package config

import "os"

// S3Config groups the bucket + AWS credentials together. The AWS SDK falls back
// to its standard credential chain (instance role, shared file, etc.) when these
// are blank — set them explicitly only if you need to override.
type S3Config struct {
	Bucket          string
	Region          string
	AccessKeyID     string
	SecretAccessKey string
	SessionToken    string
	EndpointURL     string // override for S3-compatible stores (MinIO etc.); blank = AWS
	ForcePathStyle  bool   // required for MinIO and most S3-compatible endpoints
}

func loadS3() S3Config {
	return S3Config{
		Bucket:          getenv("S3_BUCKET", "path-finder-corpus"),
		Region:          getenv("AWS_REGION", "us-east-1"),
		AccessKeyID:     os.Getenv("AWS_ACCESS_KEY_ID"),
		SecretAccessKey: os.Getenv("AWS_SECRET_ACCESS_KEY"),
		SessionToken:    os.Getenv("AWS_SESSION_TOKEN"),
		EndpointURL:     os.Getenv("S3_ENDPOINT_URL"),
		ForcePathStyle:  getenv("S3_FORCE_PATH_STYLE", "") == "true",
	}
}
