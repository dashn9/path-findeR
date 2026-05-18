package jobs

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/user/path-finder-service/internal/config"
	"github.com/user/path-finder-service/internal/core"
	"github.com/user/path-finder-service/internal/models"
	"github.com/user/path-finder-service/internal/storage"
)

type JobRunner struct {
	corpus      storage.CorpusStore
	parserStore *storage.ParserStore
	pipeline    config.PipelineConfig
	ai          config.AIConfig
	cooldown    time.Duration
	mu          sync.Mutex
	running     map[string]bool
}

func NewJobRunner(corpus storage.CorpusStore, parserStore *storage.ParserStore, pipeline config.PipelineConfig, ai config.AIConfig) *JobRunner {
	cooldown := time.Duration(pipeline.RerunCooldownSeconds) * time.Second
	if cooldown < 0 {
		cooldown = 0
	}
	return &JobRunner{
		corpus:      corpus,
		parserStore: parserStore,
		pipeline:    pipeline,
		ai:          ai,
		cooldown:    cooldown,
		running:     make(map[string]bool),
	}
}

type regenerateOpts struct {
	labels []string
}

// Trigger asks the runner to (re-)derive the parser for bucketID. The call
// is rate-limited by an in-flight dedup, a cooldown since the last run, and
// a "are there even new pages?" check against the corpus.
func (r *JobRunner) Trigger(ctx context.Context, bucketID string) {
	r.trigger(ctx, bucketID, nil)
}

func (r *JobRunner) trigger(ctx context.Context, bucketID string, regen *regenerateOpts) {
	r.mu.Lock()
	if r.running[bucketID] {
		r.mu.Unlock()
		return
	}
	r.running[bucketID] = true
	r.mu.Unlock()

	if !r.shouldRun(ctx, bucketID, regen) {
		r.mu.Lock()
		delete(r.running, bucketID)
		r.mu.Unlock()
		return
	}

	go r.run(context.Background(), bucketID, regen)
}

// shouldRun applies cooldown + new-pages guards. Regeneration requests bypass
// the new-pages check (the caller is explicit) but still respect the cooldown.
func (r *JobRunner) shouldRun(ctx context.Context, bucketID string, regen *regenerateOpts) bool {
	doc, err := r.parserStore.Get(ctx, bucketID)
	if err != nil {
		slog.Error("manifest fetch failed", "bucket_id", bucketID, "err", err)
		return false
	}
	if doc == nil {
		// First run for the bucket — nothing to compare against.
		return true
	}

	if doc.LastTriggeredAt != nil && r.cooldown > 0 {
		if time.Since(*doc.LastTriggeredAt) < r.cooldown {
			slog.Debug("cooldown active, skipping", "bucket_id", bucketID)
			return false
		}
	}

	if regen != nil {
		return true
	}

	reference := doc.CreatedAt
	if doc.LastTriggeredAt != nil {
		reference = *doc.LastTriggeredAt
	}
	if doc.CompletedAt != nil && doc.CompletedAt.After(reference) {
		reference = *doc.CompletedAt
	}
	hasNew, err := r.corpus.HasPagesNewerThan(ctx, bucketID, reference)
	if err != nil {
		slog.Error("new-pages check failed", "bucket_id", bucketID, "err", err)
		return false
	}
	if !hasNew {
		slog.Debug("no new pages since last run, skipping", "bucket_id", bucketID)
		return false
	}
	return true
}

func (r *JobRunner) run(ctx context.Context, bucketID string, regen *regenerateOpts) {
	defer func() {
		r.mu.Lock()
		delete(r.running, bucketID)
		r.mu.Unlock()
	}()

	now := time.Now()
	if err := r.parserStore.SetLastTriggered(ctx, bucketID, now); err != nil {
		slog.Error("set last_triggered failed", "bucket_id", bucketID, "err", err)
		return
	}
	if err := r.parserStore.UpdateStatus(ctx, bucketID, models.StatusRunning, nil); err != nil {
		slog.Error("manifest status update failed", "bucket_id", bucketID, "err", err)
		return
	}

	existing, _ := r.parserStore.Get(ctx, bucketID)

	pages, err := r.corpus.GetAll(ctx, bucketID)
	if err != nil {
		slog.Error("corpus fetch failed", "bucket_id", bucketID, "err", err)
		errStr := err.Error()
		_ = r.parserStore.UpdateStatus(ctx, bucketID, models.StatusFailed, &errStr)
		return
	}

	result, err := core.RunPipeline(bucketID, storage.ToTuples(pages), r.pipeline, r.ai)
	if err != nil {
		slog.Error("pipeline failed", "bucket_id", bucketID, "err", err)
		errStr := err.Error()
		_ = r.parserStore.UpdateStatus(ctx, bucketID, models.StatusFailed, &errStr)
		return
	}

	if regen != nil && len(regen.labels) > 0 && existing != nil {
		result, err = mergeLabels(result, existing.Parser, regen.labels)
		if err != nil {
			slog.Error("merge labels failed", "bucket_id", bucketID, "err", err)
			errStr := err.Error()
			_ = r.parserStore.UpdateStatus(ctx, bucketID, models.StatusFailed, &errStr)
			return
		}
	}

	if err := r.parserStore.UpdateResult(ctx, bucketID, result); err != nil {
		slog.Error("save result failed", "bucket_id", bucketID, "err", err)
		return
	}

	slog.Info("bucket run completed", "bucket_id", bucketID)
}

func (r *JobRunner) Regenerate(ctx context.Context, parserID string, labels []string, force bool) (json.RawMessage, error) {
	doc, err := r.parserStore.Get(ctx, parserID)
	if err != nil {
		return nil, err
	}
	if doc == nil {
		return nil, &NotFoundError{ParserID: parserID}
	}

	if !force {
		reference := doc.CreatedAt
		if doc.CompletedAt != nil {
			reference = *doc.CompletedAt
		}
		newer, err := r.corpus.HasPagesNewerThan(ctx, parserID, reference)
		if err != nil {
			return nil, err
		}
		if newer {
			return nil, &NewerPagesError{ParserID: parserID}
		}
	}

	r.trigger(ctx, parserID, &regenerateOpts{labels: labels})

	resp, _ := json.Marshal(map[string]string{
		"status":    "regeneration_triggered",
		"parser_id": parserID,
	})
	return resp, nil
}

// mergeLabels keeps labels from the previous manifest that are not in `keep`,
// and replaces the rest from the freshly-generated manifest.
func mergeLabels(newResult json.RawMessage, oldParser map[string]interface{}, keep []string) (json.RawMessage, error) {
	var manifest map[string]interface{}
	if err := json.Unmarshal(newResult, &manifest); err != nil {
		return nil, err
	}

	newParser, _ := manifest["parser"].(map[string]interface{})
	if newParser == nil {
		newParser = map[string]interface{}{}
	}

	keepSet := make(map[string]bool, len(keep))
	for _, l := range keep {
		keepSet[l] = true
	}

	merged := map[string]interface{}{}
	for label, val := range oldParser {
		if !keepSet[label] {
			merged[label] = val
		}
	}
	for label, val := range newParser {
		if keepSet[label] {
			merged[label] = val
		}
	}

	manifest["parser"] = merged
	return json.Marshal(manifest)
}

type NotFoundError struct {
	ParserID string
}

func (e *NotFoundError) Error() string {
	return "parser '" + e.ParserID + "' not found"
}

type NewerPagesError struct {
	ParserID string
}

func (e *NewerPagesError) Error() string {
	return "parser '" + e.ParserID + "' has newer pages in the corpus; use force=true to override"
}
