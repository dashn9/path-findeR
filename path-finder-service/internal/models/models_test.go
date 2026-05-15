package models

import (
	"encoding/json"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	c := DefaultConfig()
	if c.MaxDirectKB != 300 {
		t.Errorf("MaxDirectKB = %d, want 300", c.MaxDirectKB)
	}
	if c.TopNNodes != 30 {
		t.Errorf("TopNNodes = %d, want 30", c.TopNNodes)
	}
	if c.MaxSentences != 3 {
		t.Errorf("MaxSentences = %d, want 3", c.MaxSentences)
	}
	if c.MaxSentenceChars != 500 {
		t.Errorf("MaxSentenceChars = %d, want 500", c.MaxSentenceChars)
	}
	if c.SimilarityThreshold != 0.75 {
		t.Errorf("SimilarityThreshold = %f, want 0.75", c.SimilarityThreshold)
	}
	if c.MaxRetries != 3 {
		t.Errorf("MaxRetries = %d, want 3", c.MaxRetries)
	}
	if c.MinPages != 2 {
		t.Errorf("MinPages = %d, want 2", c.MinPages)
	}
	if c.OutputFormat != "json" {
		t.Errorf("OutputFormat = %s, want json", c.OutputFormat)
	}
}

func TestFeedRequestJSON(t *testing.T) {
	raw := `{"url":"http://example.com/1","html":"<html></html>","job_id":"j1"}`
	var req FeedRequest
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatal(err)
	}
	if req.URL != "http://example.com/1" {
		t.Errorf("URL = %s", req.URL)
	}
	if req.JobID != "j1" {
		t.Errorf("JobID = %s", req.JobID)
	}
}

func TestForceRequestJSON(t *testing.T) {
	raw := `{"job_id":"j1"}`
	var req ForceRequest
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatal(err)
	}
	if req.JobID != "j1" {
		t.Errorf("JobID = %s", req.JobID)
	}
}

func TestRegenerationRequestDefaults(t *testing.T) {
	raw := `{"parser_id":"p1"}`
	var req RegenerationRequest
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatal(err)
	}
	if req.ParserID != "p1" {
		t.Errorf("ParserID = %s", req.ParserID)
	}
	if req.Labels != nil {
		t.Errorf("Labels should be nil, got %v", req.Labels)
	}
	if req.Force {
		t.Error("Force should be false")
	}
}

func TestRegenerationRequestFull(t *testing.T) {
	raw := `{"parser_id":"p1","labels":["title","price"],"force":true}`
	var req RegenerationRequest
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatal(err)
	}
	if len(req.Labels) != 2 {
		t.Errorf("Labels len = %d, want 2", len(req.Labels))
	}
	if !req.Force {
		t.Error("Force should be true")
	}
}

func TestStatusResponseOmitsEmpty(t *testing.T) {
	resp := StatusResponse{Status: "accepted", JobID: "j1"}
	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	json.Unmarshal(data, &m)
	if _, ok := m["parser_id"]; ok {
		t.Error("parser_id should be omitted when empty")
	}
	if _, ok := m["error"]; ok {
		t.Error("error should be omitted when nil")
	}
}

func TestManifestDocRoundtrip(t *testing.T) {
	doc := ManifestDoc{
		ID:     "p1",
		JobID:  "p1",
		Status: StatusDone,
	}
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	var parsed ManifestDoc
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.Status != StatusDone {
		t.Errorf("Status = %s, want done", parsed.Status)
	}
}

func TestJobStatusValues(t *testing.T) {
	cases := []struct {
		s    JobStatus
		want string
	}{
		{StatusPending, "pending"},
		{StatusRunning, "running"},
		{StatusDone, "done"},
		{StatusFailed, "failed"},
	}
	for _, tc := range cases {
		if string(tc.s) != tc.want {
			t.Errorf("got %s, want %s", tc.s, tc.want)
		}
	}
}

func TestConfigJSON(t *testing.T) {
	c := DefaultConfig()
	data, err := json.Marshal(c)
	if err != nil {
		t.Fatal(err)
	}
	var parsed PipelineConfig
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.MaxDirectKB != c.MaxDirectKB {
		t.Errorf("MaxDirectKB mismatch")
	}
	if parsed.SimilarityThreshold != c.SimilarityThreshold {
		t.Errorf("SimilarityThreshold mismatch")
	}
}
