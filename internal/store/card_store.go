package store

import (
	"database/sql"
	"fmt"
	"karuta/internal/model"
)

type CardStore struct {
	db *sql.DB
}

func NewCardStore(db *sql.DB) *CardStore {
	return &CardStore{db: db}
}

func (s *CardStore) CreateCard(deckID int64, audioPath, coverPath, hintText, displayText string, sortOrder int) (*model.Card, error) {
	res, err := s.db.Exec(
		`INSERT INTO cards (deck_id, audio_path, cover_path, hint_text, display_text, sort_order)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		deckID, audioPath, coverPath, hintText, displayText, sortOrder,
	)
	if err != nil {
		return nil, fmt.Errorf("create card: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("last insert id: %w", err)
	}
	return s.GetByID(id)
}

func (s *CardStore) ListByDeck(deckID int64) ([]*model.Card, error) {
	rows, err := s.db.Query(
		`SELECT id, deck_id, audio_path, cover_path, hint_text, display_text, sort_order, created_at
		 FROM cards WHERE deck_id = ? ORDER BY sort_order ASC, id ASC`,
		deckID,
	)
	if err != nil {
		return nil, fmt.Errorf("list cards: %w", err)
	}
	defer rows.Close()

	var cards []*model.Card
	for rows.Next() {
		c := &model.Card{}
		if err := rows.Scan(&c.ID, &c.DeckID, &c.AudioPath, &c.CoverPath, &c.HintText, &c.DisplayText, &c.SortOrder, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan card: %w", err)
		}
		cards = append(cards, c)
	}
	return cards, rows.Err()
}

func (s *CardStore) GetByID(id int64) (*model.Card, error) {
	row := s.db.QueryRow(
		`SELECT id, deck_id, audio_path, cover_path, hint_text, display_text, sort_order, created_at
		 FROM cards WHERE id = ?`,
		id,
	)
	c := &model.Card{}
	if err := row.Scan(&c.ID, &c.DeckID, &c.AudioPath, &c.CoverPath, &c.HintText, &c.DisplayText, &c.SortOrder, &c.CreatedAt); err != nil {
		return nil, fmt.Errorf("get card by id: %w", err)
	}
	return c, nil
}

func (s *CardStore) DeleteCard(id int64) error {
	// 先删关联的 game_records（外键约束）
	if _, err := s.db.Exec(`DELETE FROM game_records WHERE card_id = ?`, id); err != nil {
		return fmt.Errorf("delete game records: %w", err)
	}
	_, err := s.db.Exec(`DELETE FROM cards WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete card: %w", err)
	}
	return nil
}
