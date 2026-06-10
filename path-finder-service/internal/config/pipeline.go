package config

import "github.com/user/path-finder-service/internal/models"

// PipelineConfig is the subset that crosses the FFI to the Rust core. It only
// holds knobs the pipeline cares about — credentials and storage endpoints are
// resolved on the Go side and never travel over FFI.
//
// `Schema` is per-parser (loaded from the parser doc on each run) but kept on
// PipelineConfig as the FFI envelope. The shared service-wide PipelineConfig
// always carries an empty Schema; per-run callers clone-and-override it.
type PipelineConfig struct {
	MaxDirectKB         int                  `json:"max_direct_kb"`
	TopNNodes           int                  `json:"top_n_nodes"`
	MaxSentences        int                  `json:"max_sentences"`
	MaxSentenceChars    int                  `json:"max_sentence_chars"`
	SimilarityThreshold float64              `json:"similarity_threshold"`
	MaxRetries          int                  `json:"max_retries"`
	OutputFormat        string               `json:"output_format"`
	Exclusions          []string             `json:"exclusions"`
	MinPages            int                  `json:"min_pages"`
	Schema              []models.SchemaField `json:"schema"`
	// ShapeSimilarityThreshold gates which existing parser a freshly fed page
	// joins. Stays Go-side (not forwarded to the Rust core).
	ShapeSimilarityThreshold float64 `json:"-"`
	// RerunCooldownSeconds is the minimum delay between consecutive pipeline
	// runs for the same parser. Stays Go-side.
	RerunCooldownSeconds int `json:"-"`
}

func loadPipeline() PipelineConfig {
	return PipelineConfig{
		MaxDirectKB:              getenvInt("PIPELINE_MAX_DIRECT_KB", 300),
		TopNNodes:                getenvInt("PIPELINE_TOP_N_NODES", 30),
		MaxSentences:             getenvInt("PIPELINE_MAX_SENTENCES", 3),
		MaxSentenceChars:         getenvInt("PIPELINE_MAX_SENTENCE_CHARS", 500),
		SimilarityThreshold:      getenvFloat("PIPELINE_SIMILARITY_THRESHOLD", 0.75),
		MaxRetries:               getenvInt("PIPELINE_MAX_RETRIES", 3),
		OutputFormat:             getenv("PIPELINE_OUTPUT_FORMAT", "json"),
		// Non-nil so JSON marshals as [] not null — the Rust core deserializes
		// these fields as Vec and rejects null.
		Exclusions:               []string{},
		Schema:                   []models.SchemaField{},
		MinPages:                 getenvInt("PIPELINE_MIN_PAGES", 1),
		ShapeSimilarityThreshold: getenvFloat("PIPELINE_SHAPE_SIMILARITY_THRESHOLD", 0.75),
		RerunCooldownSeconds:     getenvInt("PIPELINE_RERUN_COOLDOWN_SECONDS", 60),
	}
}
