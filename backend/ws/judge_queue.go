package ws

import (
	"errors"
	"math"
	"time"
)

// JudgeQueueCommand uses audio identity, never a stale client queue index.
// An omitted start_sec follows the room setting; explicit zero starts at the beginning.
type JudgeQueueCommand struct {
	Action      string   `json:"action,omitempty"`
	CardID      int64    `json:"card_id"`
	CardAudioID int64    `json:"card_audio_id"`
	StartSec    *float64 `json:"start_sec,omitempty"`
	Position    int      `json:"position,omitempty"`
}

func (gs *GameSession) wakeJudgeQueue() {
	select {
	case gs.judgePlayCh <- struct{}{}:
	default:
	}
}

// Called with gs.mu held so edits, consumption and private snapshots stay ordered.
func (gs *GameSession) sendJudgeQueueLocked() {
	played := make([]JudgeQueueCommand, 0, len(gs.judgePlayed))
	for _, item := range gs.playItems {
		if gs.judgePlayed[item.Index] {
			played = append(played, JudgeQueueCommand{CardID: item.CardID, CardAudioID: item.CardAudioID})
		}
	}
	queue := append([]JudgeQueueCommand{}, gs.judgeQueue...)
	gs.hub.SendJSONToUser(gs.judgeUserID, map[string]interface{}{
		"type": "judge_queue", "items": queue, "played": played,
	})
}

func (gs *GameSession) UpdateJudgeQueue(req JudgeQueueCommand) error {
	gs.mu.Lock()
	defer gs.mu.Unlock()
	if !gs.judgeMode {
		return errors.New("当前不是裁判模式")
	}
	select {
	case <-gs.stopCh:
		return errors.New("对局已结束")
	default:
	}
	if req.Action == "clear" {
		gs.judgeQueue = nil
		gs.sendJudgeQueueLocked()
		gs.wakeJudgeQueue()
		return nil
	}
	if req.Action != "" && req.Action != "add" && req.Action != "remove" && req.Action != "move" && req.Action != "update" {
		return errors.New("无效的队列操作")
	}
	var item *PlayItem
	for _, candidate := range gs.playItems {
		if candidate.CardID == req.CardID && (req.CardAudioID == 0 || candidate.CardAudioID == req.CardAudioID) && !gs.judgePlayed[candidate.Index] {
			item = candidate
			break
		}
	}
	if item == nil || gs.cardRemainingCount[req.CardID] <= 0 {
		return errors.New("歌曲不存在、已播放或正在播放")
	}
	req.CardAudioID = item.CardAudioID
	if req.StartSec != nil {
		sec := *req.StartSec
		if math.IsNaN(sec) || math.IsInf(sec, 0) || sec < 0 || (item.DurationSec > 0 && sec >= item.DurationSec) || (item.DurationSec <= 0 && sec > 0) {
			return errors.New("播放起点必须小于歌曲时长；时长未知的歌曲只能从头播放")
		}
		// Own the value rather than retaining a caller's mutable pointer.
		req.StartSec = &sec
	}
	idx := -1
	for i, pending := range gs.judgeQueue {
		if pending.CardID == req.CardID && pending.CardAudioID == req.CardAudioID {
			idx = i
			break
		}
	}
	switch req.Action {
	case "", "add":
		if idx >= 0 {
			return errors.New("这首歌已在待播队列中")
		}
		req.Action = ""
		req.Position = 0
		gs.judgeQueue = append(gs.judgeQueue, req)
	case "remove", "move", "update":
		if idx < 0 {
			return errors.New("这首歌已不在待播队列中，请刷新后重试")
		}
		if req.Action == "update" {
			gs.judgeQueue[idx].StartSec = req.StartSec
		} else if req.Action == "remove" {
			gs.judgeQueue = append(gs.judgeQueue[:idx], gs.judgeQueue[idx+1:]...)
		} else {
			if req.Position < 0 || req.Position >= len(gs.judgeQueue) {
				return errors.New("队列位置已变化，请重试")
			}
			entry := gs.judgeQueue[idx]
			gs.judgeQueue = append(gs.judgeQueue[:idx], gs.judgeQueue[idx+1:]...)
			gs.judgeQueue = append(gs.judgeQueue, JudgeQueueCommand{})
			copy(gs.judgeQueue[req.Position+1:], gs.judgeQueue[req.Position:])
			gs.judgeQueue[req.Position] = entry
		}
	}
	gs.sendJudgeQueueLocked()
	gs.wakeJudgeQueue()
	return nil
}

// The channel only wakes this consumer. The mutex-protected slice can be edited
// during playback/cooldown and does not drop songs when a channel buffer is full.
func (gs *GameSession) nextJudgeItem() (*PlayItem, JudgeQueueCommand, bool) {
	gs.mu.Lock()
	playedCount := len(gs.judgePlayed)
	gs.mu.Unlock()
	gs.hub.BroadcastJSON(map[string]interface{}{
		"type": "judge_waiting", "played_count": playedCount, "total_count": len(gs.playItems),
	})
	var notifiedOfflineAt time.Time
	for {
		select {
		case <-gs.stopCh:
			return nil, JudgeQueueCommand{}, false
		default:
		}
		gs.mu.Lock()
		if !gs.paused && len(gs.judgeQueue) > 0 {
			req := gs.judgeQueue[0]
			gs.judgeQueue = gs.judgeQueue[1:]
			for _, item := range gs.playItems {
				if item.CardID == req.CardID && item.CardAudioID == req.CardAudioID && !gs.judgePlayed[item.Index] && gs.cardRemainingCount[item.CardID] > 0 {
					gs.judgePlayed[item.Index] = true
					gs.currentIdx = item.Index
					gs.grabWindow[item.Index] = time.Now()
					gs.wrongUsers = make(map[int64]bool)
					// Clear signals left by the preceding round before starting another.
					for len(gs.cardGrabbedCh) > 0 {
						<-gs.cardGrabbedCh
					}
					for len(gs.pauseCh) > 0 {
						<-gs.pauseCh
					}
					for len(gs.resumeCh) > 0 {
						<-gs.resumeCh
					}
					for len(gs.skipCh) > 0 {
						<-gs.skipCh
					}
					gs.sendJudgeQueueLocked()
					gs.mu.Unlock()
					return item, req, true
				}
			}
			gs.sendJudgeQueueLocked()
			gs.mu.Unlock()
			continue
		}
		offlineAt := gs.judgeOfflineAt
		gs.mu.Unlock()
		var timeout <-chan time.Time
		var timer *time.Timer
		if !offlineAt.IsZero() {
			if notifiedOfflineAt != offlineAt {
				seconds := int(math.Max(0, math.Ceil(time.Until(offlineAt.Add(60*time.Second)).Seconds())))
				gs.hub.BroadcastJSON(map[string]interface{}{"type": "judge_offline", "timeout": seconds})
				notifiedOfflineAt = offlineAt
			}
			timer = time.NewTimer(time.Until(offlineAt.Add(60 * time.Second)))
			timeout = timer.C
		}
		select {
		case <-gs.stopCh:
			if timer != nil {
				timer.Stop()
			}
			return nil, JudgeQueueCommand{}, false
		case <-gs.judgePlayCh:
		case <-gs.resumeCh:
		case <-timeout:
			gs.mu.Lock()
			stillOffline := gs.judgeOfflineAt == offlineAt
			gs.mu.Unlock()
			if stillOffline {
				gs.hub.BroadcastJSON(map[string]interface{}{"type": "judge_timeout"})
				gs.broadcastGameOver()
				return nil, JudgeQueueCommand{}, false
			}
		}
		if timer != nil {
			timer.Stop()
		}
	}
}
