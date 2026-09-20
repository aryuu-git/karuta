package media

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"path"

	"karuta/backend/storage"
	"karuta/backend/store"
)

type Service struct {
	storage storage.Storage
	assets  *store.MediaAssetStore
}

func NewService(storage storage.Storage, assets *store.MediaAssetStore) *Service {
	return &Service{storage: storage, assets: assets}
}

// Put stores media under a content-addressed key and reuses an existing ready
// asset with identical bytes. Existing UUID-based paths remain valid.
func (s *Service) Put(ctx context.Context, kind, directory, extension, mimeType string, data []byte, userID int64) (string, error) {
	digest := sha256.Sum256(data)
	digestHex := hex.EncodeToString(digest[:])
	if asset, err := s.assets.FindReady(kind, digestHex); err == nil {
		if s.storage.Exists(ctx, asset.ObjectKey) {
			return asset.ObjectKey, nil
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}

	objectKey := path.Join(directory, digestHex+"."+extension)
	if err := s.storage.Put(ctx, objectKey, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		return "", err
	}
	asset, err := s.assets.RecordReady(kind, objectKey, digestHex, mimeType, int64(len(data)), userID)
	if err != nil {
		// The object may have been written concurrently by another request
		// that already registered it; never delete a possibly-shared object.
		if raced, findErr := s.assets.FindReady(kind, digestHex); findErr == nil && s.storage.Exists(ctx, raced.ObjectKey) {
			return raced.ObjectKey, nil
		}
		return "", err
	}
	return asset.ObjectKey, nil
}

func (s *Service) Forget(objectKey string) error {
	return s.assets.DeleteByObjectKey(objectKey)
}
