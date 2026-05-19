package storage

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/user/path-finder-service/internal/models"
)

// FeedStore persists the routing decision for every accepted Feed call so
// the UI can show why each page joined the parser it did.
type FeedStore struct {
	collection *mongo.Collection
}

func NewFeedStore(collection *mongo.Collection) *FeedStore {
	return &FeedStore{collection: collection}
}

// DeleteByParser drops every decision row tied to this parser. Used when a
// parser is nuked so audit history doesn't outlive the thing it audited.
func (s *FeedStore) DeleteByParser(ctx context.Context, parserID string) error {
	_, err := s.collection.DeleteMany(ctx, bson.M{"parser_id": parserID})
	return err
}

func (s *FeedStore) Insert(ctx context.Context, d *models.FeedDecision) error {
	if d.ID == "" {
		d.ID = bson.NewObjectID().Hex()
	}
	_, err := s.collection.InsertOne(ctx, d)
	return err
}

// ListByParser returns the decisions where the given parser was the chosen
// destination, newest first. Capped so an old parser doesn't dump thousands
// of rows into the UI.
func (s *FeedStore) ListByParser(ctx context.Context, parserID string, limit int64) ([]models.FeedDecision, error) {
	if limit <= 0 {
		limit = 200
	}
	opts := options.Find().
		SetSort(bson.D{{Key: "at", Value: -1}}).
		SetLimit(limit)
	cursor, err := s.collection.Find(ctx, bson.M{"parser_id": parserID}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var out []models.FeedDecision
	if err := cursor.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}
