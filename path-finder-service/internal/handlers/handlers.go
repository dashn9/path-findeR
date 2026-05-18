package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/user/path-finder-service/internal/feeders"
	"github.com/user/path-finder-service/internal/jobs"
	"github.com/user/path-finder-service/internal/models"
	"github.com/user/path-finder-service/internal/storage"
)

type Handlers struct {
	Feeder      *feeders.FunctionFeeder
	Runner      *jobs.JobRunner
	ParserStore *storage.ParserStore
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

	bucketID, err := h.Feeder.Feed(r.Context(), req.URL, req.HTML)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, models.StatusResponse{
		Status:   "accepted",
		ParserID: bucketID,
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

	writeJSON(w, http.StatusOK, doc)
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
