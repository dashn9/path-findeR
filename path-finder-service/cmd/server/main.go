package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/user/path-finder-service/internal/feeders"
	"github.com/user/path-finder-service/internal/handlers"
	"github.com/user/path-finder-service/internal/jobs"
	"github.com/user/path-finder-service/internal/models"
	"github.com/user/path-finder-service/internal/storage"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	ctx := context.Background()

	s3Bucket := env("S3_BUCKET", "path-finder-corpus")
	mongoURI := env("MONGO_URI", "mongodb://localhost:27017")
	mongoDB := env("MONGO_DB", "path_finder")
	bindAddr := env("BIND_ADDR", "0.0.0.0:8000")

	// S3
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		slog.Error("aws config", "err", err)
		os.Exit(1)
	}
	s3Client := s3.NewFromConfig(awsCfg)
	corpus := storage.NewCorpusStore(s3Client, s3Bucket)

	// MongoDB
	mongoClient, err := mongo.Connect(options.Client().ApplyURI(mongoURI))
	if err != nil {
		slog.Error("mongo connect", "err", err)
		os.Exit(1)
	}
	defer mongoClient.Disconnect(ctx)
	collection := mongoClient.Database(mongoDB).Collection("manifests")
	parserStore := storage.NewParserStore(collection)

	// Pipeline config
	config := models.DefaultConfig()
	if ep := os.Getenv("AI_ENDPOINT"); ep != "" {
		config.AIEndpoint = ep
	}
	if m := os.Getenv("AI_MODEL"); m != "" {
		config.AIModel = m
	}

	runner := jobs.NewJobRunner(corpus, parserStore, config)
	feeder := feeders.NewFunctionFeeder(corpus, runner, config.MinPages)

	h := &handlers.Handlers{
		Feeder:      feeder,
		Runner:      runner,
		ParserStore: parserStore,
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/health", h.Health)
	r.Post("/feed", h.Feed)
	r.Post("/force", h.Force)
	r.Get("/parser/{parserID}", h.GetParser)
	r.Post("/regenerate", h.Regenerate)

	slog.Info("listening", "addr", bindAddr)
	if err := http.ListenAndServe(bindAddr, r); err != nil {
		slog.Error("server", "err", err)
		os.Exit(1)
	}
}
