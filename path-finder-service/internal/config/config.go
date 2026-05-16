// Package config loads service configuration from environment variables.
//
// Process env always wins over the .env file, so production deployments can
// set vars directly and ignore the file entirely. Each domain (S3, Mongo, AI,
// Storage, Server) owns its own Load() so credentials stay grouped with the
// thing that uses them — AWS keys live on S3Config, the model knobs live on
// AIConfig.
package config

import (
	"errors"
	"io/fs"
	"log/slog"
	"os"
	"slices"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Server   ServerConfig
	Storage  StorageConfig
	S3       S3Config
	Local    LocalStorageConfig
	Mongo    MongoConfig
	AI       AIConfig
	Pipeline PipelineConfig
}

// Load reads .env (if present) and constructs the full config from env.
// path defaults to ".env" when empty. Missing file is a silent no-op.
func Load(path string) Config {
	if path == "" {
		path = getenv("ENV_FILE", ".env")
	}
	if err := godotenv.Load(path); err != nil {
		if !errors.Is(err, fs.ErrNotExist) {
			slog.Warn("dotenv load failed", "path", path, "err", err)
		}
	} else {
		slog.Info("loaded dotenv", "path", path)
	}

	return Config{
		Server:   loadServer(),
		Storage:  loadStorage(),
		S3:       loadS3(),
		Local:    loadLocal(),
		Mongo:    loadMongo(),
		AI:       loadAI(),
		Pipeline: loadPipeline(),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getenvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func getenvFloat(key string, fallback float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return fallback
}

// pickAdapter validates env[key] against allowed values, warning + falling
// back to def on unknown input. Shared by AI and Storage configs.
func pickAdapter(key, def string, allowed ...string) string {
	raw := getenv(key, def)
	if slices.Contains(allowed, raw) {
		return raw
	}
	slog.Warn("unknown adapter, using default", "key", key, "value", raw, "default", def)
	return def
}
