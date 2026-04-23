package store

import (
	"database/sql"
	"fmt"
	"time"
)

type GameRecordStore struct {
	db *sql.DB
}

func NewGameRecordStore(db *sql.DB) *GameRecordStore {
	return &GameRecordStore{db: db}
}

// GrabbedRecord 表示一张已被抢走（或无人抢）的牌记录
type GrabbedRecord struct {
	CardID   int64  `json:"card_id"`
	WinnerID *int64 `json:"winner_id"`
	Username string `json:"winner_name"`
}

// ListGrabbed 返回指定房间内所有已有结果的牌（无论有没有人抢）
func (s *GameRecordStore) ListGrabbed(roomID int64) ([]*GrabbedRecord, error) {
	rows, err := s.db.Query(`
		SELECT gr.card_id, gr.winner_id, COALESCE(u.username, '') AS username
		FROM game_records gr
		LEFT JOIN users u ON u.id = gr.winner_id
		WHERE gr.room_id = ?
	`, roomID)
	if err != nil {
		return nil, fmt.Errorf("list grabbed: %w", err)
	}
	defer rows.Close()
	var list []*GrabbedRecord
	for rows.Next() {
		r := &GrabbedRecord{}
		if err := rows.Scan(&r.CardID, &r.WinnerID, &r.Username); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

func (s *GameRecordStore) InsertRecord(roomID, cardID int64, winnerID *int64, grabbedAt time.Time) error {
	return s.InsertRecordFull(roomID, cardID, winnerID, grabbedAt, false)
}

func (s *GameRecordStore) InsertRecordFull(roomID, cardID int64, winnerID *int64, grabbedAt time.Time, isLast bool) error {
	_, err := s.db.Exec(
		`INSERT INTO game_records (room_id, card_id, winner_id, grabbed_at, is_last) VALUES (?, ?, ?, ?, ?)`,
		roomID, cardID, winnerID, grabbedAt, isLast,
	)
	if err != nil {
		return fmt.Errorf("insert game record: %w", err)
	}
	return nil
}
