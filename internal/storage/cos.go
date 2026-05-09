package storage

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/tencentyun/cos-go-sdk-v5"
)

// COSStorage implements Storage using Tencent Cloud Object Storage.
type COSStorage struct {
	client  *cos.Client
	baseURL string
	cdnURL  string
}

// NewCOSStorage creates a COSStorage instance.
func NewCOSStorage(secretID, secretKey, bucket, region, cdnDomain string) (*COSStorage, error) {
	bucketURL, err := url.Parse(fmt.Sprintf("https://%s.cos.%s.myqcloud.com", bucket, region))
	if err != nil {
		return nil, fmt.Errorf("parse bucket url: %w", err)
	}
	serviceURL, err := url.Parse(fmt.Sprintf("https://cos.%s.myqcloud.com", region))
	if err != nil {
		return nil, fmt.Errorf("parse service url: %w", err)
	}

	baseURL := &cos.BaseURL{
		BucketURL:  bucketURL,
		ServiceURL: serviceURL,
	}

	client := cos.NewClient(baseURL, &http.Client{
		Transport: &cos.AuthorizationTransport{
			SecretID:  secretID,
			SecretKey: secretKey,
		},
	})

	cdnURLStr := ""
	if cdnDomain != "" {
		cdnURLStr = "https://" + cdnDomain
	}

	return &COSStorage{
		client:  client,
		baseURL: bucketURL.String(),
		cdnURL:  cdnURLStr,
	}, nil
}

func (s *COSStorage) Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error {
	opt := &cos.ObjectPutOptions{
		ObjectPutHeaderOptions: &cos.ObjectPutHeaderOptions{
			ContentType:   contentType,
			ContentLength: size,
			CacheControl:  "public, max-age=31536000, immutable",
		},
	}
	_, err := s.client.Object.Put(ctx, key, r, opt)
	return err
}

func (s *COSStorage) Delete(ctx context.Context, key string) error {
	_, err := s.client.Object.Delete(ctx, key)
	return err
}

func (s *COSStorage) URL(key string) string {
	if key == "" {
		return ""
	}
	if s.cdnURL != "" {
		return s.cdnURL + "/" + key
	}
	return s.baseURL + "/" + key
}

func (s *COSStorage) Exists(ctx context.Context, key string) bool {
	ok, _ := s.client.Object.IsExist(ctx, key)
	return ok
}
