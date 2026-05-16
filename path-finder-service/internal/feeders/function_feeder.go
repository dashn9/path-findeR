package feeders

import (
	"context"
	"sync"

	"github.com/user/path-finder-service/internal/jobs"
	"github.com/user/path-finder-service/internal/storage"
)

type FunctionFeeder struct {
	corpus   storage.CorpusStore
	runner   *jobs.JobRunner
	minPages int
	mu       sync.Mutex
	counts   map[string]int
}

func NewFunctionFeeder(corpus storage.CorpusStore, runner *jobs.JobRunner, minPages int) *FunctionFeeder {
	if minPages < 2 {
		minPages = 2
	}
	return &FunctionFeeder{
		corpus:   corpus,
		runner:   runner,
		minPages: minPages,
		counts:   make(map[string]int),
	}
}

func (f *FunctionFeeder) Feed(ctx context.Context, url, html, jobID string) error {
	f.mu.Lock()
	index := f.counts[jobID]
	f.counts[jobID] = index + 1
	count := index + 1
	f.mu.Unlock()

	if err := f.corpus.Put(ctx, jobID, index, url, html); err != nil {
		return err
	}

	if count >= f.minPages {
		f.runner.Trigger(ctx, jobID)
	}
	return nil
}

func (f *FunctionFeeder) Force(ctx context.Context, jobID string) {
	f.runner.Trigger(ctx, jobID)
}
