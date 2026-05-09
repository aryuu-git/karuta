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

func (s *CardStore) CreateCard(ownerID int64, coverPath, displayText, series, tags string, isShared bool) (*model.Card, error) {
	res, err := s.db.Exec(
		`INSERT INTO cards (owner_id, cover_path, display_text, series, tags, is_shared, audio_path, hint_text)
		 VALUES (?, ?, ?, ?, ?, ?, '', '')`,
		ownerID, coverPath, displayText, series, tags, isShared,
	)
	if err != nil {
		return nil, fmt.Errorf("create card: %w", err)
	}
	id, _ := res.LastInsertId()
	return s.GetByID(id)
}

// CreateCardLegacy preserves the old interface for migration compatibility.
func (s *CardStore) CreateCardLegacy(deckID int64, audioPath, coverPath, hintText, displayText string, sortOrder int) (*model.Card, error) {
	res, err := s.db.Exec(
		`INSERT INTO cards (deck_id, audio_path, cover_path, hint_text, display_text, sort_order)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		deckID, audioPath, coverPath, hintText, displayText, sortOrder,
	)
	if err != nil {
		return nil, fmt.Errorf("create card legacy: %w", err)
	}
	id, _ := res.LastInsertId()
	return s.GetByID(id)
}

func (s *CardStore) GetByID(id int64) (*model.Card, error) {
	row := s.db.QueryRow(
		`SELECT c.id, COALESCE(c.deck_id, 0), COALESCE(c.owner_id, 0), c.audio_path, c.cover_path,
		        c.hint_text, c.display_text, c.series, c.tags, c.is_shared, c.sort_order, c.created_at,
		        COALESCE(u.username, '') as owner_name
		 FROM cards c LEFT JOIN users u ON u.id = c.owner_id
		 WHERE c.id = ?`, id,
	)
	c := &model.Card{}
	if err := row.Scan(&c.ID, &c.DeckID, &c.OwnerID, &c.AudioPath, &c.CoverPath,
		&c.HintText, &c.DisplayText, &c.Series, &c.Tags, &c.IsShared, &c.SortOrder, &c.CreatedAt,
		&c.OwnerName); err != nil {
		return nil, fmt.Errorf("get card by id: %w", err)
	}
	return c, nil
}

func (s *CardStore) ListByOwner(ownerID int64) ([]*model.Card, error) {
	rows, err := s.db.Query(
		`SELECT c.id, COALESCE(c.owner_id, 0), c.cover_path, c.display_text,
		        c.series, c.tags, c.is_shared, c.created_at,
		        (SELECT COUNT(*) FROM card_audios ca WHERE ca.card_id = c.id) as audio_count
		 FROM cards c WHERE c.owner_id = ?
		 ORDER BY c.created_at DESC`, ownerID,
	)
	if err != nil {
		return nil, fmt.Errorf("list cards by owner: %w", err)
	}
	defer rows.Close()
	return s.scanCardList(rows)
}

func (s *CardStore) ListPublic(search, series, tag string, limit, offset int) ([]*model.Card, error) {
	query := `SELECT c.id, COALESCE(c.owner_id, 0), c.cover_path, c.display_text,
	                 c.series, c.tags, c.is_shared, c.created_at,
	                 (SELECT COUNT(*) FROM card_audios ca WHERE ca.card_id = c.id) as audio_count,
	                 COALESCE(u.username, '') as owner_name
	          FROM cards c LEFT JOIN users u ON u.id = c.owner_id
	          WHERE c.is_shared = TRUE`
	args := []interface{}{}

	if search != "" {
		query += ` AND (c.display_text LIKE ? OR c.series LIKE ?)`
		args = append(args, "%"+search+"%", "%"+search+"%")
	}
	if series != "" {
		query += ` AND c.series = ?`
		args = append(args, series)
	}
	if tag != "" {
		query += ` AND c.tags LIKE ?`
		args = append(args, "%"+tag+"%")
	}

	query += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("list public cards: %w", err)
	}
	defer rows.Close()
	return s.scanCardListWithOwner(rows)
}

func (s *CardStore) Update(id int64, displayText, series, tags string, isShared bool) error {
	_, err := s.db.Exec(
		`UPDATE cards SET display_text = ?, series = ?, tags = ?, is_shared = ? WHERE id = ?`,
		displayText, series, tags, isShared, id,
	)
	return err
}

func (s *CardStore) UpdateCover(id int64, coverPath string) error {
	_, err := s.db.Exec(`UPDATE cards SET cover_path = ? WHERE id = ?`, coverPath, id)
	return err
}

func (s *CardStore) DeleteCard(id int64) error {
	if _, err := s.db.Exec(`DELETE FROM game_records WHERE card_id = ?`, id); err != nil {
		return fmt.Errorf("delete game records: %w", err)
	}
	if _, err := s.db.Exec(`DELETE FROM deck_cards WHERE card_id = ?`, id); err != nil {
		return fmt.Errorf("delete deck_cards: %w", err)
	}
	if _, err := s.db.Exec(`DELETE FROM card_audios WHERE card_id = ?`, id); err != nil {
		return fmt.Errorf("delete card_audios: %w", err)
	}
	_, err := s.db.Exec(`DELETE FROM cards WHERE id = ?`, id)
	return err
}

// ListByDeck is a legacy helper used by existing code paths.
func (s *CardStore) ListByDeck(deckID int64) ([]*model.Card, error) {
	rows, err := s.db.Query(
		`SELECT id, COALESCE(deck_id, 0), COALESCE(owner_id, 0), audio_path, cover_path, hint_text, display_text,
		        series, tags, is_shared, sort_order, created_at
		 FROM cards WHERE deck_id = ? ORDER BY sort_order ASC, id ASC`, deckID,
	)
	if err != nil {
		return nil, fmt.Errorf("list cards by deck: %w", err)
	}
	defer rows.Close()

	var cards []*model.Card
	for rows.Next() {
		c := &model.Card{}
		if err := rows.Scan(&c.ID, &c.DeckID, &c.OwnerID, &c.AudioPath, &c.CoverPath, &c.HintText, &c.DisplayText,
			&c.Series, &c.Tags, &c.IsShared, &c.SortOrder, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan card: %w", err)
		}
		cards = append(cards, c)
	}
	return cards, rows.Err()
}

func (s *CardStore) scanCardList(rows *sql.Rows) ([]*model.Card, error) {
	var cards []*model.Card
	for rows.Next() {
		c := &model.Card{}
		if err := rows.Scan(&c.ID, &c.OwnerID, &c.CoverPath, &c.DisplayText,
			&c.Series, &c.Tags, &c.IsShared, &c.CreatedAt, &c.AudioCount); err != nil {
			return nil, fmt.Errorf("scan card: %w", err)
		}
		cards = append(cards, c)
	}
	return cards, rows.Err()
}

func (s *CardStore) scanCardListWithOwner(rows *sql.Rows) ([]*model.Card, error) {
	var cards []*model.Card
	for rows.Next() {
		c := &model.Card{}
		if err := rows.Scan(&c.ID, &c.OwnerID, &c.CoverPath, &c.DisplayText,
			&c.Series, &c.Tags, &c.IsShared, &c.CreatedAt, &c.AudioCount, &c.OwnerName); err != nil {
			return nil, fmt.Errorf("scan card: %w", err)
		}
		cards = append(cards, c)
	}
	return cards, rows.Err()
}
