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

// FixCacheHeaders iterates all objects and sets Cache-Control if missing.
func (s *COSStorage) FixCacheHeaders(ctx context.Context) {
	prefixes := []string{"audio/", "covers/"}
	cacheControl := "public, max-age=31536000, immutable"

	for _, prefix := range prefixes {
		marker := ""
		for {
			opt := &cos.BucketGetOptions{
				Prefix:  prefix,
				Marker:  marker,
				MaxKeys: 200,
			}
			result, _, err := s.client.Bucket.Get(ctx, opt)
			if err != nil {
				fmt.Printf("[cos-fix] list %s error: %v\n", prefix, err)
				break
			}
			for _, obj := range result.Contents {
				// Check current headers
				resp, err := s.client.Object.Head(ctx, obj.Key, nil)
				if err != nil {
					continue
				}
				cc := resp.Header.Get("Cache-Control")
				if cc != "" && cc != "no-cache" {
					continue // already has cache header
				}
				// Copy object to itself with new metadata
				srcURL := fmt.Sprintf("%s/%s", s.baseURL, obj.Key)
				_, _, err = s.client.Object.Copy(ctx, obj.Key, srcURL, &cos.ObjectCopyOptions{
					ObjectCopyHeaderOptions: &cos.ObjectCopyHeaderOptions{
						CacheControl:        cacheControl,
						XCosMetadataDirective: "Replaced",
					},
				})
				if err != nil {
					fmt.Printf("[cos-fix] fix %s error: %v\n", obj.Key, err)
				} else {
					fmt.Printf("[cos-fix] fixed %s\n", obj.Key)
				}
			}
			if !result.IsTruncated {
				break
			}
			marker = result.NextMarker
		}
	}
	fmt.Println("[cos-fix] done")
}
