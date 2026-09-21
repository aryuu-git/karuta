// 牌组列表增强回归（v8）：封面拼贴聚合（嵌套相关子查询）与点赞计数的运行时实证——
// 编译期不校验 SQL 语义，此类查询必须有真实执行回归。
package store

import (
	"path/filepath"
	"testing"
)

func TestDeckListCoversAndLikes(t *testing.T) {
	db, err := OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := NewStore(db)
	if _, err := db.Exec(`
		INSERT INTO users (id, username, email, password) VALUES (1, 'owner', 'o@x.test', 'x');
		INSERT INTO users (id, username, email, password) VALUES (2, 'liker', 'l@x.test', 'x');
		INSERT INTO decks (id, owner_id, name, share_level, is_public) VALUES (1, 1, 'deck', 'playable', TRUE);
		INSERT INTO cards (id, owner_id, display_text, cover_path, share_level) VALUES
			(1, 1, 'a', 'covers/a.jpg', 'playable'),
			(2, 1, 'b', 'covers/b.jpg', 'playable'),
			(3, 1, 'c', 'covers/c.jpg', 'playable');
		INSERT INTO deck_cards (deck_id, card_id, sort_order) VALUES (1, 1, 0), (1, 2, 1), (1, 3, 2);
	`); err != nil {
		t.Fatal(err)
	}

	// 点赞开关往返
	if liked, err := s.Decks.LikeToggle(1, 2); err != nil || !liked {
		t.Fatalf("like should engage, liked=%v err=%v", liked, err)
	}
	if liked, err := s.Decks.LikeToggle(1, 2); err != nil || liked {
		t.Fatalf("second toggle should cancel, liked=%v err=%v", liked, err)
	}
	if liked, err := s.Decks.LikeToggle(1, 2); err != nil || !liked {
		t.Fatalf("re-like should engage, liked=%v err=%v", liked, err)
	}

	decks, err := s.Decks.ListByOwner(1)
	if err != nil {
		t.Fatalf("ListByOwner errored — 拼贴子查询 SQL 无效? %v", err)
	}
	if len(decks) != 1 {
		t.Fatalf("want 1 deck, got %d", len(decks))
	}
	d := decks[0]
	if d.CardCount != 3 {
		t.Fatalf("card_count=%d want 3", d.CardCount)
	}
	if d.CoverPaths != "covers/a.jpg,covers/b.jpg,covers/c.jpg" {
		t.Fatalf("covers=%q want ordered concatenation", d.CoverPaths)
	}
	if d.Likes != 1 {
		t.Fatalf("likes=%d want 1", d.Likes)
	}
	// owner 视角 liked_by_me=false（赞者是用户 2）
	if d.LikedByMe {
		t.Fatal("owner wrongly flagged as liker")
	}

	pub, err := s.Decks.ListPublicByShareLevel(2, "")
	if err != nil {
		t.Fatalf("ListPublicByShareLevel errored: %v", err)
	}
	if len(pub) != 1 || !pub[0].LikedByMe || pub[0].Likes != 1 {
		t.Fatalf("liker view wrong: n=%d liked=%v likes=%d", len(pub), pub[0].LikedByMe, pub[0].Likes)
	}

	// 排序：交换首位与末位后保存
	if err := s.DeckCards.Reorder(1, []int64{3, 2, 1}); err != nil {
		t.Fatal(err)
	}
	decks, _ = s.Decks.ListByOwner(1)
	if decks[0].CoverPaths != "covers/c.jpg,covers/b.jpg,covers/a.jpg" {
		t.Fatalf("covers after reorder=%q want c,b,a", decks[0].CoverPaths)
	}
}
