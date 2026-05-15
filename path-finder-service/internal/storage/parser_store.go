package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

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
