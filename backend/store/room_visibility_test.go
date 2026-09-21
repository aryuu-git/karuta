// 大厅列表可见性回归（v7 增补回顾）：私密房对普通用户隐藏、管理员可见并带标记。
// 同时实证 modernc sqlite 驱动对 bool 参数的绑定（`OR ?` 若拒 bool 会令列表整体 500）。
package store

import (
	"path/filepath"
	"testing"
)

func TestListActivePrivateVisibility(t *testing.T) {
	db, err := OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := NewStore(db)
	if _, err := db.Exec(`
		INSERT INTO users (id, username, email, password) VALUES (1, 'u', 'u@x.test', 'x');
		INSERT INTO decks (id, owner_id, name) VALUES (1, 1, 'deck');
		INSERT INTO rooms (id, code, deck_id, host_id, status, is_private) VALUES (1, 'PUB001', 1, 1, 'waiting', FALSE);
		INSERT INTO rooms (id, code, deck_id, host_id, status, is_private) VALUES (2, 'PRV001', 1, 1, 'waiting', TRUE);
	`); err != nil {
		t.Fatal(err)
	}

	// 普通用户：只见公开房
	plain, err := s.Rooms.ListActive(false)
	if err != nil {
		t.Fatalf("ListActive(false) errored — bool 绑定被驱动拒绝? %v", err)
	}
	if len(plain) != 1 || plain[0].Code != "PUB001" {
		t.Fatalf("regular viewer should see only the public room, got %d rooms", len(plain))
	}
	if plain[0].IsPrivate {
		t.Fatal("public room wrongly flagged private")
	}

	// 管理员：公开 + 私密，私密带标记
	admin, err := s.Rooms.ListActive(true)
	if err != nil {
		t.Fatal(err)
	}
	if len(admin) != 2 {
		t.Fatalf("admin should see 2 rooms, got %d", len(admin))
	}
	privateSeen := false
	for _, r := range admin {
		if r.IsPrivate {
			privateSeen = true
		}
	}
	if !privateSeen {
		t.Fatal("admin list missing the private room's is_private flag")
	}
}
