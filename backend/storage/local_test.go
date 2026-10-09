package storage

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestLocalStorageMediaLifecycle(t *testing.T) {
	s, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	key := "audio/sample.wav"
	if err := s.Put(ctx, key, bytes.NewBufferString("0123456789"), 10, "audio/wav"); err != nil {
		t.Fatal(err)
	}
	if !s.Exists(ctx, key) || s.URL(key) != "/uploads/audio/sample.wav" {
		t.Fatal("media was not stored with a local URL")
	}
	// Content-addressed uploads may write an existing key again.
	if err := s.Put(ctx, key, bytes.NewBufferString("abcdefghij"), 10, "audio/wav"); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodGet, s.URL(key), nil)
	r.Header.Set("Range", "bytes=2-5")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != http.StatusPartialContent || w.Body.String() != "cdef" || w.Header().Get("Content-Range") != "bytes 2-5/10" {
		t.Fatalf("range response: %d %q %v", w.Code, w.Body.String(), w.Header())
	}
	if w.Header().Get("Content-Type") != "audio/wav" {
		t.Fatalf("audio MIME type = %q", w.Header().Get("Content-Type"))
	}
	w = httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest(http.MethodHead, s.URL(key), nil))
	if w.Code != http.StatusOK || w.Body.Len() != 0 || w.Header().Get("Content-Length") != "10" {
		t.Fatalf("HEAD response: %d %v", w.Code, w.Header())
	}
	if err := s.Delete(ctx, key); err != nil {
		t.Fatal(err)
	}
	if s.Exists(ctx, key) {
		t.Fatal("deleted file still exists")
	}
	if err := s.Delete(ctx, key); err != nil {
		t.Fatalf("deleting a missing file: %v", err)
	}
}

func TestLocalStorageRejectsTraversalAndSymlinks(t *testing.T) {
	root := t.TempDir()
	s, err := NewLocalStorage(filepath.Join(root, "uploads"))
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	for _, key := range []string{"", ".", "..", "../secret", "/secret", "covers/../../secret", "covers/../secret", `covers\secret`, `C:/secret`, "audio/a:stream", "covers/name.", "covers/name "} {
		t.Run(key, func(t *testing.T) {
			if err := s.Put(ctx, key, bytes.NewBufferString("x"), 1, "image/png"); err == nil {
				t.Fatal("unsafe write accepted")
			}
			if err := s.Delete(ctx, key); err == nil || s.Exists(ctx, key) || s.URL(key) != "" {
				t.Fatal("unsafe key accepted")
			}
		})
	}
	secret := filepath.Join(root, "secret.txt")
	if err := os.WriteFile(secret, []byte("secret"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(secret, filepath.Join(s.root, "secret.txt")); err != nil {
		t.Logf("symlink test unavailable on this platform: %v", err)
		return
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/uploads/secret.txt", nil))
	if w.Code != http.StatusNotFound || s.Exists(ctx, "secret.txt") {
		t.Fatal("symlink exposed a file outside the media directory")
	}
}

func TestLocalStorageRejectsIncompleteUploadsAndDirectoryListing(t *testing.T) {
	s, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := s.Put(ctx, "covers/bad.png", bytes.NewBufferString("short"), 10, "image/png"); err == nil {
		t.Fatal("incomplete upload accepted")
	}
	if s.Exists(ctx, "covers/bad.png") {
		t.Fatal("incomplete upload published")
	}
	files, err := os.ReadDir(filepath.Join(s.root, "covers"))
	if err != nil || len(files) != 0 {
		t.Fatalf("temporary upload files left behind: %v %v", files, err)
	}
	for _, target := range []string{"/uploads/", "/uploads/covers", "/uploads/../secret.txt", "/uploads/%2e%2e/secret.txt", "/uploads/missing.png"} {
		w := httptest.NewRecorder()
		s.ServeHTTP(w, httptest.NewRequest(http.MethodGet, target, nil))
		if w.Code != http.StatusNotFound {
			t.Fatalf("%s returned %d", target, w.Code)
		}
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if err := s.Put(cancelled, "covers/cancel.png", bytes.NewBufferString("x"), 1, "image/png"); err == nil {
		t.Fatal("cancelled upload accepted")
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/uploads/covers/bad.png", nil))
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatal("unsupported HTTP method accepted")
	}
}

var _ Storage = (*LocalStorage)(nil)
var _ http.Handler = (*LocalStorage)(nil)
