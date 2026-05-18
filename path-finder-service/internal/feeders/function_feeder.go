// Package feeders accepts pages and routes them to the right parser bucket.
//
// Routing pipeline per incoming page:
//
//  1. Normalize hostname + classify URL path segments into static/dynamic
//     tokens (digits-heavy or hex/UUID → "*").
//  2. Compute structural shape (paths + marks) via the Rust core.
//  3. Filter existing buckets for the hostname to those whose url_tokens and
//     url_seg_count exactly match. Cheap pre-filter; cuts impossibles.
//  4. For each surviving candidate, score the new page against every captured
//     shape_ref via combined Jaccard (0.7*paths + 0.3*marks). Take the max.
//  5. Highest score >= threshold → join. Nothing qualifies → fresh bucket.
//
// Buckets start in `forming` state; the first PromotionPages shapes are all
// pushed onto shape_refs (capped). Once page_count crosses PromotionPages,
// the bucket flips to `stable` and the captured refs are trusted as the
// template signature.
package feeders

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/user/path-finder-service/internal/core"
	"github.com/user/path-finder-service/internal/jobs"
	"github.com/user/path-finder-service/internal/models"
	"github.com/user/path-finder-service/internal/storage"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// Tunables that aren't exposed via env yet — pinned here for the first
// testing version.
const (
	// PromotionPages: bucket flips from forming to stable once page_count
	// reaches this. The first N pages are *all* captured as shape_refs.
	PromotionPages = 3
	// MarkWeight: contribution of the marks Jaccard to the combined score.
	// Paths get the rest.
	MarkWeight = 0.3
)

type FunctionFeeder struct {
	corpus         storage.CorpusStore
	parserStore    *storage.ParserStore
	runner         *jobs.JobRunner
	minPages       int
	threshold      float64
	promotionPages int
	// hostMu serialises bucket creation per hostname so two near-simultaneous
	// Feeds for the same template don't both insert duplicate buckets.
	hostMu sync.Map
}

func NewFunctionFeeder(
	corpus storage.CorpusStore,
	parserStore *storage.ParserStore,
	runner *jobs.JobRunner,
	minPages int,
	threshold float64,
) *FunctionFeeder {
	if minPages < 2 {
		minPages = 2
	}
	if threshold <= 0 || threshold > 1 {
		threshold = 0.75
	}
	return &FunctionFeeder{
		corpus:         corpus,
		parserStore:    parserStore,
		runner:         runner,
		minPages:       minPages,
		threshold:      threshold,
		promotionPages: PromotionPages,
	}
}

// Feed routes one (url, html) page to the matching bucket (or creates one),
// persists the page, and triggers a run when the bucket reaches minPages.
func (f *FunctionFeeder) Feed(ctx context.Context, pageURL, html string) (string, error) {
	hostname, tokens, err := extractHostAndTokens(pageURL)
	if err != nil {
		return "", err
	}

	shape, err := core.ComputeShape(html)
	if err != nil {
		return "", fmt.Errorf("compute shape: %w", err)
	}

	bucketID, isNew, err := f.routeToBucket(ctx, hostname, tokens, shape)
	if err != nil {
		return "", err
	}

	count, err := f.parserStore.IncrementPageCount(ctx, bucketID)
	if err != nil {
		return "", fmt.Errorf("increment page count: %w", err)
	}
	index := count - 1

	// While forming, every page contributes to the template signature so a
	// single weird first page can't poison subsequent matches.
	if isNew || count <= f.promotionPages {
		ref := models.ShapeRef{Paths: shape.Paths, Marks: shape.Marks}
		if err := f.parserStore.PushShapeRef(ctx, bucketID, ref, f.promotionPages); err != nil {
			slog.Warn("push shape_ref failed", "parser_id", bucketID, "err", err)
		}
	}
	if count >= f.promotionPages {
		if err := f.parserStore.PromoteToStable(ctx, bucketID); err != nil {
			slog.Warn("promote bucket failed", "parser_id", bucketID, "err", err)
		}
	}

	if err := f.corpus.Put(ctx, bucketID, index, pageURL, html); err != nil {
		return "", err
	}

	if count >= f.minPages {
		f.runner.Trigger(ctx, bucketID)
	}
	return bucketID, nil
}

// Force lets the caller manually trigger a known bucket regardless of count.
func (f *FunctionFeeder) Force(ctx context.Context, parserID string) {
	f.runner.Trigger(ctx, parserID)
}

// routeToBucket picks the best-matching bucket for (hostname, tokens, shape)
// or creates a new one. Returns the bucket id and whether it was newly created.
func (f *FunctionFeeder) routeToBucket(
	ctx context.Context,
	hostname string,
	tokens []string,
	shape core.Shape,
) (string, bool, error) {
	muIface, _ := f.hostMu.LoadOrStore(hostname, &sync.Mutex{})
	mu := muIface.(*sync.Mutex)
	mu.Lock()
	defer mu.Unlock()

	all, err := f.parserStore.FindByHostname(ctx, hostname)
	if err != nil {
		return "", false, fmt.Errorf("find buckets: %w", err)
	}

	// URL-token pre-filter: same hostname, same segment count, identical
	// static tokens. Single static-position mismatch (e.g. /users vs /products)
	// disqualifies the candidate regardless of shape similarity.
	var candidates []*models.ManifestDoc
	for i := range all {
		c := &all[i]
		if c.URLSegCount == len(tokens) && tokensMatch(c.URLTokens, tokens) {
			candidates = append(candidates, c)
		}
	}

	var best *models.ManifestDoc
	bestScore := 0.0
	for _, c := range candidates {
		score, err := scoreAgainstRefs(shape, c.ShapeRefs)
		if err != nil {
			return "", false, fmt.Errorf("score %s: %w", c.ID, err)
		}
		if score > bestScore {
			best, bestScore = c, score
		}
	}

	if best != nil && bestScore >= f.threshold {
		slog.Debug("matched existing bucket", "parser_id", best.ID, "score", bestScore)
		return best.ID, false, nil
	}

	bucketID := hostname + ":" + shape.ID
	doc := &models.ManifestDoc{
		ID:          bucketID,
		Hostname:    hostname,
		URLTokens:   tokens,
		URLSegCount: len(tokens),
		State:       models.BucketForming,
		ShapeRefs:   []models.ShapeRef{},
		Status:      models.StatusPending,
		PageCount:   0,
		CreatedAt:   time.Now().UTC(),
	}
	if err := f.parserStore.Save(ctx, doc); err != nil {
		// Concurrent feeder won the race for the exact same shape — adopt it.
		if mongo.IsDuplicateKeyError(err) {
			return bucketID, false, nil
		}
		return "", false, fmt.Errorf("create bucket: %w", err)
	}
	slog.Info("created bucket",
		"parser_id", bucketID,
		"tokens", tokens,
		"path_count", len(shape.Paths),
		"mark_count", len(shape.Marks))
	return bucketID, true, nil
}

// scoreAgainstRefs returns the highest combined Jaccard between the new shape
// and any of the bucket's captured references. Empty refs (brand-new bucket
// before its first push) score 0.
func scoreAgainstRefs(shape core.Shape, refs []models.ShapeRef) (float64, error) {
	best := 0.0
	for _, r := range refs {
		ps, err := core.ShapeJaccard(shape.Paths, r.Paths)
		if err != nil {
			return 0, err
		}
		ms, err := core.ShapeJaccard(shape.Marks, r.Marks)
		if err != nil {
			return 0, err
		}
		combined := (1.0-MarkWeight)*ps + MarkWeight*ms
		if combined > best {
			best = combined
		}
	}
	return best, nil
}
