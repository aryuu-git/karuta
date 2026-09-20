package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"karuta/backend/middleware"
	"karuta/backend/security"
	"karuta/backend/storage"
	"karuta/backend/store"
	"karuta/backend/ws"

	"github.com/go-chi/chi/v5"
)

type WSHandler struct {
	store      *store.Store
	hubManager *ws.HubManager
	tickets    *security.WSTicketManager
}

func NewWSHandler(s *store.Store, hm *ws.HubManager, tickets *security.WSTicketManager) *WSHandler {
	return &WSHandler{store: s, hubManager: hm, tickets: tickets}
}

// POST /api/ws-ticket creates a path-bound, short-lived credential.
func (h *WSHandler) IssueTicket(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"UNAUTHORIZED","message":"not authenticated"}`, http.StatusUnauthorized)
		return
	}
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !validWebSocketPath(req.Path) {
		http.Error(w, `{"error":"BAD_REQUEST","message":"invalid websocket path"}`, http.StatusBadRequest)
		return
	}
	user, err := h.store.Users.GetByID(userID)
	if err != nil || user.Disabled {
		http.Error(w, `{"error":"UNAUTHORIZED","message":"user unavailable"}`, http.StatusUnauthorized)
		return
	}
	ticket, expiresAt, err := h.tickets.Issue(security.WSTicketIdentity{UserID: user.ID, Username: user.Username}, req.Path)
	if err != nil {
		http.Error(w, `{"error":"INTERNAL_ERROR","message":"failed to issue ticket"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"ticket": ticket, "expires_at": expiresAt.UnixMilli()})
}

func validWebSocketPath(path string) bool {
	if strings.ContainsAny(path, "?#") {
		return false
	}
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 3 && parts[0] == "ws" && parts[1] == "rooms" {
		_, err := strconv.ParseInt(parts[2], 10, 64)
		return err == nil
	}
	if len(parts) == 4 && parts[0] == "ws" && parts[1] == "ccp" && parts[2] == "rooms" {
		return parts[3] != ""
	}
	if len(parts) == 4 && parts[0] == "ws" && parts[1] == "quadrant" && parts[2] == "rooms" {
		_, err := strconv.ParseInt(parts[3], 10, 64)
		return err == nil
	}
	return false
}

// GET /ws/rooms/{id}?ticket=<single-use-ticket>
func (h *WSHandler) ServeWS(w http.ResponseWriter, r *http.Request) {
	roomIDStr := chi.URLParam(r, "id")
	roomID, err := strconv.ParseInt(roomIDStr, 10, 64)
	if err != nil {
		http.Error(w, `{"error":"BAD_REQUEST","message":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	identity, err := h.tickets.Consume(r.URL.Query().Get("ticket"), r.URL.Path)
	if err != nil {
		http.Error(w, `{"error":"UNAUTHORIZED","message":"invalid websocket ticket"}`, http.StatusUnauthorized)
		return
	}
	userID := identity.UserID

	// Verify room exists
	room, err := h.store.Rooms.GetByID(roomID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, `{"error":"NOT_FOUND","message":"room not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"INTERNAL_ERROR","message":"failed to get room"}`, http.StatusInternalServerError)
		return
	}
	if room.Status == "end" || room.Status == "aborted" {
		http.Error(w, `{"error":"ROOM_ENDED","message":"room has ended"}`, http.StatusGone)
		return
	}

	// Verify user is in the room (or auto-join as spectator)
	inRoom, err := h.store.Rooms.IsPlayerInRoom(roomID, userID)
	if err != nil {
		http.Error(w, `{"error":"INTERNAL_ERROR","message":"failed to check membership"}`, http.StatusInternalServerError)
		return
	}
	if !inRoom {
		http.Error(w, `{"error":"FORBIDDEN","message":"you are not in this room"}`, http.StatusForbidden)
		return
	}

	// Fetch username
	user, err := h.store.Users.GetByID(userID)
	if err != nil {
		http.Error(w, `{"error":"INTERNAL_ERROR","message":"failed to get user"}`, http.StatusInternalServerError)
		return
	}

	// 获取该玩家在此房间的 role
	role := h.store.Rooms.GetPlayerRole(roomID, userID)

	avatarURL := ""
	if user.AvatarPath != "" {
		avatarURL = storage.FileURL(user.AvatarPath, "avatars")
	}
	hub := h.hubManager.GetOrCreate(roomID)
	ws.UpgradeHandler(hub, w, r, userID, user.Username, avatarURL, role)
}
