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

// FileURL generates a unified URL for serving files, compatible with both legacy absolute paths and new COS keys.
func FileURL(storedPath string, category string) string {
	if storedPath == "" {
		return ""
	}
	base := filepath.Base(storedPath)
	return "/uploads/" + category + "/" + base
}

// PathToKey converts a stored path (legacy absolute path or new key) to COS key format.
func PathToKey(path string) string {
	if path == "" {
		return ""
	}
	base := filepath.Base(path)
	dir := filepath.Base(filepath.Dir(path))
	if dir == "audio" || dir == "covers" {
		return dir + "/" + base
	}
	// If already a key format like "audio/xxx.mp3"
	if strings.HasPrefix(path, "audio/") || strings.HasPrefix(path, "covers/") {
		return path
	}
	return base
}
