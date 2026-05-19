// Package feeders accepts pages and routes them to the right parser.
//
// Routing pipeline per incoming page:
//
//  1. Normalize hostname; capture raw path tokens for cosmetic display.
//  2. Compute structural shape (paths + marks) via the Rust core.
//  3. For every parser on the same hostname, score the new page against
//     every captured shape_ref via combined Jaccard (0.7*paths + 0.3*marks)
//     and take the max.
//  4. Highest score >= threshold → join. Nothing qualifies → fresh parser.
//
// URL path tokens are not part of the gate: same host + same shape is
// enough. The stored url_tokens are kept only as a display hint that
// converges to wildcards over time when lengths happen to match.
//
// Parsers start in `forming` state; the first PromotionPages shapes are all
// pushed onto shape_refs (capped). Once page_count crosses PromotionPages,
// the parser flips to `stable` and the captured refs are trusted.
package feeders

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/user/path-finder-service/internal/core"
	"github.com/user/path-finder-service/internal/jobs"
	"github.com/user/path-finder-service/internal/models"
	"github.com/user/path-finder-service/internal/storage"
)

// Tunables that aren't exposed via env yet — pinned here for the first
// testing version.
const (
	// PromotionPages: parser flips from forming to stable once page_count
	// reaches this. The first N pages are *all* captured as shape_refs.
	PromotionPages = 3
	// MarkWeight: contribution of the marks Jaccard to the combined score.
	// Paths get the rest.
	MarkWeight = 0.3
)

type FunctionFeeder struct {
	corpus         storage.CorpusStore
	parserStore    *storage.ParserStore
	feedStore      *storage.FeedStore
	runner         *jobs.JobRunner
	minPages       int
	threshold      float64
	promotionPages int
	// hostMu serialises parser creation per hostname so two near-simultaneous
	// Feeds for the same shape don't both insert duplicate parsers.
	hostMu sync.Map
}

func NewFunctionFeeder(
	corpus storage.CorpusStore,
	parserStore *storage.ParserStore,
	feedStore *storage.FeedStore,
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
		feedStore:      feedStore,
		runner:         runner,
		minPages:       minPages,
		threshold:      threshold,
		promotionPages: PromotionPages,
	}
}

// Feed routes one (url, html) page to the matching parser (or creates one),
// persists the page, records the routing decision, and triggers a run when
// the parser reaches minPages.
func (f *FunctionFeeder) Feed(ctx context.Context, pageURL, html string) (string, error) {
	hostname, tokens, err := extractHostAndTokens(pageURL)
	if err != nil {
		return "", err
	}

	shape, err := core.ComputeShape(html)
	if err != nil {
		return "", fmt.Errorf("compute shape: %w", err)
	}

	route, err := f.routeToParser(ctx, hostname, tokens, shape)
	if err != nil {
		return "", err
	}
	parserID := route.parserID

	count, err := f.parserStore.IncrementPageCount(ctx, parserID)
	if err != nil {
		return "", fmt.Errorf("increment page count: %w", err)
	}
	index := count - 1

	// While forming, every page contributes to the template signature so a
	// single weird first page can't poison subsequent matches.
	if route.created || count <= f.promotionPages {
		ref := models.ShapeRef{Paths: shape.Paths, Marks: shape.Marks}
		if err := f.parserStore.PushShapeRef(ctx, parserID, ref, f.promotionPages); err != nil {
			slog.Warn("push shape_ref failed", "parser_id", parserID, "err", err)
		}
	}
	if count >= f.promotionPages {
		if err := f.parserStore.PromoteToStable(ctx, parserID); err != nil {
			slog.Warn("promote parser failed", "parser_id", parserID, "err", err)
		}
	}

	if err := f.corpus.Put(ctx, hostname, parserID, index, pageURL, html); err != nil {
		return "", err
	}

	f.recordDecision(ctx, decisionInput{
		url:      pageURL,
		hostname: hostname,
		tokens:   tokens,
		shape:    shape,
		route:    route,
		index:    index,
	})

	if count >= f.minPages {
		f.runner.Trigger(ctx, parserID)
	}
	return parserID, nil
}

type decisionInput struct {
	url      string
	hostname string
	tokens   []string
	shape    core.Shape
	route    routeResult
	index    int
}

// recordDecision persists the routing audit row. Best-effort: a write
// failure logs but doesn't fail the Feed call — the user already has their
// page accepted, and the audit log is a secondary artifact.
func (f *FunctionFeeder) recordDecision(ctx context.Context, d decisionInput) {
	outcome := models.OutcomeMatched
	if d.route.created {
		outcome = models.OutcomeCreated
	}
	dec := &models.FeedDecision{
		At:       time.Now().UTC(),
		URL:      d.url,
		Hostname: d.hostname,
		Tokens:   d.tokens,
		Shape: models.ShapeSummary{
			PathCount: len(d.shape.Paths),
			MarkCount: len(d.shape.Marks),
		},
		Threshold:  f.threshold,
		Candidates: d.route.candidates,
		Outcome:    outcome,
		ParserID:   d.route.parserID,
		PageIndex:  d.index,
	}
	if err := f.feedStore.Insert(ctx, dec); err != nil {
		slog.Warn("record feed decision failed", "parser_id", d.route.parserID, "err", err)
	}
}

// Force lets the caller manually trigger a known parser, bypassing the
// safety guards (new-pages, failed-status circuit breaker) that gate
// auto-triggers from the feed path.
func (f *FunctionFeeder) Force(ctx context.Context, parserID string) {
	f.runner.Force(ctx, parserID)
}

// routeResult bundles the chosen parser with the full candidate scoreboard
// so callers (specifically: the decision recorder) can persist *why* the
// page landed where it did, not just where.
type routeResult struct {
	parserID   string
	created    bool
	candidates []models.FeedCandidate
}

// routeToParser picks the best-matching parser for (hostname, shape) or
// creates a new one. URL path tokens are not part of the match — same host
// + similar enough shape is enough.
//
// Every parser on the hostname is scored regardless of whether it clears
// the threshold; the full table is returned so the audit trail records
// near-misses too.
//
// The url_tokens stored on the chosen parser are still updated to converge
// toward wildcards across pages whose path lengths happen to align; this is
// purely cosmetic, for the pattern column in the UI.
func (f *FunctionFeeder) routeToParser(
	ctx context.Context,
	hostname string,
	tokens []string,
	shape core.Shape,
) (routeResult, error) {
	muIface, _ := f.hostMu.LoadOrStore(hostname, &sync.Mutex{})
	mu := muIface.(*sync.Mutex)
	mu.Lock()
	defer mu.Unlock()

	all, err := f.parserStore.FindByHostname(ctx, hostname)
	if err != nil {
		return routeResult{}, fmt.Errorf("find parsers: %w", err)
	}

	candidates := make([]models.FeedCandidate, 0, len(all))
	bestIdx := -1
	for i := range all {
		c := &all[i]
		score, err := scoreAgainstRefs(shape, c.ShapeRefs)
		if err != nil {
			return routeResult{}, fmt.Errorf("score %s: %w", c.ID, err)
		}
		candidates = append(candidates, models.FeedCandidate{
			ParserID:  c.ID,
			Score:     score,
			State:     string(c.State),
			PageCount: c.PageCount,
		})
		if score >= f.threshold && (bestIdx < 0 || score > candidates[bestIdx].Score) {
			bestIdx = len(candidates) - 1
		}
	}

	if bestIdx >= 0 {
		candidates[bestIdx].Accepted = true
		chosen := &all[bestIdx]
		slog.Debug("matched existing parser",
			"parser_id", chosen.ID,
			"shape_score", candidates[bestIdx].Score)
		if next := updatedPattern(chosen.URLTokens, tokens); !sameTokens(next, chosen.URLTokens) {
			if err := f.parserStore.SetURLTokens(ctx, chosen.ID, next); err != nil {
				slog.Warn("update url_tokens failed", "parser_id", chosen.ID, "err", err)
			}
		}
		return routeResult{parserID: chosen.ID, created: false, candidates: candidates}, nil
	}

	parserID := bson.NewObjectID().Hex()
	doc := &models.ManifestDoc{
		ID:          parserID,
		Hostname:    hostname,
		URLTokens:   tokens,
		URLSegCount: len(tokens),
		State:       models.ParserForming,
		ShapeRefs:   []models.ShapeRef{},
		Status:      models.StatusPending,
		PageCount:   0,
		CreatedAt:   time.Now().UTC(),
	}
	if err := f.parserStore.Save(ctx, doc); err != nil {
		return routeResult{}, fmt.Errorf("create parser: %w", err)
	}
	slog.Info("created parser",
		"parser_id", parserID,
		"hostname", hostname,
		"path_count", len(shape.Paths),
		"mark_count", len(shape.Marks))
	return routeResult{parserID: parserID, created: true, candidates: candidates}, nil
}

func sameTokens(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// scoreAgainstRefs returns the highest combined routing score between the
// incoming shape and any of the parser's captured references.
//
// Paths use the looser max(jaccard, overlap) score — pages of the same
// template often differ by optional blocks (reviews, recommendations) which
// shows up as one path set being a near-subset of the other, killing
// Jaccard but leaving overlap high. Marks stay Jaccard: the mark set is
// already a constrained, semantic-anchor set, so size-mismatch noise is
// less of an issue there.
//
// Empty refs (brand-new parser before its first push) score 0.
func scoreAgainstRefs(shape core.Shape, refs []models.ShapeRef) (float64, error) {
	best := 0.0
	for _, r := range refs {
		ps, err := core.ShapeSimilarity(shape.Paths, r.Paths)
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
