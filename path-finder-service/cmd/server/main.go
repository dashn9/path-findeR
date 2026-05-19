package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/user/path-finder-service/internal/config"
	"github.com/user/path-finder-service/internal/feeders"
	"github.com/user/path-finder-service/internal/handlers"
	"github.com/user/path-finder-service/internal/jobs"
	"github.com/user/path-finder-service/internal/storage"
)

func main() {
	cfg := config.Load("")
	ctx := context.Background()

	corpus, err := buildCorpusStore(ctx, cfg)
	if err != nil {
		slog.Error("corpus store init", "err", err)
		os.Exit(1)
	}

	mongoClient, err := mongo.Connect(options.Client().ApplyURI(cfg.Mongo.URI))
	if err != nil {
		slog.Error("mongo connect", "err", err)
		os.Exit(1)
	}
	defer mongoClient.Disconnect(ctx)
	if err := mongoClient.Ping(ctx, nil); err != nil {
		slog.Error("mongo ping", "uri", cfg.Mongo.URI, "err", err)
		os.Exit(1)
	}
	db := mongoClient.Database(cfg.Mongo.DB)
	parserStore := storage.NewParserStore(db.Collection(cfg.Mongo.Collection))
	feedStore := storage.NewFeedStore(db.Collection(cfg.Mongo.FeedDecisionsColl))

	progress, err := storage.NewProgressStore(cfg.Storage.ProgressDir)
	if err != nil {
		slog.Error("progress store init", "err", err)
		os.Exit(1)
	}

	runner := jobs.NewJobRunner(corpus, parserStore, progress, cfg.Pipeline, cfg.AI)
	feeder := feeders.NewFunctionFeeder(
		corpus,
		parserStore,
		feedStore,
		runner,
		cfg.Pipeline.MinPages,
		cfg.Pipeline.ShapeSimilarityThreshold,
	)

	h := &handlers.Handlers{
		Feeder:      feeder,
		Runner:      runner,
		ParserStore: parserStore,
		FeedStore:   feedStore,
		Corpus:      corpus,
		Progress:    progress,
		Config:      cfg,
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	r.Get("/health", h.Health)
	r.Get("/config", h.GetConfig)
	r.Post("/feed", h.Feed)
	r.Post("/force", h.Force)
	r.Get("/parsers", h.ListParsers)
	r.Get("/parser/{parserID}", h.GetParser)
	r.Delete("/parser/{parserID}", h.NukeParser)
	r.Get("/parser/{parserID}/corpus", h.ListCorpus)
	r.Get("/parser/{parserID}/feeds", h.ListFeeds)
	r.Post("/regenerate", h.Regenerate)

	slog.Info("listening",
		"addr", cfg.Server.BindAddr,
		"storage", cfg.Storage.Adapter,
		"ai_adapter", cfg.AI.Adapter)
	if err := http.ListenAndServe(cfg.Server.BindAddr, r); err != nil {
		slog.Error("server", "err", err)
		os.Exit(1)
	}
}

// corsMiddleware: dev-friendly permissive CORS. Reflects the request's
// Origin so credentialed fetches work, and short-circuits OPTIONS preflights.
// Tighten to an allowlist before production.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// buildCorpusStore wires the configured storage adapter. S3 reads its creds
// from cfg.S3 (falling back to the AWS SDK's standard chain when blank);
// local writes to cfg.Local.BasePath on disk.
func buildCorpusStore(ctx context.Context, cfg config.Config) (storage.CorpusStore, error) {
	switch cfg.Storage.Adapter {
	case config.StorageAdapterLocal:
		slog.Info("storage: local fs", "base_path", cfg.Local.BasePath)
		return storage.NewLocalCorpusStore(cfg.Local.BasePath)

	case config.StorageAdapterS3:
		fallthrough
	default:
		opts := []func(*awsconfig.LoadOptions) error{
			awsconfig.WithRegion(cfg.S3.Region),
		}
		if cfg.S3.AccessKeyID != "" && cfg.S3.SecretAccessKey != "" {
			opts = append(opts, awsconfig.WithCredentialsProvider(
				credentials.NewStaticCredentialsProvider(
					cfg.S3.AccessKeyID,
					cfg.S3.SecretAccessKey,
					cfg.S3.SessionToken,
				),
			))
		}
		awsCfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
		if err != nil {
			return nil, err
		}
		s3Opts := func(o *s3.Options) {
			if cfg.S3.EndpointURL != "" {
				o.BaseEndpoint = &cfg.S3.EndpointURL
			}
			o.UsePathStyle = cfg.S3.ForcePathStyle
		}
		slog.Info("storage: s3",
			"bucket", cfg.S3.Bucket,
			"region", cfg.S3.Region,
			"endpoint", cfg.S3.EndpointURL)
		client := s3.NewFromConfig(awsCfg, s3Opts)
		if _, err := client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: &cfg.S3.Bucket}); err != nil {
			return nil, fmt.Errorf("s3 bucket %q unreachable: %w", cfg.S3.Bucket, err)
		}
		return storage.NewS3CorpusStore(client, cfg.S3.Bucket), nil
	}
}
