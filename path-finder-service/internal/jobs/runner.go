package jobs

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/user/path-finder-service/internal/core"
	"github.com/user/path-finder-service/internal/models"
	"github.com/user/path-finder-service/internal/storage"
)

type JobRunner struct {
	corpus      *storage.CorpusStore
	parserStore *storage.ParserStore
	config      models.PipelineConfig
	mu          sync.Mutex
	running     map[string]bool
}

func NewJobRunner(corpus *storage.CorpusStore, parserStore *storage.ParserStore, config models.PipelineConfig) *JobRunner {
	return &JobRunner{
		corpus:      corpus,
		parserStore: parserStore,
		config:      config,
		running:     make(map[string]bool),
	}
}

func (r *JobRunner) Trigger(ctx context.Context, jobID string) {
	r.mu.Lock()
	if r.running[jobID] {
		r.mu.Unlock()
		return
	}
	r.running[jobID] = true
	r.mu.Unlock()

	go r.run(context.Background(), jobID)
}

func (r *JobRunner) run(ctx context.Context, jobID string) {
	defer func() {
		r.mu.Lock()
		delete(r.running, jobID)
		r.mu.Unlock()
	}()

	now := time.Now()
	doc := &models.ManifestDoc{
		ID:        jobID,
		JobID:     jobID,
		Status:    models.StatusRunning,
		CreatedAt: now,
	}

	if err := r.parserStore.Save(ctx, doc); err != nil {
		// Already exists, update status
		_ = r.parserStore.UpdateStatus(ctx, jobID, models.StatusRunning, nil)
	}

	pages, err := r.corpus.GetAll(ctx, jobID)
	if err != nil {
		slog.Error("corpus fetch failed", "job_id", jobID, "err", err)
		errStr := err.Error()
		_ = r.parserStore.UpdateStatus(ctx, jobID, models.StatusFailed, &errStr)
		return
	}

	result, err := core.RunPipeline(pages, r.config)
	if err != nil {
		slog.Error("pipeline failed", "job_id", jobID, "err", err)
		errStr := err.Error()
		_ = r.parserStore.UpdateStatus(ctx, jobID, models.StatusFailed, &errStr)
		return
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

	r.Trigger(ctx, doc.JobID)

	resp, _ := json.Marshal(map[string]string{
		"status":    "regeneration_triggered",
		"parser_id": parserID,
	})
	return resp, nil
}

type NotFoundError struct {
	ParserID string
}

func (e *NotFoundError) Error() string {
	return "parser '" + e.ParserID + "' not found"
}
