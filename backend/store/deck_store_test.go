package store

// 回归：删除牌组曾 500（FK 约束，线上必现）。game_records 的 room_id/card_id 外键
// 均无 ON DELETE，靠 DeleteDeck 显式清战绩。旧实现只按「本牌组的 card」清，
// 战绩里若记录了借来的共享卡（cards.deck_id 不属于本牌组）就漏删，
// DELETE rooms 撞 game_records.room_id 外键。两个方向都清后应可完整删除。

import (
	"path/filepath"
	"testing"
)

func TestDeleteDeckWithBorrowedCardGameRecords(t *testing.T) {
	db, err := OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := NewStore(db)

	// 牌组 1：自有卡 1 + 借来的共享卡 2（归属牌组 2）；房间 1 用牌组 1 打过一局，
	// 抢牌记录里两张卡都有——卡 2 的记录是旧清理逻辑漏删的那行。
	if _, err := db.Exec(`
		INSERT INTO users (id, username, email, password) VALUES (1, 'owner', 'o@x.test', 'x');
		INSERT INTO users (id, username, email, password) VALUES (2, 'other', 't@x.test', 'x');
		INSERT INTO decks (id, owner_id, name) VALUES (1, 1, 'victim');
		INSERT INTO decks (id, owner_id, name) VALUES (2, 2, 'foreign');
		INSERT INTO cards (id, deck_id, owner_id, display_text) VALUES (1, 1, 1, 'own');
		INSERT INTO cards (id, deck_id, owner_id, display_text) VALUES (2, 2, 2, 'borrowed');
		INSERT INTO deck_cards (deck_id, card_id, sort_order) VALUES (1, 1, 0), (1, 2, 1);
		INSERT INTO rooms (id, code, deck_id, host_id, status) VALUES (1, 'R1', 1, 1, 'end');
		INSERT INTO room_players (room_id, user_id) VALUES (1, 1);
		INSERT INTO game_records (room_id, card_id) VALUES (1, 1), (1, 2);
	`); err != nil {
		t.Fatal(err)
	}

	if err := s.Decks.DeleteDeck(1); err != nil {
		t.Fatalf("DeleteDeck errored (修复前为 FK 约束失败 → 线上 500): %v", err)
	}

	for _, q := range []struct {
		sql  string
		want int64
	}{
		{`SELECT COUNT(*) FROM decks WHERE id = 1`, 0},
		{`SELECT COUNT(*) FROM rooms WHERE id = 1`, 0},
		{`SELECT COUNT(*) FROM room_players WHERE room_id = 1`, 0},
		{`SELECT COUNT(*) FROM game_records WHERE room_id = 1`, 0},
		{`SELECT COUNT(*) FROM cards WHERE id = 1`, 0},
		// 借来的卡是牌组 2 的资产，删牌组 1 不得误伤
		{`SELECT COUNT(*) FROM cards WHERE id = 2`, 1},
		{`SELECT COUNT(*) FROM decks WHERE id = 2`, 1},
	} {
		var n int64
		if err := db.QueryRow(q.sql).Scan(&n); err != nil {
			t.Fatalf("%s: %v", q.sql, err)
		}
		if n != q.want {
			t.Errorf("%s = %d, want %d", q.sql, n, q.want)
		}
	}
}
