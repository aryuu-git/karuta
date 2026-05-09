package store

import (
	"database/sql"
	"fmt"
	"karuta/internal/model"
	"strings"
)

type DeckCardStore struct {
	db *sql.DB
}

func NewDeckCardStore(db *sql.DB) *DeckCardStore {
	return &DeckCardStore{db: db}
}

func (s *DeckCardStore) Add(deckID, cardID, addedBy int64, sortOrder int) error {
	_, err := s.db.Exec(
		`INSERT OR IGNORE INTO deck_cards (deck_id, card_id, sort_order, added_by) VALUES (?, ?, ?, ?)`,
		deckID, cardID, sortOrder, addedBy,
	)
	return err
}

func (s *DeckCardStore) AddBatch(deckID int64, cardIDs []int64, addedBy int64) error {
	if len(cardIDs) == 0 {
		return nil
	}
	// 获取当前最大 sort_order
	var maxSort int
	_ = s.db.QueryRow(`SELECT COALESCE(MAX(sort_order), -1) FROM deck_cards WHERE deck_id = ?`, deckID).Scan(&maxSort)

	for i, cardID := range cardIDs {
		if err := s.Add(deckID, cardID, addedBy, maxSort+1+i); err != nil {
			return err
		}
	}
	return nil
}

func (s *DeckCardStore) Remove(deckID, cardID int64) error {
	_, err := s.db.Exec(`DELETE FROM deck_cards WHERE deck_id = ? AND card_id = ?`, deckID, cardID)
	return err
}

func (s *DeckCardStore) ListCardsByDeck(deckID int64) ([]*model.Card, error) {
	rows, err := s.db.Query(
		`SELECT c.id, COALESCE(c.owner_id, 0), COALESCE(c.audio_path, ''), COALESCE(c.cover_path, ''),
		        COALESCE(c.hint_text, ''), c.display_text,
		        COALESCE(c.series, ''), COALESCE(c.tags, ''), COALESCE(c.is_shared, 1),
		        c.sort_order, c.created_at,
		        COALESCE(u.username, '') as owner_name
		 FROM cards c
		 JOIN deck_cards dc ON dc.card_id = c.id
		 LEFT JOIN users u ON u.id = c.owner_id
		 WHERE dc.deck_id = ?
		 ORDER BY dc.sort_order ASC, c.id ASC`, deckID,
	)
	if err != nil {
		return nil, fmt.Errorf("list cards by deck: %w", err)
	}
	defer rows.Close()

	var cards []*model.Card
	for rows.Next() {
		c := &model.Card{}
		if err := rows.Scan(&c.ID, &c.OwnerID, &c.AudioPath, &c.CoverPath, &c.HintText, &c.DisplayText,
			&c.Series, &c.Tags, &c.IsShared, &c.SortOrder, &c.CreatedAt, &c.OwnerName); err != nil {
			return nil, fmt.Errorf("scan card: %w", err)
		}
		cards = append(cards, c)
	}
	return cards, rows.Err()
}

func (s *DeckCardStore) CountByDeck(deckID int64) (int, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM deck_cards WHERE deck_id = ?`, deckID).Scan(&count)
	return count, err
}

func (s *DeckCardStore) CloneDeck(srcDeckID, dstDeckID, addedBy int64) error {
	// 先从 deck_cards 复制
	_, err := s.db.Exec(
		`INSERT OR IGNORE INTO deck_cards (deck_id, card_id, sort_order, added_by)
		 SELECT ?, card_id, sort_order, ? FROM deck_cards WHERE deck_id = ?`,
		dstDeckID, addedBy, srcDeckID,
	)
	if err != nil {
		return err
	}
	// fallback: 也从 legacy cards.deck_id 复制（存量数据）
	_, err = s.db.Exec(
		`INSERT OR IGNORE INTO deck_cards (deck_id, card_id, sort_order, added_by)
		 SELECT ?, id, sort_order, ? FROM cards WHERE deck_id = ?
		 AND id NOT IN (SELECT card_id FROM deck_cards WHERE deck_id = ?)`,
		dstDeckID, addedBy, srcDeckID, dstDeckID,
	)
	return err
}

func (s *DeckCardStore) CardInDeck(deckID, cardID int64) (bool, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM deck_cards WHERE deck_id = ? AND card_id = ?`, deckID, cardID).Scan(&count)
	return count > 0, err
}

// ListCardsByDeckFallback tries deck_cards first; if empty, falls back to legacy cards.deck_id.
func (s *DeckCardStore) ListCardsByDeckFallback(deckID int64, legacyDB *sql.DB) ([]*model.Card, error) {
	cards, err := s.ListCardsByDeck(deckID)
	if err != nil {
		return nil, err
	}
	if len(cards) > 0 {
		return cards, nil
	}

	// Fallback: legacy query
	rows, err := legacyDB.Query(
		`SELECT id, COALESCE(owner_id, 0), COALESCE(audio_path, ''), COALESCE(cover_path, ''),
		        COALESCE(hint_text, ''), display_text,
		        COALESCE(series, ''), COALESCE(tags, ''), COALESCE(is_shared, 1),
		        sort_order, created_at
		 FROM cards WHERE deck_id = ? ORDER BY sort_order ASC, id ASC`, deckID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		c := &model.Card{}
		if err := rows.Scan(&c.ID, &c.OwnerID, &c.AudioPath, &c.CoverPath, &c.HintText, &c.DisplayText,
			&c.Series, &c.Tags, &c.IsShared, &c.SortOrder, &c.CreatedAt); err != nil {
			return nil, err
		}
		cards = append(cards, c)
	}
	return cards, rows.Err()
}

// DecksUsingCard returns deck IDs that reference a given card.
func (s *DeckCardStore) DecksUsingCard(cardID int64) ([]int64, error) {
	rows, err := s.db.Query(`SELECT deck_id FROM deck_cards WHERE card_id = ?`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// placeholder helper for building IN clauses
func placeholders(n int) string {
	if n <= 0 {
		return ""
	}
	return strings.Repeat("?,", n-1) + "?"
}
