package store

import (
	"database/sql"
	"fmt"
	"karuta/internal/model"
)

type CardAudioStore struct {
	db *sql.DB
}

func NewCardAudioStore(db *sql.DB) *CardAudioStore {
	return &CardAudioStore{db: db}
}

func (s *CardAudioStore) Create(cardID int64, audioPath, hintText string, sortOrder int) (*model.CardAudio, error) {
	res, err := s.db.Exec(
		`INSERT INTO card_audios (card_id, audio_path, hint_text, sort_order) VALUES (?, ?, ?, ?)`,
		cardID, audioPath, hintText, sortOrder,
	)
	if err != nil {
		return nil, fmt.Errorf("create card_audio: %w (card_id=%d, path=%s)", err, cardID, audioPath)
	}
	id, _ := res.LastInsertId()
	return s.GetByID(id)
}

func (s *CardAudioStore) GetByID(id int64) (*model.CardAudio, error) {
	row := s.db.QueryRow(
		`SELECT id, card_id, audio_path, hint_text, sort_order, created_at FROM card_audios WHERE id = ?`, id,
	)
	a := &model.CardAudio{}
	if err := row.Scan(&a.ID, &a.CardID, &a.AudioPath, &a.HintText, &a.SortOrder, &a.CreatedAt); err != nil {
		return nil, fmt.Errorf("get card_audio: %w", err)
	}
	return a, nil
}

func (s *CardAudioStore) ListByCardID(cardID int64) ([]*model.CardAudio, error) {
	rows, err := s.db.Query(
		`SELECT id, card_id, audio_path, hint_text, sort_order, created_at
		 FROM card_audios WHERE card_id = ? ORDER BY sort_order ASC, id ASC`, cardID,
	)
	if err != nil {
		return nil, fmt.Errorf("list card_audios: %w", err)
	}
	defer rows.Close()

	var audios []*model.CardAudio
	for rows.Next() {
		a := &model.CardAudio{}
		if err := rows.Scan(&a.ID, &a.CardID, &a.AudioPath, &a.HintText, &a.SortOrder, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan card_audio: %w", err)
		}
		audios = append(audios, a)
	}
	return audios, rows.Err()
}

func (s *CardAudioStore) CountByCardID(cardID int64) (int, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM card_audios WHERE card_id = ?`, cardID).Scan(&count)
	return count, err
}

func (s *CardAudioStore) UpdateHintText(id int64, hintText string) error {
	_, err := s.db.Exec(`UPDATE card_audios SET hint_text = ? WHERE id = ?`, hintText, id)
	return err
}

func (s *CardAudioStore) Delete(id int64) error {
	_, err := s.db.Exec(`DELETE FROM card_audios WHERE id = ?`, id)
	return err
}

func (s *CardAudioStore) DeleteByCardID(cardID int64) error {
	_, err := s.db.Exec(`DELETE FROM card_audios WHERE card_id = ?`, cardID)
	return err
}

// GetAudiosForCard returns the audio list for a card.
// Falls back to cards.audio_path for legacy data without card_audios records.
func (s *CardAudioStore) GetAudiosForCard(card *model.Card) []*model.CardAudio {
	audios, err := s.ListByCardID(card.ID)
	if err == nil && len(audios) > 0 {
		return audios
	}
	if card.AudioPath != "" {
		return []*model.CardAudio{{
			ID:       0,
			CardID:   card.ID,
			AudioPath: card.AudioPath,
			HintText: card.HintText,
		}}
	}
	return nil
}
