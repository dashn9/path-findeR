// Package models holds the HTTP / Mongo DTOs. Pipeline + AI config moved to
// internal/config; this package only describes what crosses the API boundary.
package models

import "time"

type JobStatus string

const (
	StatusPending JobStatus = "pending"
	StatusRunning JobStatus = "running"
	StatusDone    JobStatus = "done"
	StatusFailed  JobStatus = "failed"
)

// ParserState gates how aggressively the feeder trusts a parser's references.
//
//   - forming: parser has fewer than the promotion threshold of pages; new
//     pages are compared against *every* existing page so one bad initial
//     sample can't poison subsequent matches.
//   - stable:  parser has accumulated enough pages; the captured shape_refs
//     are trusted as the template signature.
type ParserState string

const (
	ParserForming ParserState = "forming"
	ParserStable  ParserState = "stable"
)

// ShapeRef is a captured page signature used to score new candidates against
// the parser. Stored on the manifest (capped at PIPELINE_PROMOTION_PAGES
// entries) so scoring doesn't require re-reading the corpus on every Feed.
type ShapeRef struct {
	Paths []string `json:"paths" bson:"paths"`
	Marks []string `json:"marks" bson:"marks"`
}

// StageEvent is one entry in a run's audit log — when a pipeline stage
// started. Stage names mirror what the Rust core emits.
type StageEvent struct {
	Stage int    `json:"stage" bson:"stage"`
	Name  string `json:"name" bson:"name"`
	AtMs  int64  `json:"at_ms" bson:"at_ms"`
}

// RunLog is the persisted record of one finished pipeline run. The live
// progress snapshot (transient, on disk) is folded into a RunLog and
// appended to the parser doc when the run completes.
type RunLog struct {
	StartedAt   time.Time    `json:"started_at" bson:"started_at"`
	CompletedAt time.Time    `json:"completed_at" bson:"completed_at"`
	Status      JobStatus    `json:"status" bson:"status"`
	FailedStage *int         `json:"failed_stage,omitempty" bson:"failed_stage,omitempty"`
	Error       *string      `json:"error,omitempty" bson:"error,omitempty"`
	Events      []StageEvent `json:"events" bson:"events"`
}

// ProgressView is the in-flight progress attached to /parser/{id} responses
// while a run is active. Reconstructed from the on-disk snapshot per request;
// never persisted on the doc.
type ProgressView struct {
	Stage       int          `json:"stage"`
	Total       int          `json:"total"`
	Name        string       `json:"name"`
	StartedAtMs int64        `json:"started_at_ms"`
	UpdatedAtMs int64        `json:"updated_at_ms"`
	Events      []StageEvent `json:"events"`
}

// ManifestDoc is the persistent record for one parser. Routing pairs a
// hostname with a structural shape signature; URL path tokens are kept
// only as cosmetic context for the UI. The ID is a Mongo ObjectID hex
// string, generated at creation time.
type ManifestDoc struct {
	ID              string                 `json:"_id" bson:"_id"`
	Hostname        string                 `json:"hostname" bson:"hostname"`
	URLTokens       []string               `json:"url_tokens" bson:"url_tokens"`
	URLSegCount     int                    `json:"url_seg_count" bson:"url_seg_count"`
	State           ParserState            `json:"state" bson:"state"`
	ShapeRefs       []ShapeRef             `json:"shape_refs" bson:"shape_refs"`
	Status          JobStatus              `json:"status" bson:"status"`
	PageCount       int                    `json:"page_count" bson:"page_count"`
	CreatedAt       time.Time              `json:"created_at" bson:"created_at"`
	LastTriggeredAt *time.Time             `json:"last_triggered_at,omitempty" bson:"last_triggered_at,omitempty"`
	CompletedAt     *time.Time             `json:"completed_at,omitempty" bson:"completed_at,omitempty"`
	Error           *string                `json:"error,omitempty" bson:"error,omitempty"`
	URLPattern      map[string]interface{} `json:"url_pattern,omitempty" bson:"url_pattern,omitempty"`
	Parser          map[string]interface{} `json:"parser,omitempty" bson:"parser,omitempty"`
	// Trace is the Inspector's per-label payload: candidate scoreboard,
	// validation matrix, extracted values, DOM context, AI rationale.
	// Loosely typed so we can ship Rust shape changes without a schema
	// migration in Go.
	Trace           map[string]interface{} `json:"trace,omitempty" bson:"trace,omitempty"`
	Runs            []RunLog               `json:"runs,omitempty" bson:"runs,omitempty"`
	// Progress is *not* stored — it's hydrated from the live progress file
	// when a run is in flight. Empty when idle.
	Progress *ProgressView `json:"progress,omitempty" bson:"-"`
}

// FeedRequest pushes one page into the service. The destination parser is
// decided server-side from (hostname, structural shape).
type FeedRequest struct {
	URL  string `json:"url"`
	HTML string `json:"html"`
}

// ForceRequest manually triggers a run for a known parser.
type ForceRequest struct {
	ParserID string `json:"parser_id"`
}

// RegenerationRequest re-derives an existing parser (optionally keeping a
// subset of labels from the prior manifest).
type RegenerationRequest struct {
	ParserID string   `json:"parser_id"`
	Labels   []string `json:"labels,omitempty"`
	Force    bool     `json:"force"`
}

type StatusResponse struct {
	Status   string  `json:"status"`
	ParserID string  `json:"parser_id,omitempty"`
	Error    *string `json:"error,omitempty"`
}

// FeedDecisionOutcome distinguishes "joined an existing parser" from
// "created a new one". A third outcome could be "rejected" in the future
// (e.g. malformed HTML); not modeled yet.
type FeedDecisionOutcome string

const (
	OutcomeMatched FeedDecisionOutcome = "matched"
	OutcomeCreated FeedDecisionOutcome = "created"
)

// ShapeSummary is the routing signal stripped of bulky path/mark arrays —
// enough to display in the UI without making the decision doc huge.
type ShapeSummary struct {
	PathCount int `json:"path_count" bson:"path_count"`
	MarkCount int `json:"mark_count" bson:"mark_count"`
}

// FeedCandidate records one parser that was considered for the incoming
// page along with the score it received. Score is the combined Jaccard
// against the parser's best-matching shape_ref; if the parser had no refs
// yet the score is 0.
type FeedCandidate struct {
	ParserID  string  `json:"parser_id" bson:"parser_id"`
	Score     float64 `json:"score" bson:"score"`
	State     string  `json:"state" bson:"state"`
	PageCount int     `json:"page_count" bson:"page_count"`
	Accepted  bool    `json:"accepted" bson:"accepted"`
}

// FeedDecision is the audit trail for one Feed call: every input that
// shaped the routing choice plus the full candidate table so the user can
// see why the page landed where it did.
type FeedDecision struct {
	ID         string              `json:"_id" bson:"_id"`
	At         time.Time           `json:"at" bson:"at"`
	URL        string              `json:"url" bson:"url"`
	Hostname   string              `json:"hostname" bson:"hostname"`
	Tokens     []string            `json:"tokens" bson:"tokens"`
	Shape      ShapeSummary        `json:"shape" bson:"shape"`
	Threshold  float64             `json:"threshold" bson:"threshold"`
	Candidates []FeedCandidate     `json:"candidates" bson:"candidates"`
	Outcome    FeedDecisionOutcome `json:"outcome" bson:"outcome"`
	ParserID   string              `json:"parser_id" bson:"parser_id"`
	PageIndex  int                 `json:"page_index" bson:"page_index"`
}
