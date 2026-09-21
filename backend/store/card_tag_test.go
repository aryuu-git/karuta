// 标签链路回归（2026-09-21 tag 专项审查）：
// 公共库标签过滤须精确 token 匹配（子串误中/通配符注入均拒）；标签集稳定有序。
package store

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func newTagTestStore(t *testing.T) (*Store, *sql.DB) {
	t.Helper()
	db, err := OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := NewStore(db)
	if _, err := db.Exec(`INSERT INTO users (id, username, email, password) VALUES (1, 'u', 'u@x.test', 'x')`); err != nil {
		t.Fatal(err)
	}
	return s, db
}

func TestListPublicTagExactMatch(t *testing.T) {
	s, db := newTagTestStore(t)
	seed := []struct {
		id   int64
		tags string
	}{
		{1, "游戏"},
		{2, "小游戏"},
		{3, "游戏,动画"},
		{4, "动画, 游戏"},
		{5, "100%完成"},
	}
	for _, c := range seed {
		if _, err := db.Exec(
			`INSERT INTO cards (id, owner_id, display_text, tags, is_shared, share_level) VALUES (?, 1, ?, ?, TRUE, 'playable')`,
			c.id, "card", c.tags,
		); err != nil {
			t.Fatal(err)
		}
	}

	ids := func(tag string) []int64 {
		list, err := s.Cards.ListPublic("", "", tag, "", "latest", 0, 50, 0)
		if err != nil {
			t.Fatal(err)
		}
		out := make([]int64, 0, len(list))
		for _, c := range list {
			out = append(out, c.ID)
		}
		return out
	}

	// 精确匹配：命中 1/3/4（4 号带空格经规范化），绝不命中 2（小游戏）
	got := ids("游戏")
	want := map[int64]bool{1: true, 3: true, 4: true}
	if len(got) != 3 {
		t.Fatalf("tag=游戏 matched %v, want exactly [1 3 4]", got)
	}
	for _, id := range got {
		if !want[id] {
			t.Fatalf("tag=游戏 wrongly matched card %d (tags=%v)", id, got)
		}
	}

	// 通配符注入：tag=% 转义后按字面「%」token 精确匹配——无卡的标签恰为
	// 「%」，正确结果是空集；未转义的旧实现会匹配全部 5 张
	pct := ids("%")
	if len(pct) != 0 {
		t.Fatalf("tag=%% must match nothing (escaped literal), got %v — 通配符注入未被阻断", pct)
	}

	// 标签集：去重 + 稳定排序（Go 字节序：ASCII < 动 < 小 < 游）
	tags, err := s.Cards.ListPublicTags()
	if err != nil {
		t.Fatal(err)
	}
	expected := []string{"100%完成", "动画", "小游戏", "游戏"}
	if len(tags) != len(expected) {
		t.Fatalf("ListPublicTags=%v want %v", tags, expected)
	}
	for i := range expected {
		if tags[i] != expected[i] {
			t.Fatalf("ListPublicTags order %v want %v（须稳定排序）", tags, expected)
		}
	}
}
