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

// MaxRunsRetained caps the rolling run-history kept on a parser doc so
// the document size stays bounded across many regenerations.
const MaxRunsRetained = 20

type JobRunner struct {
	corpus      storage.CorpusStore
	parserStore *storage.ParserStore
	progress    *storage.ProgressStore
	pipeline    config.PipelineConfig
	ai          config.AIConfig
	cooldown    time.Duration
	mu          sync.Mutex
	running     map[string]bool
}

func NewJobRunner(corpus storage.CorpusStore, parserStore *storage.ParserStore, progress *storage.ProgressStore, pipeline config.PipelineConfig, ai config.AIConfig) *JobRunner {
	cooldown := time.Duration(pipeline.RerunCooldownSeconds) * time.Second
	if cooldown < 0 {
		cooldown = 0
	}
	return &JobRunner{
		corpus:      corpus,
		parserStore: parserStore,
		progress:    progress,
		pipeline:    pipeline,
		ai:          ai,
		cooldown:    cooldown,
		running:     make(map[string]bool),
	}
}

// runOpts marks a trigger as user-initiated. Non-nil opts bypass the
// new-pages check and the failed-status circuit breaker — the user is
// explicitly asking for a retry, so don't second-guess them.
type runOpts struct {
	labels []string
}

// Trigger is the auto-trigger path from the feeder. Respects every safety
// guard: cooldown, new-pages-since-last-run, and the failed-status circuit
// breaker (a parser in `failed` won't auto-retry until the user forces it).
func (r *JobRunner) Trigger(ctx context.Context, parserID string) {
	r.trigger(ctx, parserID, nil)
}

// Force is the user-initiated retry path. Honors the cooldown (avoid
// hammering) but skips the new-pages check and the failed-status guard.
func (r *JobRunner) Force(ctx context.Context, parserID string) {
	r.trigger(ctx, parserID, &runOpts{})
}

func (r *JobRunner) trigger(ctx context.Context, parserID string, opts *runOpts) {
	r.mu.Lock()
	if r.running[parserID] {
		r.mu.Unlock()
		return
	}
	r.running[parserID] = true
	r.mu.Unlock()

	if !r.shouldRun(ctx, parserID, opts) {
		r.mu.Lock()
		delete(r.running, parserID)
		r.mu.Unlock()
		return
	}

	go r.run(context.Background(), parserID, opts)
}

// shouldRun applies the safety guards: cooldown always, plus the failed
// circuit breaker + new-pages check for *auto* triggers. User-initiated
// runs (opts != nil) bypass both of the latter.
func (r *JobRunner) shouldRun(ctx context.Context, parserID string, opts *runOpts) bool {
	doc, err := r.parserStore.Get(ctx, parserID)
	if err != nil {
		slog.Error("manifest fetch failed", "parser_id", parserID, "err", err)
		return false
	}
	if doc == nil {
		// First run for this parser — nothing to compare against.
		return true
	}

	if doc.LastTriggeredAt != nil && r.cooldown > 0 {
		if time.Since(*doc.LastTriggeredAt) < r.cooldown {
			slog.Debug("cooldown active, skipping", "parser_id", parserID)
			return false
		}
	}

	if opts != nil {
		return true
	}

	// Circuit breaker: a parser that crashed for a deterministic reason
	// (config bug, malformed AI response, etc.) shouldn't keep auto-retrying
	// every time a new page lands. The user has to Force/Regenerate to
	// signal "I think it'll work now".
	if doc.Status == models.StatusFailed {
		slog.Debug("parser is in failed state, auto-trigger blocked", "parser_id", parserID)
		return false
	}

	reference := doc.CreatedAt
	if doc.LastTriggeredAt != nil {
		reference = *doc.LastTriggeredAt
	}
	if doc.CompletedAt != nil && doc.CompletedAt.After(reference) {
		reference = *doc.CompletedAt
	}
	hasNew, err := r.corpus.HasPagesNewerThan(ctx, doc.Hostname, parserID, reference)
	if err != nil {
		slog.Error("new-pages check failed", "parser_id", parserID, "err", err)
		return false
	}
	if !hasNew {
		slog.Debug("no new pages since last run, skipping", "parser_id", parserID)
		return false
	}
	return true
}

func (r *JobRunner) run(ctx context.Context, parserID string, opts *runOpts) {
	defer func() {
		r.mu.Lock()
		delete(r.running, parserID)
		r.mu.Unlock()
	}()

	now := time.Now()
	if err := r.parserStore.SetLastTriggered(ctx, parserID, now); err != nil {
		slog.Error("set last_triggered failed", "parser_id", parserID, "err", err)
		return
	}
	if err := r.parserStore.UpdateStatus(ctx, parserID, models.StatusRunning, nil); err != nil {
		slog.Error("manifest status update failed", "parser_id", parserID, "err", err)
		return
	}

	existing, err := r.parserStore.Get(ctx, parserID)
	if err != nil || existing == nil {
		slog.Error("manifest fetch failed", "parser_id", parserID, "err", err)
		return
	}

	pages, err := r.corpus.GetAll(ctx, existing.Hostname, parserID)
	if err != nil {
		slog.Error("corpus fetch failed", "parser_id", parserID, "err", err)
		errStr := err.Error()
		_ = r.parserStore.UpdateStatus(ctx, parserID, models.StatusFailed, &errStr)
		r.finalizeRun(ctx, parserID, now, models.StatusFailed, &errStr)
		return
	}

	progressPath := ""
	if r.progress != nil {
		progressPath = r.progress.PathFor(parserID)
	}
	// Clone the service-wide PipelineConfig and overlay the parser-specific
	// schema (frozen at parser creation, never per-run). Empty schema falls
	// back to the Rust core's free-discovery prompt.
	runCfg := r.pipeline
	runCfg.Schema = existing.Schema
	result, err := core.RunPipeline(parserID, storage.ToTuples(pages), runCfg, r.ai, progressPath)
	if err != nil {
		slog.Error("pipeline failed", "parser_id", parserID, "err", err)
		errStr := err.Error()
		_ = r.parserStore.UpdateStatus(ctx, parserID, models.StatusFailed, &errStr)
		r.finalizeRun(ctx, parserID, now, models.StatusFailed, &errStr)
		return
	}

	if opts != nil && len(opts.labels) > 0 && existing != nil {
		result, err = mergeLabels(result, existing.Parser, opts.labels)
		if err != nil {
			slog.Error("merge labels failed", "parser_id", parserID, "err", err)
			errStr := err.Error()
			_ = r.parserStore.UpdateStatus(ctx, parserID, models.StatusFailed, &errStr)
			r.finalizeRun(ctx, parserID, now, models.StatusFailed, &errStr)
			return
		}
	}

	if err := r.parserStore.UpdateResult(ctx, parserID, result); err != nil {
		slog.Error("save result failed", "parser_id", parserID, "err", err)
		errStr := err.Error()
		r.finalizeRun(ctx, parserID, now, models.StatusFailed, &errStr)
		return
	}

	r.finalizeRun(ctx, parserID, now, models.StatusDone, nil)
	slog.Info("parser run completed", "parser_id", parserID)
}

// finalizeRun folds the live progress snapshot into a persisted RunLog and
// clears the snapshot file. Best-effort — a failure here doesn't roll back
// the run, just leaves the audit trail thin.
func (r *JobRunner) finalizeRun(ctx context.Context, parserID string, startedAt time.Time, status models.JobStatus, errMsg *string) {
	if r.progress == nil {
		return
	}
	snap, _ := r.progress.Read(parserID)
	run := models.RunLog{
		StartedAt:   startedAt.UTC(),
		CompletedAt: time.Now().UTC(),
		Status:      status,
		Error:       errMsg,
	}
	if snap != nil {
		run.Events = make([]models.StageEvent, len(snap.Events))
		for i, e := range snap.Events {
			run.Events[i] = models.StageEvent{Stage: e.Stage, Name: e.Name, AtMs: e.AtMs}
		}
		if status == models.StatusFailed && len(snap.Events) > 0 {
			last := snap.Events[len(snap.Events)-1].Stage
			run.FailedStage = &last
		}
	}
	if err := r.parserStore.AppendRunLog(ctx, parserID, run, MaxRunsRetained); err != nil {
		slog.Warn("append run log failed", "parser_id", parserID, "err", err)
	}
	if err := r.progress.Clear(parserID); err != nil {
		slog.Warn("clear progress failed", "parser_id", parserID, "err", err)
	}
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
		newer, err := r.corpus.HasPagesNewerThan(ctx, doc.Hostname, parserID, reference)
		if err != nil {
			return nil, err
		}
		if newer {
			return nil, &NewerPagesError{ParserID: parserID}
		}
	}

	r.trigger(ctx, parserID, &runOpts{labels: labels})

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
