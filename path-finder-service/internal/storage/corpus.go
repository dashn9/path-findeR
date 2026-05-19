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

// PageMeta is the lightweight listing entry — no HTML body, just enough to
// show "what's in the corpus" in a UI without pulling every page back.
type PageMeta struct {
	URL       string    `json:"url"`
	Index     int       `json:"index"`
	FetchedAt time.Time `json:"fetched_at"`
}

// CorpusStore persists the HTML pages a parser has accumulated. Pages are
// keyed by (hostname, parserID, index) so the on-disk / S3 layout is
// browsable by site: `<hostname>/<parserID>/<index>.html`. Implementations:
//
//   - S3CorpusStore — production (AWS S3 or any S3-compatible store)
//   - LocalCorpusStore — single-host dev / on-disk fallback
type CorpusStore interface {
	// Put writes one (url, html) page under (hostname, parserID) at the given index.
	Put(ctx context.Context, hostname, parserID string, index int, url, html string) error

	// GetAll returns every page for (hostname, parserID) in stable index order.
	GetAll(ctx context.Context, hostname, parserID string) ([]Page, error)

	// HasPagesNewerThan reports whether any page under (hostname, parserID)
	// was written after t. Used by the runner to skip no-op re-runs.
	HasPagesNewerThan(ctx context.Context, hostname, parserID string, t time.Time) (bool, error)

	// List returns lightweight per-page metadata (URL + index + fetched_at)
	// without reading the HTML bodies. Used by the UI's corpus tab.
	List(ctx context.Context, hostname, parserID string) ([]PageMeta, error)

	// Delete removes every page for (hostname, parserID). Idempotent.
	Delete(ctx context.Context, hostname, parserID string) error
}

// ToTuples converts pages to the [][2]string shape the Rust FFI expects.
func ToTuples(pages []Page) [][2]string {
	out := make([][2]string, len(pages))
	for i, p := range pages {
		out[i] = [2]string{p.URL, p.HTML}
	}
	return out
}
