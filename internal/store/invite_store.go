package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"
)

type InviteStore struct {
	db *sql.DB
}

func NewInviteStore(db *sql.DB) *InviteStore {
	return &InviteStore{db: db}
}

type Invite struct {
	ID        int64      `json:"id"`
	Code      string     `json:"code"`
	CreatorID int64      `json:"creator_id"`
	UsedBy    *int64     `json:"used_by,omitempty"`
	UsedAt    *time.Time `json:"used_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

func (s *InviteStore) Generate(creatorID int64) (*Invite, error) {
	code := generateInviteCode()
	res, err := s.db.Exec(
		`INSERT INTO invites (code, creator_id) VALUES (?, ?)`,
		code, creatorID,
	)
	if err != nil {
		return nil, fmt.Errorf("create invite: %w", err)
	}
	id, _ := res.LastInsertId()
	return &Invite{ID: id, Code: code, CreatorID: creatorID, CreatedAt: time.Now()}, nil
}

func (s *InviteStore) UseCode(code string, userID int64) (creatorID int64, err error) {
	row := s.db.QueryRow(`SELECT id, creator_id FROM invites WHERE code = ? AND used_by IS NULL`, code)
	var inviteID int64
	if err := row.Scan(&inviteID, &creatorID); err != nil {
		return 0, fmt.Errorf("invalid or used invite code")
	}
	_, err = s.db.Exec(`UPDATE invites SET used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?`, userID, inviteID)
	return creatorID, err
}

func (s *InviteStore) ListByCreator(creatorID int64) ([]*Invite, error) {
	rows, err := s.db.Query(
		`SELECT id, code, creator_id, used_by, used_at, created_at FROM invites WHERE creator_id = ? ORDER BY created_at DESC`,
		creatorID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []*Invite
	for rows.Next() {
		inv := &Invite{}
		if err := rows.Scan(&inv.ID, &inv.Code, &inv.CreatorID, &inv.UsedBy, &inv.UsedAt, &inv.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, inv)
	}
	return list, nil
}

func generateInviteCode() string {
	b := make([]byte, 4)
	rand.Read(b)
	return hex.EncodeToString(b)
}
