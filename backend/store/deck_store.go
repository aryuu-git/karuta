package store

import (
	"database/sql"
	"fmt"
	"karuta/backend/model"
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
		`SELECT d.id, d.owner_id, d.name, d.description, d.is_public, d.share_level, d.edit_level, d.created_at,
		        (SELECT COUNT(*) FROM deck_cards dc WHERE dc.deck_id = d.id) AS card_count,
		        COALESCE((SELECT GROUP_CONCAT(cover) FROM (SELECT c3.cover_path AS cover FROM deck_cards dc3 JOIN cards c3 ON c3.id = dc3.card_id WHERE dc3.deck_id = d.id ORDER BY dc3.sort_order, dc3.card_id LIMIT 4)), '') AS covers,
		        (SELECT COUNT(*) FROM deck_likes dl WHERE dl.deck_id = d.id) AS likes,
		        EXISTS(SELECT 1 FROM deck_likes dl2 WHERE dl2.deck_id = d.id AND dl2.user_id = ?) AS liked_by_me
		 FROM decks d
		 WHERE d.owner_id = ?
		 ORDER BY d.created_at DESC`,
		ownerID, ownerID,
	)
	if err != nil {
		return nil, fmt.Errorf("list decks: %w", err)
	}
	defer rows.Close()

	var decks []*model.Deck
	for rows.Next() {
		d := &model.Deck{}
		var liked int
		if err := rows.Scan(&d.ID, &d.OwnerID, &d.Name, &d.Description, &d.IsPublic, &d.ShareLevel, &d.EditLevel, &d.CreatedAt, &d.CardCount, &d.CoverPaths, &d.Likes, &liked); err != nil {
			return nil, fmt.Errorf("scan deck: %w", err)
		}
		d.LikedByMe = liked != 0
		decks = append(decks, d)
	}
	return decks, rows.Err()
}

func (s *DeckStore) GetByID(id int64) (*model.Deck, error) {
	row := s.db.QueryRow(
		`SELECT id, owner_id, name, description, is_public, share_level, edit_level, created_at FROM decks WHERE id = ?`,
		id,
	)
	d := &model.Deck{}
	if err := row.Scan(&d.ID, &d.OwnerID, &d.Name, &d.Description, &d.IsPublic, &d.ShareLevel, &d.EditLevel, &d.CreatedAt); err != nil {
		return nil, fmt.Errorf("get deck by id: %w", err)
	}
	return d, nil
}

func (s *DeckStore) UpdateShareLevel(id int64, shareLevel, editLevel string) error {
	isPublic := shareLevel != "private"
	_, err := s.db.Exec(
		`UPDATE decks SET share_level = ?, edit_level = ?, is_public = ? WHERE id = ?`,
		shareLevel, editLevel, isPublic, id,
	)
	return err
}

// LikeToggle 牌组点赞开关（与 card_likes 同构，v8）。
func (s *DeckStore) LikeToggle(deckID, userID int64) (bool, error) {
	res, err := s.db.Exec(`INSERT OR IGNORE INTO deck_likes (deck_id, user_id) VALUES (?, ?)`, deckID, userID)
	if err != nil {
		return false, fmt.Errorf("deck like toggle: %w", err)
	}
	if affected, err := res.RowsAffected(); err == nil && affected == 1 {
		return true, nil
	}
	if _, err := s.db.Exec(`DELETE FROM deck_likes WHERE deck_id = ? AND user_id = ?`, deckID, userID); err != nil {
		return false, fmt.Errorf("deck unlike: %w", err)
	}
	return false, nil
}

// LikeCount 牌组点赞数。
func (s *DeckStore) LikeCount(deckID int64) (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM deck_likes WHERE deck_id = ?`, deckID).Scan(&n)
	return n, err
}

// LikedByUser 该用户是否赞过此牌组。
func (s *DeckStore) LikedByUser(deckID, userID int64) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM deck_likes WHERE deck_id = ? AND user_id = ?`, deckID, userID).Scan(&n)
	return n > 0, err
}

func (s *DeckStore) ListPublicByShareLevel(viewerID int64, owner string) ([]*model.Deck, error) {
	query := `SELECT d.id, d.owner_id, d.name, d.description, d.is_public, d.share_level, d.edit_level, d.created_at,
		        (SELECT COUNT(*) FROM deck_cards dc WHERE dc.deck_id = d.id) AS card_count,
		        COALESCE(u.username, '') AS owner_name,
		        COALESCE((SELECT GROUP_CONCAT(cover) FROM (SELECT c3.cover_path AS cover FROM deck_cards dc3 JOIN cards c3 ON c3.id = dc3.card_id WHERE dc3.deck_id = d.id ORDER BY dc3.sort_order, dc3.card_id LIMIT 4)), '') AS covers,
		        (SELECT COUNT(*) FROM deck_likes dl WHERE dl.deck_id = d.id) AS likes,
		        EXISTS(SELECT 1 FROM deck_likes dl2 WHERE dl2.deck_id = d.id AND dl2.user_id = ?) AS liked_by_me
		 FROM decks d
		 LEFT JOIN users u ON u.id = d.owner_id
		 WHERE d.share_level IN ('playable', 'editable')`
	args := []interface{}{viewerID}
	if owner != "" {
		query += ` AND u.username LIKE ?`
		args = append(args, "%"+owner+"%")
	}
	query += ` ORDER BY d.created_at DESC`
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("list public decks by share level: %w", err)
	}
	defer rows.Close()
	var decks []*model.Deck
	for rows.Next() {
		d := &model.Deck{}
		var liked int
		if err := rows.Scan(&d.ID, &d.OwnerID, &d.Name, &d.Description, &d.IsPublic, &d.ShareLevel, &d.EditLevel, &d.CreatedAt, &d.CardCount, &d.OwnerName, &d.CoverPaths, &d.Likes, &liked); err != nil {
			return nil, fmt.Errorf("scan deck: %w", err)
		}
		d.LikedByMe = liked != 0
		decks = append(decks, d)
	}
	return decks, rows.Err()
}

func (s *DeckStore) ListEditable(viewerID int64) ([]*model.Deck, error) {
	rows, err := s.db.Query(
		`SELECT d.id, d.owner_id, d.name, d.description, d.is_public, d.share_level, d.edit_level, d.created_at,
		        (SELECT COUNT(*) FROM deck_cards dc WHERE dc.deck_id = d.id) AS card_count,
		        COALESCE(u.username, '') AS owner_name,
		        COALESCE((SELECT GROUP_CONCAT(cover) FROM (SELECT c3.cover_path AS cover FROM deck_cards dc3 JOIN cards c3 ON c3.id = dc3.card_id WHERE dc3.deck_id = d.id ORDER BY dc3.sort_order, dc3.card_id LIMIT 4)), '') AS covers,
		        (SELECT COUNT(*) FROM deck_likes dl WHERE dl.deck_id = d.id) AS likes,
		        EXISTS(SELECT 1 FROM deck_likes dl2 WHERE dl2.deck_id = d.id AND dl2.user_id = ?) AS liked_by_me
		 FROM decks d
		 LEFT JOIN users u ON u.id = d.owner_id
		 WHERE d.share_level = 'editable'
		 ORDER BY d.created_at DESC`,
		viewerID,
	)
	if err != nil {
		return nil, fmt.Errorf("list editable decks: %w", err)
	}
	defer rows.Close()
	var decks []*model.Deck
	for rows.Next() {
		d := &model.Deck{}
		var liked int
		if err := rows.Scan(&d.ID, &d.OwnerID, &d.Name, &d.Description, &d.IsPublic, &d.ShareLevel, &d.EditLevel, &d.CreatedAt, &d.CardCount, &d.OwnerName, &d.CoverPaths, &d.Likes, &liked); err != nil {
			return nil, fmt.Errorf("scan deck: %w", err)
		}
		d.LikedByMe = liked != 0
		decks = append(decks, d)
	}
	return decks, rows.Err()
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

// HasActiveRoom returns true if the deck is currently used in a live room.
func (s *DeckStore) HasActiveRoom(deckID int64) (bool, error) {
	var count int
	row := s.db.QueryRow(
		`SELECT COUNT(*) FROM rooms WHERE deck_id = ? AND status IN ('waiting', 'reading', 'paused')`,
		deckID,
	)
	if err := row.Scan(&count); err != nil {
		return false, fmt.Errorf("has active room: %w", err)
	}
	return count > 0, nil
}
