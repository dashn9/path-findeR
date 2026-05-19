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

func (s *S3CorpusStore) Put(ctx context.Context, hostname, parserID string, index int, url, html string) error {
	key := pageKey(hostname, parserID, index)
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
func (s *S3CorpusStore) GetAll(ctx context.Context, hostname, parserID string) ([]Page, error) {
	prefix := parserPrefix(hostname, parserID)
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

func (s *S3CorpusStore) HasPagesNewerThan(ctx context.Context, hostname, parserID string, t time.Time) (bool, error) {
	prefix := parserPrefix(hostname, parserID)
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

func (s *S3CorpusStore) List(ctx context.Context, hostname, parserID string) ([]PageMeta, error) {
	prefix := parserPrefix(hostname, parserID)
	keys, err := s.listKeysWithMeta(ctx, prefix)
	if err != nil {
		return nil, err
	}
	out := make([]PageMeta, 0, len(keys))
	for _, k := range keys {
		idx := parseIndex(k.key, prefix)
		// HeadObject is the only way to get user metadata (the source URL).
		head, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
			Bucket: &s.bucket,
			Key:    &k.key,
		})
		if err != nil {
			return nil, fmt.Errorf("head %s: %w", k.key, err)
		}
		out = append(out, PageMeta{
			URL:       head.Metadata["url"],
			Index:     idx,
			FetchedAt: k.lastModified,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Index < out[j].Index })
	return out, nil
}

type s3KeyMeta struct {
	key          string
	lastModified time.Time
}

func (s *S3CorpusStore) listKeysWithMeta(ctx context.Context, prefix string) ([]s3KeyMeta, error) {
	var out []s3KeyMeta
	var token *string
	for {
		page, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            &s.bucket,
			Prefix:            &prefix,
			ContinuationToken: token,
		})
		if err != nil {
			return nil, fmt.Errorf("list objects: %w", err)
		}
		for _, obj := range page.Contents {
			mod := time.Time{}
			if obj.LastModified != nil {
				mod = obj.LastModified.UTC()
			}
			out = append(out, s3KeyMeta{key: aws.ToString(obj.Key), lastModified: mod})
		}
		if page.IsTruncated == nil || !*page.IsTruncated {
			break
		}
		token = page.NextContinuationToken
	}
	return out, nil
}

func (s *S3CorpusStore) Delete(ctx context.Context, hostname, parserID string) error {
	prefix := parserPrefix(hostname, parserID)
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

// parserPrefix builds the S3 key prefix "<hostname>/<parserID>/" so the
// bucket layout is browsable by site, matching the local-fs layout.
func parserPrefix(hostname, parserID string) string {
	return hostname + "/" + parserID + "/"
}

func pageKey(hostname, parserID string, index int) string {
	return fmt.Sprintf("%s%d.html", parserPrefix(hostname, parserID), index)
}

func parseIndex(key, prefix string) int {
	name := strings.TrimPrefix(key, prefix)
	name = strings.TrimSuffix(name, ".html")
	if n, err := strconv.Atoi(name); err == nil {
		return n
	}
	return 1 << 30
}
