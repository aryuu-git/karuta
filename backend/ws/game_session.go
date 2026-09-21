package ws

import (
	"encoding/json"
	"log/slog"
	"math/rand"
	"sync"
	"time"

	"karuta/backend/achievement"
	"karuta/backend/mask"
	"karuta/backend/model"
	"karuta/backend/storage"
	"karuta/backend/store"
)

// PlayItem represents a single round in the game (one audio to play).
type PlayItem struct {
	Index       int
	CardID      int64
	AudioPath   string
	HintText    string
	CardAudioID int64
	// DurationSec 音频时长（秒），来自上传链路测量；0 表示未知，
	// 服务端回合时钟对该回合回退到上限兜底。
	DurationSec float64
}

type judgePlayRequest struct {
	CardID      int64
	CardAudioID int64
}

// GameSession manages the lifecycle of a single karuta game.
type GameSession struct {
	hub  *RoomHub
	room *model.Room

	cards              []*model.Card
	playItems          []*PlayItem
	currentIdx         int
	cardRemainingCount map[int64]int
	roundResults       map[int]int64

	grabWindow     map[int]time.Time
	wrongUsers     map[int64]bool
	penaltyCount   map[int64]int
	lastCardWinner int64

	cardGrabbedCh chan struct{}
	audioEndedCh  chan struct{} // 已废弃（B1 服务端权威时钟）：保留通道兼容调用点，收到消息不再触发切首
	skipCh        chan struct{}
	mu            sync.Mutex
	paused        bool
	pauseCh       chan struct{}
	resumeCh      chan struct{}
	stopCh        chan struct{}
	store         *store.Store
	playStartTime time.Time
	// roundEndsAt 当前回合的服务端权威截止时刻（音频开始 + 时长 + 缓冲）。
	// 客户端 audio_ended 不再触发切首；到期由本时刻驱动。
	roundEndsAt time.Time
	// lastCmdID 记录每个玩家最近一次抢牌命令 ID，实现幂等（防网络重试重复判分）。
	lastCmdID map[int64]int64

	// judge mode
	judgeMode      bool
	judgeUserID    int64
	judgePlayCh    chan judgePlayRequest
	judgeEndCh     chan struct{}
	judgeOfflineCh chan struct{}
}

func expandToPlayItems(cards []*model.Card) []*PlayItem {
	var items []*PlayItem
	for _, card := range cards {
		if len(card.Audios) > 0 {
			for _, audio := range card.Audios {
				items = append(items, &PlayItem{
					CardID:      card.ID,
					AudioPath:   audio.AudioPath,
					HintText:    audio.HintText,
					CardAudioID: audio.ID,
					DurationSec: audio.DurationSec,
				})
			}
		} else if card.AudioPath != "" {
			items = append(items, &PlayItem{
				CardID:    card.ID,
				AudioPath: card.AudioPath,
				HintText:  card.HintText,
			})
		}
	}
	return items
}

func newGameSession(hub *RoomHub, room *model.Room, cards []*model.Card, s *store.Store) *GameSession {
	isJudge := room.Mode == "judge"

	// Load audios for each card and filter out cards with no audio
	validCards := make([]*model.Card, 0, len(cards))
	for _, card := range cards {
		card.Audios = s.CardAudios.GetAudiosForCard(card)
		card.AudioCount = len(card.Audios)
		if card.AudioCount == 0 && card.AudioPath != "" {
			card.AudioCount = 1
		}
		if card.AudioCount > 0 {
			validCards = append(validCards, card)
		}
	}
	cards = validCards

	playItems := expandToPlayItems(cards)

	if !isJudge {
		rand.Shuffle(len(playItems), func(i, j int) {
			playItems[i], playItems[j] = playItems[j], playItems[i]
		})
	}
	for i := range playItems {
		playItems[i].Index = i
	}

	remaining := make(map[int64]int)
	for _, card := range cards {
		remaining[card.ID] = card.AudioCount
	}

	gs := &GameSession{
		hub:                hub,
		room:               room,
		cards:              cards,
		playItems:          playItems,
		cardRemainingCount: remaining,
		roundResults:       make(map[int]int64),
		grabWindow:         make(map[int]time.Time),
		wrongUsers:         make(map[int64]bool),
		penaltyCount:       make(map[int64]int),
		cardGrabbedCh:      make(chan struct{}, 1),
		skipCh:             make(chan struct{}, 1),
		audioEndedCh:       make(chan struct{}, 1),
		pauseCh:            make(chan struct{}, 8),
		resumeCh:           make(chan struct{}, 8),
		stopCh:             make(chan struct{}),
		store:              s,
		lastCmdID:          make(map[int64]int64),
		judgeMode:          isJudge,
		judgeUserID:        room.HostID,
	}
	if isJudge {
		gs.judgePlayCh = make(chan judgePlayRequest, 1)
		gs.judgeEndCh = make(chan struct{}, 1)
		gs.judgeOfflineCh = make(chan struct{}, 1)
	}
	return gs
}

type wsEvent struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

func (gs *GameSession) Run() {
	gs.broadcastRoomState()

	if gs.judgeMode {
		gs.runJudgeMode()
	} else {
		gs.runAutoMode()
	}
}

func (gs *GameSession) runAutoMode() {
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

	for gs.currentIdx < len(gs.playItems) {
		item := gs.playItems[gs.currentIdx]

		for len(gs.pauseCh) > 0 {
			<-gs.pauseCh
		}
		for len(gs.resumeCh) > 0 {
			<-gs.resumeCh
		}
		for len(gs.audioEndedCh) > 0 {
			<-gs.audioEndedCh
		}
		for len(gs.cardGrabbedCh) > 0 {
			<-gs.cardGrabbedCh
		}

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

		gs.mu.Lock()
		gs.grabWindow[item.Index] = time.Now()
		gs.wrongUsers = make(map[int64]bool)
		gs.mu.Unlock()

		isLast := gs.currentIdx == len(gs.playItems)-1

		// B1 服务端权威回合时钟：
		// ends_at = 音频开始 + 实测时长 + 缓冲期（读牌间隔），到期自动切首。
		// 时长未知（旧数据）时回退上限兜底（原 maxWait 逻辑）。
		gs.playStartTime = time.Now()
		settle := time.Duration(gs.room.IntervalSec) * time.Second
		if item.DurationSec > 0 {
			// 末首无下一首切首缓冲，对齐原 audio_ended 后 2 秒的行为。
			tail := settle
			if isLast {
				tail = 2 * time.Second
			}
			gs.roundEndsAt = gs.playStartTime.Add(time.Duration(item.DurationSec*float64(time.Second)) + tail)
		} else {
			maxWait := settle * 10
			if maxWait < 60*time.Second {
				maxWait = 60 * time.Second
			}
			gs.roundEndsAt = gs.playStartTime.Add(maxWait)
		}

		cardStartMsg := map[string]interface{}{
			"type":            "card_start",
			"round_id":        item.Index + 1,
			"card_id":         item.CardID,
			"card_audio_id":   item.CardAudioID,
			"audio_url":       audioURLFromPath(item.AudioPath),
			"hint_text":       item.HintText,
			"index":           gs.currentIdx + 1,
			"total":           len(gs.playItems),
			"is_last":         isLast,
			"next_audio_urls": gs.upcomingAudioURLs(gs.currentIdx+1, 2),
			"start_at":        gs.playStartTime.UnixMilli(),
			"ends_at":         gs.roundEndsAt.UnixMilli(),
			"server_now":      time.Now().UnixMilli(),
		}
		if gs.room.RandomStart {
			rng := rand.New(rand.NewSource(gs.room.MaskSeed ^ item.CardAudioID ^ int64(gs.currentIdx)))
			maxPct := gs.room.RandomStartMax
			if maxPct <= 0 || maxPct > 80 {
				maxPct = 50
			}
			cardStartMsg["start_ratio"] = float64(rng.Intn(maxPct)) / 100.0
		}
		gs.hub.BroadcastJSON(cardStartMsg)

		if isLast {
			if !gs.waitAudioOnly() {
				return
			}
		} else if !gs.waitInterval() {
			return
		}

		gs.mu.Lock()
		delete(gs.grabWindow, item.Index)
		_, grabbed := gs.roundResults[item.Index]
		gs.mu.Unlock()

		if !grabbed {
			gs.mu.Lock()
			gs.cardRemainingCount[item.CardID]--
			remaining := gs.cardRemainingCount[item.CardID]
			gs.mu.Unlock()

			gs.hub.BroadcastJSON(map[string]interface{}{
				"type":      "card_missed",
				"card_id":   item.CardID,
				"remaining": remaining,
			})

			if remaining <= 0 {
				gs.hub.BroadcastJSON(map[string]interface{}{
					"type":    "card_exhausted",
					"card_id": item.CardID,
				})
			}

			now := time.Now()
			_ = gs.store.GameRecords.InsertRecord(gs.room.ID, item.CardID, nil, now)
		}

		gs.currentIdx++
	}

	gs.broadcastGameOver()
}

func (gs *GameSession) upcomingAudioURLs(start, limit int) []string {
	if start < 0 || limit <= 0 || start >= len(gs.playItems) {
		return []string{}
	}
	urls := make([]string, 0, limit)
	for i := start; i < len(gs.playItems) && len(urls) < limit; i++ {
		if url := audioURLFromPath(gs.playItems[i].AudioPath); url != "" {
			urls = append(urls, url)
		}
	}
	return urls
}

func (gs *GameSession) runJudgeMode() {
	playedCount := 0

	for {
		gs.hub.BroadcastJSON(map[string]interface{}{
			"type":         "judge_waiting",
			"played_count": playedCount,
			"total_count":  len(gs.playItems),
		})

		var req judgePlayRequest
		select {
		case <-gs.stopCh:
			return
		case <-gs.judgeEndCh:
			goto gameOver
		case <-gs.judgeOfflineCh:
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
				case req = <-gs.judgePlayCh:
					reconnectTimer.Stop()
					reconnected = true
					break waitLoop
				case <-reconnectTimer.C:
					gs.hub.BroadcastJSON(map[string]interface{}{
						"type": "judge_timeout",
					})
					goto gameOver
				}
			}
			if !reconnected {
				goto gameOver
			}
		case req = <-gs.judgePlayCh:
		}

		playedCount++

		// find the PlayItem: prefer exact match by CardAudioID, fallback to first unplayed of this card
		var item *PlayItem
		if req.CardAudioID > 0 {
			for _, pi := range gs.playItems {
				if pi.CardAudioID == req.CardAudioID {
					if _, done := gs.roundResults[pi.Index]; !done {
						item = pi
						break
					}
				}
			}
		}
		if item == nil {
			for _, pi := range gs.playItems {
				if pi.CardID == req.CardID {
					if _, done := gs.roundResults[pi.Index]; !done {
						item = pi
						break
					}
				}
			}
		}
		if item == nil {
			continue
		}

		gs.mu.Lock()
		gs.currentIdx = item.Index
		gs.grabWindow[item.Index] = time.Now()
		gs.wrongUsers = make(map[int64]bool)
		gs.mu.Unlock()

		judgeCardStart := map[string]interface{}{
			"type":          "card_start",
			"round_id":      item.Index + 1,
			"card_id":       item.CardID,
			"card_audio_id": item.CardAudioID,
			"audio_url":     audioURLFromPath(item.AudioPath),
			"hint_text":     item.HintText,
			"index":         playedCount,
			"total":         len(gs.playItems),
			"is_last":       playedCount >= len(gs.playItems),
		}
		if gs.room.RandomStart {
			rng := rand.New(rand.NewSource(gs.room.MaskSeed ^ item.CardAudioID ^ int64(playedCount)))
			maxPct := gs.room.RandomStartMax
			if maxPct <= 0 || maxPct > 80 {
				maxPct = 50
			}
			judgeCardStart["start_ratio"] = float64(rng.Intn(maxPct)) / 100.0
		}
		gs.hub.BroadcastJSON(judgeCardStart)

		if !gs.waitInterval() {
			return
		}

		gs.mu.Lock()
		delete(gs.grabWindow, item.Index)
		_, grabbed := gs.roundResults[item.Index]
		gs.mu.Unlock()

		if !grabbed {
			gs.mu.Lock()
			gs.cardRemainingCount[item.CardID]--
			remaining := gs.cardRemainingCount[item.CardID]
			gs.mu.Unlock()

			gs.hub.BroadcastJSON(map[string]interface{}{
				"type":      "card_missed",
				"card_id":   item.CardID,
				"remaining": remaining,
			})
			if remaining <= 0 {
				gs.hub.BroadcastJSON(map[string]interface{}{
					"type":    "card_exhausted",
					"card_id": item.CardID,
				})
			}
			_ = gs.store.GameRecords.InsertRecord(gs.room.ID, item.CardID, nil, time.Now())
		}

		allPlayed := true
		for _, pi := range gs.playItems {
			if _, done := gs.roundResults[pi.Index]; !done {
				// check if this card's remaining > 0 (it could be missed but remaining consumed)
				gs.mu.Lock()
				r := gs.cardRemainingCount[pi.CardID]
				gs.mu.Unlock()
				if r > 0 {
					allPlayed = false
					break
				}
			}
		}
		if allPlayed {
			break
		}
	}

gameOver:
	gs.broadcastGameOver()
}

func (gs *GameSession) broadcastGameOver() {
	_ = gs.store.Rooms.UpdateStatus(gs.room.ID, "end")

	players, _ := gs.store.Rooms.ListPlayers(gs.room.ID)
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
	for i := 1; i < len(scoringPlayers); i++ {
		for j := i; j > 0 && scoringPlayers[j].Score > scoringPlayers[j-1].Score; j-- {
			scoringPlayers[j], scoringPlayers[j-1] = scoringPlayers[j-1], scoringPlayers[j]
		}
	}

	// Build grabbed cards per user (each round = one entry, same cover can appear multiple times)
	userCards := make(map[int64][]map[string]interface{})
	gs.mu.Lock()
	for idx, winnerID := range gs.roundResults {
		item := gs.playItems[idx]
		for _, c := range gs.cards {
			if c.ID == item.CardID {
				userCards[winnerID] = append(userCards[winnerID], map[string]interface{}{
					"id":           c.ID,
					"display_text": c.DisplayText,
					"cover_url":    coverURL(c),
					"hint_text":    item.HintText,
				})
				break
			}
		}
	}
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
		"type":                "game_over",
		"results":             results,
		"last_card_winner_id": lastCardWinner,
	})

	// 成就评估（2026-09-21；best-effort，绝不阻塞结算）。新解锁逐人推送
	// achievement_unlocked，前端右下角弹层消费。
	snap := achievement.GameSnapshot{
		Mode:           gs.room.Mode,
		Training:       gs.room.Training,
		PlayerCount:    len(scoringPlayers),
		Penalties:      penaltyCount,
		LastCardWinner: lastCardWinner,
	}
	if gs.judgeMode {
		snap.JudgeUserID = gs.judgeUserID
	}
	snap.Ranks = make(map[int64]int, len(scoringPlayers))
	snap.PlayerIDs = make([]int64, 0, len(scoringPlayers))
	for i, p := range scoringPlayers {
		snap.Ranks[p.UserID] = i + 1
		snap.PlayerIDs = append(snap.PlayerIDs, p.UserID)
	}
	gs.mu.Lock()
	// 语义备忘（2026-09-21 回顾）：once 模式会从 playItems 剔除同牌后续音频，
	// 被剔除的未读回合计入 MissedRounds——judge_sweep/perfect_round 在 once
	// 房间几乎不可能达成（once 仅 duel 强制或用户自选，judge 房罕见，可接受）。
	snap.MissedRounds = len(gs.playItems) - len(gs.roundResults)
	if len(gs.playItems) > 0 && len(gs.roundResults) == len(gs.playItems) {
		winner := int64(0)
		perfect := true
		for _, w := range gs.roundResults {
			if winner == 0 {
				winner = w
			} else if w != winner {
				perfect = false
				break
			}
		}
		if perfect {
			snap.PerfectWinner = winner
		}
	}
	gs.mu.Unlock()
	for uid, unlocks := range achievement.NewEvaluator(gs.store).OnGameEnd(snap) {
		gs.hub.SendJSONToUser(uid, map[string]interface{}{
			"type":         "achievement_unlocked",
			"achievements": unlocks,
		})
	}

	time.Sleep(4 * time.Second)
	gs.hub.Stop()
}

// safeSend 向客户端写入数据。注销/停止路径会 close(client.send)，与本写入
// 并发时存在竞态窗口（select 也可能命中已关闭通道触发 panic），统一在此
// recover 兜底并静默丢弃——已离线/慢客户端丢包无害。
func safeSend(c *Client, data []byte) {
	defer func() { _ = recover() }()
	select {
	case c.send <- data:
	default:
	}
}

func (gs *GameSession) SendRoomStateToClient(client *Client) {
	cardList := gs.buildCardList()
	players, _ := gs.store.Rooms.ListPlayers(gs.room.ID)
	playerList := gs.buildPlayerList(players)

	gs.mu.Lock()
	totalRemaining := 0
	for _, r := range gs.cardRemainingCount {
		totalRemaining += r
	}
	judgeWaiting := gs.judgeMode && len(gs.grabWindow) == 0 && totalRemaining > 0
	grabbedList := gs.buildGrabbedList()
	gs.mu.Unlock()

	data, err := json.Marshal(map[string]interface{}{
		"type": "room_state",
		"data": map[string]interface{}{
			"room":            gs.buildRoomMap(),
			"players":         playerList,
			"cards":           cardList,
			"grabbed_cards":   grabbedList,
			"remaining_count": totalRemaining,
			"judge_waiting":   judgeWaiting,
		},
	})
	if err != nil {
		return
	}
	safeSend(client, data)
}

func (gs *GameSession) broadcastRoomState() {
	players, _ := gs.store.Rooms.ListPlayers(gs.room.ID)

	gs.mu.Lock()
	totalRemaining := 0
	for _, r := range gs.cardRemainingCount {
		totalRemaining += r
	}
	judgeWaiting := gs.judgeMode && len(gs.grabWindow) == 0 && totalRemaining > 0
	grabbedList := gs.buildGrabbedList()
	gs.mu.Unlock()

	gs.hub.BroadcastJSON(map[string]interface{}{
		"type": "room_state",
		"data": map[string]interface{}{
			"room":            gs.buildRoomMap(),
			"players":         gs.buildPlayerList(players),
			"cards":           gs.buildCardList(),
			"grabbed_cards":   grabbedList,
			"remaining_count": totalRemaining,
			"judge_waiting":   judgeWaiting,
		},
	})
}

// SnapshotBoard 返回当前棋盘的权威投影（REST 快照恢复用）：
// 每张牌剩余可抢次数 + 已出结果的牌（含无人抢，带 hint_text）。
// 供 handler 在页面刷新/重连时恢复棋盘，避免从 DB 反推导致已抢牌"复活"。
func (gs *GameSession) SnapshotBoard() (map[int64]int, []map[string]interface{}) {
	gs.mu.Lock()
	defer gs.mu.Unlock()
	remaining := make(map[int64]int, len(gs.cardRemainingCount))
	for id, n := range gs.cardRemainingCount {
		remaining[id] = n
	}
	return remaining, gs.buildGrabbedList()
}

func (gs *GameSession) buildGrabbedList() []map[string]interface{} {
	if len(gs.roundResults) == 0 {
		return nil
	}
	list := make([]map[string]interface{}, 0, len(gs.roundResults))
	for idx, winnerID := range gs.roundResults {
		item := gs.playItems[idx]
		winnerName := ""
		if u, err := gs.store.Users.GetByID(winnerID); err == nil {
			winnerName = u.Username
		}
		list = append(list, map[string]interface{}{
			"card_id":     item.CardID,
			"winner_id":   winnerID,
			"winner_name": winnerName,
			"hint_text":   item.HintText,
		})
	}
	return list
}

func (gs *GameSession) buildRoomMap() map[string]interface{} {
	m := map[string]interface{}{
		"id":           gs.room.ID,
		"code":         gs.room.Code,
		"status":       "reading",
		"interval_sec": gs.room.IntervalSec,
		"host_id":      gs.room.HostID,
		"deck_id":      gs.room.DeckID,
		"mode":         gs.room.Mode,
	}
	if gs.room.MaskEnabled {
		m["mask_enabled"] = true
		m["mask_difficulty"] = gs.room.MaskDifficulty
	}
	if gs.room.ShuffleRemaining > 0 {
		m["shuffle_remaining"] = gs.room.ShuffleRemaining
	}
	return m
}

func (gs *GameSession) buildCardList() []map[string]interface{} {
	gs.mu.Lock()
	defer gs.mu.Unlock()

	// 如果开启了遮罩模式，生成 masks
	var masks map[int64]*mask.CardMask
	if gs.room.MaskEnabled {
		cardIDs := make([]int64, len(gs.cards))
		for i, c := range gs.cards {
			cardIDs[i] = c.ID
		}
		masks = mask.GenerateMasks(gs.room.MaskSeed, cardIDs, gs.room.MaskDifficulty)
	}

	list := make([]map[string]interface{}, 0, len(gs.cards))
	for _, c := range gs.cards {
		item := map[string]interface{}{
			"id":           c.ID,
			"display_text": c.DisplayText,
			"cover_url":    coverURL(c),
			"audio_count":  c.AudioCount,
			"remaining":    gs.cardRemainingCount[c.ID],
		}
		// 裁判模式下返回 audios 列表，供裁判选择播放
		if gs.judgeMode && len(c.Audios) > 0 {
			audioList := make([]map[string]interface{}, 0, len(c.Audios))
			for _, a := range c.Audios {
				audioList = append(audioList, map[string]interface{}{
					"id":        a.ID,
					"audio_url": storage.FileURL(a.AudioPath, "audio"),
					"hint_text": a.HintText,
				})
			}
			item["audios"] = audioList
		}
		if masks != nil {
			item["mask"] = masks[c.ID]
		}
		list = append(list, item)
	}
	return list
}

func (gs *GameSession) buildPlayerList(players []*model.RoomPlayer) []map[string]interface{} {
	onlineSet := make(map[int64]bool)
	for _, id := range gs.hub.OnlineUserIDs() {
		onlineSet[id] = true
	}
	list := make([]map[string]interface{}, 0, len(players))
	for _, p := range players {
		if gs.judgeMode && p.UserID == gs.judgeUserID {
			continue
		}
		list = append(list, map[string]interface{}{
			"user_id":    p.UserID,
			"username":   p.Username,
			"avatar_url": p.AvatarURL,
			"role":       p.Role,
			"score":      p.Score,
			"online":     onlineSet[p.UserID],
		})
	}
	return list
}

// NotifyAudioEnded 已废弃（B1 服务端权威回合时钟）：
// 客户端 audio_ended 不再触发切首。保留函数兼容旧客户端消息，仅记日志。
func (gs *GameSession) NotifyAudioEnded(userID int64, roundID int) {
	slog.Info("legacy audio_ended ignored (server-authoritative clock)", "user_id", userID, "round_id", roundID)
}

func (gs *GameSession) waitMinPlay() {
	if gs.room.MinPlayTime > 0 {
		elapsed := time.Since(gs.playStartTime)
		remaining := time.Duration(gs.room.MinPlayTime)*time.Second - elapsed
		if remaining > 0 {
			time.Sleep(remaining)
		}
	}
}

// waitAudioOnly 等待最后一首结束：服务端权威时钟到期（ends_at）或抢牌后 2 秒。
// 暂停期间时钟顺延补偿。
func (gs *GameSession) waitAudioOnly() bool {
	maxWait := time.Duration(gs.room.IntervalSec) * time.Second * 10
	if maxWait < 60*time.Second {
		maxWait = 60 * time.Second
	}

	for {
		deadline := gs.roundEndsAt
		if deadline.IsZero() {
			deadline = time.Now().Add(maxWait)
		}
		roundTimer := time.NewTimer(time.Until(deadline))
		select {
		case <-gs.stopCh:
			roundTimer.Stop()
			return false
		case <-gs.cardGrabbedCh:
			roundTimer.Stop()
			gs.waitMinPlay()
			select {
			case <-gs.stopCh:
				return false
			case <-time.After(2 * time.Second):
			}
			return true
		case <-gs.skipCh:
			roundTimer.Stop()
			return true
		case <-roundTimer.C:
			return true
		case <-gs.pauseCh:
			if !roundTimer.Stop() {
				select {
				case <-roundTimer.C:
				default:
				}
			}
			pausedAt := time.Now()
			for {
				select {
				case <-gs.stopCh:
					return false
				case <-gs.resumeCh:
					gs.mu.Lock()
					gs.roundEndsAt = gs.roundEndsAt.Add(time.Since(pausedAt))
					gs.mu.Unlock()
					goto nextWait
				}
			}
		}
	nextWait:
	}
}

// waitInterval 等待非末首回合结束。
// 服务端权威时钟：roundEndsAt = 音频开始 + 实测时长 + 缓冲期；到期自动切首。
// 抢牌后仍保留 settle 缓冲窗口（与原行为一致）；暂停期间时钟顺延补偿；
// 客户端 audio_ended 不再触发结束（B1 规格）。
func (gs *GameSession) waitInterval() bool {
	settle := time.Duration(gs.room.IntervalSec) * time.Second
	maxWait := settle * 10
	if maxWait < 60*time.Second {
		maxWait = 60 * time.Second
	}

	for {
		// 每轮重建回合截止计时器（暂停恢复后 deadline 已顺延）。
		deadline := gs.roundEndsAt
		if deadline.IsZero() {
			deadline = time.Now().Add(maxWait)
		}
		roundTimer := time.NewTimer(time.Until(deadline))

		select {
		case <-gs.stopCh:
			roundTimer.Stop()
			return false
		case <-gs.cardGrabbedCh:
			roundTimer.Stop()
			// 抢中：保留缓冲期供玩家看清结果再切首。
			select {
			case <-gs.stopCh:
				return false
			case <-time.After(settle):
			}
			return true
		case <-gs.skipCh:
			roundTimer.Stop()
			gs.waitMinPlay()
			return true
		case <-roundTimer.C:
			// 服务端权威到期：时长 + 缓冲结束。
			gs.waitMinPlay()
			return true
		case <-gs.pauseCh:
			if !roundTimer.Stop() {
				select {
				case <-roundTimer.C:
				default:
				}
			}
			pausedAt := time.Now()
			for {
				select {
				case <-gs.stopCh:
					return false
				case <-gs.resumeCh:
					gs.mu.Lock()
					gs.roundEndsAt = gs.roundEndsAt.Add(time.Since(pausedAt))
					gs.mu.Unlock()
					goto nextInterval
				}
			}
		}
	nextInterval:
	}
}

// HandleGrab processes a grab attempt from a player.
// cmdID 为客户端生成的单调递增命令 ID：网络重试导致的重复投递
// （同一玩家 cmdID 不大于上次）会被静默忽略，防止重复判分。
// cmdID=0 视为不支持幂等的旧客户端，直接处理。
func (gs *GameSession) HandleGrab(userID, cardID int64, cmdID int64) {
	gs.mu.Lock()
	defer gs.mu.Unlock()

	if cmdID > 0 {
		if last, ok := gs.lastCmdID[userID]; ok && cmdID <= last {
			return
		}
		gs.lastCmdID[userID] = cmdID
	}
	if gs.judgeMode && userID == gs.judgeUserID {
		gs.hub.SendJSONToUser(userID, map[string]interface{}{
			"type": "grab_banned",
		})
		return
	}

	if gs.wrongUsers[userID] {
		gs.hub.SendJSONToUser(userID, map[string]interface{}{
			"type":    "grab_banned",
			"card_id": cardID,
		})
		return
	}

	// Current PlayItem
	if gs.currentIdx >= len(gs.playItems) {
		return
	}
	currentItem := gs.playItems[gs.currentIdx]

	// Check if grab window is open for current item
	if _, ok := gs.grabWindow[currentItem.Index]; !ok {
		return
	}

	// Validate: player clicked the correct card?
	if cardID != currentItem.CardID {
		grabberName := ""
		if u, err := gs.store.Users.GetByID(userID); err == nil {
			grabberName = u.Username
		}
		gs.wrongUsers[userID] = true
		remaining := len(gs.playItems) - gs.currentIdx
		penalty := gs.room.PenaltyWrong && (gs.room.PenaltyLast == 0 || remaining <= gs.room.PenaltyLast)
		if penalty {
			gs.penaltyCount[userID]++
			_ = gs.store.Rooms.DeductScore(gs.room.ID, userID, 1)
		}
		gs.hub.SendJSONToUser(userID, map[string]interface{}{
			"type":    "grab_failed",
			"card_id": cardID,
			"reason":  "not_current",
			"penalty": penalty,
		})
		gs.hub.BroadcastJSON(map[string]interface{}{
			"type":     "grab_wrong",
			"user_id":  userID,
			"username": grabberName,
			"card_id":  cardID,
			"reason":   "not_current",
			"penalty":  penalty,
		})
		if penalty {
			gs.broadcastScores()
		}
		gs.checkAllBanned()
		return
	}

	// Check if already grabbed this round
	if _, alreadyGrabbed := gs.roundResults[currentItem.Index]; alreadyGrabbed {
		grabberName := ""
		if u, err := gs.store.Users.GetByID(userID); err == nil {
			grabberName = u.Username
		}
		gs.wrongUsers[userID] = true
		penalty := gs.room.PenaltySlow
		if penalty {
			gs.penaltyCount[userID]++
			_ = gs.store.Rooms.DeductScore(gs.room.ID, userID, 1)
		}
		gs.hub.SendJSONToUser(userID, map[string]interface{}{
			"type":    "grab_failed",
			"card_id": cardID,
			// reason 补齐（2026-09-21）：前端已有 already_grabbed 分支，
			// 此前该消息不带 reason 使分支永远不可达。
			"reason":  "already_grabbed",
			"penalty": penalty,
		})
		gs.hub.BroadcastJSON(map[string]interface{}{
			"type":     "grab_wrong",
			"user_id":  userID,
			"username": grabberName,
			"card_id":  cardID,
			"reason":   "already_grabbed",
			"penalty":  penalty,
		})
		if penalty {
			gs.broadcastScores()
		}
		gs.checkAllBanned()
		return
	}

	// Success!
	gs.roundResults[currentItem.Index] = userID
	gs.cardRemainingCount[cardID]--
	remaining := gs.cardRemainingCount[cardID]

	// "once" mode: exhaust card immediately and remove remaining items from queue
	if gs.room.MultiAudioMode == "once" && remaining > 0 {
		gs.cardRemainingCount[cardID] = 0
		remaining = 0
		// Remove future playItems with same cardID
		filtered := gs.playItems[:gs.currentIdx+1]
		for i := gs.currentIdx + 1; i < len(gs.playItems); i++ {
			if gs.playItems[i].CardID != cardID {
				filtered = append(filtered, gs.playItems[i])
			}
		}
		gs.playItems = filtered
	}

	gs.lastCardWinner = userID

	winnerName := ""
	if u, err := gs.store.Users.GetByID(userID); err == nil {
		winnerName = u.Username
	}

	_ = gs.store.Rooms.UpdateScore(gs.room.ID, userID, 1)

	now := time.Now()
	winnerIDCopy := userID
	isLastItem := gs.currentIdx == len(gs.playItems)-1
	_ = gs.store.GameRecords.InsertRecordFull(gs.room.ID, cardID, &winnerIDCopy, now, isLastItem)

	gs.hub.BroadcastJSON(map[string]interface{}{
		"type":        "card_claimed",
		"card_id":     cardID,
		"winner_id":   userID,
		"winner_name": winnerName,
		"remaining":   remaining,
		"hint_text":   currentItem.HintText,
	})

	if remaining <= 0 {
		gs.hub.BroadcastJSON(map[string]interface{}{
			"type":    "card_exhausted",
			"card_id": cardID,
		})
	}

	gs.broadcastScores()

	select {
	case gs.cardGrabbedCh <- struct{}{}:
	default:
	}
}

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

func (gs *GameSession) JudgePlayCard(cardID, cardAudioID int64) {
	if gs.judgePlayCh == nil {
		return
	}
	select {
	case gs.judgePlayCh <- judgePlayRequest{CardID: cardID, CardAudioID: cardAudioID}:
	default:
	}
}

func (gs *GameSession) Stop() {
	select {
	case <-gs.stopCh:
	default:
		close(gs.stopCh)
	}
}

func (gs *GameSession) SkipCard() {
	select {
	case gs.skipCh <- struct{}{}:
	default:
	}
}

func (gs *GameSession) IsJudge(userID int64) bool {
	return gs.judgeMode && gs.judgeUserID == userID
}

func (gs *GameSession) OnJudgeDisconnected() {
	if gs.judgeOfflineCh == nil {
		return
	}
	select {
	case gs.judgeOfflineCh <- struct{}{}:
	default:
	}
}

func (gs *GameSession) checkAllBanned() {
	onlineIDs := gs.hub.OnlinePlayerIDs()
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
			return
		}
	}
	gs.hub.BroadcastJSON(map[string]interface{}{
		"type": "all_banned",
	})
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

func audioURLFromPath(path string) string {
	return storage.FileURL(path, "audio")
}

func coverURL(card *model.Card) string {
	return storage.FileURL(card.CoverPath, "covers")
}
