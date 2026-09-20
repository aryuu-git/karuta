package media

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"path"

	"karuta/backend/storage"
	"karuta/backend/store"
)

// 配额错误：业务层应映射为明确的 QUOTA_EXCEEDED 错误码。
var ErrQuotaExceeded = errors.New("quota exceeded")

// QuotaLimits 用户上传配额（0 表示不限）。
type QuotaLimits struct {
	// TotalBytes 每用户媒体资产总容量上限（字节）。
	TotalBytes int64
	// DailyUploads 每用户单日上传次数上限。
	DailyUploads int64
}

type Service struct {
	storage storage.Storage
	assets  *store.MediaAssetStore
	quota   QuotaLimits
}

func NewService(storage storage.Storage, assets *store.MediaAssetStore) *Service {
	return NewServiceWithQuota(storage, assets, QuotaLimits{})
}

func NewServiceWithQuota(storage storage.Storage, assets *store.MediaAssetStore, quota QuotaLimits) *Service {
	return &Service{storage: storage, assets: assets, quota: quota}
}

// checkQuota 校验用户配额：总容量与单日上传次数。
// userID=0（匿名上传）不限制——当前所有上传都带用户身份，此为防御分支。
func (s *Service) checkQuota(userID int64, incoming int64) error {
	if userID == 0 {
		return nil
	}
	if s.quota.TotalBytes <= 0 && s.quota.DailyUploads <= 0 {
		return nil
	}
	usage, err := s.assets.UserUsage(userID)
	if err != nil {
		// 配额查询失败不应阻断上传（可用性优先），仅由调用方日志兜底。
		return nil
	}
	if s.quota.TotalBytes > 0 && usage.Bytes+incoming > s.quota.TotalBytes {
		return fmt.Errorf("%w: total", ErrQuotaExceeded)
	}
	if s.quota.DailyUploads > 0 && usage.TodayUploads >= s.quota.DailyUploads {
		return fmt.Errorf("%w: daily", ErrQuotaExceeded)
	}
	return nil
}

// Put stores media under a content-addressed key and reuses an existing ready
// asset with identical bytes. Existing UUID-based paths remain valid.
func (s *Service) Put(ctx context.Context, kind, directory, extension, mimeType string, data []byte, userID int64) (string, error) {
	if err := s.checkQuota(userID, int64(len(data))); err != nil {
		return "", err
	}
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

// Forget 将资产标记为 pending_delete（B2 状态机）。
// 物理删除由 `karuta-admin media gc` 执行；此调用仅表示业务引用已归零。
func (s *Service) Forget(objectKey string) error {
	return s.assets.MarkPendingDelete(objectKey)
}
