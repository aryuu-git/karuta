package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"karuta/backend/achievement"
	"karuta/backend/middleware"
	"karuta/backend/model"
	"karuta/backend/storage"
	"karuta/backend/store"

	"github.com/go-chi/chi/v5"
)

// populateDeckCovers 把列表查询聚合的 cover_path 串转为绝对 URL 拼贴（前 4 张）
func populateDeckCovers(decks []*model.Deck) {
	for _, d := range decks {
		if d.CoverPaths == "" {
			continue
		}
		for _, p := range strings.Split(d.CoverPaths, ",") {
			if url := storage.FileURL(p, "covers"); url != "" {
				d.CoverURLs = append(d.CoverURLs, url)
			}
		}
	}
}

const (
	maxAudioSize = 20 * 1024 * 1024 // 20 MB
	maxCoverSize = 5 * 1024 * 1024  // 5 MB
)

type DeckHandler struct {
	store *store.Store
}

func NewDeckHandler(s *store.Store) *DeckHandler {
	return &DeckHandler{store: s}
}

// POST /api/decks
func (h *DeckHandler) CreateDeck(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		ShareLevel  string `json:"share_level"`
		EditLevel   string `json:"edit_level"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "name is required")
		return
	}

	deck, err := h.store.Decks.CreateDeck(userID, req.Name, req.Description)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create deck")
		return
	}

	// Set share/edit level if provided（值域校验 2026-09-21：垃圾 share_level 会被
	// canPlayDeck 的 != 'private' 判定为公开——意外泄露）
	if req.ShareLevel != "" {
		if req.ShareLevel != "private" && req.ShareLevel != "playable" && req.ShareLevel != "editable" {
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", "share_level must be private, playable, or editable")
			return
		}
		editLevel := req.EditLevel
		if editLevel == "" {
			editLevel = "add_only"
		}
		if editLevel != "add_only" && editLevel != "full" {
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", "edit_level must be add_only or full")
			return
		}
		if err := h.store.Decks.UpdateShareLevel(deck.ID, req.ShareLevel, editLevel); err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to set share level")
			return
		}
		deck.ShareLevel = req.ShareLevel
		deck.EditLevel = editLevel
		deck.IsPublic = req.ShareLevel != "private"
	}

	writeJSON(w, http.StatusCreated, deck)
	// 成就（best-effort）：牌组收藏家
	achievement.NewEvaluator(h.store).OnContentEvent(userID, "deck")
}

// GET /api/decks/mine
func (h *DeckHandler) ListMyDecks(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	decks, err := h.store.Decks.ListByOwner(userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list decks")
		return
	}
	if decks == nil {
		decks = []*model.Deck{}
	}
	populateDeckCovers(decks)

	writeJSON(w, http.StatusOK, decks)
}

// GET /api/decks/public
func (h *DeckHandler) ListPublicDecks(w http.ResponseWriter, r *http.Request) {
	viewerID, _ := middleware.GetUserID(r.Context())
	owner := r.URL.Query().Get("owner")
	decks, err := h.store.Decks.ListPublicByShareLevel(viewerID, owner)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list public decks")
		return
	}
	if decks == nil {
		decks = []*model.Deck{}
	}
	populateDeckCovers(decks)
	writeJSON(w, http.StatusOK, decks)
}

// GET /api/decks/editable
func (h *DeckHandler) ListEditableDecks(w http.ResponseWriter, r *http.Request) {
	viewerID, _ := middleware.GetUserID(r.Context())
	decks, err := h.store.Decks.ListEditable(viewerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list editable decks")
		return
	}
	if decks == nil {
		decks = []*model.Deck{}
	}
	populateDeckCovers(decks)
	writeJSON(w, http.StatusOK, decks)
}

// GET /api/decks/{id}
func (h *DeckHandler) GetDeck(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	deckID, err := parseDeckID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid deck id")
		return
	}

	deck, err := h.store.Decks.GetByID(deckID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "deck not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get deck")
		return
	}

	if !canPlayDeck(userID, deck) {
		// 防枚举（2026-09-21 对齐 GetCard）：无权一律 404，不暴露存在性
		writeError(w, http.StatusNotFound, "NOT_FOUND", "deck not found")
		return
	}

	// Load cards via deck_cards (M:N), fallback to legacy
	cards, err := h.store.DeckCards.ListCardsByDeck(deckID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list cards")
		return
	}
	// Fallback to legacy if deck_cards is empty
	if len(cards) == 0 {
		cards, err = h.store.Cards.ListByDeck(deckID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list cards")
			return
		}
	}
	if cards == nil {
		cards = []*model.Card{}
	}

	// Populate URL fields and audios
	for _, c := range cards {
		c.CoverURL = storage.FileURL(c.CoverPath, "covers")
		// Load audios for each card
		audios := h.store.CardAudios.GetAudiosForCard(c)
		for _, a := range audios {
			a.AudioURL = storage.FileURL(a.AudioPath, "audio")
		}
		c.Audios = audios
		c.AudioCount = len(audios)
	}

	deck.CardCount = len(cards)

	// 点赞状态（v8）
	if likes, err := h.store.Decks.LikeCount(deckID); err == nil {
		deck.Likes = likes
	}
	if liked, err := h.store.Decks.LikedByUser(deckID, userID); err == nil {
		deck.LikedByMe = liked
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"deck":  deck,
		"cards": cards,
	})
}

// PATCH /api/decks/{id}
func (h *DeckHandler) UpdateDeck(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	deckID, err := parseDeckID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid deck id")
		return
	}
	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		ShareLevel  *string `json:"share_level"`
		EditLevel   *string `json:"edit_level"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	deck, err := h.store.Decks.GetByID(deckID)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "deck not found")
		return
	}
	if deck.OwnerID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied")
		return
	}

	// 部分更新：只更新传入的字段
	if req.Name != nil && *req.Name != "" {
		deck.Name = *req.Name
	}
	if req.Description != nil {
		deck.Description = *req.Description
	}
	if req.ShareLevel != nil {
		// 值域校验（2026-09-21 权限审查，同 CreateDeck）
		if *req.ShareLevel != "private" && *req.ShareLevel != "playable" && *req.ShareLevel != "editable" {
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", "share_level must be private, playable, or editable")
			return
		}
		deck.ShareLevel = *req.ShareLevel
	}
	if req.EditLevel != nil {
		if *req.EditLevel != "add_only" && *req.EditLevel != "full" {
			writeError(w, http.StatusBadRequest, "BAD_REQUEST", "edit_level must be add_only or full")
			return
		}
		deck.EditLevel = *req.EditLevel
	}

	// 更新名称/描述
	if _, err := h.store.Decks.UpdateDeck(deckID, deck.Name, deck.Description); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update deck")
		return
	}
	// 更新共享设置
	if req.ShareLevel != nil || req.EditLevel != nil {
		if err := h.store.Decks.UpdateShareLevel(deckID, deck.ShareLevel, deck.EditLevel); err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update share level")
			return
		}
	}

	// 重新读取返回
	updated, err := h.store.Decks.GetByID(deckID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get updated deck")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// DELETE /api/decks/{id}
func (h *DeckHandler) DeleteDeck(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	deckID, err := parseDeckID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid deck id")
		return
	}

	deck, err := h.store.Decks.GetByID(deckID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "deck not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get deck")
		return
	}

	if deck.OwnerID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied")
		return
	}

	active, err := h.store.Decks.HasActiveRoom(deckID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to check active rooms")
		return
	}
	if active {
		writeError(w, http.StatusConflict, "DECK_IN_USE", "deck is currently used in an active room")
		return
	}

	if err := h.store.Decks.DeleteDeck(deckID); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to delete deck")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// POST /api/decks/{id}/share
func (h *DeckHandler) ShareDeck(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	deckID, err := parseDeckID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid deck id")
		return
	}
	deck, err := h.store.Decks.GetByID(deckID)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "deck not found")
		return
	}
	if deck.OwnerID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied")
		return
	}

	var req struct {
		ShareLevel string `json:"share_level"`
		EditLevel  string `json:"edit_level"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid body")
		return
	}

	// Validate share_level
	if req.ShareLevel != "private" && req.ShareLevel != "playable" && req.ShareLevel != "editable" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "share_level must be private, playable, or editable")
		return
	}
	if req.EditLevel == "" {
		req.EditLevel = "add_only"
	}

	if err := h.store.Decks.UpdateShareLevel(deckID, req.ShareLevel, req.EditLevel); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update share settings")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"share_level": req.ShareLevel,
		"edit_level":  req.EditLevel,
	})
	// 成就（best-effort）：分享家（首次公开牌组）
	if req.ShareLevel != "private" {
		achievement.NewEvaluator(h.store).OnContentEvent(userID, "share")
	}
}

// POST /api/decks/{id}/cards — 添加牌到牌组
func (h *DeckHandler) AddCardsToDeck(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	deckID, err := parseDeckID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid deck id")
		return
	}

	deck, err := h.store.Decks.GetByID(deckID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "deck not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get deck")
		return
	}

	if !canAddCardToDeck(userID, deck) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied")
		return
	}

	var req struct {
		CardIDs []int64 `json:"card_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if len(req.CardIDs) == 0 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "card_ids is required")
		return
	}

	// 可见性校验（2026-09-21 泄露修复）：每张卡必须存在且调用者可见
	// （owner 或非 private）——此前零校验，可把他人 private 卡塞进可编辑
	// 牌组，经 GetDeck/建房链路泄露其 hint_text 与音频 URL。
	for _, cardID := range req.CardIDs {
		card, err := h.store.Cards.GetByID(cardID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeError(w, http.StatusNotFound, "NOT_FOUND", "card not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to check card")
			return
		}
		if card.OwnerID != userID && card.ShareLevel == "private" {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied to a card")
			return
		}
	}

	if err := h.store.DeckCards.AddBatch(deckID, req.CardIDs, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to add cards to deck")
		return
	}

	count, _ := h.store.DeckCards.CountByDeck(deckID)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"added":      len(req.CardIDs),
		"card_count": count,
	})
}

// DELETE /api/decks/{id}/cards/{cardID} — 从牌组移除牌
func (h *DeckHandler) RemoveCardFromDeck(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	deckID, err := parseDeckID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid deck id")
		return
	}

	cardIDStr := chi.URLParam(r, "cardID")
	cardID, err := strconv.ParseInt(cardIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid card id")
		return
	}

	deck, err := h.store.Decks.GetByID(deckID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "deck not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get deck")
		return
	}

	if !canRemoveCardFromDeck(userID, deck) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied")
		return
	}

	// Verify card is in deck
	inDeck, err := h.store.DeckCards.CardInDeck(deckID, cardID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to check card membership")
		return
	}
	if !inDeck {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "card not found in this deck")
		return
	}

	if err := h.store.DeckCards.Remove(deckID, cardID); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to remove card from deck")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// POST /api/decks/{id}/clone — 复制牌组
func (h *DeckHandler) CloneDeck(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	deckID, err := parseDeckID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid deck id")
		return
	}

	var req struct {
		Mode string `json:"mode"` // "full" (default) or "covers_only"
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.Mode == "" {
		req.Mode = "full"
	}

	srcDeck, err := h.store.Decks.GetByID(deckID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "deck not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get deck")
		return
	}

	if !canPlayDeck(userID, srcDeck) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied")
		return
	}

	username := ""
	if u, err2 := h.store.Users.GetByID(userID); err2 == nil {
		username = u.Username
	}
	newDeck, err := h.store.Decks.CreateDeck(userID, srcDeck.Name+"_"+username, srcDeck.Description)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create deck copy")
		return
	}

	if req.Mode == "covers_only" {
		// 创建新牌（只有封面，无音频），加入新牌组
		srcCards, _ := h.store.DeckCards.ListCardsByDeck(deckID)
		if len(srcCards) == 0 {
			srcCards, _ = h.store.Cards.ListByDeck(deckID)
		}
		for i, c := range srcCards {
			newCard, err := h.store.Cards.CreateCard(userID, c.CoverPath, c.DisplayText+"_"+username, c.Series, c.Tags, true)
			if err != nil {
				log.Printf("[clone] CreateCard failed: %v", err)
				continue
			}
			if err := h.store.DeckCards.Add(newDeck.ID, newCard.ID, userID, i); err != nil {
				log.Printf("[clone] DeckCards.Add failed: %v (deck=%d, card=%d)", err, newDeck.ID, newCard.ID)
			}
		}
	} else {
		// 完整复制：引用相同的牌
		if err := h.store.DeckCards.CloneDeck(deckID, newDeck.ID, userID); err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to clone cards")
			return
		}
	}

	count, _ := h.store.DeckCards.CountByDeck(newDeck.ID)
	newDeck.CardCount = count

	writeJSON(w, http.StatusCreated, newDeck)
}

// POST /api/decks/{id}/like — 牌组点赞开关（任意登录用户）
func (h *DeckHandler) ToggleLike(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	deckID, err := parseDeckID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid deck id")
		return
	}
	deck, err := h.store.Decks.GetByID(deckID)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "deck not found")
		return
	}
	if !canPlayDeck(userID, deck) {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "deck not found")
		return
	}
	liked, err := h.store.Decks.LikeToggle(deckID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to toggle like")
		return
	}
	likes, _ := h.store.Decks.LikeCount(deckID)
	writeJSON(w, http.StatusOK, map[string]interface{}{"liked": liked, "likes": likes})
}

// POST /api/decks/{id}/reorder — 牌组内排序（owner 或 editable+full）
func (h *DeckHandler) ReorderCards(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	deckID, err := parseDeckID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid deck id")
		return
	}
	deck, err := h.store.Decks.GetByID(deckID)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "deck not found")
		return
	}
	if !canRemoveCardFromDeck(userID, deck) {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied")
		return
	}
	var req struct {
		CardIDs []int64 `json:"card_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.CardIDs) == 0 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "card_ids is required")
		return
	}
	if err := h.store.DeckCards.Reorder(deckID, req.CardIDs); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to reorder cards")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Permission helpers

func canAddCardToDeck(userID int64, deck *model.Deck) bool {
	if deck.OwnerID == userID {
		return true
	}
	return deck.ShareLevel == "editable"
}

func canRemoveCardFromDeck(userID int64, deck *model.Deck) bool {
	if deck.OwnerID == userID {
		return true
	}
	return deck.ShareLevel == "editable" && deck.EditLevel == "full"
}

func canPlayDeck(userID int64, deck *model.Deck) bool {
	if deck.OwnerID == userID {
		return true
	}
	return deck.ShareLevel != "private"
}

// parseDeckID extracts and parses the {id} URL parameter.
func parseDeckID(r *http.Request) (int64, error) {
	idStr := chi.URLParam(r, "id")
	return strconv.ParseInt(idStr, 10, 64)
}

// detectAudioFormat inspects magic bytes to identify audio format.
// Returns extension and true on success.
func detectAudioFormat(data []byte) (string, bool) {
	if len(data) < 4 {
		return "", false
	}
	switch {
	// AAC（ADTS 0xFFF1/0xFFF9）必须先于 mp3 判定：mp3 的 0xFF&0xE0==0xE0
	// 同样命中 AAC 首字节，原顺序使 aac 分支为死代码、AAC 恒存成 .mp3
	// （2026-09-21 修复）。
	case len(data) >= 2 && data[0] == 0xFF && (data[1] == 0xF1 || data[1] == 0xF9):
		return "aac", true
	case data[0] == 0xFF && (data[1]&0xE0) == 0xE0:
		return "mp3", true
	case data[0] == 'I' && data[1] == 'D' && data[2] == '3':
		return "mp3", true
	case data[0] == 'R' && data[1] == 'I' && data[2] == 'F' && data[3] == 'F':
		return "wav", true
	case len(data) >= 8 &&
		data[4] == 'f' && data[5] == 't' && data[6] == 'y' && data[7] == 'p':
		return "m4a", true
	case data[0] == 0x66 && data[1] == 0x4C && data[2] == 0x61 && data[3] == 0x43:
		return "flac", true
	case data[0] == 'O' && data[1] == 'g' && data[2] == 'g' && data[3] == 'S':
		return "ogg", true
	}
	return "", false
}

// detectImageFormat inspects magic bytes to identify image format.
func detectImageFormat(data []byte) (string, bool) {
	if len(data) < 4 {
		return "", false
	}
	switch {
	case data[0] == 0xFF && data[1] == 0xD8:
		return "jpg", true
	case data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47:
		return "png", true
	case len(data) >= 4 && string(data[:4]) == "RIFF" && len(data) >= 12 && string(data[8:12]) == "WEBP":
		return "webp", true
	}
	return "", false
}
