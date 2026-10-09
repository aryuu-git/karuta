package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestBatchCategoryMergesOwnedCardsAndDeduplicatesIDs(t *testing.T) {
	e := newSecEnv(t)
	seedSecurityFixtures(t, e)
	if _, err := e.db.Exec(`UPDATE cards SET tags = '原标签' WHERE id = 101`); err != nil {
		t.Fatal(err)
	}
	w := serveSec(t, e.cardH.BatchUpdateTags, http.MethodPost, "/api/cards/batch-tag", "/api/cards/batch-tag", 10,
		`{"card_ids":[101,102,101],"tags":[" 动画歌曲 "]}`)
	if w.Code != http.StatusOK {
		t.Fatalf("batch failed: %d %s", w.Code, w.Body.String())
	}
	var result struct {
		Applied int `json:"applied"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || result.Applied != 2 {
		t.Fatalf("applied = %d, error = %v", result.Applied, err)
	}
	first, _ := e.store.Cards.GetByID(101)
	second, _ := e.store.Cards.GetByID(102)
	if first.Tags != "原标签,动画歌曲" || second.Tags != "动画歌曲" {
		t.Fatalf("unexpected tags: %q %q", first.Tags, second.Tags)
	}
}

func TestBatchCategoryRejectsInvalidSelectionsWithoutPartialWrites(t *testing.T) {
	for _, tc := range []struct {
		name   string
		body   string
		status int
	}{
		{"other owner", `{"card_ids":[101,104],"tags":["分类"]}`, http.StatusForbidden},
		{"missing card", `{"card_ids":[101,999],"tags":["分类"]}`, http.StatusNotFound},
		{"blank category", `{"card_ids":[101],"tags":[" "]}`, http.StatusBadRequest},
		{"comma category", `{"card_ids":[101],"tags":["游戏,动画"]}`, http.StatusBadRequest},
		{"Chinese comma", `{"card_ids":[101],"tags":["游戏，动画"]}`, http.StatusBadRequest},
		{"empty selection", `{"card_ids":[],"tags":["分类"]}`, http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := newSecEnv(t)
			seedSecurityFixtures(t, e)
			w := serveSec(t, e.cardH.BatchUpdateTags, http.MethodPost, "/api/cards/batch-tag", "/api/cards/batch-tag", 10, tc.body)
			if w.Code != tc.status {
				t.Fatalf("status %d, want %d: %s", w.Code, tc.status, w.Body.String())
			}
			card, _ := e.store.Cards.GetByID(101)
			if card.Tags != "" {
				t.Fatal("invalid batch partially updated a card")
			}
		})
	}
}

func TestMyTagsRequiresAuthAndOnlyReturnsOwnedTags(t *testing.T) {
	e := newSecEnv(t)
	seedSecurityFixtures(t, e)
	if _, err := e.db.Exec(`UPDATE cards SET tags = '私有分类' WHERE id = 102; UPDATE cards SET tags = '他人分类' WHERE id = 104`); err != nil {
		t.Fatal(err)
	}
	w := serveSec(t, e.cardH.ListMyTags, http.MethodGet, "/api/cards/mine/tags", "/api/cards/mine/tags", 10, "")
	var tags []string
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &tags) != nil || !reflect.DeepEqual(tags, []string{"私有分类"}) {
		t.Fatalf("my tags: %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	e.cardH.ListMyTags(w, httptest.NewRequest(http.MethodGet, "/api/cards/mine/tags", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated status = %d", w.Code)
	}
}
