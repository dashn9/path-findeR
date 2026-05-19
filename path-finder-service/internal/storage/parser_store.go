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

// Delete removes the parser doc. Caller is responsible for cleaning up the
// associated corpus + feed decisions + progress file — those live in other
// stores.
func (s *ParserStore) Delete(ctx context.Context, parserID string) error {
	_, err := s.collection.DeleteOne(ctx, bson.M{"_id": parserID})
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

// FindByHostname returns every parser currently registered for hostname. The
// feeder uses this to decide which (if any) existing parser a new page joins.
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

// List returns every parser manifest, newest first. Used by the UI to
// hydrate the parsers list at app start.
func (s *ParserStore) List(ctx context.Context) ([]models.ManifestDoc, error) {
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	cursor, err := s.collection.Find(ctx, bson.M{}, opts)
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

// IncrementPageCount atomically bumps the parser's page counter and returns
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

// PushShapeRef appends a captured (paths, marks) reference to the parser,
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

// PromoteToStable flips the parser from forming to stable once page_count
// crosses the promotion threshold.
func (s *ParserStore) PromoteToStable(ctx context.Context, parserID string) error {
	filter := bson.M{"_id": parserID, "state": string(models.ParserForming)}
	_, err := s.collection.UpdateOne(ctx, filter, bson.M{"$set": bson.M{"state": string(models.ParserStable)}})
	return err
}

// SetURLTokens replaces the parser's stored URL pattern. The feeder calls
// this after absorbing a new page that promoted one or more positions to
// wildcard.
func (s *ParserStore) SetURLTokens(ctx context.Context, parserID string, tokens []string) error {
	filter := bson.M{"_id": parserID}
	_, err := s.collection.UpdateOne(ctx, filter, bson.M{"$set": bson.M{"url_tokens": tokens}})
	return err
}

func (s *ParserStore) UpdateStatus(ctx context.Context, parserID string, status models.JobStatus, errMsg *string) error {
	filter := bson.M{"_id": parserID}
	set := bson.M{"status": string(status)}
	if status == models.StatusDone {
		now := time.Now()
		set["completed_at"] = now
	}
	update := bson.M{"$set": set}
	if errMsg != nil {
		set["error"] = *errMsg
	} else {
		// Clear any stale failure from a prior run when transitioning to a
		// non-failed state, so the UI doesn't show a fresh "running" doc
		// alongside a leftover error message.
		update["$unset"] = bson.M{"error": ""}
	}
	_, err := s.collection.UpdateOne(ctx, filter, update)
	return err
}

// SetLastTriggered records when a run started; pairs with the cooldown check
// in the runner.
func (s *ParserStore) SetLastTriggered(ctx context.Context, parserID string, t time.Time) error {
	filter := bson.M{"_id": parserID}
	_, err := s.collection.UpdateOne(ctx, filter, bson.M{"$set": bson.M{"last_triggered_at": t}})
	return err
}

// AppendRunLog tacks a finished run onto the parser's runs[] array, capped
// at maxRuns so the doc doesn't grow unbounded.
func (s *ParserStore) AppendRunLog(ctx context.Context, parserID string, run models.RunLog, maxRuns int) error {
	filter := bson.M{"_id": parserID}
	update := bson.M{
		"$push": bson.M{
			"runs": bson.M{
				"$each":  bson.A{run},
				"$slice": -maxRuns,
			},
		},
	}
	_, err := s.collection.UpdateOne(ctx, filter, update)
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
		// trace is the per-label Inspector data (candidates, validation
		// matrix, extracted values, DOM context). Persisted so the UI can
		// show it after the run; safe to overwrite each completion.
		"trace": parsed["trace"],
	}
	_, err := s.collection.UpdateOne(ctx, filter, bson.M{
		"$set":   set,
		"$unset": bson.M{"error": ""},
	})
	return err
}
