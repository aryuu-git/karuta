package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"karuta/internal/middleware"
	"karuta/internal/model"
	"karuta/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const (
	maxAudioSize = 20 * 1024 * 1024 // 20 MB
	maxCoverSize = 5 * 1024 * 1024  // 5 MB
)

type DeckHandler struct {
	store     *store.Store
	uploadDir string
}

func NewDeckHandler(s *store.Store, uploadDir string) *DeckHandler {
	return &DeckHandler{store: s, uploadDir: uploadDir}
}

// GET /api/decks/public
func (h *DeckHandler) ListPublicDecks(w http.ResponseWriter, r *http.Request) {
	decks, err := h.store.Decks.ListPublic()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list public decks")
		return
	}
	if decks == nil {
		decks = []*model.Deck{}
	}
	writeJSON(w, http.StatusOK, decks)
}

// POST /api/decks/{id}/share  — 切换共享状态
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
		IsPublic bool `json:"is_public"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid body")
		return
	}
	if err := h.store.Decks.SetPublic(deckID, req.IsPublic); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"is_public": req.IsPublic})
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
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "name is required")
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
	updated, err := h.store.Decks.UpdateDeck(deckID, req.Name, req.Description)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update deck")
		return
	}
	writeJSON(w, http.StatusOK, updated)
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

	writeJSON(w, http.StatusCreated, deck)
}

// GET /api/decks
func (h *DeckHandler) ListDecks(w http.ResponseWriter, r *http.Request) {
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

	if deck.OwnerID != userID && !deck.IsPublic {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied")
		return
	}

	cards, err := h.store.Cards.ListByDeck(deckID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list cards")
		return
	}
	if cards == nil {
		cards = []*model.Card{}
	}

	// Populate URL fields
	for _, c := range cards {
		if c.AudioPath != "" {
			c.AudioURL = "/uploads/audio/" + filepath.Base(c.AudioPath)
		}
		if c.CoverPath != "" {
			c.CoverURL = "/uploads/covers/" + filepath.Base(c.CoverPath)
		}
	}

	deck.CardCount = len(cards)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"deck":  deck,
		"cards": cards,
	})
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

	// Delete all card files before removing from DB
	cards, err := h.store.Cards.ListByDeck(deckID)
	if err == nil {
		for _, c := range cards {
			if c.AudioPath != "" {
				_ = os.Remove(c.AudioPath)
			}
			if c.CoverPath != "" {
				_ = os.Remove(c.CoverPath)
			}
		}
	}

	if err := h.store.Decks.DeleteDeck(deckID); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to delete deck")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// POST /api/decks/{id}/cards
func (h *DeckHandler) AddCard(w http.ResponseWriter, r *http.Request) {
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

	// Limit multipart memory to 25MB
	if err := r.ParseMultipartForm(25 * 1024 * 1024); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "failed to parse multipart form")
		return
	}

	displayText := r.FormValue("display_text")
	hintText := r.FormValue("hint_text")
	if displayText == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "display_text is required")
		return
	}

	// Handle audio file
	audioFile, audioHeader, err := r.FormFile("audio")
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "audio file is required")
		return
	}
	defer audioFile.Close()

	if audioHeader.Size > maxAudioSize {
		writeError(w, http.StatusBadRequest, "FILE_TOO_LARGE", "audio file must be <= 20MB")
		return
	}

	audioBytes, err := io.ReadAll(io.LimitReader(audioFile, maxAudioSize+1))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to read audio file")
		return
	}

	audioExt, ok := detectAudioFormat(audioBytes)
	if !ok {
		writeError(w, http.StatusBadRequest, "INVALID_FORMAT", "unsupported audio format; allowed: mp3, wav, m4a, flac, ogg, aac")
		return
	}

	audioDir := filepath.Join(h.uploadDir, "audio")
	if err := os.MkdirAll(audioDir, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create audio directory")
		return
	}
	audioFilename := uuid.New().String() + "." + audioExt
	audioPath := filepath.Join(audioDir, audioFilename)
	if err := os.WriteFile(audioPath, audioBytes, 0644); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to save audio file")
		return
	}

	// Handle cover file (required)
	coverPath := ""
	coverFile, coverHeader, coverErr := r.FormFile("cover")
	if coverErr != nil {
		_ = os.Remove(audioPath)
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "cover image is required")
		return
	}
	if true {
		defer coverFile.Close()
		if coverHeader.Size > maxCoverSize {
			_ = os.Remove(audioPath)
			writeError(w, http.StatusBadRequest, "FILE_TOO_LARGE", "cover file must be <= 5MB")
			return
		}

		coverBytes, err := io.ReadAll(io.LimitReader(coverFile, maxCoverSize+1))
		if err != nil {
			_ = os.Remove(audioPath)
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to read cover file")
			return
		}

		coverExt, ok := detectImageFormat(coverBytes)
		if !ok {
			_ = os.Remove(audioPath)
			writeError(w, http.StatusBadRequest, "INVALID_FORMAT", "unsupported cover format; allowed: jpg, png, webp")
			return
		}

		coverDir := filepath.Join(h.uploadDir, "covers")
		if err := os.MkdirAll(coverDir, 0755); err != nil {
			_ = os.Remove(audioPath)
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create covers directory")
			return
		}
		coverFilename := uuid.New().String() + "." + coverExt
		coverPath = filepath.Join(coverDir, coverFilename)
		if err := os.WriteFile(coverPath, coverBytes, 0644); err != nil {
			_ = os.Remove(audioPath)
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to save cover file")
			return
		}
	}

	existingCards, _ := h.store.Cards.ListByDeck(deckID)
	sortOrder := len(existingCards)

	card, err := h.store.Cards.CreateCard(deckID, audioPath, coverPath, hintText, displayText, sortOrder)
	if err != nil {
		_ = os.Remove(audioPath)
		if coverPath != "" {
			_ = os.Remove(coverPath)
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create card")
		return
	}

	card.AudioURL = "/uploads/audio/" + filepath.Base(card.AudioPath)
	if card.CoverPath != "" {
		card.CoverURL = "/uploads/covers/" + filepath.Base(card.CoverPath)
	}

	writeJSON(w, http.StatusCreated, card)
}

// DELETE /api/decks/{id}/cards/{cardID}
func (h *DeckHandler) DeleteCard(w http.ResponseWriter, r *http.Request) {
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
	if deck.OwnerID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied")
		return
	}

	card, err := h.store.Cards.GetByID(cardID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "card not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get card")
		return
	}
	if card.DeckID != deckID {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "card not found in this deck")
		return
	}

	if err := h.store.Cards.DeleteCard(cardID); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to delete card")
		return
	}

	// Clean up files
	if card.AudioPath != "" {
		_ = os.Remove(card.AudioPath)
	}
	if card.CoverPath != "" {
		_ = os.Remove(card.CoverPath)
	}

	w.WriteHeader(http.StatusNoContent)
}

// parseDeckID extracts and parses the {id} URL parameter.
func parseDeckID(r *http.Request) (int64, error) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid id: %w", err)
	}
	return id, nil
}

// detectAudioFormat inspects magic bytes to identify audio format.
// Returns extension and true on success.
func detectAudioFormat(data []byte) (string, bool) {
	if len(data) < 4 {
		return "", false
	}
	switch {
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
	case len(data) >= 2 && data[0] == 0xFF && data[1] == 0xF1:
		return "aac", true
	case len(data) >= 2 && data[0] == 0xFF && data[1] == 0xF9:
		return "aac", true
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
