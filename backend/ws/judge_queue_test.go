package ws

import (
	"encoding/json"
	"math"
	"testing"
	"time"
)

func newJudgeQueueTestSession(t *testing.T) *GameSession {
	gs := newGrabTestSession(t, "judge")
	for i, item := range gs.playItems {
		item.CardAudioID = int64(i + 1)
		item.DurationSec = 60
	}
	return gs
}

func queueTestSong(t *testing.T, gs *GameSession, audioID int64, start *float64) {
	t.Helper()
	if err := gs.UpdateJudgeQueue(JudgeQueueCommand{CardID: 7, CardAudioID: audioID, StartSec: start}); err != nil {
		t.Fatal(err)
	}
}

func TestJudgeQueueEditsAndValidation(t *testing.T) {
	gs := newJudgeQueueTestSession(t)
	for id := int64(1); id <= 4; id++ {
		queueTestSong(t, gs, id, nil)
	}
	if len(gs.judgeQueue) != 4 {
		t.Fatal("queue dropped songs when wake channel was full")
	}
	for _, req := range []JudgeQueueCommand{
		{CardID: 7, CardAudioID: 1}, // duplicate
		{CardID: 8, CardAudioID: 1}, // audio belongs to another card
		{CardID: 7, CardAudioID: 99},
		{Action: "move", CardID: 7, CardAudioID: 1, Position: 4},
	} {
		if gs.UpdateJudgeQueue(req) == nil {
			t.Fatalf("accepted invalid request: %+v", req)
		}
	}
	for _, seconds := range []float64{-1, 60, 61, math.NaN(), math.Inf(1)} {
		if gs.UpdateJudgeQueue(JudgeQueueCommand{Action: "update", CardID: 7, CardAudioID: 1, StartSec: &seconds}) == nil {
			t.Fatalf("accepted start %v", seconds)
		}
	}
	start := 30.5
	for _, req := range []JudgeQueueCommand{
		{Action: "update", CardID: 7, CardAudioID: 3, StartSec: &start},
		{Action: "move", CardID: 7, CardAudioID: 3, Position: 0},
		{Action: "remove", CardID: 7, CardAudioID: 2},
	} {
		if err := gs.UpdateJudgeQueue(req); err != nil {
			t.Fatal(err)
		}
	}
	item, req, ok := gs.nextJudgeItem()
	if !ok || item.CardAudioID != 3 || req.StartSec == nil || *req.StartSec != start {
		t.Fatalf("did not consume reordered song with its start: %+v", req)
	}
	if gs.UpdateJudgeQueue(JudgeQueueCommand{CardID: 7, CardAudioID: 3}) == nil {
		t.Fatal("accepted a song already playing")
	}
	// An unclaimed round is still played, even when other audio on the card remains.
	delete(gs.grabWindow, item.Index)
	if gs.UpdateJudgeQueue(JudgeQueueCommand{CardID: 7, CardAudioID: 3}) == nil {
		t.Fatal("accepted replay of missed audio")
	}
	if err := gs.UpdateJudgeQueue(JudgeQueueCommand{Action: "clear"}); err != nil {
		t.Fatal(err)
	}
	if len(gs.judgeQueue) != 0 || len(gs.judgePlayed) != 1 {
		t.Fatal("clear changed played rounds")
	}
}

func TestJudgeQueueUnknownDurationAndExplicitZero(t *testing.T) {
	gs := newJudgeQueueTestSession(t)
	gs.playItems[0].DurationSec = 0
	start := 10.0
	if gs.UpdateJudgeQueue(JudgeQueueCommand{CardID: 7, CardAudioID: 1, StartSec: &start}) == nil {
		t.Fatal("unknown duration accepted nonzero seek")
	}
	start = 0
	queueTestSong(t, gs, 1, &start)
	if gs.judgeQueue[0].StartSec == nil {
		t.Fatal("explicit zero lost")
	}
	gs.Stop()
	if gs.UpdateJudgeQueue(JudgeQueueCommand{CardID: 7, CardAudioID: 2}) == nil {
		t.Fatal("stopped session accepted song")
	}
}

func readJudgeTestEvent(t *testing.T, ch <-chan []byte, eventType string) map[string]interface{} {
	t.Helper()
	timer := time.NewTimer(3 * time.Second)
	defer timer.Stop()
	for {
		select {
		case raw := <-ch:
			var event map[string]interface{}
			if err := json.Unmarshal(raw, &event); err != nil {
				t.Fatal(err)
			}
			if event["type"] == eventType {
				return event
			}
		case <-timer.C:
			t.Fatalf("timed out waiting for %s", eventType)
		}
	}
}

func TestJudgeQueuePlaybackCooldownPauseAndSeek(t *testing.T) {
	gs := newJudgeQueueTestSession(t)
	gs.room.IntervalSec = 1
	gs.room.RandomStart = true
	gs.Pause()
	start := 30.0
	queueTestSong(t, gs, 1, &start)
	done := make(chan struct{})
	go func() { defer close(done); gs.runJudgeMode() }()
	t.Cleanup(func() { gs.Stop(); <-done })
	readJudgeTestEvent(t, gs.hub.broadcast, "judge_waiting")
	gs.mu.Lock()
	if len(gs.judgePlayed) != 0 {
		t.Error("consumed while paused")
	}
	gs.mu.Unlock()
	gs.Resume()
	first := readJudgeTestEvent(t, gs.hub.broadcast, "card_start")
	if first["start_sec"] != 30.0 || first["start_ratio"] != nil {
		t.Fatal("manual start did not override random start")
	}
	if first["ends_at"].(float64)-first["start_at"].(float64) != 31000 {
		t.Fatal("deadline did not use remaining duration plus interval")
	}
	// Queue more songs while the first is playing; player claim starts cooldown.
	zero := 0.0
	queueTestSong(t, gs, 2, &zero)
	gs.HandleGrab(100, 7)
	readJudgeTestEvent(t, gs.hub.broadcast, "card_claimed")
	claimedAt := time.Now()
	queueTestSong(t, gs, 3, nil)
	second := readJudgeTestEvent(t, gs.hub.broadcast, "card_start")
	if second["card_audio_id"] != 2.0 || second["start_sec"] != 0.0 {
		t.Fatal("FIFO or explicit zero was lost")
	}
	if time.Since(claimedAt) < 900*time.Millisecond {
		t.Fatal("queue bypassed cooldown")
	}
	gs.Pause()
	if err := gs.UpdateJudgeQueue(JudgeQueueCommand{Action: "remove", CardID: 7, CardAudioID: 3}); err != nil {
		t.Fatal(err)
	}
	gs.mu.Lock()
	if len(gs.judgeQueue) != 0 || len(gs.judgePlayed) != 2 {
		t.Error("paused edit consumed an extra song")
	}
	gs.mu.Unlock()
}

func TestJudgeQueueSnapshotIsPrivateAndRestored(t *testing.T) {
	gs := newJudgeQueueTestSession(t)
	judge := &Client{userID: 99, send: make(chan []byte, 16)}
	player := &Client{userID: 100, send: make(chan []byte, 16)}
	gs.hub.clients[judge] = true
	gs.hub.clients[player] = true
	queueTestSong(t, gs, 1, nil)
	if len(player.send) != 0 {
		t.Fatal("queue leaked to player")
	}
	readJudgeTestEvent(t, judge.send, "judge_queue")
	gs.nextJudgeItem()
	queueTestSong(t, gs, 2, nil)
	for len(judge.send) > 0 {
		<-judge.send
	}
	gs.SendRoomStateToClient(judge)
	snapshot := readJudgeTestEvent(t, judge.send, "judge_queue")
	if len(snapshot["items"].([]interface{})) != 1 || len(snapshot["played"].([]interface{})) != 1 {
		t.Fatal("reconnect lost queue/history")
	}
	gs.SendRoomStateToClient(player)
	readJudgeTestEvent(t, player.send, "room_state")
	if len(player.send) != 0 {
		t.Fatal("private queue sent in player reconnect")
	}
}

func TestJudgeQueueMissedRoundAutomaticallyAdvances(t *testing.T) {
	gs := newJudgeQueueTestSession(t)
	gs.playItems[0].DurationSec = 0.15
	queueTestSong(t, gs, 1, nil)
	queueTestSong(t, gs, 2, nil)
	done := make(chan struct{})
	go func() { defer close(done); gs.runJudgeMode() }()
	t.Cleanup(func() { gs.Stop(); <-done })
	readJudgeTestEvent(t, gs.hub.broadcast, "card_start")
	readJudgeTestEvent(t, gs.hub.broadcast, "card_missed")
	next := readJudgeTestEvent(t, gs.hub.broadcast, "card_start")
	if next["card_audio_id"] != 2.0 {
		t.Fatal("missed round did not advance FIFO")
	}
	if gs.UpdateJudgeQueue(JudgeQueueCommand{CardID: 7, CardAudioID: 1}) == nil {
		t.Fatal("missed audio became available again")
	}
}

func TestJudgeQueueOnceModeKeepsRoundIndices(t *testing.T) {
	gs := newJudgeQueueTestSession(t)
	gs.room.MultiAudioMode = "once"
	queueTestSong(t, gs, 3, nil)
	queueTestSong(t, gs, 1, nil)
	queueTestSong(t, gs, 4, nil)
	gs.nextJudgeItem()
	gs.HandleGrab(100, 7)
	if len(gs.playItems) != 4 || gs.playItems[2].CardAudioID != 3 {
		t.Fatal("once mode changed stable indices")
	}
	if gs.cardRemainingCount[7] != 0 || len(gs.judgeQueue) != 0 {
		t.Fatal("once mode kept exhausted songs in queue")
	}
	if gs.UpdateJudgeQueue(JudgeQueueCommand{CardID: 7, CardAudioID: 2}) == nil {
		t.Fatal("exhausted card accepted")
	}
}
