package feeders

import (
	"context"
	"log/slog"
	"sync"

	"github.com/redis/go-redis/v9"

	"github.com/user/path-finder-service/internal/jobs"
	"github.com/user/path-finder-service/internal/storage"
)

type RedisStreamFeeder struct {
	rdb          *redis.Client
	streamKey    string
	groupName    string
	consumerName string
	corpus       *storage.CorpusStore
	runner       *jobs.JobRunner
	minPages     int
	mu           sync.Mutex
	counts       map[string]int
}

func NewRedisStreamFeeder(
	redisURL, streamKey, groupName, consumerName string,
	corpus *storage.CorpusStore,
	runner *jobs.JobRunner,
	minPages int,
) (*RedisStreamFeeder, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	if minPages < 2 {
		minPages = 2
	}
	return &RedisStreamFeeder{
		rdb:          redis.NewClient(opts),
		streamKey:    streamKey,
		groupName:    groupName,
		consumerName: consumerName,
		corpus:       corpus,
		runner:       runner,
		minPages:     minPages,
		counts:       make(map[string]int),
	}, nil
}

func (f *RedisStreamFeeder) Start(ctx context.Context) error {
	// Ensure consumer group
	_ = f.rdb.XGroupCreateMkStream(ctx, f.streamKey, f.groupName, "0").Err()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		streams, err := f.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    f.groupName,
			Consumer: f.consumerName,
			Streams:  []string{f.streamKey, ">"},
			Count:    10,
			Block:    5000,
		}).Result()
		if err == redis.Nil {
			continue
		}
		if err != nil {
			slog.Error("xreadgroup error", "err", err)
			continue
		}

		for _, stream := range streams {
			for _, msg := range stream.Messages {
				f.processMessage(ctx, msg)
				f.rdb.XAck(ctx, f.streamKey, f.groupName, msg.ID)
			}
		}
	}
}

func (f *RedisStreamFeeder) processMessage(ctx context.Context, msg redis.XMessage) {
	url, _ := msg.Values["url"].(string)
	html, _ := msg.Values["html"].(string)
	jobID, _ := msg.Values["job_id"].(string)
	if jobID == "" {
		return
	}

	f.mu.Lock()
	index := f.counts[jobID]
	f.counts[jobID] = index + 1
	count := index + 1
	f.mu.Unlock()

	if err := f.corpus.Put(ctx, jobID, index, url, html); err != nil {
		slog.Error("corpus put failed", "job_id", jobID, "err", err)
		return
	}

	if count >= f.minPages {
		f.runner.Trigger(ctx, jobID)
	}
}

func (f *RedisStreamFeeder) Feed(ctx context.Context, url, html, jobID string) error {
	return f.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: f.streamKey,
		Values: map[string]interface{}{
			"url":    url,
			"html":   html,
			"job_id": jobID,
		},
	}).Err()
}

func (f *RedisStreamFeeder) Force(ctx context.Context, jobID string) {
	f.runner.Trigger(ctx, jobID)
}
