package ccp

import (
	"encoding/json"
	"math/rand"
	"strconv"
	"strings"
	"time"
)

// CcpGameSession 游戏会话，管理一局游戏的完整生命周期
type CcpGameSession struct {
	hub    *CcpHub
	room   *CcpRoom
	store  *Store
	state  *CcpGameState
	images []RoomImageInfo
}

// NewCcpGameSession 创建游戏会话
func NewCcpGameSession(hub *CcpHub, room *CcpRoom, store *Store, state *CcpGameState, images []RoomImageInfo) *CcpGameSession {
	return &CcpGameSession{
		hub:    hub,
		room:   room,
		store:  store,
		state:  state,
		images: images,
	}
}

// SendStateToClient 向单个客户端发送当前完整状态
func (s *CcpGameSession) SendStateToClient(client *CcpClient) {
	s.hub.SendToUser(client.userID, map[string]interface{}{
		"type":        "game_state",
		"game_state":  s.state,
		"room":        s.room,
		"images":      s.images,
	})
}

// HandleMessage 处理 WebSocket 消息
func (s *CcpGameSession) HandleMessage(client *CcpClient, msgType string, data json.RawMessage) {
	switch msgType {
	case "reveal":
		s.handleReveal(client, data)
	case "guess":
		s.handleGuess(client, data)
	case "judge":
		s.handleJudge(client, data)
	case "skip_round":
		s.handleSkipRound(client)
	case "reduce_blur":
		s.handleAdjustBlur(client, -1)
	case "increase_blur":
		s.handleAdjustBlur(client, 1)
	case "end_game":
		s.handleEndGame(client)
	}
}

// reveal 掀开方块
func (s *CcpGameSession) handleReveal(client *CcpClient, data json.RawMessage) {
	if s.state.Status != "active" {
		return
	}
	// 检查是否是当前玩家
	if s.state.PlayerOrder[s.state.CurrentPlayerIndex] != client.userID {
		return
	}
	// 检查是否有待判定的猜测
	if s.state.PendingGuess != nil {
		return
	}

	var req struct {
		TileIndex int `json:"tile_index"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		return
	}

	totalTiles := s.room.GridSize * s.room.GridSize
	if req.TileIndex < 0 || req.TileIndex >= totalTiles {
		return
	}
	for _, t := range s.state.RevealedTiles {
		if t == req.TileIndex {
			return
		}
	}

	s.state.RevealedTiles = append(s.state.RevealedTiles, req.TileIndex)
	log := CcpGameLog{
		ID:        time.Now().UnixMilli(),
		Type:      "reveal",
		UserID:    client.userID,
		Username:  client.username,
		Message:   client.username + " 掀开了第 " + itoa(len(s.state.RevealedTiles)) + " 块",
		Timestamp: time.Now().UnixMilli(),
	}
	s.state.Logs = append(s.state.Logs, log)

	s.nextTurn()
	s.saveAndBroadcast()
}

// guess 提交猜测
func (s *CcpGameSession) handleGuess(client *CcpClient, data json.RawMessage) {
	if s.state.Status != "active" {
		return
	}
	if s.state.PendingGuess != nil {
		return
	}
	// 检查是否是当前玩家
	if s.state.PlayerOrder[s.state.CurrentPlayerIndex] != client.userID {
		return
	}

	var req struct {
		Word string `json:"word"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		return
	}
	word := strings.TrimSpace(req.Word)
	if word == "" {
		return
	}

	// 增加猜测次数
	s.store.IncrementPlayerGuessCount(s.room.Code, client.userID)

	// 自动判定模式：直接判定，不等待裁判
	if s.room.JudgeMode == "auto" {
		s.handleAutoJudge(client, word)
		return
	}

	// 裁判模式：设置待判定猜测
	pending := &CcpPendingGuess{
		ID:        time.Now().UnixMilli(),
		UserID:    client.userID,
		Username:  client.username,
		Word:      word,
		Timestamp: time.Now().UnixMilli(),
	}
	s.state.PendingGuess = pending

	log := CcpGameLog{
		ID:        time.Now().UnixMilli(),
		Type:      "guess",
		UserID:    client.userID,
		Username:  client.username,
		Message:   client.username + " 提交了猜测，等待判定...",
		Timestamp: time.Now().UnixMilli(),
	}
	s.state.Logs = append(s.state.Logs, log)

	s.saveAndBroadcast()
}

// handleAutoJudge 自动判定模式下的猜测处理
func (s *CcpGameSession) handleAutoJudge(client *CcpClient, word string) {
	// 获取当前图片的答案关键词
	var keywords string
	if s.state.CurrentImageIndex < len(s.images) {
		keywords = s.images[s.state.CurrentImageIndex].AnswerKeywords
	}

	correct := AutoJudge(word, keywords)

	if correct {
		s.store.UpdatePlayerScore(s.room.Code, client.userID, 1)

		log := CcpGameLog{
			ID:        time.Now().UnixMilli(),
			Type:      "system",
			UserID:    0,
			Username:  "系统",
			Message:   client.username + " 猜对了！+1 分（自动判定）",
			Timestamp: time.Now().UnixMilli(),
		}
		s.state.Logs = append(s.state.Logs, log)

		if s.state.CurrentRound >= s.state.MaxRounds {
			s.state.Status = "completed"
			s.store.UpdateRoomStatus(s.room.Code, "ended")
			s.room.Status = "ended"
		} else {
			s.startNewRound()
		}
	} else {
		log := CcpGameLog{
			ID:        time.Now().UnixMilli(),
			Type:      "system",
			UserID:    0,
			Username:  "系统",
			Message:   client.username + " 猜错了（自动判定）",
			Timestamp: time.Now().UnixMilli(),
		}
		s.state.Logs = append(s.state.Logs, log)

		// 检查猜测次数是否用完
		player, err := s.store.GetPlayer(s.room.Code, client.userID)
		if err == nil && player.GuessCount >= s.room.MaxGuesses {
			skipLog := CcpGameLog{
				ID:        time.Now().UnixMilli(),
				Type:      "system",
				UserID:    0,
				Username:  "系统",
				Message:   client.username + " 用完猜测次数，跳过本轮",
				Timestamp: time.Now().UnixMilli(),
			}
			s.state.Logs = append(s.state.Logs, skipLog)
			s.nextTurn()
		}
	}

	s.saveAndBroadcast()
}

// judge 裁判判定（裁判模式）或自动判定（自动模式）
func (s *CcpGameSession) handleJudge(client *CcpClient, data json.RawMessage) {
	if s.state.PendingGuess == nil {
		return
	}
	if !client.isHost && s.room.JudgeMode == "judge" {
		return
	}

	var req struct {
		Correct bool   `json:"correct"`
		GuessID int64  `json:"guess_id"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		return
	}

	pending := s.state.PendingGuess

	if req.Correct {
		// 猜对 +1 分
		s.store.UpdatePlayerScore(s.room.Code, pending.UserID, 1)

		log := CcpGameLog{
			ID:        time.Now().UnixMilli(),
			Type:      "system",
			UserID:    0,
			Username:  "系统",
			Message:   pending.Username + " 猜对了！+1 分",
			Timestamp: time.Now().UnixMilli(),
		}
		s.state.Logs = append(s.state.Logs, log)

		s.state.PendingGuess = nil

		if s.state.CurrentRound >= s.state.MaxRounds {
			s.state.Status = "completed"
			s.store.UpdateRoomStatus(s.room.Code, "ended")
			s.room.Status = "ended"
		} else {
			s.startNewRound()
		}
	} else {
		s.state.PendingGuess = nil

		log := CcpGameLog{
			ID:        time.Now().UnixMilli(),
			Type:      "system",
			UserID:    0,
			Username:  "系统",
			Message:   pending.Username + " 猜错了",
			Timestamp: time.Now().UnixMilli(),
		}
		s.state.Logs = append(s.state.Logs, log)

		// 检查猜测次数是否用完
		players, _ := s.store.ListPlayers(s.room.Code)
		for _, p := range players {
			if p.UserID == pending.UserID {
				if p.GuessCount >= s.room.MaxGuesses {
					skipLog := CcpGameLog{
						ID:        time.Now().UnixMilli(),
						Type:      "system",
						UserID:    0,
						Username:  "系统",
						Message:   pending.Username + " 用完猜测次数，跳过本轮",
						Timestamp: time.Now().UnixMilli(),
					}
					s.state.Logs = append(s.state.Logs, skipLog)
					s.nextTurn()
				}
				break
			}
		}
	}

	s.saveAndBroadcast()
}

// skipRound 裁判跳过本轮
func (s *CcpGameSession) handleSkipRound(client *CcpClient) {
	if !client.isHost {
		return
	}
	s.state.PendingGuess = nil

	log := CcpGameLog{
		ID:        time.Now().UnixMilli(),
		Type:      "system",
		UserID:    0,
		Username:  "系统",
		Message:   "裁判跳过了本轮",
		Timestamp: time.Now().UnixMilli(),
	}
	s.state.Logs = append(s.state.Logs, log)

	if s.state.CurrentRound >= s.state.MaxRounds {
		s.state.Status = "completed"
		s.store.UpdateRoomStatus(s.room.Code, "ended")
		s.room.Status = "ended"
	} else {
		s.startNewRound()
	}

	s.saveAndBroadcast()
}

// adjustBlur 调整模糊度
func (s *CcpGameSession) handleAdjustBlur(client *CcpClient, delta int) {
	if !client.isHost {
		return
	}
	newLevel := s.state.CurrentBlurLevel + delta
	if newLevel < 0 || newLevel > s.room.BlurLevel {
		return
	}
	s.state.CurrentBlurLevel = newLevel

	log := CcpGameLog{
		ID:        time.Now().UnixMilli(),
		Type:      "system",
		UserID:    0,
		Username:  "系统",
		Message:   "模糊度调整为 " + itoa(newLevel),
		Timestamp: time.Now().UnixMilli(),
	}
	s.state.Logs = append(s.state.Logs, log)

	s.saveAndBroadcast()
}

// endGame 裁判结束游戏
func (s *CcpGameSession) handleEndGame(client *CcpClient) {
	if !client.isHost {
		return
	}
	s.state.Status = "completed"
	s.store.UpdateRoomStatus(s.room.Code, "ended")
	s.room.Status = "ended"

	log := CcpGameLog{
		ID:        time.Now().UnixMilli(),
		Type:      "system",
		UserID:    0,
		Username:  "系统",
		Message:   "裁判结束了游戏",
		Timestamp: time.Now().UnixMilli(),
	}
	s.state.Logs = append(s.state.Logs, log)

	s.saveAndBroadcast()
}

// startNewRound 开始新一轮
func (s *CcpGameSession) startNewRound() {
	s.state.CurrentRound++
	s.state.CurrentImageIndex++
	s.state.RevealedTiles = []int{}
	s.state.CurrentBlurLevel = s.room.BlurLevel
	s.store.ResetPlayerGuessCounts(s.room.Code)

	players, _ := s.store.ListPlayers(s.room.Code)
	var playerOrder []int64
	for _, p := range players {
		if !p.IsHost {
			playerOrder = append(playerOrder, p.UserID)
		}
	}
	// 洗牌
	for i := len(playerOrder) - 1; i > 0; i-- {
		j := randIntn(i + 1)
		playerOrder[i], playerOrder[j] = playerOrder[j], playerOrder[i]
	}
	s.state.PlayerOrder = playerOrder
	s.state.CurrentPlayerIndex = 0

	log := CcpGameLog{
		ID:        time.Now().UnixMilli(),
		Type:      "system",
		UserID:    0,
		Username:  "系统",
		Message:   "第 " + itoa(s.state.CurrentRound) + " 轮开始！",
		Timestamp: time.Now().UnixMilli(),
	}
	s.state.Logs = append(s.state.Logs, log)
}

// nextTurn 切换到下一个玩家并重置其猜测次数
func (s *CcpGameSession) nextTurn() {
	if len(s.state.PlayerOrder) == 0 {
		return
	}
	s.state.CurrentPlayerIndex = (s.state.CurrentPlayerIndex + 1) % len(s.state.PlayerOrder)
	nextUserID := s.state.PlayerOrder[s.state.CurrentPlayerIndex]
	s.store.ResetPlayerGuessCount(s.room.Code, nextUserID)
}

// saveAndBroadcast 保存状态并广播
func (s *CcpGameSession) saveAndBroadcast() {
	s.store.UpdateGameState(s.state)
	players, _ := s.store.ListPlayers(s.room.Code)
	s.hub.BroadcastJSON(map[string]interface{}{
		"type":        "action_result",
		"game_state":  s.state,
		"room":        s.room,
		"images":      s.images,
		"players":     players,
	})
}

// AutoJudge 自动判定逻辑（自动模式下使用）
// 返回 true 表示猜对
func AutoJudge(guess string, answerKeywords string) bool {
	if answerKeywords == "" {
		return false
	}
	guess = strings.ToLower(strings.TrimSpace(guess))
	keywords := strings.Split(answerKeywords, ",")
	for _, kw := range keywords {
		kw = strings.ToLower(strings.TrimSpace(kw))
		if kw != "" && (strings.Contains(guess, kw) || strings.Contains(kw, guess)) {
			return true
		}
	}
	return false
}

func itoa(n int) string {
	return strconv.Itoa(n)
}

func randIntn(n int) int {
	return rand.Intn(n)
}
