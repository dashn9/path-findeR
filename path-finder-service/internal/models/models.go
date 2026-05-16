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

type ManifestDoc struct {
	ID          string                 `json:"_id" bson:"_id"`
	JobID       string                 `json:"job_id" bson:"job_id"`
	Status      JobStatus              `json:"status" bson:"status"`
	CreatedAt   time.Time              `json:"created_at" bson:"created_at"`
	CompletedAt *time.Time             `json:"completed_at,omitempty" bson:"completed_at,omitempty"`
	Error       *string                `json:"error,omitempty" bson:"error,omitempty"`
	URLPattern  map[string]interface{} `json:"url_pattern,omitempty" bson:"url_pattern,omitempty"`
	Parser      map[string]interface{} `json:"parser,omitempty" bson:"parser,omitempty"`
}

type FeedRequest struct {
	URL   string `json:"url"`
	HTML  string `json:"html"`
	JobID string `json:"job_id"`
}

type ForceRequest struct {
	JobID string `json:"job_id"`
}

type RegenerationRequest struct {
	ParserID string   `json:"parser_id"`
	Labels   []string `json:"labels,omitempty"`
	Force    bool     `json:"force"`
}

type StatusResponse struct {
	Status   string  `json:"status"`
	JobID    string  `json:"job_id,omitempty"`
	ParserID string  `json:"parser_id,omitempty"`
	Error    *string `json:"error,omitempty"`
}
