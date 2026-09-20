package media

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"path/filepath"
	"testing"

	"karuta/backend/store"
)

// fakeStorage is an in-memory Storage implementation for service tests.
type fakeStorage struct {
	objects map[string][]byte
}

func newFakeStorage() *fakeStorage {
	return &fakeStorage{objects: map[string][]byte{}}
}

func (f *fakeStorage) Put(_ context.Context, key string, r io.Reader, size int64, _ string) error {
	data, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	if size >= 0 && int64(len(data)) != size {
		return fmt.Errorf("size mismatch: got %d, want %d", len(data), size)
	}
	f.objects[key] = data
	return nil
}

func (f *fakeStorage) Delete(_ context.Context, key string) error {
	delete(f.objects, key)
	return nil
}

func (f *fakeStorage) URL(key string) string { return key }

func (f *fakeStorage) Exists(_ context.Context, key string) bool {
	_, ok := f.objects[key]
	return ok
}

func newTestService(t *testing.T) (*Service, *fakeStorage, *store.Store, *sql.DB) {
	t.Helper()
	db, err := store.OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	stor := newFakeStorage()
	st := store.NewStore(db)
	return NewService(stor, st.MediaAssets), stor, st, db
}

func newTestUser(t *testing.T, st *store.Store, name string) int64 {
	t.Helper()
	user, err := st.Users.CreateUser(name, name+"@example.test", "hash")
	if err != nil {
		t.Fatal(err)
	}
	return user.ID
}

func digestOf(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func TestPutDedupesIdenticalBytes(t *testing.T) {
	svc, stor, st, db := newTestService(t)
	ctx := context.Background()

	first := newTestUser(t, st, "uploader-a")
	second := newTestUser(t, st, "uploader-b")

	keyA, err := svc.Put(ctx, "cover", "covers", "webp", "image/webp", []byte("identical-bytes"), first)
	if err != nil {
		t.Fatal(err)
	}
	keyB, err := svc.Put(ctx, "cover", "covers", "webp", "image/webp", []byte("identical-bytes"), second)
	if err != nil {
		t.Fatal(err)
	}

	if keyA != keyB {
		t.Fatalf("identical bytes produced different keys: %q vs %q", keyA, keyB)
	}
	if filepath.Dir(keyA) != "covers" {
		t.Fatalf("unexpected key layout: %q", keyA)
	}
	if !stor.Exists(ctx, keyA) {
		t.Fatalf("object %q missing after upload", keyA)
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM media_assets WHERE kind = 'cover' AND sha256 = ?`,
		digestOf([]byte("identical-bytes"))).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("expected exactly one ready asset record, got %d", count)
	}
}

func TestPutSeparatesKindsAndBytes(t *testing.T) {
	svc, _, st, _ := newTestService(t)
	ctx := context.Background()
	userID := newTestUser(t, st, "uploader-a")

	coverKey, err := svc.Put(ctx, "cover", "covers", "webp", "image/webp", []byte("shared-bytes"), userID)
	if err != nil {
		t.Fatal(err)
	}
	audioKey, err := svc.Put(ctx, "audio", "audio", "mp3", "audio/mpeg", []byte("shared-bytes"), userID)
	if err != nil {
		t.Fatal(err)
	}
	otherKey, err := svc.Put(ctx, "cover", "covers", "webp", "image/webp", []byte("other-bytes"), userID)
	if err != nil {
		t.Fatal(err)
	}

	if coverKey == audioKey {
		t.Fatal("same bytes under different kinds must not share a key")
	}
	if coverKey == otherKey {
		t.Fatal("different bytes must not share a key")
	}
	if filepath.Dir(coverKey) != "covers" || filepath.Dir(audioKey) != "audio" {
		t.Fatalf("keys not stored in requested directories: %q %q", coverKey, audioKey)
	}
}

func TestPutRewritesMissingObject(t *testing.T) {
	svc, stor, st, _ := newTestService(t)
	ctx := context.Background()
	userID := newTestUser(t, st, "uploader-a")

	key, err := svc.Put(ctx, "avatar", "avatars", "png", "image/png", []byte("avatar-bytes"), userID)
	if err != nil {
		t.Fatal(err)
	}
	if err := stor.Delete(ctx, key); err != nil {
		t.Fatal(err)
	}

	rewritten, err := svc.Put(ctx, "avatar", "avatars", "png", "image/png", []byte("avatar-bytes"), userID)
	if err != nil {
		t.Fatal(err)
	}
	if rewritten != key {
		t.Fatalf("rewrite changed key: %q vs %q", key, rewritten)
	}
	if !stor.Exists(ctx, key) {
		t.Fatalf("object %q not rewritten after loss", key)
	}
}

func TestForgetRemovesRecord(t *testing.T) {
	svc, _, st, _ := newTestService(t)
	ctx := context.Background()
	userID := newTestUser(t, st, "uploader-a")

	key, err := svc.Put(ctx, "cover", "covers", "webp", "image/webp", []byte("forget-me"), userID)
	if err != nil {
		t.Fatal(err)
	}

	if err := svc.Forget(key); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.assets.FindReady("cover", digestOf([]byte("forget-me"))); err != sql.ErrNoRows {
		t.Fatalf("expected sql.ErrNoRows after Forget, got %v", err)
	}
}
