package store

import (
	"database/sql"
	"fmt"
	"karuta/internal/model"
)

type DeckStore struct {
	db *sql.DB
}

func NewDeckStore(db *sql.DB) *DeckStore {
	return &DeckStore{db: db}
}

func (s *DeckStore) CreateDeck(ownerID int64, name, description string) (*model.Deck, error) {
	res, err := s.db.Exec(
		`INSERT INTO decks (owner_id, name, description) VALUES (?, ?, ?)`,
		ownerID, name, description,
	)
	if err != nil {
		return nil, fmt.Errorf("create deck: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("last insert id: %w", err)
	}
	return s.GetByID(id)
}

func (s *DeckStore) ListByOwner(ownerID int64) ([]*model.Deck, error) {
	rows, err := s.db.Query(
		`SELECT d.id, d.owner_id, d.name, d.description, d.is_public, d.created_at,
		        COUNT(c.id) AS card_count
		 FROM decks d
		 LEFT JOIN cards c ON c.deck_id = d.id
		 WHERE d.owner_id = ?
		 GROUP BY d.id
		 ORDER BY d.created_at DESC`,
		ownerID,
	)
	if err != nil {
		return nil, fmt.Errorf("list decks: %w", err)
	}
	defer rows.Close()

	var decks []*model.Deck
	for rows.Next() {
		d := &model.Deck{}
		if err := rows.Scan(&d.ID, &d.OwnerID, &d.Name, &d.Description, &d.IsPublic, &d.CreatedAt, &d.CardCount); err != nil {
			return nil, fmt.Errorf("scan deck: %w", err)
		}
		decks = append(decks, d)
	}
	return decks, rows.Err()
}

func (s *DeckStore) GetByID(id int64) (*model.Deck, error) {
	row := s.db.QueryRow(
		`SELECT id, owner_id, name, description, is_public, created_at FROM decks WHERE id = ?`,
		id,
	)
	d := &model.Deck{}
	if err := row.Scan(&d.ID, &d.OwnerID, &d.Name, &d.Description, &d.IsPublic, &d.CreatedAt); err != nil {
		return nil, fmt.Errorf("get deck by id: %w", err)
	}
	return d, nil
}

func (s *DeckStore) ListPublic() ([]*model.Deck, error) {
	rows, err := s.db.Query(
		`SELECT d.id, d.owner_id, d.name, d.description, d.is_public, d.created_at,
		        COUNT(c.id) AS card_count,
		        u.username AS owner_name
		 FROM decks d
		 LEFT JOIN cards c ON c.deck_id = d.id
		 LEFT JOIN users u ON u.id = d.owner_id
		 WHERE d.is_public = TRUE
		 GROUP BY d.id
		 ORDER BY d.created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list public decks: %w", err)
	}
	defer rows.Close()
	var decks []*model.Deck
	for rows.Next() {
		d := &model.Deck{}
		if err := rows.Scan(&d.ID, &d.OwnerID, &d.Name, &d.Description, &d.IsPublic, &d.CreatedAt, &d.CardCount, &d.OwnerName); err != nil {
			return nil, fmt.Errorf("scan deck: %w", err)
		}
		decks = append(decks, d)
	}
	return decks, rows.Err()
}

func (s *DeckStore) SetPublic(id int64, isPublic bool) error {
	_, err := s.db.Exec(`UPDATE decks SET is_public = ? WHERE id = ?`, isPublic, id)
	return err
}

func (s *DeckStore) UpdateDeck(id int64, name, description string) (*model.Deck, error) {
	_, err := s.db.Exec(
		`UPDATE decks SET name = ?, description = ? WHERE id = ?`,
		name, description, id,
	)
	if err != nil {
		return nil, fmt.Errorf("update deck: %w", err)
	}
	return s.GetByID(id)
}

func (s *DeckStore) DeleteDeck(id int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// 找出所有关联的 card id
	rows, err := tx.Query(`SELECT id FROM cards WHERE deck_id = ?`, id)
	if err != nil {
		return fmt.Errorf("query cards: %w", err)
	}
	var cardIDs []int64
	for rows.Next() {
		var cid int64
		if err := rows.Scan(&cid); err == nil {
			cardIDs = append(cardIDs, cid)
		}
	}
	rows.Close()

	// 删 game_records（引用这些 card）
	for _, cid := range cardIDs {
		if _, err := tx.Exec(`DELETE FROM game_records WHERE card_id = ?`, cid); err != nil {
			return fmt.Errorf("delete game records: %w", err)
		}
	}

	// 找出所有关联的 room id
	roomRows, err := tx.Query(`SELECT id FROM rooms WHERE deck_id = ?`, id)
	if err != nil {
		return fmt.Errorf("query rooms: %w", err)
	}
	var roomIDs []int64
	for roomRows.Next() {
		var rid int64
		if err := roomRows.Scan(&rid); err == nil {
			roomIDs = append(roomIDs, rid)
		}
	}
	roomRows.Close()

	// 删 room_players 和 rooms
	for _, rid := range roomIDs {
		if _, err := tx.Exec(`DELETE FROM room_players WHERE room_id = ?`, rid); err != nil {
			return fmt.Errorf("delete room_players: %w", err)
		}
	}
	if _, err := tx.Exec(`DELETE FROM rooms WHERE deck_id = ?`, id); err != nil {
		return fmt.Errorf("delete rooms: %w", err)
	}

	// 删 cards（ON DELETE CASCADE 会自动删，但显式删也没问题）
	if _, err := tx.Exec(`DELETE FROM cards WHERE deck_id = ?`, id); err != nil {
		return fmt.Errorf("delete cards: %w", err)
	}

	// 删 deck
	if _, err := tx.Exec(`DELETE FROM decks WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete deck: %w", err)
	}

	return tx.Commit()
}

func (s *DeckStore) CountCards(deckID int64) (int, error) {
	var count int
	row := s.db.QueryRow(`SELECT COUNT(*) FROM cards WHERE deck_id = ?`, deckID)
	if err := row.Scan(&count); err != nil {
		return 0, fmt.Errorf("count cards: %w", err)
	}
	return count, nil
}

// HasActiveRoom returns true if the deck is currently used in a non-ended room.
func (s *DeckStore) HasActiveRoom(deckID int64) (bool, error) {
	var count int
	row := s.db.QueryRow(
		`SELECT COUNT(*) FROM rooms WHERE deck_id = ? AND status != 'end'`,
		deckID,
	)
	if err := row.Scan(&count); err != nil {
		return false, fmt.Errorf("has active room: %w", err)
	}
	return count > 0, nil
}
