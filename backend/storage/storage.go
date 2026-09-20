package storage

import (
	"context"
	"io"
	"path/filepath"
	"strings"
)

// Storage defines a unified file storage interface supporting both local disk and COS.
type Storage interface {
	Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error
	Delete(ctx context.Context, key string) error
	URL(key string) string
	Exists(ctx context.Context, key string) bool
}

// mediaBaseURL, when non-empty, makes FileURL/MediaURL return absolute URLs
// served directly by object storage/CDN, so clients skip the Go server hop
// entirely. Only enable it when media objects are publicly readable there.
var mediaBaseURL string

// SetMediaBaseURL configures the absolute base for media download URLs.
func SetMediaBaseURL(base string) {
	mediaBaseURL = strings.TrimRight(base, "/")
}

// FileURL generates a unified URL for serving files, compatible with both
// legacy absolute paths and new COS keys.
func FileURL(storedPath string, category string) string {
	if storedPath == "" {
		return ""
	}
	base := filepath.Base(storedPath)
	return MediaURL("/uploads/" + category + "/" + base)
}

// MediaURL rewrites a legacy /uploads/... URL to the absolute media base when
// configured; otherwise returns it unchanged.
func MediaURL(url string) string {
	if mediaBaseURL == "" || url == "" {
		return url
	}
	return mediaBaseURL + strings.TrimPrefix(url, "/uploads")
}

// PathToKey converts a stored path (legacy absolute path or new key) to COS key format.
func PathToKey(path string) string {
	if path == "" {
		return ""
	}
	base := filepath.Base(path)
	dir := filepath.Base(filepath.Dir(path))
	if dir == "audio" || dir == "covers" || dir == "avatars" {
		return dir + "/" + base
	}
	// If already a key format like "audio/xxx.mp3"
	if strings.HasPrefix(path, "audio/") || strings.HasPrefix(path, "covers/") || strings.HasPrefix(path, "avatars/") {
		return path
	}
	return base
}
