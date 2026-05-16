package storage

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// LocalCorpusStore persists pages to a local directory. Layout mirrors S3:
//
//	<base>/<job_id>/<index>.html        raw HTML
//	<base>/<job_id>/<index>.url         source URL (one line, UTF-8)
//
// The url sidecar replaces S3 object metadata. mtime on the html file is the
// authoritative "page was written at" timestamp.
type LocalCorpusStore struct {
	base string
}

func NewLocalCorpusStore(base string) (*LocalCorpusStore, error) {
	if base == "" {
		return nil, errors.New("local storage path is empty")
	}
	if err := os.MkdirAll(base, 0o755); err != nil {
		return nil, fmt.Errorf("create base path %q: %w", base, err)
	}
	return &LocalCorpusStore{base: base}, nil
}

func (s *LocalCorpusStore) Put(ctx context.Context, jobID string, index int, url, html string) error {
	dir := filepath.Join(s.base, jobID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("mkdir %s: %w", dir, err)
	}
	htmlPath := filepath.Join(dir, fmt.Sprintf("%d.html", index))
	urlPath := filepath.Join(dir, fmt.Sprintf("%d.url", index))

	if err := writeAtomic(htmlPath, []byte(html)); err != nil {
		return err
	}
	return writeAtomic(urlPath, []byte(url))
}

func (s *LocalCorpusStore) GetAll(ctx context.Context, jobID string) ([]Page, error) {
	dir := filepath.Join(s.base, jobID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read %s: %w", dir, err)
	}

	type indexed struct {
		idx  int
		page Page
	}
	results := make([]indexed, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".html") {
			continue
		}
		idx, err := strconv.Atoi(strings.TrimSuffix(e.Name(), ".html"))
		if err != nil {
			continue
		}
		htmlBytes, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", e.Name(), err)
		}
		urlBytes, _ := os.ReadFile(filepath.Join(dir, fmt.Sprintf("%d.url", idx)))
		results = append(results, indexed{
			idx:  idx,
			page: Page{URL: strings.TrimSpace(string(urlBytes)), HTML: string(htmlBytes)},
		})
	}

	sort.Slice(results, func(i, j int) bool { return results[i].idx < results[j].idx })
	pages := make([]Page, len(results))
	for i, r := range results {
		pages[i] = r.page
	}
	return pages, nil
}

func (s *LocalCorpusStore) HasPagesNewerThan(ctx context.Context, jobID string, t time.Time) (bool, error) {
	dir := filepath.Join(s.base, jobID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return false, nil
		}
		return false, fmt.Errorf("read %s: %w", dir, err)
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".html") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().After(t) {
			return true, nil
		}
	}
	return false, nil
}

func (s *LocalCorpusStore) Delete(ctx context.Context, jobID string) error {
	dir := filepath.Join(s.base, jobID)
	if err := os.RemoveAll(dir); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("remove %s: %w", dir, err)
	}
	return nil
}

// writeAtomic writes via a temp file + rename so a crashed Put doesn't leave a
// partial page on disk. Rename is atomic on the same filesystem.
func writeAtomic(path string, data []byte) error {
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return fmt.Errorf("create %s: %w", tmp, err)
	}
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return fmt.Errorf("write %s: %w", tmp, err)
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("close %s: %w", tmp, err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("rename %s -> %s: %w", tmp, path, err)
	}
	return nil
}
