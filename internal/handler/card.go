package handler

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"

	"karuta/internal/middleware"
	"karuta/internal/model"
	"karuta/internal/storage"
	"karuta/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type CardHandler struct {
	store     *store.Store
	uploadDir string
	storage   storage.Storage
}

func NewCardHandler(s *store.Store, uploadDir string, stor storage.Storage) *CardHandler {
	return &CardHandler{store: s, uploadDir: uploadDir, storage: stor}
}

// GET /api/cards/mine
func (h *CardHandler) ListMyCards(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	cards, err := h.store.Cards.ListByOwner(userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list cards")
		return
	}
	if cards == nil {
		cards = []*model.Card{}
	}

	// Populate URL fields
	for _, c := range cards {
		c.CoverURL = storage.FileURL(c.CoverPath, "covers")
	}

	writeJSON(w, http.StatusOK, cards)
}

// GET /api/cards/public
func (h *CardHandler) ListPublicCards(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	series := r.URL.Query().Get("series")
	tag := r.URL.Query().Get("tag")

	page := 1
	if p, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && p > 0 {
		page = p
	}
	size := 20
	if s, err := strconv.Atoi(r.URL.Query().Get("size")); err == nil && s > 0 && s <= 100 {
		size = s
	}
	offset := (page - 1) * size

	cards, err := h.store.Cards.ListPublic(search, series, tag, size, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list public cards")
		return
	}
	if cards == nil {
		cards = []*model.Card{}
	}

	// Populate URL fields
	for _, c := range cards {
		c.CoverURL = storage.FileURL(c.CoverPath, "covers")
	}

	writeJSON(w, http.StatusOK, cards)
}

// GET /api/cards/{id}
func (h *CardHandler) GetCard(w http.ResponseWriter, r *http.Request) {
	cardID, err := parseCardID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid card id")
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

	// Populate URLs
	card.CoverURL = storage.FileURL(card.CoverPath, "covers")

	// Load audios
	audios := h.store.CardAudios.GetAudiosForCard(card)
	for _, a := range audios {
		a.AudioURL = storage.FileURL(a.AudioPath, "audio")
	}
	card.Audios = audios
	card.AudioCount = len(audios)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"card":   card,
		"audios": audios,
	})
}

// POST /api/cards
func (h *CardHandler) CreateCard(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	// Limit multipart memory to 25MB
	if err := r.ParseMultipartForm(25 * 1024 * 1024); err != nil {
		log.Printf("[card] ParseMultipartForm failed: %v", err)
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "failed to parse multipart form")
		return
	}
	log.Printf("[card] CreateCard start: user=%d, display_text=%s", userID, r.FormValue("display_text"))

	displayText := r.FormValue("display_text")
	series := r.FormValue("series")
	tags := r.FormValue("tags")
	hintText := r.FormValue("hint_text")
	if displayText == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "display_text is required")
		return
	}

	// Handle cover file (required)
	coverFile, coverHeader, err := r.FormFile("cover")
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "cover image is required")
		return
	}
	defer coverFile.Close()

	if coverHeader.Size > maxCoverSize {
		writeError(w, http.StatusBadRequest, "FILE_TOO_LARGE", "cover file must be <= 5MB")
		return
	}

	coverBytes, err := io.ReadAll(io.LimitReader(coverFile, maxCoverSize+1))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to read cover file")
		return
	}

	coverExt, ok := detectImageFormat(coverBytes)
	if !ok {
		log.Printf("[card] cover format detection failed (size=%d, first4=%x)", len(coverBytes), coverBytes[:min(4, len(coverBytes))])
		writeError(w, http.StatusBadRequest, "INVALID_FORMAT", "unsupported cover format; allowed: jpg, png, webp")
		return
	}
	log.Printf("[card] cover OK: ext=%s, size=%d", coverExt, len(coverBytes))

	coverFilename := uuid.New().String() + "." + coverExt
	coverKey := "covers/" + coverFilename
	coverContentType := "image/" + coverExt
	if coverExt == "jpg" {
		coverContentType = "image/jpeg"
	}
	if err := h.storage.Put(context.Background(), coverKey, bytes.NewReader(coverBytes), int64(len(coverBytes)), coverContentType); err != nil {
		log.Printf("[card] COS Put cover failed: %v (key=%s, size=%d)", err, coverKey, len(coverBytes))
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to save cover file")
		return
	}
	coverPath := coverKey
	log.Printf("[card] COS Put cover OK: key=%s", coverKey)

	// Handle audio file (required)
	audioFile, audioHeader, err := r.FormFile("audio")
	if err != nil {
		_ = h.storage.Delete(context.Background(), coverKey)
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "audio file is required")
		return
	}
	defer audioFile.Close()

	if audioHeader.Size > maxAudioSize {
		_ = h.storage.Delete(context.Background(), coverKey)
		writeError(w, http.StatusBadRequest, "FILE_TOO_LARGE", "audio file must be <= 20MB")
		return
	}

	audioBytes, err := io.ReadAll(io.LimitReader(audioFile, maxAudioSize+1))
	if err != nil {
		_ = h.storage.Delete(context.Background(), coverKey)
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to read audio file")
		return
	}

	audioExt, ok := detectAudioFormat(audioBytes)
	if !ok {
		_ = h.storage.Delete(context.Background(), coverKey)
		writeError(w, http.StatusBadRequest, "INVALID_FORMAT", "unsupported audio format; allowed: mp3, wav, m4a, flac, ogg, aac")
		return
	}

	audioFilename := uuid.New().String() + "." + audioExt
	audioKey := "audio/" + audioFilename
	audioContentType := "audio/" + audioExt
	if audioExt == "mp3" {
		audioContentType = "audio/mpeg"
	} else if audioExt == "m4a" {
		audioContentType = "audio/mp4"
	}
	if err := h.storage.Put(context.Background(), audioKey, bytes.NewReader(audioBytes), int64(len(audioBytes)), audioContentType); err != nil {
		log.Printf("[card] COS Put audio failed: %v (key=%s, size=%d)", err, audioKey, len(audioBytes))
		_ = h.storage.Delete(context.Background(), coverKey)
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to save audio file")
		return
	}
	audioPath := audioKey
	log.Printf("[card] COS Put audio OK: key=%s", audioKey)

	// Create card in DB
	isShared := true // default to shared
	card, err := h.store.Cards.CreateCard(userID, coverPath, displayText, series, tags, isShared)
	if err != nil {
		log.Printf("[card] CreateCard failed: %v (owner=%d, cover=%s, text=%s)", err, userID, coverPath, displayText)
		_ = h.storage.Delete(context.Background(), coverKey)
		_ = h.storage.Delete(context.Background(), audioKey)
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create card")
		return
	}

	// Create audio record
	log.Printf("[card] DB card created OK: card_id=%d, now creating audio record...", card.ID)
	audio, err := h.store.CardAudios.Create(card.ID, audioPath, hintText, 0)
	if err != nil {
		log.Printf("[card] CardAudios.Create failed: %v (card_id=%d, audio=%s, hint=%s)", err, card.ID, audioPath, hintText)
		// Clean up: delete card and files
		_ = h.store.Cards.DeleteCard(card.ID)
		_ = h.storage.Delete(context.Background(), coverKey)
		_ = h.storage.Delete(context.Background(), audioKey)
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create audio record")
		return
	}

	// Populate URLs
	card.CoverURL = storage.FileURL(coverPath, "covers")
	audio.AudioURL = storage.FileURL(audioPath, "audio")
	card.Audios = []*model.CardAudio{audio}
	card.AudioCount = 1

	writeJSON(w, http.StatusCreated, card)
}

// PATCH /api/cards/{id}
func (h *CardHandler) UpdateCard(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	cardID, err := parseCardID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid card id")
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

	if card.OwnerID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied")
		return
	}

	var req struct {
		DisplayText *string `json:"display_text"`
		Series      *string `json:"series"`
		Tags        *string `json:"tags"`
		IsShared    *bool   `json:"is_shared"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}

	displayText := card.DisplayText
	if req.DisplayText != nil {
		displayText = *req.DisplayText
	}
	series := card.Series
	if req.Series != nil {
		series = *req.Series
	}
	tags := card.Tags
	if req.Tags != nil {
		tags = *req.Tags
	}
	isShared := card.IsShared
	if req.IsShared != nil {
		isShared = *req.IsShared
	}

	if err := h.store.Cards.Update(cardID, displayText, series, tags, isShared); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update card")
		return
	}

	updated, err := h.store.Cards.GetByID(cardID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get updated card")
		return
	}
	updated.CoverURL = storage.FileURL(updated.CoverPath, "covers")

	writeJSON(w, http.StatusOK, updated)
}

// DELETE /api/cards/{id}
func (h *CardHandler) DeleteCard(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	cardID, err := parseCardID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid card id")
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

	if card.OwnerID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied")
		return
	}

	// Delete audio files
	audios, _ := h.store.CardAudios.ListByCardID(cardID)
	for _, a := range audios {
		if a.AudioPath != "" {
			_ = h.storage.Delete(context.Background(), storage.PathToKey(a.AudioPath))
		}
	}

	// Delete cover file
	if card.CoverPath != "" {
		_ = h.storage.Delete(context.Background(), storage.PathToKey(card.CoverPath))
	}

	if err := h.store.Cards.DeleteCard(cardID); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to delete card")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// POST /api/cards/{id}/audios
func (h *CardHandler) AddAudio(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	cardID, err := parseCardID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid card id")
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

	if card.OwnerID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied")
		return
	}

	if err := r.ParseMultipartForm(25 * 1024 * 1024); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "failed to parse multipart form")
		return
	}

	hintText := r.FormValue("hint_text")

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

	audioFilename := uuid.New().String() + "." + audioExt
	audioKey := "audio/" + audioFilename
	audioContentType := "audio/" + audioExt
	if audioExt == "mp3" {
		audioContentType = "audio/mpeg"
	} else if audioExt == "m4a" {
		audioContentType = "audio/mp4"
	}
	if err := h.storage.Put(context.Background(), audioKey, bytes.NewReader(audioBytes), int64(len(audioBytes)), audioContentType); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to save audio file")
		return
	}
	audioPath := audioKey

	// Determine sort order
	count, _ := h.store.CardAudios.CountByCardID(cardID)

	audio, err := h.store.CardAudios.Create(cardID, audioPath, hintText, count)
	if err != nil {
		_ = h.storage.Delete(context.Background(), audioKey)
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create audio record")
		return
	}

	audio.AudioURL = storage.FileURL(audioPath, "audio")

	writeJSON(w, http.StatusCreated, audio)
}

// DELETE /api/cards/{id}/audios/{audioID}
// PATCH /api/cards/{id}/audios/{audioID}
func (h *CardHandler) UpdateAudio(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	cardID, err := parseCardID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid card id")
		return
	}
	audioIDStr := chi.URLParam(r, "audioID")
	audioID, err := strconv.ParseInt(audioIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid audio id")
		return
	}
	card, err := h.store.Cards.GetByID(cardID)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "card not found")
		return
	}
	if card.OwnerID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied")
		return
	}
	var req struct {
		HintText string `json:"hint_text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid body")
		return
	}
	if err := h.store.CardAudios.UpdateHintText(audioID, req.HintText); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update audio")
		return
	}
	audio, err := h.store.CardAudios.GetByID(audioID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get audio")
		return
	}
	audio.AudioURL = storage.FileURL(audio.AudioPath, "audio")
	writeJSON(w, http.StatusOK, audio)
}

func (h *CardHandler) DeleteAudio(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	cardID, err := parseCardID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid card id")
		return
	}

	audioIDStr := chi.URLParam(r, "audioID")
	audioID, err := strconv.ParseInt(audioIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid audio id")
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

	if card.OwnerID != userID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "access denied")
		return
	}

	// Verify audio belongs to this card
	audio, err := h.store.CardAudios.GetByID(audioID)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "audio not found")
		return
	}
	if audio.CardID != cardID {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "audio not found in this card")
		return
	}

	// Must keep at least 1 audio
	count, _ := h.store.CardAudios.CountByCardID(cardID)
	if count <= 1 {
		writeError(w, http.StatusConflict, "MIN_AUDIO", "card must have at least one audio")
		return
	}

	if err := h.store.CardAudios.Delete(audioID); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to delete audio")
		return
	}

	// Clean up file
	if audio.AudioPath != "" {
		_ = h.storage.Delete(context.Background(), storage.PathToKey(audio.AudioPath))
	}

	w.WriteHeader(http.StatusNoContent)
}

// parseCardID extracts and parses the {id} URL parameter for card routes.
func parseCardID(r *http.Request) (int64, error) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid id: %w", err)
	}
	return id, nil
}
