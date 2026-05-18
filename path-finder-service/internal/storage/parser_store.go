package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/user/path-finder-service/internal/models"
)

type ParserStore struct {
	collection *mongo.Collection
}

func NewParserStore(collection *mongo.Collection) *ParserStore {
	return &ParserStore{collection: collection}
}

func (s *ParserStore) Save(ctx context.Context, doc *models.ManifestDoc) error {
	_, err := s.collection.InsertOne(ctx, doc)
	return err
}

func (s *ParserStore) Get(ctx context.Context, parserID string) (*models.ManifestDoc, error) {
	filter := bson.M{"_id": parserID}
	var doc models.ManifestDoc
	err := s.collection.FindOne(ctx, filter).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

// FindByHostname returns every bucket currently registered for hostname. The
// feeder uses this to decide which (if any) existing bucket a new page joins.
func (s *ParserStore) FindByHostname(ctx context.Context, hostname string) ([]models.ManifestDoc, error) {
	cursor, err := s.collection.Find(ctx, bson.M{"hostname": hostname})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var docs []models.ManifestDoc
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, err
	}
	return docs, nil
}

// IncrementPageCount atomically bumps the bucket's page counter and returns
// the post-increment value. The feeder uses (returned-1) as the page index
// when writing into the corpus.
func (s *ParserStore) IncrementPageCount(ctx context.Context, parserID string) (int, error) {
	filter := bson.M{"_id": parserID}
	update := bson.M{"$inc": bson.M{"page_count": 1}}
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	res := s.collection.FindOneAndUpdate(ctx, filter, update, opts)
	var doc models.ManifestDoc
	if err := res.Decode(&doc); err != nil {
		return 0, err
	}
	return doc.PageCount, nil
}

// PushShapeRef appends a captured (paths, marks) reference to the bucket,
// capped at maxRefs so the document doesn't grow unbounded.
func (s *ParserStore) PushShapeRef(ctx context.Context, parserID string, ref models.ShapeRef, maxRefs int) error {
	filter := bson.M{"_id": parserID}
	update := bson.M{
		"$push": bson.M{
			"shape_refs": bson.M{
				"$each":  bson.A{ref},
				"$slice": -maxRefs,
			},
		},
	}
	_, err := s.collection.UpdateOne(ctx, filter, update)
	return err
}

// PromoteToStable flips the bucket from forming to stable once page_count
// crosses the promotion threshold.
func (s *ParserStore) PromoteToStable(ctx context.Context, parserID string) error {
	filter := bson.M{"_id": parserID, "state": string(models.BucketForming)}
	_, err := s.collection.UpdateOne(ctx, filter, bson.M{"$set": bson.M{"state": string(models.BucketStable)}})
	return err
}

func (s *ParserStore) UpdateStatus(ctx context.Context, parserID string, status models.JobStatus, errMsg *string) error {
	filter := bson.M{"_id": parserID}
	set := bson.M{"status": string(status)}
	if status == models.StatusDone {
		now := time.Now()
		set["completed_at"] = now
	}
	if errMsg != nil {
		set["error"] = *errMsg
	}
	_, err := s.collection.UpdateOne(ctx, filter, bson.M{"$set": set})
	return err
}

// SetLastTriggered records when a run started; pairs with the cooldown check
// in the runner.
func (s *ParserStore) SetLastTriggered(ctx context.Context, parserID string, t time.Time) error {
	filter := bson.M{"_id": parserID}
	_, err := s.collection.UpdateOne(ctx, filter, bson.M{"$set": bson.M{"last_triggered_at": t}})
	return err
}

func (s *ParserStore) UpdateResult(ctx context.Context, parserID string, result json.RawMessage) error {
	var parsed map[string]interface{}
	if err := json.Unmarshal(result, &parsed); err != nil {
		return fmt.Errorf("unmarshal result: %w", err)
	}

	filter := bson.M{"_id": parserID}
	now := time.Now()
	set := bson.M{
		"status":       string(models.StatusDone),
		"completed_at": now,
		"url_pattern":  parsed["url_pattern"],
		"parser":       parsed["parser"],
	}
	_, err := s.collection.UpdateOne(ctx, filter, bson.M{"$set": set})
	return err
}
