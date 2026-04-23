package ws

import (
	"encoding/json"
	"math/rand"
	"path/filepath"
	"sync"
	"time"

	"karuta/internal/model"
	"karuta/internal/store"
)

// GameSession manages the lifecycle of a single karuta game.
type GameSession struct {
	hub            *RoomHub
	room           *model.Room
	cards          []*model.Card // shuffled order (auto) or original order (judge)
	currentIdx     int
	grabbedCards   map[int64]int64    // card_id -> winner_user_id
	grabWindow     map[int64]time.Time // card_id -> window open time
	wrongUsers     map[int64]bool     // 本首抢错过的用户，禁止继续抢
	penaltyCount   map[int64]int      // 全局抢错次数统计
	lastCardWinner int64              // 最后一张牌的抢牌者
	cardGrabbedCh  chan struct{}       // 抢到牌时发信号，提前结束 waitInterval
	audioEndedCh   chan struct{}       // 客户端报告音频播放完毕
	skipCh         chan struct{}       // 房主跳过当前牌
	mu             sync.Mutex
	paused         bool
	pauseCh        chan struct{}
	resumeCh       chan struct{}
	stopCh         chan struct{}
	store          *store.Store

	// judge mode
	judgeMode       bool
	judgeUserID     int64        // 裁判的 userID（裁判不能抢牌）
	judgePlayCh     chan int64   // 裁判选牌信号
	judgeEndCh      chan struct{} // 裁判结束游戏
	judgeOfflineCh  chan struct{} // 裁判断线信号
}

func newGameSession(hub *RoomHub, room *model.Room, cards []*model.Card, s *store.Store) *GameSession {
	isJudge := room.Mode == "judge"

	var orderedCards []*model.Card
	if isJudge {
		// 裁判模式保持原始顺序，不打乱
		orderedCards = make([]*model.Card, len(cards))
		copy(orderedCards, cards)
	} else {
		shuffled := make([]*model.Card, len(cards))
		copy(shuffled, cards)
		rand.Shuffle(len(shuffled), func(i, j int) {
			shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
		})
		orderedCards = shuffled
	}

	gs := &GameSession{
		hub:           hub,
		room:          room,
		cards:         orderedCards,
		grabbedCards:  make(map[int64]int64),
		grabWindow:    make(map[int64]time.Time),
		wrongUsers:    make(map[int64]bool),
		penaltyCount:  make(map[int64]int),
		cardGrabbedCh: make(chan struct{}, 1),
		skipCh:        make(chan struct{}, 1),
		audioEndedCh:  make(chan struct{}, 1),
		pauseCh:       make(chan struct{}, 8),
		resumeCh:      make(chan struct{}, 8),
		stopCh:        make(chan struct{}),
		store:         s,
		judgeMode:     isJudge,
		judgeUserID:   room.HostID, // 裁判模式下房主是裁判
	}
	if isJudge {
		gs.judgePlayCh = make(chan int64, 1)
		gs.judgeEndCh = make(chan struct{}, 1)
		gs.judgeOfflineCh = make(chan struct{}, 1)
	}
	return gs
}

// wsEvent is the standard outgoing WebSocket event envelope.
type wsEvent struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// Run is the main game loop. It iterates over the shuffled cards and
// manages timing, grab windows, scoring, and final persistence.
func (gs *GameSession) Run() {
	// 1. 游戏开始时广播全量 room_state，让所有客户端切换到游戏界面
	gs.broadcastRoomState()

	if gs.judgeMode {
		gs.runJudgeMode()
	} else {
		gs.runAutoMode()
	}
}

// runAutoMode is the original auto-play loop.
func (gs *GameSession) runAutoMode() {
	// 广播倒计时 3,2,1
	for i := 3; i >= 1; i-- {
		gs.hub.BroadcastJSON(map[string]interface{}{
			"type":  "countdown",
			"count": i,
		})
		time.Sleep(1 * time.Second)
	}
	gs.hub.BroadcastJSON(map[string]interface{}{
		"type":  "countdown",
		"count": 0,
	})

	for gs.currentIdx < len(gs.cards) {
		card := gs.cards[gs.currentIdx]

		// 每首开始前 drain 掉残余的 pause/resume 信号，防止旧信号污染新一首
		for len(gs.pauseCh) > 0 { <-gs.pauseCh }
		for len(gs.resumeCh) > 0 { <-gs.resumeCh }
		for len(gs.audioEndedCh) > 0 { <-gs.audioEndedCh }
		for len(gs.cardGrabbedCh) > 0 { <-gs.cardGrabbedCh }

		// 如果当前是暂停状态，等 resume 后再开始本首
		gs.mu.Lock()
		paused := gs.paused
		gs.mu.Unlock()
		if paused {
			select {
			case <-gs.stopCh:
				return
			case <-gs.resumeCh:
				gs.mu.Lock()
				gs.paused = false
				gs.mu.Unlock()
			}
		}

		// Open grab window
		gs.mu.Lock()
		gs.grabWindow[card.ID] = time.Now()
		gs.mu.Unlock()

		// 每首新牌开始，重置抢错记录
		gs.mu.Lock()
		gs.wrongUsers = make(map[int64]bool)
		gs.mu.Unlock()

		isLast := gs.currentIdx == len(gs.cards)-1

		// Broadcast card_start — 扁平结构，与前端 WSEvent 匹配
		gs.hub.BroadcastJSON(map[string]interface{}{
			"type":      "card_start",
			"card_id":   card.ID,
			"audio_url": audioURL(card),
			"hint_text": card.HintText,
			"index":     gs.currentIdx + 1,
			"total":     len(gs.cards),
			"is_last":   isLast,
		})

		// 最后一张：等音频播完后立即结束，不等结算间隔
		if isLast {
			if !gs.waitAudioOnly() {
				return
			}
		} else if !gs.waitInterval() {
			return
		}

		// Close grab window
		gs.mu.Lock()
		delete(gs.grabWindow, card.ID)
		_, grabbed := gs.grabbedCards[card.ID]
		gs.mu.Unlock()

		if !grabbed {
			gs.hub.BroadcastJSON(map[string]interface{}{
				"type":    "card_missed",
				"card_id": card.ID,
			})
			now := time.Now()
			_ = gs.store.GameRecords.InsertRecord(gs.room.ID, card.ID, nil, now)
		}

		gs.currentIdx++
	}

	gs.broadcastGameOver()
}

// runJudgeMode is the judge-driven loop: wait for judge to choose each card.
func (gs *GameSession) runJudgeMode() {
	played := make(map[int64]bool)

	for {
		// 通知裁判可以选牌
		gs.hub.BroadcastJSON(map[string]interface{}{
			"type":         "judge_waiting",
			"played_count": len(played),
			"total_count":  len(gs.cards),
		})

		// 等待裁判选牌、结束或停止
		var cardID int64
		select {
		case <-gs.stopCh:
			return
		case <-gs.judgeEndCh:
			goto gameOver
		case <-gs.judgeOfflineCh:
			// 裁判断线，广播提示，等待重连（最多 60s）
			gs.hub.BroadcastJSON(map[string]interface{}{
				"type":    "judge_offline",
				"timeout": 60,
			})
			reconnected := false
			reconnectTimer := time.NewTimer(60 * time.Second)
			waitLoop:
			for {
				select {
				case <-gs.stopCh:
					reconnectTimer.Stop()
					return
				case cardID = <-gs.judgePlayCh:
					// 裁判重连并选了牌
					reconnectTimer.Stop()
					reconnected = true
					break waitLoop
				case <-reconnectTimer.C:
					// 超时，结束游戏
					gs.hub.BroadcastJSON(map[string]interface{}{
						"type": "judge_timeout",
					})
					break waitLoop
				}
			}
			if !reconnected {
				goto gameOver
			}
		case cardID = <-gs.judgePlayCh:
		}

		// 找到这张牌
		var card *model.Card
		for _, c := range gs.cards {
			if c.ID == cardID {
				card = c
				break
			}
		}
		if card == nil {
			// 无效卡片，继续等待
			continue
		}
		played[cardID] = true

		// 每首新牌开始，重置抢错记录
		gs.mu.Lock()
		gs.wrongUsers = make(map[int64]bool)
		gs.grabWindow[card.ID] = time.Now()
		gs.mu.Unlock()

		// 广播 card_start
		gs.hub.BroadcastJSON(map[string]interface{}{
			"type":      "card_start",
			"card_id":   card.ID,
			"audio_url": audioURL(card),
			"hint_text": card.HintText,
		})

		// 等待玩家抢牌或音频结束
		if !gs.waitInterval() {
			return
		}

		// 关闭抢牌窗口
		gs.mu.Lock()
		delete(gs.grabWindow, card.ID)
		_, grabbed := gs.grabbedCards[card.ID]
		gs.mu.Unlock()

		if !grabbed {
			gs.hub.BroadcastJSON(map[string]interface{}{
				"type":    "card_missed",
				"card_id": card.ID,
			})
			_ = gs.store.GameRecords.InsertRecord(gs.room.ID, card.ID, nil, time.Now())
		}

		// 如果所有牌都播完了，自动结束
		if len(played) >= len(gs.cards) {
			goto gameOver
		}
	}

gameOver:
	gs.broadcastGameOver()
}

// broadcastGameOver persists end status and broadcasts the final scoreboard.
func (gs *GameSession) broadcastGameOver() {
	_ = gs.store.Rooms.UpdateStatus(gs.room.ID, "end")

	players, _ := gs.store.Rooms.ListPlayers(gs.room.ID)
	// 裁判模式下，裁判不参与排名
	scoringPlayers := players
	if gs.judgeMode {
		filtered := make([]*model.RoomPlayer, 0, len(players))
		for _, p := range players {
			if p.UserID != gs.judgeUserID {
				filtered = append(filtered, p)
			}
		}
		scoringPlayers = filtered
	}
	// 按得分排序
	for i := 1; i < len(scoringPlayers); i++ {
		for j := i; j > 0 && scoringPlayers[j].Score > scoringPlayers[j-1].Score; j-- {
			scoringPlayers[j], scoringPlayers[j-1] = scoringPlayers[j-1], scoringPlayers[j]
		}
	}
	// 构建每人抢到的牌列表
	userCards := make(map[int64][]map[string]interface{})
	gs.mu.Lock()
	for cardID, winnerID := range gs.grabbedCards {
		for _, c := range gs.cards {
			if c.ID == cardID {
				userCards[winnerID] = append(userCards[winnerID], map[string]interface{}{
					"id":           c.ID,
					"display_text": c.DisplayText,
					"cover_url":    coverURL(c),
					"hint_text":    c.HintText,
				})
				break
			}
		}
	}
	gs.mu.Unlock()

	gs.mu.Lock()
	penaltyCount := gs.penaltyCount
	lastCardWinner := gs.lastCardWinner
	gs.mu.Unlock()

	results := make([]map[string]interface{}, 0, len(scoringPlayers))
	for i, p := range scoringPlayers {
		results = append(results, map[string]interface{}{
			"user_id":       p.UserID,
			"username":      p.Username,
			"score":         p.Score,
			"rank":          i + 1,
			"grabbed_cards": userCards[p.UserID],
			"penalty_count": penaltyCount[p.UserID],
		})
	}
	gs.hub.BroadcastJSON(map[string]interface{}{
		"type":                  "game_over",
		"results":               results,
		"last_card_winner_id":   lastCardWinner,
	})

	// 等待客户端收到 game_over 再清理
	time.Sleep(4 * time.Second)
	gs.hub.Stop()
}

// SendRoomStateToClient 向单个新连接客户端发送当前游戏状态
func (gs *GameSession) SendRoomStateToClient(client *Client) {
	cardList := gs.buildCardList()
	players, _ := gs.store.Rooms.ListPlayers(gs.room.ID)
	playerList := gs.buildPlayerList(players)

	gs.mu.Lock()
	remaining := len(gs.cards) - len(gs.grabbedCards)
	gs.mu.Unlock()

	gs.mu.Lock()
	judgeWaiting := gs.judgeMode && len(gs.grabWindow) == 0 && len(gs.grabbedCards) < len(gs.cards)
	grabbedList := gs.buildGrabbedList()
	gs.mu.Unlock()

	data, err := json.Marshal(map[string]interface{}{
		"type": "room_state",
		"data": map[string]interface{}{
			"room":            gs.buildRoomMap(),
			"players":         playerList,
			"cards":           cardList,
			"grabbed_cards":   grabbedList,
			"remaining_count": remaining,
			"judge_waiting":   judgeWaiting,
		},
	})
	if err != nil {
		return
	}
	select {
	case client.send <- data:
	default:
	}
}

// broadcastRoomState 广播全量房间状态，供新连接或游戏开始时同步
func (gs *GameSession) broadcastRoomState() {
	players, _ := gs.store.Rooms.ListPlayers(gs.room.ID)
	gs.mu.Lock()
	remaining := len(gs.cards) - len(gs.grabbedCards)
	judgeWaiting := gs.judgeMode && len(gs.grabWindow) == 0 && len(gs.grabbedCards) < len(gs.cards)
	gs.mu.Unlock()

	gs.mu.Lock()
	grabbedList := gs.buildGrabbedList()
	gs.mu.Unlock()

	gs.hub.BroadcastJSON(map[string]interface{}{
		"type": "room_state",
		"data": map[string]interface{}{
			"room":            gs.buildRoomMap(),
			"players":         gs.buildPlayerList(players),
			"cards":           gs.buildCardList(),
			"grabbed_cards":   grabbedList,
			"remaining_count": remaining,
			"judge_waiting":   judgeWaiting,
		},
	})
}

// buildGrabbedList 返回已抢走（或无人抢）的牌列表，需在 mu 锁内调用
func (gs *GameSession) buildGrabbedList() []map[string]interface{} {
	if len(gs.grabbedCards) == 0 {
		return nil
	}
	list := make([]map[string]interface{}, 0, len(gs.grabbedCards))
	for cardID, winnerID := range gs.grabbedCards {
		winnerName := ""
		if u, err := gs.store.Users.GetByID(winnerID); err == nil {
			winnerName = u.Username
		}
		list = append(list, map[string]interface{}{
			"card_id":     cardID,
			"winner_id":   winnerID,
			"winner_name": winnerName,
		})
	}
	return list
}

func (gs *GameSession) buildRoomMap() map[string]interface{} {
	return map[string]interface{}{
		"id":           gs.room.ID,
		"code":         gs.room.Code,
		"status":       "reading",
		"interval_sec": gs.room.IntervalSec,
		"host_id":      gs.room.HostID,
		"deck_id":      gs.room.DeckID,
		"mode":         gs.room.Mode,
	}
}

func (gs *GameSession) buildCardList() []map[string]interface{} {
	list := make([]map[string]interface{}, 0, len(gs.cards))
	for _, c := range gs.cards {
		list = append(list, map[string]interface{}{
			"id":           c.ID,
			"display_text": c.DisplayText,
			"hint_text":    c.HintText,
			"audio_url":    audioURL(c),
			"cover_url":    coverURL(c),
		})
	}
	return list
}

func (gs *GameSession) buildPlayerList(players []*model.RoomPlayer) []map[string]interface{} {
	// 获取当前在线用户集合
	onlineSet := make(map[int64]bool)
	for _, id := range gs.hub.OnlineUserIDs() {
		onlineSet[id] = true
	}
	list := make([]map[string]interface{}, 0, len(players))
	for _, p := range players {
		// 裁判模式下，裁判不出现在分数榜
		if gs.judgeMode && p.UserID == gs.judgeUserID {
			continue
		}
		list = append(list, map[string]interface{}{
			"user_id":  p.UserID,
			"username": p.Username,
			"role":     p.Role,
			"score":    p.Score,
			"online":   onlineSet[p.UserID],
		})
	}
	return list
}

// NotifyAudioEnded is called when a client reports the audio has finished playing.
func (gs *GameSession) NotifyAudioEnded() {
	select {
	case gs.audioEndedCh <- struct{}{}:
	default:
	}
}

// waitAudioOnly 只等音频播完（或被抢），不等结算间隔，用于最后一张牌
func (gs *GameSession) waitAudioOnly() bool {
	maxWait := time.Duration(gs.room.IntervalSec)*time.Second*10
	if maxWait < 60*time.Second {
		maxWait = 60 * time.Second
	}
	maxTimer := time.NewTimer(maxWait)
	defer maxTimer.Stop()
	for {
		select {
		case <-gs.stopCh:
			return false
		case <-gs.cardGrabbedCh:
			// 被抢走，短暂等待让前端动画播完再结束
			select {
			case <-gs.stopCh:
				return false
			case <-time.After(2 * time.Second):
			}
			return true
		case <-gs.audioEndedCh:
			// 音频播完，短暂等待后结束
			select {
			case <-gs.stopCh:
				return false
			case <-time.After(2 * time.Second):
			}
			return true
		case <-gs.skipCh:
			// 房主跳过，立即结束
			return true
		case <-maxTimer.C:
			return true
		case <-gs.pauseCh:
			maxTimer.Stop()
			for {
				select {
				case <-gs.stopCh:
					return false
				case <-gs.resumeCh:
					maxTimer = time.NewTimer(maxWait)
					goto continueAudio
				}
			}
		continueAudio:
		}
	}
}

// waitFixed waits for a fixed duration, interruptible by stop only.
func (gs *GameSession) waitFixed(dur time.Duration) bool {
	select {
	case <-gs.stopCh:
		return false
	case <-time.After(dur):
		return true
	}
}

// waitInterval waits for audio to finish (via audioEndedCh), then settles for interval_sec.
// If no audio_ended signal arrives, falls back to interval_sec timeout.
// Can be cut short by cardGrabbedCh.
func (gs *GameSession) waitInterval() bool {
	settle := time.Duration(gs.room.IntervalSec) * time.Second
	// 最长兜底：interval_sec * 10，防止客户端永不发 audio_ended
	maxWait := settle * 10
	if maxWait < 60*time.Second {
		maxWait = 60 * time.Second
	}

	// Phase 1：等音频播完（或超时兜底，或被抢，或暂停）
	maxTimer := time.NewTimer(maxWait)
	defer maxTimer.Stop()

	paused := false
	for {
		select {
		case <-gs.stopCh:
			return false

		case <-gs.cardGrabbedCh:
			// 抢到了，等 interval_sec 结算间隔后进下一首
			select {
			case <-gs.stopCh:
				return false
			case <-time.After(settle):
			}
			return true

		case <-gs.audioEndedCh:
			// 音频播完，进入 Phase 2
			goto afterAudio

		case <-gs.skipCh:
			// 房主跳过，直接进 Phase 2
			goto afterAudio

		case <-maxTimer.C:
			// 超时兜底，直接进 Phase 2
			goto afterAudio

		case <-gs.pauseCh:
			paused = true
			maxTimer.Stop()
			// 暂停期间阻塞
			for paused {
				select {
				case <-gs.stopCh:
					return false
				case <-gs.resumeCh:
					paused = false
					// 重置超时
					maxTimer = time.NewTimer(maxWait)
				}
			}
		}
	}

afterAudio:
	// Phase 2：音频放完后，等 interval_sec 让玩家抢牌
	settleTimer := time.NewTimer(settle)
	defer settleTimer.Stop()
	for {
		select {
		case <-gs.stopCh:
			return false
		case <-gs.cardGrabbedCh:
			// 结算期间被抢，再等一个 settle
			select {
			case <-gs.stopCh:
				return false
			case <-time.After(settle):
			}
			return true
		case <-settleTimer.C:
			return true
		case <-gs.skipCh:
			// 房主跳过，立即进下一首
			return true
		case <-gs.pauseCh:
			settleTimer.Stop()
			for {
				select {
				case <-gs.stopCh:
					return false
				case <-gs.resumeCh:
					settleTimer = time.NewTimer(settle)
					goto continueSettle
				}
			}
		continueSettle:
		}
	}
}

// HandleGrab processes a grab attempt from a player.
func (gs *GameSession) HandleGrab(userID, cardID int64) {
	gs.mu.Lock()
	defer gs.mu.Unlock()

	// 裁判模式下，裁判不能抢牌
	if gs.judgeMode && userID == gs.judgeUserID {
		gs.hub.SendJSONToUser(userID, map[string]interface{}{
			"type": "grab_banned",
		})
		return
	}

	// 本局抢错过的用户，禁止继续抢牌
	if gs.wrongUsers[userID] {
		gs.hub.SendJSONToUser(userID, map[string]interface{}{
			"type":    "grab_banned",
			"card_id": cardID,
		})
		return
	}

	_, ok := gs.grabWindow[cardID]
	if !ok {
		// 点的不是当前播放的牌，或窗口已关闭 — 扣分、禁止本首、广播公告
		grabberName := ""
		if u, err := gs.store.Users.GetByID(userID); err == nil {
			grabberName = u.Username
		}
		gs.wrongUsers[userID] = true
		gs.penaltyCount[userID]++
		_ = gs.store.Rooms.DeductScore(gs.room.ID, userID, 1)
		gs.hub.SendJSONToUser(userID, map[string]interface{}{
			"type":    "grab_failed",
			"card_id": cardID,
			"reason":  "not_current",
			"penalty": true,
		})
		gs.hub.BroadcastJSON(map[string]interface{}{
			"type":     "grab_wrong",
			"user_id":  userID,
			"username": grabberName,
			"card_id":  cardID,
			"reason":   "not_current",
		})
		go gs.broadcastScores()
		gs.checkAllBanned()
		return
	}

	if _, alreadyGrabbed := gs.grabbedCards[cardID]; alreadyGrabbed {
		grabberName := ""
		if u, err := gs.store.Users.GetByID(userID); err == nil {
			grabberName = u.Username
		}
		gs.wrongUsers[userID] = true
		gs.penaltyCount[userID]++
		_ = gs.store.Rooms.DeductScore(gs.room.ID, userID, 1)
		gs.hub.SendJSONToUser(userID, map[string]interface{}{
			"type":    "grab_failed",
			"card_id": cardID,
			"penalty": true,
		})
		gs.hub.BroadcastJSON(map[string]interface{}{
			"type":     "grab_wrong",
			"user_id":  userID,
			"username": grabberName,
			"card_id":  cardID,
			"reason":   "already_grabbed",
		})
		go gs.broadcastScores()
		gs.checkAllBanned()
		return
	}

	// Record winner
	gs.grabbedCards[cardID] = userID
	gs.lastCardWinner = userID // 每次成功抢牌都更新，最终保留最后一张的抢牌者

	// Get winner username
	winnerName := ""
	if u, err := gs.store.Users.GetByID(userID); err == nil {
		winnerName = u.Username
	}

	// 先更新分数，再广播（保证 score_update 里分数是最新的）
	_ = gs.store.Rooms.UpdateScore(gs.room.ID, userID, 1)

	// Persist game record（最后一张标记 is_last）
	now := time.Now()
	winnerIDCopy := userID
	isLastCard := gs.currentIdx == len(gs.cards)-1
	_ = gs.store.GameRecords.InsertRecordFull(gs.room.ID, cardID, &winnerIDCopy, now, isLastCard)

	// 广播 card_claimed
	gs.hub.BroadcastJSON(map[string]interface{}{
		"type":        "card_claimed",
		"card_id":     cardID,
		"winner_id":   userID,
		"winner_name": winnerName,
	})

	// 立即广播最新分数
	gs.broadcastScores()

	// 通知 waitInterval 提前结束
	select {
	case gs.cardGrabbedCh <- struct{}{}:
	default:
	}
}

// Pause signals the game session to pause.
func (gs *GameSession) Pause() {
	gs.mu.Lock()
	if !gs.paused {
		gs.paused = true
		select {
		case gs.pauseCh <- struct{}{}:
		default:
		}
	}
	gs.mu.Unlock()

	gs.hub.BroadcastJSON(map[string]interface{}{"type": "paused"})
}

// Resume signals the game session to resume.
func (gs *GameSession) Resume() {
	gs.mu.Lock()
	if gs.paused {
		gs.paused = false
		select {
		case gs.resumeCh <- struct{}{}:
		default:
		}
	}
	gs.mu.Unlock()

	gs.hub.BroadcastJSON(map[string]interface{}{"type": "resumed"})
}

// JudgePlayCard sends a card ID to the judge play channel.
func (gs *GameSession) JudgePlayCard(cardID int64) {
	if gs.judgePlayCh == nil {
		return
	}
	select {
	case gs.judgePlayCh <- cardID:
	default:
	}
}

// Stop terminates the game session immediately.
func (gs *GameSession) Stop() {
	select {
	case <-gs.stopCh:
	default:
		close(gs.stopCh)
	}
}

// SkipCard signals the session to skip the current card immediately.
func (gs *GameSession) SkipCard() {
	select {
	case gs.skipCh <- struct{}{}:
	default:
	}
}

// IsJudge returns true if the given userID is the judge in judge mode.
func (gs *GameSession) IsJudge(userID int64) bool {
	return gs.judgeMode && gs.judgeUserID == userID
}

// OnJudgeDisconnected notifies the session that the judge has disconnected.
func (gs *GameSession) OnJudgeDisconnected() {
	if gs.judgeOfflineCh == nil {
		return
	}
	select {
	case gs.judgeOfflineCh <- struct{}{}:
	default:
	}
}

// checkAllBanned 检查所有非裁判在线玩家是否全部已被禁止抢牌
// 必须在 gs.mu 锁内调用
func (gs *GameSession) checkAllBanned() {
	onlineIDs := gs.hub.OnlinePlayerIDs()
	// 过滤掉裁判
	playerIDs := make([]int64, 0, len(onlineIDs))
	for _, id := range onlineIDs {
		if gs.judgeMode && id == gs.judgeUserID {
			continue
		}
		playerIDs = append(playerIDs, id)
	}
	if len(playerIDs) == 0 {
		return
	}
	for _, id := range playerIDs {
		if !gs.wrongUsers[id] {
			return // 还有玩家可以抢
		}
	}
	// 所有非裁判在线玩家都已被禁止，广播提示并提前结束本首
	gs.hub.BroadcastJSON(map[string]interface{}{
		"type": "all_banned",
	})
	// 同时通知 Phase 1 和 Phase 2
	select {
	case gs.audioEndedCh <- struct{}{}:
	default:
	}
	select {
	case gs.cardGrabbedCh <- struct{}{}:
	default:
	}
}

func (gs *GameSession) broadcastScores() {
	players, err := gs.store.Rooms.ListPlayers(gs.room.ID)
	if err != nil {
		return
	}
	scores := make([]map[string]interface{}, 0, len(players))
	for _, p := range players {
		if gs.judgeMode && p.UserID == gs.judgeUserID {
			continue
		}
		scores = append(scores, map[string]interface{}{
			"user_id":  p.UserID,
			"username": p.Username,
			"score":    p.Score,
		})
	}
	gs.hub.BroadcastJSON(map[string]interface{}{
		"type":   "score_update",
		"scores": scores,
	})
}

func audioURL(card *model.Card) string {
	if card.AudioPath == "" {
		return ""
	}
	return "/uploads/audio/" + filepath.Base(card.AudioPath)
}

func coverURL(card *model.Card) string {
	if card.CoverPath == "" {
		return ""
	}
	return "/uploads/covers/" + filepath.Base(card.CoverPath)
}
