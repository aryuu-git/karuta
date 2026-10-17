package ws

import (
	"testing"

	"karuta/backend/model"
)

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
