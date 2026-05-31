package quadrant

import (
	"encoding/json"
	"net/http"
	"strconv"

	"karuta/internal/middleware"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

type Handler struct {
	store      *Store
	hubManager *HubManager
	jwtSecret  string
}

func NewHandler(store *Store, hubManager *HubManager, jwtSecret string) *Handler {
	return &Handler{store: store, hubManager: hubManager, jwtSecret: jwtSecret}
}

func getUserID(r *http.Request) int64 {
	id, _ := middleware.GetUserID(r.Context())
	return id
}

// --- Banks ---

func (h *Handler) CreateBank(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == 0 {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Visibility  string `json:"visibility"`
		Category    string `json:"category"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "name is required")
		return
	}
	if req.Visibility == "" {
		req.Visibility = "private"
	}
	if req.Category == "" {
		req.Category = "custom"
	}
	bank, err := h.store.CreateBank(req.Name, req.Description, userID, req.Visibility, req.Category)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, bank)
}

func (h *Handler) ListBanks(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	scope := r.URL.Query().Get("scope")
	var banks []QuestionBank
	var err error
	switch scope {
	case "public":
		banks, err = h.store.ListBanks(0, "public")
	case "mine":
		banks, err = h.store.ListBanks(userID, "")
	default:
		banks, err = h.store.ListBanks(userID, "")
		pub, _ := h.store.ListBanks(0, "public")
		banks = append(banks, pub...)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if banks == nil {
		banks = []QuestionBank{}
	}
	writeJSON(w, http.StatusOK, banks)
}

func (h *Handler) GetBank(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid id")
		return
	}
	bank, err := h.store.GetBank(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "bank not found")
		return
	}
	writeJSON(w, http.StatusOK, bank)
}

func (h *Handler) UpdateBank(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	bank, err := h.store.GetBank(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "bank not found")
		return
	}
	if bank.OwnerID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "not owner")
		return
	}
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Visibility  string `json:"visibility"`
		Category    string `json:"category"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Name == "" {
		req.Name = bank.Name
	}
	if req.Visibility == "" {
		req.Visibility = bank.Visibility
	}
	if req.Category == "" {
		req.Category = bank.Category
	}
	h.store.UpdateBank(id, req.Name, req.Description, req.Visibility, req.Category)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) DeleteBank(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	bank, err := h.store.GetBank(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "bank not found")
		return
	}
	if bank.OwnerID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "not owner")
		return
	}
	h.store.DeleteBank(id)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Items ---

func (h *Handler) checkBankOwner(w http.ResponseWriter, r *http.Request) (int64, bool) {
	userID := getUserID(r)
	bankID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	bank, err := h.store.GetBank(bankID)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "bank not found")
		return 0, false
	}
	if bank.OwnerID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "not owner")
		return 0, false
	}
	return bankID, true
}

func (h *Handler) CreateItem(w http.ResponseWriter, r *http.Request) {
	bankID, ok := h.checkBankOwner(w, r)
	if !ok {
		return
	}
	var req struct {
		Title    string `json:"title"`
		ImageURL string `json:"image_url"`
		Source   string `json:"source"`
		SourceID string `json:"source_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Title == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "title is required")
		return
	}
	if req.Source == "" {
		req.Source = "manual"
	}
	item, err := h.store.CreateItem(bankID, req.Title, req.ImageURL, req.Source, req.SourceID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (h *Handler) ListItems(w http.ResponseWriter, r *http.Request) {
	bankID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	items, err := h.store.ListItems(bankID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if items == nil {
		items = []Item{}
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	h.store.DeleteItem(id)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Labels ---

func (h *Handler) CreateLabel(w http.ResponseWriter, r *http.Request) {
	bankID, ok := h.checkBankOwner(w, r)
	if !ok {
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "name is required")
		return
	}
	label, err := h.store.CreateLabel(bankID, req.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, label)
}

func (h *Handler) ListLabels(w http.ResponseWriter, r *http.Request) {
	bankID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	labels, err := h.store.ListLabels(bankID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if labels == nil {
		labels = []Label{}
	}
	writeJSON(w, http.StatusOK, labels)
}

func (h *Handler) DeleteLabel(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	h.store.DeleteLabel(id)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Questions ---

func (h *Handler) CreateQuestion(w http.ResponseWriter, r *http.Request) {
	bankID, ok := h.checkBankOwner(w, r)
	if !ok {
		return
	}
	var req struct {
		AxisXLabelID int64   `json:"axis_x_label_id"`
		AxisYLabelID int64   `json:"axis_y_label_id"`
		ScoreSource  string  `json:"score_source"`
		CandidateIDs []int64 `json:"candidate_ids"`
		Placements   []struct {
			ItemID      int64   `json:"item_id"`
			X           float64 `json:"x"`
			Y           float64 `json:"y"`
			RevealOrder int     `json:"reveal_order"`
		} `json:"placements"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request")
		return
	}
	if req.AxisXLabelID == 0 || req.AxisYLabelID == 0 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "axis labels required")
		return
	}
	if req.ScoreSource == "" {
		req.ScoreSource = "manual"
	}

	q, err := h.store.CreateQuestion(bankID, req.AxisXLabelID, req.AxisYLabelID, req.ScoreSource, req.CandidateIDs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	if len(req.Placements) > 0 {
		placements := make([]Placement, len(req.Placements))
		for i, p := range req.Placements {
			placements[i] = Placement{ItemID: p.ItemID, X: p.X, Y: p.Y, RevealOrder: p.RevealOrder}
		}
		h.store.SetPlacements(q.ID, placements)
	}

	writeJSON(w, http.StatusCreated, q)
}

func (h *Handler) GetQuestion(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	qd, err := h.store.GetQuestionDetail(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "question not found")
		return
	}
	writeJSON(w, http.StatusOK, qd)
}

func (h *Handler) ListQuestions(w http.ResponseWriter, r *http.Request) {
	bankID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	qs, err := h.store.ListQuestions(bankID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if qs == nil {
		qs = []Question{}
	}
	writeJSON(w, http.StatusOK, qs)
}

func (h *Handler) DeleteQuestion(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	h.store.DeleteQuestion(id)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Rooms ---

func (h *Handler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == 0 {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	var req struct {
		Name           string `json:"name"`
		BankID         int64  `json:"bank_id"`
		Visibility     string `json:"visibility"`
		MaxPlayers     int    `json:"max_players"`
		RoundsTotal    int    `json:"rounds_total"`
		CandidateCount int    `json:"candidate_count"`
		RevealInterval int    `json:"reveal_interval"`
		GuessWindow    int    `json:"guess_window"`
		BaseScore      int    `json:"base_score"`
		DecayPerReveal int    `json:"decay_per_reveal"`
		WrongPenalty   int    `json:"wrong_penalty"`
		CooldownRounds int    `json:"cooldown_rounds"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	room := &Room{
		Name:           req.Name,
		HostID:         userID,
		BankID:         req.BankID,
		Status:         "waiting",
		Visibility:     coalesce(req.Visibility, "private"),
		MaxPlayers:     coalesceInt(req.MaxPlayers, 8),
		RoundsTotal:    coalesceInt(req.RoundsTotal, 1),
		CandidateCount: coalesceInt(req.CandidateCount, 8),
		RevealInterval: req.RevealInterval,
		GuessWindow:    req.GuessWindow,
		BaseScore:      coalesceInt(req.BaseScore, 100),
		DecayPerReveal: coalesceInt(req.DecayPerReveal, 10),
		WrongPenalty:   coalesceInt(req.WrongPenalty, 20),
		CooldownRounds: coalesceInt(req.CooldownRounds, 1),
	}

	if room.BankID == 0 {
		room.JudgeID = userID
		room.RevealInterval = 0
	}

	room, err := h.store.CreateRoom(room)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	// auto join host - use empty username, will be resolved from token later
	h.store.AddPlayer(room.ID, userID, "", roleForUser(room, userID))

	writeJSON(w, http.StatusCreated, room)
}

func (h *Handler) ListRooms(w http.ResponseWriter, r *http.Request) {
	rooms, err := h.store.ListRooms()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	if rooms == nil {
		rooms = []Room{}
	}
	writeJSON(w, http.StatusOK, rooms)
}

func (h *Handler) GetRoom(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	room, err := h.store.GetRoom(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "room not found")
		return
	}
	players, _ := h.store.ListPlayers(id)
	writeJSON(w, http.StatusOK, RoomState{Room: room, Players: players})
}

func (h *Handler) JoinRoom(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == 0 {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	var req struct {
		Code string `json:"code"`
		Role string `json:"role"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Code == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "code required")
		return
	}
	if req.Role != "player" && req.Role != "spectator" {
		req.Role = "player"
	}
	room, err := h.store.GetRoomByCode(req.Code)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "room not found")
		return
	}
	if room.Status == "ended" {
		writeError(w, http.StatusBadRequest, "ROOM_ENDED", "room has ended")
		return
	}
	count := h.store.PlayerCount(room.ID)
	if count >= room.MaxPlayers {
		writeError(w, http.StatusBadRequest, "ROOM_FULL", "room is full")
		return
	}
	h.store.AddPlayer(room.ID, userID, "", req.Role)
	players, _ := h.store.ListPlayers(room.ID)
	writeJSON(w, http.StatusOK, RoomState{Room: room, Players: players})
}

func (h *Handler) ReadyPlayer(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	roomID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	var req struct {
		Ready bool `json:"ready"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	h.store.SetPlayerReady(roomID, userID, req.Ready)

	hub := h.hubManager.Get(roomID)
	if hub != nil {
		hub.BroadcastJSON(map[string]any{
			"type":    "player_ready",
			"user_id": userID,
			"ready":   req.Ready,
		})
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) StartGame(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	roomID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	room, err := h.store.GetRoom(roomID)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "room not found")
		return
	}
	if room.HostID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "not host")
		return
	}
	if room.Status != "waiting" {
		writeError(w, http.StatusBadRequest, "INVALID_STATUS", "room not in waiting status")
		return
	}

	hub := h.hubManager.GetOrCreate(roomID)

	if room.BankID > 0 {
		qd, err := h.store.RandomQuestionFromBank(room.BankID, nil)
		if err != nil {
			writeError(w, http.StatusBadRequest, "NO_QUESTIONS", "no questions in bank")
			return
		}
		h.store.UpdateRoomStatus(roomID, "playing")
		h.store.IncrementRound(roomID)
		room.Status = "playing"
		room.RoundsCurrent = 1

		session := newGameSession(hub, room, h.store, qd)
		hub.session = session
		go session.Run()
	} else {
		h.store.UpdateRoomStatus(roomID, "preparing")
		room.Status = "preparing"

		session := newGameSession(hub, room, h.store, &QuestionDetail{})
		hub.session = session
		hub.BroadcastJSON(map[string]any{"type": "preparing", "message": "waiting for judge"})
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) CloseRoom(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	roomID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	room, err := h.store.GetRoom(roomID)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "room not found")
		return
	}
	if room.HostID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "not host")
		return
	}
	h.store.UpdateRoomStatus(roomID, "ended")
	hub := h.hubManager.Get(roomID)
	if hub != nil {
		hub.BroadcastJSON(map[string]any{"type": "room_closed"})
		hub.Stop()
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- WebSocket ---

func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	roomID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	tokenStr := r.URL.Query().Get("token")

	userID, username := h.parseToken(tokenStr)
	if userID == 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	room, err := h.store.GetRoom(roomID)
	if err != nil || room.Status == "ended" {
		http.Error(w, "room not available", http.StatusBadRequest)
		return
	}

	role := h.store.GetPlayerRole(roomID, userID)
	if role == "" {
		http.Error(w, "not in room", http.StatusForbidden)
		return
	}

	hub := h.hubManager.GetOrCreate(roomID)
	UpgradeAndServe(hub, w, r, userID, username, role)
}

func (h *Handler) parseToken(tokenStr string) (int64, string) {
	if tokenStr == "" {
		return 0, ""
	}
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(h.jwtSecret), nil
	})
	if err != nil || !token.Valid {
		return 0, ""
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, ""
	}
	var userID int64
	switch v := claims["sub"].(type) {
	case float64:
		userID = int64(v)
	case int64:
		userID = v
	default:
		return 0, ""
	}
	username, _ := claims["username"].(string)
	return userID, username
}

// --- helpers ---

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": code, "message": message})
}

func coalesce(val, def string) string {
	if val == "" {
		return def
	}
	return val
}

func coalesceInt(val, def int) int {
	if val == 0 {
		return def
	}
	return val
}

func roleForUser(room *Room, userID int64) string {
	if room.JudgeID == userID {
		return "judge"
	}
	return "player"
}
