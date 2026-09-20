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

// Stats 返回当前登记的（ready 状态）媒体资产总数与总字节数。
func (s *MediaAssetStore) Stats() (MediaStats, error) {
	var st MediaStats
	err := s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM media_assets WHERE status = 'ready'`).
		Scan(&st.Assets, &st.Bytes)
	if err != nil {
		return st, err
	}
	return st, nil
}

// ---- B2 资产生命周期状态机：pending_upload → ready → pending_delete → deleted/failed ----

// MarkPendingDelete 将资产标记为待删除（真实引用归零时由业务层调用）。
// 物理删除由 media gc 管理命令执行，业务路径不再直接删 COS 对象。
func (s *MediaAssetStore) MarkPendingDelete(objectKey string) error {
	_, err := s.db.Exec(`UPDATE media_assets SET status = 'pending_delete' WHERE object_key = ? AND status = 'ready'`, objectKey)
	return err
}

// MarkDeleted 记录物理删除完成。
func (s *MediaAssetStore) MarkDeleted(objectKey string) error {
	_, err := s.db.Exec(`UPDATE media_assets SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE object_key = ?`, objectKey)
	return err
}

// Orphan 是一条无真实引用的资产（GC 的处理对象）。
type Orphan struct {
	ObjectKey string
	Kind      string
	SizeBytes int64
	Status    string
}

// ListOrphans 返回 ready 状态但已无任何真实引用的资产。
// 引用判定与业务删除路径保持同一套真实来源：cards.cover_path、
// card_audios.audio_path、cards.audio_path（旧数据兜底）、users.avatar_path。
func (s *MediaAssetStore) ListOrphans() ([]Orphan, error) {
	rows, err := s.db.Query(`
		SELECT m.object_key, m.kind, m.size_bytes, m.status
		FROM media_assets m
		WHERE m.status = 'ready'
		  AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.cover_path = m.object_key)
		  AND NOT EXISTS (SELECT 1 FROM card_audios ca WHERE ca.audio_path = m.object_key)
		  AND NOT EXISTS (SELECT 1 FROM cards c2 WHERE c2.audio_path = m.object_key)
		  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.avatar_path = m.object_key)
		  AND m.created_at <= datetime('now', '-1 day')`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Orphan
	for rows.Next() {
		var o Orphan
		if err := rows.Scan(&o.ObjectKey, &o.Kind, &o.SizeBytes, &o.Status); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// ListPendingDelete 返回全部待物理删除的资产。
func (s *MediaAssetStore) ListPendingDelete() ([]Orphan, error) {
	rows, err := s.db.Query(`SELECT object_key, kind, size_bytes, status FROM media_assets WHERE status = 'pending_delete'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Orphan
	for rows.Next() {
		var o Orphan
		if err := rows.Scan(&o.ObjectKey, &o.Kind, &o.SizeBytes, &o.Status); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// UserUsage 返回某用户的资产总量与当日上传次数（配额判定）。
type UserUsage struct {
	Bytes          int64
	TodayUploads   int64
}

func (s *MediaAssetStore) UserUsage(userID int64) (UserUsage, error) {
	var u UserUsage
	err := s.db.QueryRow(`SELECT COALESCE(SUM(size_bytes), 0) FROM media_assets WHERE created_by = ? AND status IN ('ready','pending_delete')`, userID).
		Scan(&u.Bytes)
	if err != nil {
		return u, err
	}
	err = s.db.QueryRow(`SELECT COUNT(*) FROM media_assets WHERE created_by = ? AND created_at >= date('now') AND kind != 'avatar'`, userID).
		Scan(&u.TodayUploads)
	return u, err
}

func nullableID(id int64) interface{} {
	if id == 0 {
		return nil
	}
	return id
}
