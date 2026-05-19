package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// StageEvent is one stage transition emitted by the Rust pipeline.
type StageEvent struct {
	Stage int    `json:"stage" bson:"stage"`
	Name  string `json:"name" bson:"name"`
	AtMs  int64  `json:"at_ms" bson:"at_ms"`
}

// ProgressSnapshot is the live state of an in-flight pipeline run, written
// by Rust on every stage and read by Go on each /parser/{id} fetch. Becomes
// stale the moment the run ends; the runner deletes the file once done.
type ProgressSnapshot struct {
	Total        int          `json:"total" bson:"total"`
	StartedAtMs  int64        `json:"started_at_ms" bson:"started_at_ms"`
	UpdatedAtMs  int64        `json:"updated_at_ms" bson:"updated_at_ms"`
	Events       []StageEvent `json:"events" bson:"events"`
}

// ProgressStore manages the on-disk progress files. The directory is local
// even when the corpus is S3 — progress is ephemeral and host-local.
type ProgressStore struct {
	dir string
}

func NewProgressStore(dir string) (*ProgressStore, error) {
	if dir == "" {
		return nil, errors.New("progress dir is empty")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("mkdir %s: %w", dir, err)
	}
	return &ProgressStore{dir: dir}, nil
}

// PathFor is the file the Rust core writes to for this parser's current run.
func (s *ProgressStore) PathFor(parserID string) string {
	return filepath.Join(s.dir, parserID+".json")
}

// Read returns the live snapshot, or nil if no run is in flight.
func (s *ProgressStore) Read(parserID string) (*ProgressSnapshot, error) {
	data, err := os.ReadFile(s.PathFor(parserID))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	var snap ProgressSnapshot
	if err := json.Unmarshal(data, &snap); err != nil {
		// A torn write between Rust's tmp+rename should be impossible, but
		// don't crash a status check over a malformed snapshot — treat as
		// "no progress yet".
		return nil, nil
	}
	return &snap, nil
}

// Clear deletes the progress file. Called by the runner after a run finishes
// (either outcome) so a stale snapshot doesn't outlive its run.
func (s *ProgressStore) Clear(parserID string) error {
	if err := os.Remove(s.PathFor(parserID)); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}
