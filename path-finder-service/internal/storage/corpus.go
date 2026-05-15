package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type CorpusStore struct {
	client *s3.Client
	bucket string
}

func NewCorpusStore(client *s3.Client, bucket string) *CorpusStore {
	return &CorpusStore{client: client, bucket: bucket}
}

func (s *CorpusStore) Put(ctx context.Context, jobID string, index int, url string, html string) error {
	key := fmt.Sprintf("%s/%d.html", jobID, index)
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      &s.bucket,
		Key:         &key,
		Body:        bytes.NewReader([]byte(html)),
		ContentType: aws.String("text/html"),
		Metadata:    map[string]string{"url": url},
	})
	return err
}

func (s *CorpusStore) GetAll(ctx context.Context, jobID string) ([][2]string, error) {
	prefix := jobID + "/"
	listOut, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: &s.bucket,
		Prefix: &prefix,
	})
	if err != nil {
		return nil, fmt.Errorf("list objects: %w", err)
	}

	var pages [][2]string
	for _, obj := range listOut.Contents {
		key := aws.ToString(obj.Key)

		head, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
			Bucket: &s.bucket,
			Key:    &key,
		})
		if err != nil {
			return nil, fmt.Errorf("head %s: %w", key, err)
		}
		pageURL := ""
		if head.Metadata != nil {
			pageURL = head.Metadata["url"]
		}

		getOut, err := s.client.GetObject(ctx, &s3.GetObjectInput{
			Bucket: &s.bucket,
			Key:    &key,
		})
		if err != nil {
			return nil, fmt.Errorf("get %s: %w", key, err)
		}
		body, err := io.ReadAll(getOut.Body)
		getOut.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", key, err)
		}

		pages = append(pages, [2]string{pageURL, string(body)})
	}

	return pages, nil
}

func (s *CorpusStore) Delete(ctx context.Context, jobID string) error {
	prefix := jobID + "/"
	listOut, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: &s.bucket,
		Prefix: &prefix,
	})
	if err != nil {
		return err
	}

	for _, obj := range listOut.Contents {
		key := aws.ToString(obj.Key)
		_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
			Bucket: &s.bucket,
			Key:    &key,
		})
		if err != nil {
			return fmt.Errorf("delete %s: %w", key, err)
		}
	}
	return nil
}
