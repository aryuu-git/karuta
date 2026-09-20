package store

import "database/sql"

type MediaAsset struct {
	ID        int64
	Kind      string
	ObjectKey string
	SHA256    string
	MimeType  string
	SizeBytes int64
	Status    string
	CreatedBy int64
}

type MediaAssetStore struct {
	db *sql.DB
}

func NewMediaAssetStore(db *sql.DB) *MediaAssetStore {
	return &MediaAssetStore{db: db}
}

func (s *MediaAssetStore) FindReady(kind, sha256 string) (*MediaAsset, error) {
	asset := &MediaAsset{}
	err := s.db.QueryRow(`SELECT id, kind, object_key, sha256, mime_type, size_bytes, status, COALESCE(created_by, 0)
		FROM media_assets WHERE kind = ? AND sha256 = ? AND status = 'ready'`, kind, sha256).
		Scan(&asset.ID, &asset.Kind, &asset.ObjectKey, &asset.SHA256, &asset.MimeType, &asset.SizeBytes, &asset.Status, &asset.CreatedBy)
	return asset, err
}

func (s *MediaAssetStore) RecordReady(kind, objectKey, sha256, mimeType string, sizeBytes, createdBy int64) (*MediaAsset, error) {
	_, err := s.db.Exec(`INSERT INTO media_assets(kind, object_key, sha256, mime_type, size_bytes, status, created_by)
		VALUES (?, ?, ?, ?, ?, 'ready', ?)
		ON CONFLICT(sha256, kind) DO UPDATE SET
			status='ready', deleted_at=NULL`, kind, objectKey, sha256, mimeType, sizeBytes, nullableID(createdBy))
	if err != nil {
		return nil, err
	}
	return s.FindReady(kind, sha256)
}

func (s *MediaAssetStore) DeleteByObjectKey(objectKey string) error {
	_, err := s.db.Exec(`DELETE FROM media_assets WHERE object_key = ?`, objectKey)
	return err
}

// MediaStats 汇总媒体资产量与总字节数（供 /metrics 端点）。
type MediaStats struct {
	Assets int64
	Bytes  int64
}

// Stats 返回当前登记的媒体资产总数与总字节数。
func (s *MediaAssetStore) Stats() (MediaStats, error) {
	var st MediaStats
	err := s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM media_assets WHERE status = 'ready'`).
		Scan(&st.Assets, &st.Bytes)
	if err != nil {
		return st, err
	}
	return st, nil
}

func nullableID(id int64) interface{} {
	if id == 0 {
		return nil
	}
	return id
}
