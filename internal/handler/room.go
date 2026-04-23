package handler

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"karuta/internal/middleware"
	"karuta/internal/store"
	"karuta/internal/ws"

	"github.com/go-chi/chi/v5"
)

const roomCodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
const roomCodeLength = 6

type RoomHandler struct {
	store      *store.Store
	hubManager *ws.HubManager
}

func NewRoomHandler(s *store.Store, hm *ws.HubManager) *RoomHandler {
	return &RoomHandler{store: s, hubManager: hm}
}

// POST /api/rooms/{id}/force-end — 管理员强制结束对局（仅 aryuu）
// POST /api/rooms/{id}/spectate — 切换旁观/玩家身份（仅 waiting 状态）
func (h *RoomHandler) SetSpectate(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	roomID, err := parseRoomID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid room id")
		return
	}
	var req struct {
		Spectate bool `json:"spectate"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid body")
		return
	}
	role := "player"
	if req.Spectate {
		role = "spectator"
	}
	if err := h.store.Rooms.SetPlayerRole(roomID, userID, role); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update role")
		return
	}
	// 同步更新 WS client 的 role，确保 checkAllBanned 能正确判断
	if hub := h.hubManager.Get(roomID); hub != nil {
		hub.UpdateClientRole(userID, role)
	}
	writeJSON(w, http.StatusOK, map[string]string{"role": role})
}

// POST /api/rooms/{id}/next-card — 房主跳过当前牌，直接下一首
func (h *RoomHandler) NextCard(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	roomID, err := parseRoomID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid room id")
		return
	}
	room, err := h.store.Rooms.GetByID(roomID)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "room not found")
		return
	}
	if room.HostID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "only host can skip")
		return
	}
	hub := h.hubManager.Get(roomID)
	if hub != nil {
		hub.SkipCard()
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RoomHandler) ForceEndRoom(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	user, err := h.store.Users.GetByID(userID)
	if err != nil || user.Username != "aryuu" {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	roomID, err := parseRoomID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid room id")
		return
	}
	hub := h.hubManager.Get(roomID)
	if hub != nil {
		hub.BroadcastJSON(map[string]interface{}{"type": "room_closed"})
		hub.Stop()
	}
	_ = h.store.Rooms.UpdateStatus(roomID, "end")
	writeJSON(w, http.StatusOK, map[string]string{"status": "ended"})
}

// GET /api/rooms
func (h *RoomHandler) ListRooms(w http.ResponseWriter, r *http.Request) {
	list, err := h.store.Rooms.ListActive()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list rooms")
		return
	}
	if list == nil {
		list = []*store.RoomListItem{}
	}
	writeJSON(w, http.StatusOK, list)
}

// POST /api/rooms
func (h *RoomHandler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	var req struct {
		DeckID      int64  `json:"deck_id"`
		IntervalSec int    `json:"interval_sec"`
		Mode        string `json:"mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.DeckID == 0 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "deck_id is required")
		return
	}
	if req.IntervalSec <= 0 {
		req.IntervalSec = 5
	}
	if req.Mode != "judge" {
		req.Mode = "auto"
	}

	deck, err := h.store.Decks.GetByID(req.DeckID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "deck not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get deck")
		return
	}
	if deck.OwnerID != userID && !deck.IsPublic {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied to this deck")
		return
	}

	// Generate unique 6-char code
	code, err := h.generateUniqueCode()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to generate room code")
		return
	}

	room, err := h.store.Rooms.CreateRoom(code, req.DeckID, userID, req.IntervalSec, req.Mode)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create room")
		return
	}

	// Auto-join the host as a player
	if err := h.store.Rooms.AddPlayer(room.ID, userID, "player"); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to add host as player")
		return
	}

	writeJSON(w, http.StatusCreated, room)
}

// POST /api/rooms/join
func (h *RoomHandler) JoinRoom(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.Code == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "code is required")
		return
	}

	room, err := h.store.Rooms.GetByCode(req.Code)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "room not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get room")
		return
	}

	if room.Status == "end" {
		writeError(w, http.StatusConflict, "ROOM_ENDED", "room has already ended")
		return
	}

	// 已结束的不让进；其他状态（waiting/reading/paused）都允许
	// 游戏进行中加入的新玩家默认为旁观者
	role := "player"
	if room.Status != "waiting" {
		role = "spectator"
	}

	if err := h.store.Rooms.AddPlayer(room.ID, userID, role); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to join room")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"room": room,
		"role": role,
	})
}

// GET /api/rooms/{id}
func (h *RoomHandler) GetRoom(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	roomID, err := parseRoomID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid room id")
		return
	}

	room, err := h.store.Rooms.GetByID(roomID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "room not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get room")
		return
	}

	inRoom, err := h.store.Rooms.IsPlayerInRoom(roomID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to check membership")
		return
	}
	if !inRoom {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "you are not in this room")
		return
	}

	players, err := h.store.Rooms.ListPlayers(roomID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list players")
		return
	}

	// Mark online status from hub
	hub := h.hubManager.Get(roomID)
	if hub != nil {
		onlineIDs := hub.OnlineUserIDs()
		onlineSet := make(map[int64]bool, len(onlineIDs))
		for _, id := range onlineIDs {
			onlineSet[id] = true
		}
		for _, p := range players {
			p.Online = onlineSet[p.UserID]
		}
	}

	// 游戏进行中返回牌组（供刷新页面的玩家初始化棋盘）
	var cardList interface{}
	if room.Status == "reading" || room.Status == "paused" {
		cards, err := h.store.Cards.ListByDeck(room.DeckID)
		if err == nil {
			list := make([]map[string]interface{}, 0, len(cards))
			for _, c := range cards {
				audioURL := ""
				if c.AudioPath != "" {
					audioURL = "/uploads/audio/" + filepath.Base(c.AudioPath)
				}
				coverURL := ""
				if c.CoverPath != "" {
					coverURL = "/uploads/covers/" + filepath.Base(c.CoverPath)
				}
				list = append(list, map[string]interface{}{
					"id":           c.ID,
					"display_text": c.DisplayText,
					"hint_text":    c.HintText,
					"audio_url":    audioURL,
					"cover_url":    coverURL,
				})
			}
			cardList = list
		}
	}

	// 已被抢走的牌（含无人抢的），供刷新后恢复棋盘状态
	var grabbedList interface{}
	if room.Status == "reading" || room.Status == "paused" {
		grabbed, err := h.store.GameRecords.ListGrabbed(roomID)
		if err == nil && len(grabbed) > 0 {
			gl := make([]map[string]interface{}, 0, len(grabbed))
			for _, g := range grabbed {
				gl = append(gl, map[string]interface{}{
					"card_id":     g.CardID,
					"winner_id":   g.WinnerID,
					"winner_name": g.Username,
				})
			}
			grabbedList = gl
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"room":          room,
		"players":       players,
		"cards":         cardList,
		"grabbed_cards": grabbedList,
	})
}

// POST /api/rooms/{id}/start
func (h *RoomHandler) StartRoom(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	roomID, err := parseRoomID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid room id")
		return
	}

	room, err := h.store.Rooms.GetByID(roomID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "room not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get room")
		return
	}

	if room.HostID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "only the host can start the game")
		return
	}
	if room.Status != "waiting" {
		writeError(w, http.StatusConflict, "INVALID_STATUS", "room is not in waiting status")
		return
	}

	cards, err := h.store.Cards.ListByDeck(room.DeckID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load cards")
		return
	}
	if len(cards) == 0 {
		writeError(w, http.StatusConflict, "NO_CARDS", "deck has no cards")
		return
	}

	if err := h.store.Rooms.UpdateStatus(roomID, "reading"); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update room status")
		return
	}
	room.Status = "reading"

	hub := h.hubManager.GetOrCreate(roomID)
	hub.StartGame(room, cards, h.store)

	writeJSON(w, http.StatusOK, map[string]string{"status": "reading"})
}

// POST /api/rooms/{id}/pause
func (h *RoomHandler) PauseRoom(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	roomID, err := parseRoomID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid room id")
		return
	}

	room, err := h.store.Rooms.GetByID(roomID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "room not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get room")
		return
	}

	if room.HostID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "only the host can pause the game")
		return
	}
	// 允许 reading 或 paused 状态都调（幂等），不严格检查
	if room.Status == "end" || room.Status == "waiting" {
		writeError(w, http.StatusConflict, "INVALID_STATUS", "game is not active")
		return
	}

	hub := h.hubManager.Get(roomID)
	if hub != nil {
		hub.PauseGame()
	}

	_ = h.store.Rooms.UpdateStatus(roomID, "paused")
	writeJSON(w, http.StatusOK, map[string]string{"status": "paused"})
}

// POST /api/rooms/{id}/resume
func (h *RoomHandler) ResumeRoom(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	roomID, err := parseRoomID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid room id")
		return
	}

	room, err := h.store.Rooms.GetByID(roomID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "room not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get room")
		return
	}

	if room.HostID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "only the host can resume the game")
		return
	}
	// 允许任何进行中的状态继续（幂等）
	if room.Status == "end" || room.Status == "waiting" {
		writeError(w, http.StatusConflict, "INVALID_STATUS", "game is not active")
		return
	}

	hub := h.hubManager.Get(roomID)
	if hub != nil {
		hub.ResumeGame()
	}

	if err := h.store.Rooms.UpdateStatus(roomID, "reading"); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update room status")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "reading"})
}

// DELETE /api/rooms/{id}  — 房主关闭房间
func (h *RoomHandler) CloseRoom(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	roomID, err := parseRoomID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid room id")
		return
	}
	room, err := h.store.Rooms.GetByID(roomID)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "room not found")
		return
	}
	if room.HostID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "only host can close the room")
		return
	}
	// 广播房间关闭事件
	hub := h.hubManager.Get(roomID)
	if hub != nil {
		hub.BroadcastJSON(map[string]interface{}{"type": "room_closed"})
		hub.Stop()
	}
	_ = h.store.Rooms.UpdateStatus(roomID, "end")
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/rooms/{id}/play-card — 裁判模式：裁判选择一张牌播放
func (h *RoomHandler) PlayCard(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	roomID, err := parseRoomID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid room id")
		return
	}

	room, err := h.store.Rooms.GetByID(roomID)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "room not found")
		return
	}

	if room.HostID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "only the host/judge can play a card")
		return
	}
	if room.Mode != "judge" {
		writeError(w, http.StatusConflict, "INVALID_MODE", "room is not in judge mode")
		return
	}
	if room.Status != "reading" && room.Status != "waiting" {
		writeError(w, http.StatusConflict, "INVALID_STATUS", "room is not active")
		return
	}

	var req struct {
		CardID int64 `json:"card_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CardID == 0 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "card_id is required")
		return
	}

	// If room was still in waiting, transition to reading and initialise session first
	if room.Status == "waiting" {
		cards, err := h.store.Cards.ListByDeck(room.DeckID)
		if err != nil || len(cards) == 0 {
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", "deck has no cards")
			return
		}
		if err := h.store.Rooms.UpdateStatus(roomID, "reading"); err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update room status")
			return
		}
		hub := h.hubManager.GetOrCreate(roomID)
		hub.StartGame(room, cards, h.store)
		time.Sleep(100 * time.Millisecond) // 等 session 初始化
		hub.JudgePlayCard(req.CardID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}

	hub := h.hubManager.Get(roomID)
	if hub == nil {
		writeError(w, http.StatusConflict, "NOT_STARTED", "game has not been started")
		return
	}
	hub.JudgePlayCard(req.CardID)

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *RoomHandler) generateUniqueCode() (string, error) {
	for attempts := 0; attempts < 10; attempts++ {
		code, err := randomCode(roomCodeLength)
		if err != nil {
			return "", err
		}
		_, err = h.store.Rooms.GetByCode(code)
		if err != nil {
			// ErrNoRows means code is available
			if errors.Is(err, sql.ErrNoRows) {
				return code, nil
			}
			return "", err
		}
		// Code exists, try again
	}
	return "", errors.New("failed to generate unique room code after 10 attempts")
}

func randomCode(length int) (string, error) {
	b := make([]byte, length)
	alphabetLen := big.NewInt(int64(len(roomCodeAlphabet)))
	for i := range b {
		n, err := rand.Int(rand.Reader, alphabetLen)
		if err != nil {
			return "", err
		}
		b[i] = roomCodeAlphabet[n.Int64()]
	}
	return string(b), nil
}

func parseRoomID(r *http.Request) (int64, error) {
	idStr := chi.URLParam(r, "id")
	return strconv.ParseInt(idStr, 10, 64)
}
