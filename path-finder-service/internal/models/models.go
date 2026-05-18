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

// BucketState gates how aggressively the feeder trusts a bucket's references.
//
//   - forming: bucket has fewer than the promotion threshold of pages; new
//     pages are compared against *every* existing page so one bad initial
//     sample can't poison subsequent matches.
//   - stable:  bucket has accumulated enough pages; the captured shape_refs
//     are trusted as the template signature.
type BucketState string

const (
	BucketForming BucketState = "forming"
	BucketStable  BucketState = "stable"
)

// ShapeRef is a captured page signature used to score new candidates against
// the bucket. Stored on the manifest (capped at PIPELINE_PROMOTION_PAGES
// entries) so scoring doesn't require re-reading the corpus on every Feed.
type ShapeRef struct {
	Paths []string `json:"paths" bson:"paths"`
	Marks []string `json:"marks" bson:"marks"`
}

// ManifestDoc is the persistent record for one bucket — a (hostname, URL
// pattern, template) triple plus the parser generated from it. The bucket
// ID (`_id`, also the public parser_id) is "<hostname>:<shape-id>".
type ManifestDoc struct {
	ID              string                 `json:"_id" bson:"_id"`
	Hostname        string                 `json:"hostname" bson:"hostname"`
	URLTokens       []string               `json:"url_tokens" bson:"url_tokens"`
	URLSegCount     int                    `json:"url_seg_count" bson:"url_seg_count"`
	State           BucketState            `json:"state" bson:"state"`
	ShapeRefs       []ShapeRef             `json:"shape_refs" bson:"shape_refs"`
	Status          JobStatus              `json:"status" bson:"status"`
	PageCount       int                    `json:"page_count" bson:"page_count"`
	CreatedAt       time.Time              `json:"created_at" bson:"created_at"`
	LastTriggeredAt *time.Time             `json:"last_triggered_at,omitempty" bson:"last_triggered_at,omitempty"`
	CompletedAt     *time.Time             `json:"completed_at,omitempty" bson:"completed_at,omitempty"`
	Error           *string                `json:"error,omitempty" bson:"error,omitempty"`
	URLPattern      map[string]interface{} `json:"url_pattern,omitempty" bson:"url_pattern,omitempty"`
	Parser          map[string]interface{} `json:"parser,omitempty" bson:"parser,omitempty"`
}

// FeedRequest pushes one page into the service. The bucket is decided
// server-side from (hostname, URL token signature, structural shape).
type FeedRequest struct {
	URL  string `json:"url"`
	HTML string `json:"html"`
}

// ForceRequest manually triggers a parser run for a known bucket.
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
