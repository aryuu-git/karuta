package ccp

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"karuta/internal/middleware"
	"karuta/internal/storage"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

// Handler HTTP 处理器
type Handler struct {
	store      *Store
	hubManager *CcpHubManager
	jwtSecret  string
	storage    storage.Storage
}

// NewHandler 创建 Handler
func NewHandler(store *Store, hubManager *CcpHubManager, jwtSecret string, stor storage.Storage) *Handler {
	return &Handler{store: store, hubManager: hubManager, jwtSecret: jwtSecret, storage: stor}
}

func ccGetUserID(r *http.Request) int64 {
	id, _ := middleware.GetUserID(r.Context())
	return id
}

// ==================== Banks ====================

func (h *Handler) CreateBank(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	if userID == 0 {
		writeCcpError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		writeCcpError(w, http.StatusBadRequest, "name is required")
		return
	}
	bank, err := h.store.CreateBank(req.Name, req.Description, userID)
	if err != nil {
		writeCcpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeCcpJSON(w, http.StatusCreated, bank)
}

func (h *Handler) ListBanks(w http.ResponseWriter, r *http.Request) {
	banks, err := h.store.ListBanks()
	if err != nil {
		writeCcpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeCcpJSON(w, http.StatusOK, banks)
}

func (h *Handler) GetBank(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	bank, err := h.store.GetBank(id)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "bank not found")
		return
	}
	writeCcpJSON(w, http.StatusOK, bank)
}

func (h *Handler) UpdateBank(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	bank, err := h.store.GetBank(id)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "bank not found")
		return
	}
	if bank.UploaderID != userID {
		writeCcpError(w, http.StatusForbidden, "not owner")
		return
	}
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Name == "" {
		req.Name = bank.Name
	}
	h.store.UpdateBank(id, req.Name, req.Description)
	writeCcpJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) DeleteBank(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	bank, err := h.store.GetBank(id)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "bank not found")
		return
	}
	if bank.UploaderID != userID {
		writeCcpError(w, http.StatusForbidden, "not owner")
		return
	}
	h.store.DeleteBank(id)
	writeCcpJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ==================== Bank Images ====================

func (h *Handler) ListBankImages(w http.ResponseWriter, r *http.Request) {
	bankID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	images, err := h.store.ListBankImages(bankID)
	if err != nil {
		writeCcpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeCcpJSON(w, http.StatusOK, images)
}

func (h *Handler) UploadBankImage(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	if userID == 0 {
		writeCcpError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	bankID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	bank, err := h.store.GetBank(bankID)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "bank not found")
		return
	}
	if bank.UploaderID != userID {
		writeCcpError(w, http.StatusForbidden, "not owner")
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10MB
		writeCcpError(w, http.StatusBadRequest, "file too large")
		return
	}
	file, header, err := r.FormFile("image")
	if err != nil {
		writeCcpError(w, http.StatusBadRequest, "image file required")
		return
	}
	defer file.Close()

	answerKeywords := r.FormValue("answer_keywords")

	// 存储到 uploads/ccp/ 目录，使用时间戳避免文件名冲突
	ext := filepath.Ext(header.Filename)
	key := "ccp/" + strconv.FormatInt(time.Now().UnixMilli(), 36) + "_" + strconv.FormatInt(bankID, 10) + ext
	if h.storage != nil {
		contentType := header.Header.Get("Content-Type")
		if contentType == "" {
			contentType = "image/jpeg"
		}
		if err := h.storage.Put(r.Context(), key, file, header.Size, contentType); err != nil {
			writeCcpError(w, http.StatusInternalServerError, "upload failed")
			return
		}
	}

	imageURL := "/uploads/" + key
	img, err := h.store.CreateBankImage(bankID, imageURL, answerKeywords)
	if err != nil {
		writeCcpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeCcpJSON(w, http.StatusCreated, img)
}

func (h *Handler) DeleteBankImage(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	img, err := h.store.GetBankImage(id)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "image not found")
		return
	}
	bank, err := h.store.GetBank(img.BankID)
	if err != nil || bank.UploaderID != userID {
		writeCcpError(w, http.StatusForbidden, "not owner")
		return
	}
	h.store.DeleteBankImage(id)
	writeCcpJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ==================== Rooms ====================

func (h *Handler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	if userID == 0 {
		writeCcpError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	var req struct {
		JudgeMode  string `json:"judge_mode"`
		GridSize   int    `json:"grid_size"`
		MaxGuesses int    `json:"max_guesses"`
		Difficulty string `json:"difficulty"`
		BlurLevel  int    `json:"blur_level"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	judgeMode := req.JudgeMode
	if judgeMode != "judge" && judgeMode != "auto" {
		judgeMode = "judge"
	}
	gridSize := req.GridSize
	if gridSize < 2 || gridSize > 12 {
		gridSize = 3
	}
	maxGuesses := req.MaxGuesses
	if maxGuesses < 1 || maxGuesses > 10 {
		maxGuesses = 3
	}
	difficulty := req.Difficulty
	if difficulty != "normal" && difficulty != "blur" {
		difficulty = "normal"
	}
	blurLevel := req.BlurLevel
	if blurLevel < 1 || blurLevel > 10 {
		blurLevel = 3
	}

	room, err := h.store.CreateRoom(userID, judgeMode, gridSize, maxGuesses, difficulty, blurLevel)
	if err != nil {
		writeCcpError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// 获取用户信息（需要从 store 查 username）
	// 这里简化处理，用 user_id 作为标识，前端会从 auth 接口获取用户名
	if err := h.store.AddPlayer(room.Code, userID, true); err != nil {
		writeCcpError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeCcpJSON(w, http.StatusCreated, room)
}

func (h *Handler) ListRooms(w http.ResponseWriter, r *http.Request) {
	rooms, err := h.store.ListWaitingRooms()
	if err != nil {
		writeCcpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeCcpJSON(w, http.StatusOK, rooms)
}

func (h *Handler) GetRoom(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	room, err := h.store.GetRoom(code)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "room not found")
		return
	}
	players, _ := h.store.ListPlayers(code)
	images, _ := h.store.GetRoomImages(code)
	gameState, _ := h.store.GetGameState(code)

	state := CcpRoomFullState{
		Room:      room,
		Players:   players,
		GameState: gameState,
		Images:    images,
	}
	writeCcpJSON(w, http.StatusOK, state)
}

func (h *Handler) UpdateRoom(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	code := chi.URLParam(r, "code")
	room, err := h.store.GetRoom(code)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "room not found")
		return
	}
	if room.HostUserID != userID {
		writeCcpError(w, http.StatusForbidden, "only host can modify")
		return
	}

	var req struct {
		JudgeMode  string   `json:"judge_mode"`
		GridSize   int      `json:"grid_size"`
		MaxGuesses int      `json:"max_guesses"`
		Difficulty string   `json:"difficulty"`
		BlurLevel  int      `json:"blur_level"`
		CgUrls     []string `json:"cg_urls"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	judgeMode := req.JudgeMode
	if judgeMode == "" {
		judgeMode = room.JudgeMode
	}
	gridSize := req.GridSize
	if gridSize == 0 {
		gridSize = room.GridSize
	}
	maxGuesses := req.MaxGuesses
	if maxGuesses == 0 {
		maxGuesses = room.MaxGuesses
	}
	difficulty := req.Difficulty
	if difficulty == "" {
		difficulty = room.Difficulty
	}
	blurLevel := req.BlurLevel
	if blurLevel == 0 {
		blurLevel = room.BlurLevel
	}

	h.store.UpdateRoomSettings(code, judgeMode, gridSize, maxGuesses, difficulty, blurLevel)

	if req.CgUrls != nil {
		images := make([]RoomImageInfo, len(req.CgUrls))
		for i, url := range req.CgUrls {
			images[i] = RoomImageInfo{ImageURL: url}
		}
		h.store.SetRoomImages(code, images)
	}

	// 重新获取最新房间数据后再广播
	room, _ = h.store.GetRoom(code)
	hub := h.hubManager.Get(code)
	if hub != nil {
		players, _ := h.store.ListPlayers(code)
		images, _ := h.store.GetRoomImages(code)
		hub.BroadcastJSON(map[string]interface{}{
			"type":    "room_update",
			"room":    room,
			"players": players,
			"images":  images,
		})
	}

	writeCcpJSON(w, http.StatusOK, room)
}

func (h *Handler) JoinRoom(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	if userID == 0 {
		writeCcpError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	code := chi.URLParam(r, "code")
	room, err := h.store.GetRoom(code)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "room not found")
		return
	}
	if room.Status != "waiting" {
		writeCcpError(w, http.StatusBadRequest, "game already started")
		return
	}
	if err := h.store.AddPlayer(room.Code, userID, false); err != nil {
		writeCcpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeCcpJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) ReadyPlayer(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	code := chi.URLParam(r, "code")
	player, err := h.store.GetPlayer(code, userID)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "player not found")
		return
	}
	newReady := !player.IsReady
	h.store.SetPlayerReady(code, userID, newReady)

	hub := h.hubManager.Get(code)
	if hub != nil {
		hub.BroadcastJSON(map[string]interface{}{
			"type":    "player_ready",
			"user_id": userID,
			"ready":   newReady,
		})
	}
	writeCcpJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) RemoveRoomImage(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	code := chi.URLParam(r, "code")
	room, err := h.store.GetRoom(code)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "room not found")
		return
	}
	if room.HostUserID != userID {
		writeCcpError(w, http.StatusForbidden, "only host can modify")
		return
	}
	var req struct {
		ImageURL string `json:"image_url"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	h.store.RemoveRoomImage(code, req.ImageURL)
	writeCcpJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) RandomRoomImages(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	code := chi.URLParam(r, "code")
	room, err := h.store.GetRoom(code)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "room not found")
		return
	}
	if room.HostUserID != userID {
		writeCcpError(w, http.StatusForbidden, "only host can modify")
		return
	}
	var req struct {
		Count  int   `json:"count"`
		BankID int64 `json:"bank_id"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	count := req.Count
	if count < 1 || count > 50 {
		count = 5
	}
	if err := h.store.RandomRoomImages(code, req.BankID, count); err != nil {
		writeCcpError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeCcpJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// AddRoomImage 手动添加单张图片到房间
func (h *Handler) AddRoomImage(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	code := chi.URLParam(r, "code")
	room, err := h.store.GetRoom(code)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "room not found")
		return
	}
	if room.HostUserID != userID {
		writeCcpError(w, http.StatusForbidden, "only host can modify")
		return
	}
	var req struct {
		ImageURL       string `json:"image_url"`
		AnswerKeywords string `json:"answer_keywords"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.ImageURL == "" {
		writeCcpError(w, http.StatusBadRequest, "image_url required")
		return
	}
	// 获取当前图片列表，追加新图片
	images, _ := h.store.GetRoomImages(code)
	images = append(images, RoomImageInfo{ImageURL: req.ImageURL, AnswerKeywords: req.AnswerKeywords})
	h.store.SetRoomImages(code, images)
	writeCcpJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ==================== Games ====================

func (h *Handler) StartGame(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	code := chi.URLParam(r, "code")
	room, err := h.store.GetRoom(code)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "room not found")
		return
	}
	if room.HostUserID != userID {
		writeCcpError(w, http.StatusForbidden, "not host")
		return
	}
	if room.Status != "waiting" {
		writeCcpError(w, http.StatusBadRequest, "game already started")
		return
	}

	players, _ := h.store.ListPlayers(code)
	var nonHostPlayers []CcpPlayer
	for _, p := range players {
		if !p.IsHost {
			nonHostPlayers = append(nonHostPlayers, p)
		}
	}
	if len(nonHostPlayers) < 1 {
		writeCcpError(w, http.StatusBadRequest, "need at least 1 player")
		return
	}

	images, _ := h.store.GetRoomImages(code)
	if len(images) == 0 {
		writeCcpError(w, http.StatusBadRequest, "no images selected")
		return
	}

	// 随机排序玩家
	playerOrder := make([]int64, len(nonHostPlayers))
	for i, p := range nonHostPlayers {
		playerOrder[i] = p.UserID
	}
	for i := len(playerOrder) - 1; i > 0; i-- {
		j := randIntn(i + 1)
		playerOrder[i], playerOrder[j] = playerOrder[j], playerOrder[i]
	}

	h.store.ResetPlayerScores(code)
	h.store.UpdateRoomStatus(code, "playing")
	room.Status = "playing"

	gameState := &CcpGameState{
		RoomID:             code,
		Status:             "active",
		CurrentRound:       1,
		MaxRounds:          len(images),
		PlayerOrder:        playerOrder,
		CurrentPlayerIndex: 0,
		RevealedTiles:      []int{},
		CurrentImageIndex:  0,
		CurrentBlurLevel:   room.BlurLevel,
		Logs: []CcpGameLog{{
			ID:        1,
			Type:      "system",
			UserID:    0,
			Username:  "系统",
			Message:   "游戏开始！第 1 轮",
			Timestamp: 1,
		}},
		PendingGuess: nil,
	}
	h.store.CreateGameState(gameState)

	hub := h.hubManager.GetOrCreate(code)
	session := NewCcpGameSession(hub, room, h.store, gameState, images)
	hub.session = session

	hub.BroadcastJSON(map[string]interface{}{
		"type":       "game_started",
		"game_state": gameState,
		"room":       room,
		"images":     images,
		"players":    players,
	})

	writeCcpJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) GetGameState(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	room, err := h.store.GetRoom(code)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "room not found")
		return
	}
	gameState, err := h.store.GetGameState(code)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "game not started")
		return
	}
	players, _ := h.store.ListPlayers(code)
	images, _ := h.store.GetRoomImages(code)
	writeCcpJSON(w, http.StatusOK, map[string]interface{}{
		"game_state": gameState,
		"room":       room,
		"images":     images,
		"players":    players,
	})
}

func (h *Handler) EndGame(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	code := chi.URLParam(r, "code")
	room, err := h.store.GetRoom(code)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "room not found")
		return
	}
	if room.HostUserID != userID {
		writeCcpError(w, http.StatusForbidden, "not host")
		return
	}
	h.store.UpdateRoomStatus(code, "ended")
	hub := h.hubManager.Get(code)
	if hub != nil {
		hub.BroadcastJSON(map[string]interface{}{"type": "room_closed"})
		hub.Stop()
	}
	writeCcpJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) ResetGame(w http.ResponseWriter, r *http.Request) {
	userID := ccGetUserID(r)
	code := chi.URLParam(r, "code")
	room, err := h.store.GetRoom(code)
	if err != nil {
		writeCcpError(w, http.StatusNotFound, "room not found")
		return
	}
	if room.HostUserID != userID {
		writeCcpError(w, http.StatusForbidden, "not host")
		return
	}
	// 重置房间状态为 waiting
	h.store.UpdateRoomStatus(code, "waiting")
	h.store.ResetPlayerScores(code)
	// 删除旧的游戏状态
	h.store.DeleteGameState(code)
	// 停止旧的 hub
	hub := h.hubManager.Get(code)
	if hub != nil {
		hub.Stop()
	}
	writeCcpJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ==================== WebSocket ====================

func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	tokenStr := r.URL.Query().Get("token")

	userID, username := h.parseToken(tokenStr)
	if userID == 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	room, err := h.store.GetRoom(code)
	if err != nil || room.Status == "ended" {
		http.Error(w, "room not available", http.StatusBadRequest)
		return
	}

	isHost := room.HostUserID == userID
	hub := h.hubManager.GetOrCreate(code)
	CcpUpgradeAndServe(hub, w, r, userID, username, isHost)
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

// ==================== helpers ====================

func writeCcpJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeCcpError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// containsKeyword 自动判定模糊匹配
func containsKeyword(guess, keywords string) bool {
	if keywords == "" {
		return false
	}
	guess = strings.ToLower(strings.TrimSpace(guess))
	for _, kw := range strings.Split(keywords, ",") {
		kw = strings.ToLower(strings.TrimSpace(kw))
		if kw != "" && (strings.Contains(guess, kw) || strings.Contains(kw, guess)) {
			return true
		}
	}
	return false
}
