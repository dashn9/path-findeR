package main

import (
	"context"
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
	parserStore := storage.NewParserStore(mongoClient.Database(cfg.Mongo.DB).Collection(cfg.Mongo.Collection))

	runner := jobs.NewJobRunner(corpus, parserStore, cfg.Pipeline, cfg.AI)
	feeder := feeders.NewFunctionFeeder(corpus, runner, cfg.Pipeline.MinPages)

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

	slog.Info("listening",
		"addr", cfg.Server.BindAddr,
		"storage", cfg.Storage.Adapter,
		"ai_adapter", cfg.AI.Adapter)
	if err := http.ListenAndServe(cfg.Server.BindAddr, r); err != nil {
		slog.Error("server", "err", err)
		os.Exit(1)
	}
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
		return storage.NewS3CorpusStore(s3.NewFromConfig(awsCfg, s3Opts), cfg.S3.Bucket), nil
	}
}
