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
	mu          sync.Mutex
	running     map[string]bool
}

func NewJobRunner(corpus storage.CorpusStore, parserStore *storage.ParserStore, pipeline config.PipelineConfig, ai config.AIConfig) *JobRunner {
	return &JobRunner{
		corpus:      corpus,
		parserStore: parserStore,
		pipeline:    pipeline,
		ai:          ai,
		running:     make(map[string]bool),
	}
}

type regenerateOpts struct {
	labels []string
}

func (r *JobRunner) Trigger(ctx context.Context, jobID string) {
	r.trigger(jobID, nil)
}

func (r *JobRunner) trigger(jobID string, regen *regenerateOpts) {
	r.mu.Lock()
	if r.running[jobID] {
		r.mu.Unlock()
		return
	}
	r.running[jobID] = true
	r.mu.Unlock()

	go r.run(context.Background(), jobID, regen)
}

func (r *JobRunner) run(ctx context.Context, jobID string, regen *regenerateOpts) {
	defer func() {
		r.mu.Lock()
		delete(r.running, jobID)
		r.mu.Unlock()
	}()

	existing, err := r.parserStore.Get(ctx, jobID)
	if err != nil {
		slog.Error("manifest fetch failed", "job_id", jobID, "err", err)
		return
	}

	if existing == nil {
		doc := &models.ManifestDoc{
			ID:        jobID,
			JobID:     jobID,
			Status:    models.StatusRunning,
			CreatedAt: time.Now(),
		}
		if err := r.parserStore.Save(ctx, doc); err != nil {
			slog.Error("manifest save failed", "job_id", jobID, "err", err)
			return
		}
	} else {
		if err := r.parserStore.UpdateStatus(ctx, jobID, models.StatusRunning, nil); err != nil {
			slog.Error("manifest status update failed", "job_id", jobID, "err", err)
			return
		}
	}

	pages, err := r.corpus.GetAll(ctx, jobID)
	if err != nil {
		slog.Error("corpus fetch failed", "job_id", jobID, "err", err)
		errStr := err.Error()
		_ = r.parserStore.UpdateStatus(ctx, jobID, models.StatusFailed, &errStr)
		return
	}

	result, err := core.RunPipeline(jobID, storage.ToTuples(pages), r.pipeline, r.ai)
	if err != nil {
		slog.Error("pipeline failed", "job_id", jobID, "err", err)
		errStr := err.Error()
		_ = r.parserStore.UpdateStatus(ctx, jobID, models.StatusFailed, &errStr)
		return
	}

	if regen != nil && len(regen.labels) > 0 && existing != nil {
		result, err = mergeLabels(result, existing.Parser, regen.labels)
		if err != nil {
			slog.Error("merge labels failed", "job_id", jobID, "err", err)
			errStr := err.Error()
			_ = r.parserStore.UpdateStatus(ctx, jobID, models.StatusFailed, &errStr)
			return
		}
	}

	if err := r.parserStore.UpdateResult(ctx, jobID, result); err != nil {
		slog.Error("save result failed", "job_id", jobID, "err", err)
		return
	}

	slog.Info("job completed", "job_id", jobID)
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
		newer, err := r.corpus.HasPagesNewerThan(ctx, doc.JobID, reference)
		if err != nil {
			return nil, err
		}
		if newer {
			return nil, &NewerPagesError{ParserID: parserID}
		}
	}

	r.trigger(doc.JobID, &regenerateOpts{labels: labels})

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
