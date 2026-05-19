package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/user/path-finder-service/internal/config"
	"github.com/user/path-finder-service/internal/feeders"
	"github.com/user/path-finder-service/internal/jobs"
	"github.com/user/path-finder-service/internal/models"
	"github.com/user/path-finder-service/internal/storage"
)

type Handlers struct {
	Feeder      *feeders.FunctionFeeder
	Runner      *jobs.JobRunner
	ParserStore *storage.ParserStore
	FeedStore   *storage.FeedStore
	Corpus      storage.CorpusStore
	Progress    *storage.ProgressStore
	// Config is the snapshot the service booted with — exposed read-only so
	// the UI's Settings tab can show real values instead of hardcoded mocks.
	Config config.Config
}

// ConfigView is the public projection of the service config. AI credentials
// are deliberately omitted — only the adapter name + model + endpoint shape
// is safe to surface.
type ConfigView struct {
	Pipeline PipelineView `json:"pipeline"`
	AI       AIView       `json:"ai"`
	Storage  StorageView  `json:"storage"`
}

type PipelineView struct {
	MinPages                 int      `json:"min_pages"`
	MaxDirectKB              int      `json:"max_direct_kb"`
	TopNNodes                int      `json:"top_n_nodes"`
	MaxSentences             int      `json:"max_sentences"`
	MaxSentenceChars         int      `json:"max_sentence_chars"`
	SimilarityThreshold      float64  `json:"similarity_threshold"`
	ShapeSimilarityThreshold float64  `json:"shape_similarity_threshold"`
	MaxRetries               int      `json:"max_retries"`
	OutputFormat             string   `json:"output_format"`
	Exclusions               []string `json:"exclusions"`
	RerunCooldownSeconds     int      `json:"rerun_cooldown_seconds"`
}

type AIView struct {
	Adapter  string `json:"adapter"`
	Model    string `json:"model"`
	BaseURL  string `json:"base_url"`
	HasKey   bool   `json:"has_key"`
}

type StorageView struct {
	Adapter     string `json:"adapter"`
	ProgressDir string `json:"progress_dir"`
}

// GetConfig surfaces the service's loaded configuration. Read-only.
func (h *Handlers) GetConfig(w http.ResponseWriter, r *http.Request) {
	cfg := h.Config

	ai := AIView{Adapter: string(cfg.AI.Adapter)}
	switch cfg.AI.Adapter {
	case config.LlmAdapterOpenAI:
		ai.Model = cfg.AI.OpenAI.Model
		ai.BaseURL = cfg.AI.OpenAI.BaseURL
		ai.HasKey = cfg.AI.OpenAI.APIKey != ""
	case config.LlmAdapterOpenRouter:
		ai.Model = cfg.AI.OpenRouter.Model
		ai.BaseURL = cfg.AI.OpenRouter.BaseURL
		ai.HasKey = cfg.AI.OpenRouter.APIKey != ""
	default:
		ai.Model = cfg.AI.Anthropic.Model
		ai.BaseURL = cfg.AI.Anthropic.BaseURL
		ai.HasKey = cfg.AI.Anthropic.APIKey != ""
	}

	view := ConfigView{
		Pipeline: PipelineView{
			MinPages:                 cfg.Pipeline.MinPages,
			MaxDirectKB:              cfg.Pipeline.MaxDirectKB,
			TopNNodes:                cfg.Pipeline.TopNNodes,
			MaxSentences:             cfg.Pipeline.MaxSentences,
			MaxSentenceChars:         cfg.Pipeline.MaxSentenceChars,
			SimilarityThreshold:      cfg.Pipeline.SimilarityThreshold,
			ShapeSimilarityThreshold: cfg.Pipeline.ShapeSimilarityThreshold,
			MaxRetries:               cfg.Pipeline.MaxRetries,
			OutputFormat:             cfg.Pipeline.OutputFormat,
			Exclusions:               cfg.Pipeline.Exclusions,
			RerunCooldownSeconds:     cfg.Pipeline.RerunCooldownSeconds,
		},
		AI:      ai,
		Storage: StorageView{Adapter: string(cfg.Storage.Adapter), ProgressDir: cfg.Storage.ProgressDir},
	}
	writeJSON(w, http.StatusOK, view)
}

func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handlers) Feed(w http.ResponseWriter, r *http.Request) {
	var req models.FeedRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	parserID, err := h.Feeder.Feed(r.Context(), req.URL, req.HTML)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, models.StatusResponse{
		Status:   "accepted",
		ParserID: parserID,
	})
}

func (h *Handlers) Force(w http.ResponseWriter, r *http.Request) {
	var req models.ForceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	h.Feeder.Force(r.Context(), req.ParserID)

	writeJSON(w, http.StatusOK, models.StatusResponse{
		Status:   "triggered",
		ParserID: req.ParserID,
	})
}

func (h *Handlers) GetParser(w http.ResponseWriter, r *http.Request) {
	parserID := chi.URLParam(r, "parserID")

	doc, err := h.ParserStore.Get(r.Context(), parserID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if doc == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "parser not found"})
		return
	}

	// Hydrate the live progress snapshot (only present while a run is in
	// flight). Best-effort: a missing/torn snapshot is just "no progress".
	if h.Progress != nil && doc.Status == models.StatusRunning {
		if snap, _ := h.Progress.Read(parserID); snap != nil && len(snap.Events) > 0 {
			last := snap.Events[len(snap.Events)-1]
			events := make([]models.StageEvent, len(snap.Events))
			for i, e := range snap.Events {
				events[i] = models.StageEvent{Stage: e.Stage, Name: e.Name, AtMs: e.AtMs}
			}
			doc.Progress = &models.ProgressView{
				Stage:       last.Stage,
				Total:       snap.Total,
				Name:        last.Name,
				StartedAtMs: snap.StartedAtMs,
				UpdatedAtMs: snap.UpdatedAtMs,
				Events:      events,
			}
		}
	}

	writeJSON(w, http.StatusOK, doc)
}

// ListParsers returns every parser manifest, newest first. Used by the UI
// to hydrate its list on app start so state survives reloads.
func (h *Handlers) ListParsers(w http.ResponseWriter, r *http.Request) {
	docs, err := h.ParserStore.List(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if docs == nil {
		docs = []models.ManifestDoc{}
	}
	writeJSON(w, http.StatusOK, docs)
}

// ListFeeds returns the routing decisions where the given parser was the
// chosen destination. Powers the "Feed log" tab so the user can see why
// each page landed here (and what near-misses there were).
func (h *Handlers) ListFeeds(w http.ResponseWriter, r *http.Request) {
	parserID := chi.URLParam(r, "parserID")
	decisions, err := h.FeedStore.ListByParser(r.Context(), parserID, 200)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if decisions == nil {
		decisions = []models.FeedDecision{}
	}
	writeJSON(w, http.StatusOK, decisions)
}

// ListCorpus returns lightweight metadata for every page in a parser's
// corpus (no HTML bodies). Powers the corpus tab. Resolves the hostname
// from the parser doc since the corpus layout is keyed by hostname first.
func (h *Handlers) ListCorpus(w http.ResponseWriter, r *http.Request) {
	parserID := chi.URLParam(r, "parserID")
	doc, err := h.ParserStore.Get(r.Context(), parserID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if doc == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "parser not found"})
		return
	}
	pages, err := h.Corpus.List(r.Context(), doc.Hostname, parserID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if pages == nil {
		pages = []storage.PageMeta{}
	}
	writeJSON(w, http.StatusOK, pages)
}

// NukeParser wipes a parser and every artifact tied to it:
//   - manifest doc (Mongo)
//   - corpus pages (local fs or S3, keyed by hostname/parser_id)
//   - feed decisions (Mongo) — the routing-audit history collapses with the
//     thing it audited
//   - run history is embedded on the manifest doc, so it dies with it
//   - live progress snapshot on disk (best-effort; harmless if no run is
//     in flight)
//
// Manifest doc is dropped last on purpose: if any earlier step fails, the
// parser still exists so the user can retry the nuke. The reverse order
// would leave orphan corpus/feed rows the UI can never find.
func (h *Handlers) NukeParser(w http.ResponseWriter, r *http.Request) {
	parserID := chi.URLParam(r, "parserID")
	ctx := r.Context()

	doc, err := h.ParserStore.Get(ctx, parserID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if doc == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "parser not found"})
		return
	}

	if err := h.Corpus.Delete(ctx, doc.Hostname, parserID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "nuke corpus: " + err.Error()})
		return
	}
	if err := h.FeedStore.DeleteByParser(ctx, parserID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "nuke feed log: " + err.Error()})
		return
	}
	if h.Progress != nil {
		_ = h.Progress.Clear(parserID)
	}
	if err := h.ParserStore.Delete(ctx, parserID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "nuke manifest: " + err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "nuked", "parser_id": parserID})
}

func (h *Handlers) Regenerate(w http.ResponseWriter, r *http.Request) {
	var req models.RegenerationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	result, err := h.Runner.Regenerate(r.Context(), req.ParserID, req.Labels, req.Force)
	if err != nil {
		var nf *jobs.NotFoundError
		if errors.As(err, &nf) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}
		var np *jobs.NewerPagesError
		if errors.As(err, &np) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(result)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
