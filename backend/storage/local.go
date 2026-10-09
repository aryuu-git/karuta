package storage

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// LocalStorage stores development media under a dedicated directory.
type LocalStorage struct {
	root string
}

func NewLocalStorage(root string) (*LocalStorage, error) {
	if root == "" {
		return nil, fmt.Errorf("local media directory is empty")
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0755); err != nil {
		return nil, err
	}
	root, err = filepath.EvalSymlinks(abs)
	if err != nil {
		return nil, err
	}
	return &LocalStorage{root: root}, nil
}

// Reject traversal, Windows drive paths and symlinks for reads and writes alike.
func (s *LocalStorage) filePath(key string) (string, error) {
	if key == "" || key == "." || path.IsAbs(key) || path.Clean(key) != key ||
		strings.ContainsAny(key, "\\:\x00") || !filepath.IsLocal(filepath.FromSlash(key)) {
		return "", fmt.Errorf("invalid local media key")
	}
	parts := strings.Split(key, "/")
	current := s.root
	for _, part := range parts {
		if part == ".." || strings.HasSuffix(part, ".") || strings.HasSuffix(part, " ") {
			return "", fmt.Errorf("invalid local media key")
		}
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil && !os.IsNotExist(err) {
			return "", err
		}
		if err == nil && info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("symlinks are not allowed in local media paths")
		}
	}
	return current, nil
}

func (s *LocalStorage) Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	filename, err := s.filePath(key)
	if err != nil {
		return err
	}
	if size < 0 {
		return fmt.Errorf("invalid media size")
	}
	if err := os.MkdirAll(filepath.Dir(filename), 0755); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(filename), ".upload-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	written, copyErr := io.Copy(file, io.LimitReader(r, size+1))
	closeErr := file.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	if written != size {
		return fmt.Errorf("media size mismatch: got %d, expected %d", written, size)
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	return os.Rename(file.Name(), filename)
}

func (s *LocalStorage) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	filename, err := s.filePath(key)
	if err != nil {
		return err
	}
	if err := os.Remove(filename); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (s *LocalStorage) URL(key string) string {
	if _, err := s.filePath(key); err != nil {
		return ""
	}
	return (&url.URL{Path: "/uploads/" + key}).String()
}

func (s *LocalStorage) Exists(ctx context.Context, key string) bool {
	if ctx.Err() != nil {
		return false
	}
	filename, err := s.filePath(key)
	if err != nil {
		return false
	}
	info, err := os.Stat(filename)
	return err == nil && info.Mode().IsRegular()
}

// ServeHTTP serves individual media files, including audio byte-range requests.
func (s *LocalStorage) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !strings.HasPrefix(r.URL.Path, "/uploads/") {
		http.NotFound(w, r)
		return
	}
	filename, err := s.filePath(strings.TrimPrefix(r.URL.Path, "/uploads/"))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	file, err := os.Open(filename)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}
