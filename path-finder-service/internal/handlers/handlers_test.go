package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealthHandler(t *testing.T) {
	h := &Handlers{}
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	h.Health(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}

	var body map[string]string
	json.NewDecoder(w.Body).Decode(&body)
	if body["status"] != "ok" {
		t.Errorf("status = %s, want ok", body["status"])
	}
}

func TestFeedBadJSON(t *testing.T) {
	h := &Handlers{}
	req := httptest.NewRequest(http.MethodPost, "/feed", strings.NewReader("not json"))
	w := httptest.NewRecorder()

	h.Feed(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestForceBadJSON(t *testing.T) {
	h := &Handlers{}
	req := httptest.NewRequest(http.MethodPost, "/force", strings.NewReader("{invalid"))
	w := httptest.NewRecorder()

	h.Force(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestRegenerateBadJSON(t *testing.T) {
	h := &Handlers{}
	req := httptest.NewRequest(http.MethodPost, "/regenerate", strings.NewReader(""))
	w := httptest.NewRecorder()

	h.Regenerate(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestWriteJSON(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, http.StatusCreated, map[string]string{"key": "val"})

	if w.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("content-type = %s", ct)
	}
	var body map[string]string
	json.NewDecoder(w.Body).Decode(&body)
	if body["key"] != "val" {
		t.Errorf("body key = %s", body["key"])
	}
}
