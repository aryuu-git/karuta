// GetUserStats 零对局回归（2026-09-30 修复）：SUM 聚合在零行时返回 NULL，
// 未 COALESCE 会把 NULL 扫进 int 报错 → /api/me/stats 对所有零对局用户 500，
// 旧 UI 的 !stats 兜底把它演成「还没有对局记录」长期无人发现。
package store

import (
	"path/filepath"
	"testing"
)

func TestGetUserStatsZeroGames(t *testing.T) {
	db, err := OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := NewStore(db)
	if _, err := db.Exec(`INSERT INTO users (id, username, email, password) VALUES (1, 'fresh', 'fresh@x.test', 'x')`); err != nil {
		t.Fatal(err)
	}

	// 修复前：SUM(NULL) 扫描报错（converting NULL to int）→ 500
	st, err := s.Rooms.GetUserStats(1)
	if err != nil {
		t.Fatalf("GetUserStats for zero-game user errored: %v", err)
	}
	if st.TotalGames != 0 || st.Top3Games != 0 || st.FirstGames != 0 || st.TotalScore != 0 || st.BestScore != 0 {
		t.Fatalf("zero-game user should have all-zero stats, got %+v", st)
	}

	// 有对局用户：COALESCE 不吞计数（聚合口径仍正确）
	if _, err := db.Exec(`
		INSERT INTO users (id, username, email, password) VALUES (2, 'veteran', 'v@x.test', 'x');
		INSERT INTO decks (id, owner_id, name) VALUES (1, 2, 'deck');
		INSERT INTO rooms (id, code, deck_id, host_id, status, training) VALUES (1, 'END001', 1, 2, 'end', FALSE);
		INSERT INTO room_players (room_id, user_id, role, score) VALUES (1, 2, 'player', 10);
		INSERT INTO room_players (room_id, user_id, role, score) VALUES (1, 1, 'player', 5);
	`); err != nil {
		t.Fatal(err)
	}
	st2, err := s.Rooms.GetUserStats(2)
	if err != nil {
		t.Fatal(err)
	}
	if st2.TotalGames != 1 || st2.FirstGames != 1 || st2.Top3Games != 1 || st2.TotalScore != 10 || st2.BestScore != 10 {
		t.Fatalf("veteran stats wrong: %+v", st2)
	}
	if st2.Top3Rate != 1 {
		t.Fatalf("veteran top3_rate should be 1, got %v", st2.Top3Rate)
	}
}
