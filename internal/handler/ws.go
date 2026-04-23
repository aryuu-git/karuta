package handler

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"karuta/internal/store"
	"karuta/internal/ws"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

type WSHandler struct {
	store      *store.Store
	hubManager *ws.HubManager
	jwtSecret  string
}

func NewWSHandler(s *store.Store, hm *ws.HubManager, jwtSecret string) *WSHandler {
	return &WSHandler{store: s, hubManager: hm, jwtSecret: jwtSecret}
}

// GET /ws/rooms/{id}?token=<jwt>
func (h *WSHandler) ServeWS(w http.ResponseWriter, r *http.Request) {
	roomIDStr := chi.URLParam(r, "id")
	roomID, err := strconv.ParseInt(roomIDStr, 10, 64)
	if err != nil {
		http.Error(w, `{"error":"BAD_REQUEST","message":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	// Authenticate via query token
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		http.Error(w, `{"error":"UNAUTHORIZED","message":"missing token"}`, http.StatusUnauthorized)
		return
	}

	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(h.jwtSecret), nil
	})
	if err != nil || !token.Valid {
		http.Error(w, `{"error":"UNAUTHORIZED","message":"invalid token"}`, http.StatusUnauthorized)
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		http.Error(w, `{"error":"UNAUTHORIZED","message":"invalid claims"}`, http.StatusUnauthorized)
		return
	}

	var userID int64
	switch v := claims["sub"].(type) {
	case float64:
		userID = int64(v)
	case int64:
		userID = v
	default:
		http.Error(w, `{"error":"UNAUTHORIZED","message":"invalid sub"}`, http.StatusUnauthorized)
		return
	}

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
	if room.Status == "end" {
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

	hub := h.hubManager.GetOrCreate(roomID)
	ws.UpgradeHandler(hub, w, r, userID, user.Username, role)
}
