package media

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"karuta/backend/store"
)

// newQuotaTestService 构造带两个测试用户的服务，返回用户 ID 供配额测试。
func newQuotaTestService(t *testing.T, quota QuotaLimits) (*Service, *store.MediaAssetStore, int64, int64) {
	t.Helper()
	db, err := store.OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	assets := store.NewMediaAssetStore(db)
	st := store.NewStore(db)
	u1, err := st.Users.CreateUser("quota-user", "quota@test.local", "hash")
	if err != nil {
		t.Fatal(err)
	}
	u2, err := st.Users.CreateUser("other-user", "other@test.local", "hash")
	if err != nil {
		t.Fatal(err)
	}
	return NewServiceWithQuota(newFakeStorage(), assets, quota), assets, u1.ID, u2.ID
}

// B2：单日上传次数配额——达到上限后 Put 必须返回 ErrQuotaExceeded。
func TestQuotaDailyUploads(t *testing.T) {
	svc, _, uid, otherID := newQuotaTestService(t, QuotaLimits{DailyUploads: 2})

	ctx := context.Background()
	for i := 0; i < 2; i++ {
		data := []byte{byte(i)}
		if _, err := svc.Put(ctx, "audio", "audio", "mp3", "audio/mpeg", data, uid); err != nil {
			t.Fatalf("upload %d should pass: %v", i+1, err)
		}
	}
	if _, err := svc.Put(ctx, "audio", "audio", "mp3", "audio/mpeg", []byte{9}, uid); !strings.Contains(err.Error(), "quota exceeded: daily") {
		t.Fatalf("third upload err = %v, want daily quota exceeded", err)
	}

	// 其他用户不受影响
	if _, err := svc.Put(ctx, "audio", "audio", "mp3", "audio/mpeg", []byte{9}, otherID); err != nil {
		t.Fatalf("other user should not be limited: %v", err)
	}
}

// B2：总容量配额——超出后返回 ErrQuotaExceeded。
func TestQuotaTotalBytes(t *testing.T) {
	svc, _, uid, _ := newQuotaTestService(t, QuotaLimits{TotalBytes: 10})

	ctx := context.Background()
	if _, err := svc.Put(ctx, "audio", "audio", "mp3", "audio/mpeg", make([]byte, 8), uid); err != nil {
		t.Fatalf("first upload should pass: %v", err)
	}
	if _, err := svc.Put(ctx, "audio", "audio", "mp3", "audio/mpeg", make([]byte, 8), uid); !strings.Contains(err.Error(), "quota exceeded: total") {
		t.Fatalf("second upload err = %v, want total quota exceeded", err)
	}
}

// B2：Forget 标记 pending_delete 而非物理删除记录。
func TestForgetMarksPendingDelete(t *testing.T) {
	svc, assets, uid, _ := newQuotaTestService(t, QuotaLimits{})

	ctx := context.Background()
	key, err := svc.Put(ctx, "audio", "audio", "mp3", "audio/mpeg", []byte("data"), uid)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.Forget(key); err != nil {
		t.Fatal(err)
	}
	pending, err := assets.ListPendingDelete()
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 1 || pending[0].ObjectKey != key {
		t.Fatalf("pending_delete = %+v, want [%s]", pending, key)
	}
}
