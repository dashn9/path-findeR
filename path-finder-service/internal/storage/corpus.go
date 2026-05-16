package storage

import (
	"context"
	"time"
)

// Page is a (url, html) pair pulled back from the corpus.
type Page struct {
	URL  string
	HTML string
}

// CorpusStore persists the HTML pages a job has fed in. Implementations:
//
//   - S3CorpusStore — production (AWS S3 or any S3-compatible store)
//   - LocalCorpusStore — single-host dev / on-disk fallback
type CorpusStore interface {
	// Put writes one (url, html) page under jobID at the given index.
	Put(ctx context.Context, jobID string, index int, url, html string) error

	// GetAll returns every page for jobID in stable index order.
	GetAll(ctx context.Context, jobID string) ([]Page, error)

	// HasPagesNewerThan reports whether any page in jobID was written after t.
	// Used by Regenerate to refuse stale re-runs.
	HasPagesNewerThan(ctx context.Context, jobID string, t time.Time) (bool, error)

	// Delete removes every page for jobID. Idempotent.
	Delete(ctx context.Context, jobID string) error
}

// ToTuples converts pages to the [][2]string shape the Rust FFI expects.
func ToTuples(pages []Page) [][2]string {
	out := make([][2]string, len(pages))
	for i, p := range pages {
		out[i] = [2]string{p.URL, p.HTML}
	}
	return out
}
