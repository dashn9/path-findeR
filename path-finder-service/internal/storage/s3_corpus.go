package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3CorpusStore struct {
	client *s3.Client
	bucket string
}

func NewS3CorpusStore(client *s3.Client, bucket string) *S3CorpusStore {
	return &S3CorpusStore{client: client, bucket: bucket}
}

func (s *S3CorpusStore) Put(ctx context.Context, bucketID string, index int, url, html string) error {
	key := pageKey(bucketID, index)
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      &s.bucket,
		Key:         &key,
		Body:        bytes.NewReader([]byte(html)),
		ContentType: aws.String("text/html"),
		Metadata:    map[string]string{"url": url},
	})
	return err
}

// GetAll fetches every page in a single pass: one ListObjects + one GetObject
// per key. GetObject returns Metadata on the response, so a separate
// HeadObject is unnecessary. Object order is restored from the numeric
// filename so callers see pages in feed order, not S3's lexicographic listing.
func (s *S3CorpusStore) GetAll(ctx context.Context, bucketID string) ([]Page, error) {
	prefix := bucketPrefix(bucketID)
	keys, err := s.listKeys(ctx, prefix)
	if err != nil {
		return nil, err
	}

	type indexed struct {
		idx  int
		page Page
	}
	results := make([]indexed, 0, len(keys))
	for _, key := range keys {
		out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
			Bucket: &s.bucket,
			Key:    &key,
		})
		if err != nil {
			return nil, fmt.Errorf("get %s: %w", key, err)
		}
		body, err := io.ReadAll(out.Body)
		_ = out.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", key, err)
		}
		results = append(results, indexed{
			idx:  parseIndex(key, prefix),
			page: Page{URL: out.Metadata["url"], HTML: string(body)},
		})
	}

	sort.Slice(results, func(i, j int) bool { return results[i].idx < results[j].idx })
	pages := make([]Page, len(results))
	for i, r := range results {
		pages[i] = r.page
	}
	return pages, nil
}

func (s *S3CorpusStore) HasPagesNewerThan(ctx context.Context, bucketID string, t time.Time) (bool, error) {
	prefix := bucketPrefix(bucketID)
	out, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: &s.bucket,
		Prefix: &prefix,
	})
	if err != nil {
		return false, fmt.Errorf("list objects: %w", err)
	}
	for _, obj := range out.Contents {
		if obj.LastModified != nil && obj.LastModified.After(t) {
			return true, nil
		}
	}
	return false, nil
}

func (s *S3CorpusStore) Delete(ctx context.Context, bucketID string) error {
	prefix := bucketPrefix(bucketID)
	keys, err := s.listKeys(ctx, prefix)
	if err != nil {
		return err
	}
	for _, key := range keys {
		if _, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: &s.bucket,
			Key:    &key,
		}); err != nil {
			return fmt.Errorf("delete %s: %w", key, err)
		}
	}
	return nil
}

func (s *S3CorpusStore) listKeys(ctx context.Context, prefix string) ([]string, error) {
	var keys []string
	var token *string
	for {
		out, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            &s.bucket,
			Prefix:            &prefix,
			ContinuationToken: token,
		})
		if err != nil {
			return nil, fmt.Errorf("list objects: %w", err)
		}
		for _, obj := range out.Contents {
			keys = append(keys, aws.ToString(obj.Key))
		}
		if out.IsTruncated == nil || !*out.IsTruncated {
			break
		}
		token = out.NextContinuationToken
	}
	return keys, nil
}

// bucketPrefix turns "host:shape" into the S3 prefix "host/shape/".
func bucketPrefix(bucketID string) string {
	return strings.ReplaceAll(bucketID, ":", "/") + "/"
}

func pageKey(bucketID string, index int) string {
	return fmt.Sprintf("%s%d.html", bucketPrefix(bucketID), index)
}

func parseIndex(key, prefix string) int {
	name := strings.TrimPrefix(key, prefix)
	name = strings.TrimSuffix(name, ".html")
	if n, err := strconv.Atoi(name); err == nil {
		return n
	}
	return 1 << 30
}
