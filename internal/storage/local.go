package storage

import (
	"context"
	"io"
	"os"
	"path/filepath"
)

// LocalStorage implements Storage using the local filesystem.
type LocalStorage struct {
	baseDir string
}

// NewLocalStorage creates a LocalStorage instance rooted at baseDir.
func NewLocalStorage(baseDir string) *LocalStorage {
	return &LocalStorage{baseDir: baseDir}
}

func (s *LocalStorage) Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error {
	fullPath := filepath.Join(s.baseDir, key)
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	return os.WriteFile(fullPath, data, 0644)
}

func (s *LocalStorage) Delete(ctx context.Context, key string) error {
	fullPath := filepath.Join(s.baseDir, key)
	err := os.Remove(fullPath)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *LocalStorage) URL(key string) string {
	// LocalStorage does not provide external URLs; serving is handled by HTTP file server.
	return ""
}

func (s *LocalStorage) Exists(ctx context.Context, key string) bool {
	fullPath := filepath.Join(s.baseDir, key)
	_, err := os.Stat(fullPath)
	return err == nil
}
