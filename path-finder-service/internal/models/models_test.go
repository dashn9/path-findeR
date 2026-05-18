package models

import (
	"encoding/json"
	"testing"
)

func TestFeedRequestJSON(t *testing.T) {
	raw := `{"url":"http://example.com/1","html":"<html></html>"}`
	var req FeedRequest
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatal(err)
	}
	if req.URL != "http://example.com/1" || req.HTML != "<html></html>" {
		t.Errorf("got %#v", req)
	}
}

func TestForceRequestJSON(t *testing.T) {
	raw := `{"parser_id":"example.com:a1b2c3d4"}`
	var req ForceRequest
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatal(err)
	}
	if req.ParserID != "example.com:a1b2c3d4" {
		t.Errorf("ParserID = %s", req.ParserID)
	}
}

func TestRegenerationRequestFull(t *testing.T) {
	raw := `{"parser_id":"example.com:a1b2c3d4","labels":["title","price"],"force":true}`
	var req RegenerationRequest
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatal(err)
	}
	if len(req.Labels) != 2 || !req.Force {
		t.Errorf("got %#v", req)
	}
}

func TestStatusResponseOmitsEmpty(t *testing.T) {
	resp := StatusResponse{Status: "accepted", ParserID: "example.com:abc"}
	data, _ := json.Marshal(resp)
	var m map[string]interface{}
	json.Unmarshal(data, &m)
	if _, ok := m["error"]; ok {
		t.Error("error should be omitted when nil")
	}
}

func TestManifestDocRoundtrip(t *testing.T) {
	doc := ManifestDoc{
		ID:          "example.com:a1b2c3d4",
		Hostname:    "example.com",
		URLTokens:   []string{"products", "*"},
		URLSegCount: 2,
		State:       BucketForming,
		ShapeRefs: []ShapeRef{
			{Paths: []string{"html", "html>body"}, Marks: []string{"#main"}},
		},
		Status:    StatusPending,
		PageCount: 1,
	}
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	var parsed ManifestDoc
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.State != BucketForming {
		t.Errorf("State = %s", parsed.State)
	}
	if len(parsed.ShapeRefs) != 1 || len(parsed.ShapeRefs[0].Paths) != 2 {
		t.Errorf("ShapeRefs = %#v", parsed.ShapeRefs)
	}
	if len(parsed.URLTokens) != 2 {
		t.Errorf("URLTokens = %v", parsed.URLTokens)
	}
}

func TestJobStatusValues(t *testing.T) {
	if string(StatusPending) != "pending" || string(StatusDone) != "done" {
		t.Error("status string values changed")
	}
}
