package handler

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"strconv"
	"time"

	"karuta/internal/mask"
	"karuta/internal/middleware"
	"karuta/internal/storage"
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

// POST /api/rooms/{id}/kick — 房主踢人
func (h *RoomHandler) KickPlayer(w http.ResponseWriter, r *http.Request) {
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
		writeError(w, http.StatusForbidden, "FORBIDDEN", "only host can kick")
		return
	}
	var req struct {
		UserID int64 `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == 0 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "user_id is required")
		return
	}
	if req.UserID == userID {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "cannot kick yourself")
		return
	}
	_ = h.store.Rooms.RemovePlayer(roomID, req.UserID)
	// 断开该用户的 WebSocket 连接并通知
	if hub := h.hubManager.Get(roomID); hub != nil {
		hub.SendJSONToUser(req.UserID, map[string]interface{}{
			"type":    "kicked",
			"message": "你被房主移出了房间",
		})
		hub.DisconnectUser(req.UserID)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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

// POST /api/rooms/{id}/claim-seat — 对阵模式抢占席位
func (h *RoomHandler) ClaimSeat(w http.ResponseWriter, r *http.Request) {
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
	if room.Mode != "duel" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "seat claiming is only for duel mode")
		return
	}
	if room.Status != "waiting" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "room is not in waiting state")
		return
	}
	var req struct {
		Seat int `json:"seat"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || (req.Seat != 1 && req.Seat != 2) {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "seat must be 1 or 2")
		return
	}
	targetRole := "duel_p1"
	if req.Seat == 2 {
		targetRole = "duel_p2"
	}
	ok2, err := h.store.Rooms.ClaimSeat(roomID, userID, targetRole)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to claim seat")
		return
	}
	if !ok2 {
		writeError(w, http.StatusConflict, "SEAT_TAKEN", "seat is already occupied or you already have a seat")
		return
	}
	if hub := h.hubManager.Get(roomID); hub != nil {
		hub.UpdateClientRole(userID, targetRole)
		hub.BroadcastJSON(h.buildSeatUpdate(roomID))
	}
	writeJSON(w, http.StatusOK, map[string]string{"role": targetRole})
}

// POST /api/rooms/{id}/leave-seat — 主动离开席位
func (h *RoomHandler) LeaveSeat(w http.ResponseWriter, r *http.Request) {
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
	players, _ := h.store.Rooms.ListPlayers(roomID)
	var currentRole string
	for _, p := range players {
		if p.UserID == userID {
			currentRole = p.Role
			break
		}
	}
	if currentRole != "duel_p1" && currentRole != "duel_p2" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "you are not in a seat")
		return
	}
	if err := h.store.Rooms.SetPlayerRole(roomID, userID, "player"); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to leave seat")
		return
	}
	if hub := h.hubManager.Get(roomID); hub != nil {
		hub.UpdateClientRole(userID, "player")
		hub.BroadcastJSON(h.buildSeatUpdate(roomID))
	}
	writeJSON(w, http.StatusOK, map[string]string{"role": "player"})
}

// POST /api/rooms/{id}/kick-seat — 房主踢人下座
func (h *RoomHandler) KickFromSeat(w http.ResponseWriter, r *http.Request) {
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
		writeError(w, http.StatusForbidden, "FORBIDDEN", "only host can kick from seat")
		return
	}
	var req struct {
		UserID int64 `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == 0 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "user_id is required")
		return
	}
	players, _ := h.store.Rooms.ListPlayers(roomID)
	var targetRole string
	for _, p := range players {
		if p.UserID == req.UserID {
			targetRole = p.Role
			break
		}
	}
	if targetRole != "duel_p1" && targetRole != "duel_p2" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "target is not in a seat")
		return
	}
	if err := h.store.Rooms.SetPlayerRole(roomID, req.UserID, "player"); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to kick from seat")
		return
	}
	if hub := h.hubManager.Get(roomID); hub != nil {
		hub.UpdateClientRole(req.UserID, "player")
		hub.SendJSONToUser(req.UserID, map[string]interface{}{"type": "seat_kicked"})
		hub.BroadcastJSON(h.buildSeatUpdate(roomID))
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *RoomHandler) buildSeatUpdate(roomID int64) map[string]interface{} {
	players, _ := h.store.Rooms.ListPlayers(roomID)
	var seat1, seat2 interface{}
	for _, p := range players {
		info := map[string]interface{}{"user_id": p.UserID, "username": p.Username}
		if p.Role == "duel_p1" {
			seat1 = info
		} else if p.Role == "duel_p2" {
			seat2 = info
		}
	}
	return map[string]interface{}{"type": "seat_update", "seat1": seat1, "seat2": seat2}
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
	if err != nil || !user.IsAdmin {
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
		DeckID           int64  `json:"deck_id"`
		IntervalSec      int    `json:"interval_sec"`
		Mode             string `json:"mode"`
		MaskEnabled      bool   `json:"mask_enabled"`
		MaskDifficulty   string `json:"mask_difficulty"`
		PenaltyWrong     *bool  `json:"penalty_wrong"`
		PenaltySlow      *bool  `json:"penalty_slow"`
		PenaltyLast      int    `json:"penalty_last"`
		Training         bool   `json:"training"`
		MinPlayTime      int    `json:"min_play_time"`
		MultiAudioMode   string `json:"multi_audio_mode"`
		ShuffleRemaining int    `json:"shuffle_remaining"`
		RandomStart      bool   `json:"random_start"`
		RandomStartMax   int    `json:"random_start_max"`
		// Duel mode config
		DuelTotalCards  int  `json:"duel_total_cards"`
		DuelFlip        bool `json:"duel_flip"`
		DuelRequeue     bool `json:"duel_requeue"`
		DuelMaxRounds   int  `json:"duel_max_rounds"`
		DuelRoundTime   int  `json:"duel_round_time"`
		DuelGrabChances int  `json:"duel_grab_chances"`
		DuelArrangeTime int  `json:"duel_arrange_time"`
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
	if req.Mode != "judge" && req.Mode != "duel" {
		req.Mode = "auto"
	}
	if req.MaskDifficulty == "" {
		req.MaskDifficulty = "normal"
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

	penaltyWrong := true
	if req.PenaltyWrong != nil {
		penaltyWrong = *req.PenaltyWrong
	}
	penaltySlow := true
	if req.PenaltySlow != nil {
		penaltySlow = *req.PenaltySlow
	}
	randomStartMax := req.RandomStartMax
	if randomStartMax <= 0 || randomStartMax > 80 {
		randomStartMax = 50
	}
	room, err := h.store.Rooms.CreateRoom(code, req.DeckID, userID, req.IntervalSec, req.Mode, req.MaskEnabled, req.MaskDifficulty, penaltyWrong, penaltySlow, req.ShuffleRemaining, req.RandomStart, randomStartMax)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create room")
		return
	}

	// Save penalty_last and training
	if req.PenaltyLast > 0 {
		_ = h.store.Rooms.UpdatePenaltyLast(room.ID, req.PenaltyLast)
	}
	if req.Training {
		_ = h.store.Rooms.UpdateTraining(room.ID, true)
	}
	if req.MinPlayTime > 0 {
		mpt := req.MinPlayTime
		if mpt < 10 {
			mpt = 10
		}
		if mpt > 60 {
			mpt = 60
		}
		_ = h.store.Rooms.UpdateMinPlayTime(room.ID, mpt)
	}
	if req.MultiAudioMode == "once" {
		_ = h.store.Rooms.UpdateMultiAudioMode(room.ID, "once")
	}

	// Duel 模式强制 once：抢一次即消失
	if req.Mode == "duel" {
		_ = h.store.Rooms.UpdateMultiAudioMode(room.ID, "once")
	}

	// Set duel config if duel mode
	if req.Mode == "duel" {
		totalCards := req.DuelTotalCards
		if totalCards <= 0 {
			totalCards = 50
		}
		roundTime := req.DuelRoundTime
		if roundTime < 30 {
			roundTime = 30
		}
		if roundTime > 120 {
			roundTime = 120
		}
		grabChances := req.DuelGrabChances
		if grabChances <= 0 {
			grabChances = 1
		}
		arrangeTime := req.DuelArrangeTime
		if arrangeTime <= 0 {
			arrangeTime = 60
		}
		if arrangeTime > 300 {
			arrangeTime = 300
		}
		_ = h.store.Rooms.UpdateDuelConfig(room.ID, totalCards, req.DuelFlip, req.DuelRequeue, req.DuelMaxRounds, roundTime, grabChances, arrangeTime)
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
	// 等待中=玩家身份进入，游戏进行中=旁观身份进入
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

	// 返回牌组（供刷新页面恢复棋盘、等待大厅预加载等）
	var cardList interface{}
	{
		// 优先从 deck_cards (M:N) 查询，为空则 fallback 到 legacy cards.deck_id
		cards, err := h.store.DeckCards.ListCardsByDeck(room.DeckID)
		if err != nil || len(cards) == 0 {
			cards, err = h.store.Cards.ListByDeck(room.DeckID)
		}
		if err == nil {
			// 如果开启了遮罩，生成 masks
			var masks map[int64]*mask.CardMask
			if room.MaskEnabled && room.MaskSeed != 0 {
				cardIDs := make([]int64, len(cards))
				for i, c := range cards {
					cardIDs[i] = c.ID
				}
				masks = mask.GenerateMasks(room.MaskSeed, cardIDs, room.MaskDifficulty)
			}

			list := make([]map[string]interface{}, 0, len(cards))
			for _, c := range cards {
				coverURL := storage.FileURL(c.CoverPath, "covers")
				// 获取音频列表
				audios := h.store.CardAudios.GetAudiosForCard(c)
				audioCount := len(audios)
				// audio_url 取第一条音频（供预览/兼容）
				audioURL := ""
				if len(audios) > 0 {
					audioURL = storage.FileURL(audios[0].AudioPath, "audio")
				}
				item := map[string]interface{}{
					"id":           c.ID,
					"display_text": c.DisplayText,
					"hint_text":    c.HintText,
					"audio_url":    audioURL,
					"cover_url":    coverURL,
					"audio_count":  audioCount,
				}
				if masks != nil {
					if m, ok := masks[c.ID]; ok {
						item["mask"] = m
					}
				}
				list = append(list, item)
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

	// 优先从 deck_cards 加载，fallback 到 legacy
	cards, err := h.store.DeckCards.ListCardsByDeck(room.DeckID)
	if err != nil || len(cards) == 0 {
		cards, err = h.store.Cards.ListByDeck(room.DeckID)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load cards")
		return
	}
	if len(cards) == 0 {
		writeError(w, http.StatusConflict, "NO_CARDS", "deck has no cards")
		return
	}

	// 如果开启了模糊牌面，生成随机种子
	if room.MaskEnabled || room.RandomStart {
		room.MaskSeed = time.Now().UnixNano()
		if err := h.store.Rooms.UpdateMaskSeed(roomID, room.MaskSeed); err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to save mask seed")
			return
		}
	}

	if err := h.store.Rooms.UpdateStatus(roomID, "reading"); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update room status")
		return
	}
	room.Status = "reading"

	hub := h.hubManager.GetOrCreate(roomID)

	if room.Mode == "duel" {
		// Duel mode: require both seats (duel_p1 / duel_p2) to be filled
		players, _ := h.store.Rooms.ListPlayers(roomID)
		var player1ID, player2ID int64
		for _, p := range players {
			if p.Role == "duel_p1" {
				player1ID = p.UserID
			} else if p.Role == "duel_p2" {
				player2ID = p.UserID
			}
		}
		if player1ID == 0 || player2ID == 0 {
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", "both seats must be filled before starting")
			return
		}
		hub.StartDuelGame(room, cards, h.store, player1ID, player2ID)
	} else {
		hub.StartGame(room, cards, h.store)
	}

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
		CardID      int64 `json:"card_id"`
		CardAudioID int64 `json:"card_audio_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CardID == 0 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "card_id is required")
		return
	}

	// If room was still in waiting, transition to reading and initialise session first
	if room.Status == "waiting" {
		cards, err := h.store.DeckCards.ListCardsByDeck(room.DeckID)
		if err != nil || len(cards) == 0 {
			cards, _ = h.store.Cards.ListByDeck(room.DeckID)
		}
		if len(cards) == 0 {
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", "deck has no cards")
			return
		}
		// 如果开启了模糊牌面或随机片段，生成随机种子
		if room.MaskEnabled || room.RandomStart {
			room.MaskSeed = time.Now().UnixNano()
			if err := h.store.Rooms.UpdateMaskSeed(roomID, room.MaskSeed); err != nil {
				writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to save mask seed")
				return
			}
		}
		if err := h.store.Rooms.UpdateStatus(roomID, "reading"); err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update room status")
			return
		}
		hub := h.hubManager.GetOrCreate(roomID)
		hub.StartGame(room, cards, h.store)
		time.Sleep(100 * time.Millisecond) // 等 session 初始化
		hub.JudgePlayCard(req.CardID, req.CardAudioID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}

	hub := h.hubManager.Get(roomID)
	if hub == nil {
		writeError(w, http.StatusConflict, "NOT_STARTED", "game has not been started")
		return
	}
	hub.JudgePlayCard(req.CardID, req.CardAudioID)

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
