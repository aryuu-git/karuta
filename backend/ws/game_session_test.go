package ws

import (
	"path/filepath"
	"testing"
	"time"

	"karuta/backend/model"
	"karuta/backend/store"
)

// newTestGameSession 构造一个最小可用的会话（内存 SQLite + 未启动的 hub）。
func newTestGameSession(t *testing.T) *GameSession {
	t.Helper()
	db, err := store.OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := store.NewStore(db)

	room := &model.Room{ID: 1, Mode: "auto", IntervalSec: 10}
	manager := NewHubManager()
	hub := newRoomHub(room.ID, manager)
	cards := []*model.Card{}
	return newGameSession(hub, room, cards, s)
}

// B1 幂等：同一玩家的旧 cmdID 重放必须被忽略，防止网络重试导致重复判分。
func TestHandleGrabCmdIDIdempotent(t *testing.T) {
	gs := newTestGameSession(t)
	gs.mu.Lock()
	gs.grabWindow[0] = time.Now()
	gs.currentIdx = 0
	gs.mu.Unlock()

	// 首次命令推进 lastCmdID（无有效回合牌，走正常拒绝路径）
	gs.HandleGrab(100, 1, 5)
	gs.mu.Lock()
	last := gs.lastCmdID[100]
	gs.mu.Unlock()
	if last != 5 {
		t.Fatalf("lastCmdID = %d, want 5", last)
	}

	// 旧命令（cmdID=3 ≤ 5）必须被忽略，lastCmdID 不回退
	gs.HandleGrab(100, 1, 3)
	gs.mu.Lock()
	last = gs.lastCmdID[100]
	gs.mu.Unlock()
	if last != 5 {
		t.Fatalf("replay advanced lastCmdID to %d, want 5", last)
	}

	// 新命令（cmdID=6）正常推进
	gs.HandleGrab(100, 1, 6)
	gs.mu.Lock()
	last = gs.lastCmdID[100]
	gs.mu.Unlock()
	if last != 6 {
		t.Fatalf("new cmd not accepted: lastCmdID = %d, want 6", last)
	}
}

// B1 回合时钟：expandToPlayItems 需要携带上传链路测量的音频时长。
func TestExpandToPlayItemsCarriesDuration(t *testing.T) {
	// 旧数据（cards.audio_path 兜底路径）没有时长信息 → DurationSec = 0，
	// 服务端回合时钟对该回合回退到上限兜底。
	got := expandToPlayItems([]*model.Card{{
		ID:        7,
		AudioPath: "audio/legacy.mp3",
	}})
	if len(got) != 1 {
		t.Fatalf("items = %d, want 1", len(got))
	}
	if got[0].DurationSec != 0 {
		t.Fatalf("legacy audio should have zero duration, got %v", got[0].DurationSec)
	}

	// 新数据（card_audios 行）带实测时长 → 透传到回合项。
	legacy := &model.Card{
		ID:     8,
		Audios: []*model.CardAudio{{ID: 1, AudioPath: "audio/new.mp3", DurationSec: 30}},
	}
	got = expandToPlayItems([]*model.Card{legacy})
	if len(got) != 1 || got[0].DurationSec != 30 {
		t.Fatalf("duration not carried: items=%d duration=%v", len(got), got[0].DurationSec)
	}
}
