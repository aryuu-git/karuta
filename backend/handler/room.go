package handler

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"strconv"
	"time"

	"karuta/backend/achievement"
	"karuta/backend/mask"
	"karuta/backend/middleware"
	"karuta/backend/storage"
	"karuta/backend/store"
	"karuta/backend/ws"

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

// GET /api/me/games — 最近对局（历史对局分页；与统计同口径）
func (h *RoomHandler) MyGames(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	page := 1
	if p, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && p > 0 {
		page = p
	}
	size := 20
	if s, err := strconv.Atoi(r.URL.Query().Get("size")); err == nil && s > 0 && s <= 50 {
		size = s
	}
	games, err := h.store.Rooms.UserGames(userID, size, (page-1)*size)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list games")
		return
	}
	if games == nil {
		games = []store.UserGame{}
	}
	writeJSON(w, http.StatusOK, games)
}

// GET /api/rankings — 全站排行（kind=score|wins|world_first，默认 score）
func (h *RoomHandler) Rankings(w http.ResponseWriter, r *http.Request) {
	limit := 10
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 50 {
		limit = l
	}
	list, err := h.store.Rooms.Rankings(r.URL.Query().Get("kind"), limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load rankings")
		return
	}
	if list == nil {
		list = []store.RankingEntry{}
	}
	writeJSON(w, http.StatusOK, list)
}

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
	// Owner 裁定（2026-09-21）：对局中允许旁观↔玩家切换——中途下场是合法玩法
	// （曾经加过的 waiting-only 限制已撤；切换后下一首起生效）
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
	if err != nil || !user.IsAdmin || user.Disabled {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	roomID, err := parseRoomID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid room id")
		return
	}
	// 先落库再断连：状态写失败时保持房间可服务，避免「连接已断、状态未终」。
	if err := h.store.Rooms.UpdateStatus(roomID, "end"); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to end room")
		return
	}
	hub := h.hubManager.Get(roomID)
	if hub != nil {
		hub.BroadcastJSON(map[string]interface{}{"type": "room_closed"})
		hub.Stop()
	}
	// 管理员强停属高权限操作，必须可追溯（修复 #6）。审计失败不回滚强停，
	// 仅记日志：紧急操作可用性优先。
	details, _ := json.Marshal(map[string]int64{"room_id": roomID})
	if err := h.store.System.Audit(userID, "room.force_end", "room", strconv.FormatInt(roomID, 10), string(details), clientIP(r)); err != nil {
		slog.Error("audit room.force_end failed", "room_id", roomID, "err", err)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ended"})
}

// GET /api/rooms
func (h *RoomHandler) ListRooms(w http.ResponseWriter, r *http.Request) {
	// 私密房可见性：普通用户过滤，管理员带出（is_private 标记随行）
	viewerAdmin := false
	if userID, ok := middleware.GetUserID(r.Context()); ok {
		if u, err := h.store.Users.GetByID(userID); err == nil && u.IsAdmin && !u.Disabled {
			viewerAdmin = true
		}
	}
	list, err := h.store.Rooms.ListActive(viewerAdmin)
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
		// v7：私密房（列表隐藏）与人数上限（2-32，默认 16）
		IsPrivate   bool `json:"is_private"`
		MaxPlayers  int  `json:"max_players"`
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
	room, err := h.store.Rooms.CreateRoom(code, req.DeckID, userID, req.IntervalSec, req.Mode, req.MaskEnabled, req.MaskDifficulty, penaltyWrong, penaltySlow, req.ShuffleRemaining, req.RandomStart, randomStartMax, req.IsPrivate, req.MaxPlayers)
	if err != nil && isUniqueConstraintError(err) {
		// 撞码兜底（2026-09-21 修复）：generateUniqueCode 查重与 INSERT 非原子，
		// 并发窗口内撞码此前直接 500。换码重试一次，仍撞才失败。
		if code, genErr := h.generateUniqueCode(); genErr == nil {
			room, err = h.store.Rooms.CreateRoom(code, req.DeckID, userID, req.IntervalSec, req.Mode, req.MaskEnabled, req.MaskDifficulty, penaltyWrong, penaltySlow, req.ShuffleRemaining, req.RandomStart, randomStartMax, req.IsPrivate, req.MaxPlayers)
		}
	}
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
		// 建房补偿（2026-09-21 修复）：房主入座失败时清掉刚建的房间，
		// 避免「房间已建但房主不在」的孤儿房。此时无其他玩家，删除无外键阻塞。
		_ = h.store.Rooms.Delete(room.ID)
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to add host as player")
		return
	}

	// 成就（best-effort）：常主
	achievement.NewEvaluator(h.store).OnContentEvent(userID, "room")

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

	if room.Status == "end" || room.Status == "aborted" {
		writeError(w, http.StatusConflict, "ROOM_ENDED", "room has already ended")
		return
	}

	// 已结束的不让进；其他状态（waiting/reading/paused）都允许
	// 等待中=玩家身份进入，游戏进行中=旁观身份进入
	role := "player"
	if room.Status != "waiting" {
		role = "spectator"
	}

	// 人数上限（v7，回顾修复为原子入座）：满员拒绝新玩家；在房成员重连/刷新
	// 幂等成功，旁观不占名额
	if role == "player" {
		joined, err := h.store.Rooms.AddPlayerWithCap(room.ID, userID, role, room.MaxPlayers)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to join room")
			return
		}
		if !joined {
			writeError(w, http.StatusConflict, "ROOM_FULL", "room is full")
			return
		}
	} else if err := h.store.Rooms.AddPlayer(room.ID, userID, role); err != nil {
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

	// 对局进行中：牌面剩余次数与已抢结果以内存权威投影为准。
	// DB 只存 game_records 落牌流水，不含"剩余次数"，从 audio_count 反推
	// 会让已抢的牌在刷新后"复活"（严重 bug：重连后棋盘全亮）。
	var liveRemaining map[int64]int
	var liveGrabbed []map[string]interface{}
	if hub != nil {
		liveRemaining, liveGrabbed = hub.LiveBoard()
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
				// 权威投影存在时带上 remaining（前端 buildRemaining 优先消费此字段）
				if liveRemaining != nil {
					item["remaining"] = liveRemaining[c.ID]
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
	if liveGrabbed != nil {
		// 对局进行中：内存权威投影（带 hint_text）
		grabbedList = liveGrabbed
	} else if room.Status == "reading" || room.Status == "paused" {
		// 内存投影不可用（服务重启等）：回退 DB 流水，仅能恢复 winner 信息
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

	var duelPlayer1ID, duelPlayer2ID int64
	if room.Mode == "duel" {
		players, err := h.store.Rooms.ListPlayers(roomID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load duel seats")
			return
		}
		for _, p := range players {
			if p.Role == "duel_p1" {
				duelPlayer1ID = p.UserID
			} else if p.Role == "duel_p2" {
				duelPlayer2ID = p.UserID
			}
		}
		if duelPlayer1ID == 0 || duelPlayer2ID == 0 {
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", "both seats must be filled before starting")
			return
		}
	}

	transitioned, err := h.store.Rooms.TransitionStatus(roomID, "waiting", "reading")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update room status")
		return
	}
	if !transitioned {
		writeError(w, http.StatusConflict, "INVALID_STATUS", "room was already started")
		return
	}
	room.Status = "reading"

	// Generate the seed only after this request has won the waiting→reading
	// compare-and-set, otherwise a losing concurrent start could overwrite the
	// seed used by the actual session.
	if room.MaskEnabled || room.RandomStart {
		room.MaskSeed = time.Now().UnixNano()
		if err := h.store.Rooms.UpdateMaskSeed(roomID, room.MaskSeed); err != nil {
			_, _ = h.store.Rooms.TransitionStatus(roomID, "reading", "waiting")
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to save mask seed")
			return
		}
	}

	hub := h.hubManager.GetOrCreate(roomID)

	if room.Mode == "duel" {
		hub.StartDuelGame(room, cards, h.store, duelPlayer1ID, duelPlayer2ID)
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
	if room.Status == "end" || room.Status == "aborted" || room.Status == "waiting" {
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
	if room.Status == "end" || room.Status == "aborted" || room.Status == "waiting" {
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

// POST /api/rooms/{id}/rematch — 结算页「原班再来一局」：复制配置开新房，
// 原班人马整体迁入。契约见 docs/ui-interaction-design.md §4.7。
// 仅房主可调；源房间必须已 end。不动 ws 包，新房开局仍走现有 start 流程。
func (h *RoomHandler) Rematch(w http.ResponseWriter, r *http.Request) {
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
		writeError(w, http.StatusForbidden, "FORBIDDEN", "only the host can rematch")
		return
	}
	if room.Status != "end" {
		writeError(w, http.StatusConflict, "ROOM_NOT_ENDED", "room has not ended yet")
		return
	}

	// reinvite 缺省 true：原班人马整体迁入新房；body 允许为空。
	var req struct {
		Reinvite *bool `json:"reinvite"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	reinvite := req.Reinvite == nil || *req.Reinvite

	// 复用建房流程的 code 生成逻辑，保证全局唯一
	code, err := h.generateUniqueCode()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to generate room code")
		return
	}
	// 单事务（2026-09-21 修复）：复制配置 + 玩家迁入/房主入座原子完成。
	newRoom, err := h.store.Rooms.RematchAndMigrate(roomID, code, reinvite)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create rematch room")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"room": newRoom})
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
