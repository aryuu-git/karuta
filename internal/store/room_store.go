package store

import (
	"database/sql"
	"fmt"
	"karuta/internal/model"
	"karuta/internal/storage"
)

type RoomStore struct {
	db *sql.DB
}

func NewRoomStore(db *sql.DB) *RoomStore {
	return &RoomStore{db: db}
}

func (s *RoomStore) CreateRoom(code string, deckID, hostID int64, intervalSec int, mode string, maskEnabled bool, maskDifficulty string, penaltyWrong, penaltySlow bool, shuffleRemaining int, randomStart bool, randomStartMax int) (*model.Room, error) {
	if mode == "" {
		mode = "auto"
	}
	if maskDifficulty == "" {
		maskDifficulty = "normal"
	}
	res, err := s.db.Exec(
		`INSERT INTO rooms (code, deck_id, host_id, interval_sec, mode, mask_enabled, mask_difficulty, penalty_wrong, penalty_slow, shuffle_remaining, random_start, random_start_max) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		code, deckID, hostID, intervalSec, mode, maskEnabled, maskDifficulty, penaltyWrong, penaltySlow, shuffleRemaining, randomStart, randomStartMax,
	)
	if err != nil {
		return nil, fmt.Errorf("create room: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("last insert id: %w", err)
	}
	return s.GetByID(id)
}

func (s *RoomStore) GetByCode(code string) (*model.Room, error) {
	row := s.db.QueryRow(
		`SELECT id, code, deck_id, host_id, status, interval_sec, mode, mask_enabled, mask_difficulty, mask_seed, penalty_wrong, penalty_slow, shuffle_remaining, random_start, random_start_max, duel_total_cards, duel_flip, duel_requeue, duel_max_rounds, duel_round_time, duel_grab_chances, duel_arrange_time, penalty_last, training, min_play_time, multi_audio_mode, created_at FROM rooms WHERE code = ?`,
		code,
	)
	r := &model.Room{}
	if err := row.Scan(&r.ID, &r.Code, &r.DeckID, &r.HostID, &r.Status, &r.IntervalSec, &r.Mode, &r.MaskEnabled, &r.MaskDifficulty, &r.MaskSeed, &r.PenaltyWrong, &r.PenaltySlow, &r.ShuffleRemaining, &r.RandomStart, &r.RandomStartMax, &r.DuelTotalCards, &r.DuelFlip, &r.DuelRequeue, &r.DuelMaxRounds, &r.DuelRoundTime, &r.DuelGrabChances, &r.DuelArrangeTime, &r.PenaltyLast, &r.Training, &r.MinPlayTime, &r.MultiAudioMode, &r.CreatedAt); err != nil {
		return nil, fmt.Errorf("get room by code: %w", err)
	}
	return r, nil
}

func (s *RoomStore) GetByID(id int64) (*model.Room, error) {
	row := s.db.QueryRow(
		`SELECT id, code, deck_id, host_id, status, interval_sec, mode, mask_enabled, mask_difficulty, mask_seed, penalty_wrong, penalty_slow, shuffle_remaining, random_start, random_start_max, duel_total_cards, duel_flip, duel_requeue, duel_max_rounds, duel_round_time, duel_grab_chances, duel_arrange_time, penalty_last, training, min_play_time, multi_audio_mode, created_at FROM rooms WHERE id = ?`,
		id,
	)
	r := &model.Room{}
	if err := row.Scan(&r.ID, &r.Code, &r.DeckID, &r.HostID, &r.Status, &r.IntervalSec, &r.Mode, &r.MaskEnabled, &r.MaskDifficulty, &r.MaskSeed, &r.PenaltyWrong, &r.PenaltySlow, &r.ShuffleRemaining, &r.RandomStart, &r.RandomStartMax, &r.DuelTotalCards, &r.DuelFlip, &r.DuelRequeue, &r.DuelMaxRounds, &r.DuelRoundTime, &r.DuelGrabChances, &r.DuelArrangeTime, &r.PenaltyLast, &r.Training, &r.MinPlayTime, &r.MultiAudioMode, &r.CreatedAt); err != nil {
		return nil, fmt.Errorf("get room by id: %w", err)
	}
	return r, nil
}

func (s *RoomStore) UpdateStatus(id int64, status string) error {
	_, err := s.db.Exec(`UPDATE rooms SET status = ? WHERE id = ?`, status, id)
	if err != nil {
		return fmt.Errorf("update room status: %w", err)
	}
	return nil
}

func (s *RoomStore) UpdateMaskSeed(id int64, seed int64) error {
	_, err := s.db.Exec(`UPDATE rooms SET mask_seed = ? WHERE id = ?`, seed, id)
	if err != nil {
		return fmt.Errorf("update mask seed: %w", err)
	}
	return nil
}

func (s *RoomStore) ListPlayers(roomID int64) ([]*model.RoomPlayer, error) {
	rows, err := s.db.Query(
		`SELECT rp.room_id, rp.user_id, u.username, COALESCE(u.avatar_path,''), rp.role, rp.score, rp.joined_at
		 FROM room_players rp
		 JOIN users u ON u.id = rp.user_id
		 WHERE rp.room_id = ?
		 ORDER BY rp.joined_at ASC`,
		roomID,
	)
	if err != nil {
		return nil, fmt.Errorf("list players: %w", err)
	}
	defer rows.Close()

	var players []*model.RoomPlayer
	for rows.Next() {
		p := &model.RoomPlayer{}
		var avatarPath string
		if err := rows.Scan(&p.RoomID, &p.UserID, &p.Username, &avatarPath, &p.Role, &p.Score, &p.JoinedAt); err != nil {
			return nil, fmt.Errorf("scan player: %w", err)
		}
		if avatarPath != "" {
			p.AvatarURL = storage.FileURL(avatarPath, "avatars")
		}
		players = append(players, p)
	}
	return players, rows.Err()
}

func (s *RoomStore) AddPlayer(roomID, userID int64, role string) error {
	_, err := s.db.Exec(
		`INSERT OR IGNORE INTO room_players (room_id, user_id, role) VALUES (?, ?, ?)`,
		roomID, userID, role,
	)
	if err != nil {
		return fmt.Errorf("add player: %w", err)
	}
	return nil
}

func (s *RoomStore) UpdateScore(roomID, userID int64, delta int) error {
	_, err := s.db.Exec(
		`UPDATE room_players SET score = score + ? WHERE room_id = ? AND user_id = ?`,
		delta, roomID, userID,
	)
	if err != nil {
		return fmt.Errorf("update score: %w", err)
	}
	return nil
}

func (s *RoomStore) DeductScore(roomID, userID int64, amount int) error {
	_, err := s.db.Exec(
		`UPDATE room_players SET score = score - ? WHERE room_id = ? AND user_id = ?`,
		amount, roomID, userID,
	)
	return err
}

// RoomListItem is a summary of a room for the lobby list.
type RoomListItem struct {
	ID          int64  `json:"id"`
	Code        string `json:"code"`
	Status      string `json:"status"`
	IntervalSec int    `json:"interval_sec"`
	Mode        string `json:"mode"`
	DeckName    string `json:"deck_name"`
	HostName    string `json:"host_name"`
	PlayerCount int    `json:"player_count"`
	Training    bool   `json:"training"`
}

func (s *RoomStore) ListActive() ([]*RoomListItem, error) {
	rows, err := s.db.Query(`
		SELECT r.id, r.code, r.status, r.interval_sec, r.mode,
		       d.name, u.username,
		       (SELECT COUNT(*) FROM room_players rp WHERE rp.room_id = r.id) AS player_count,
		       r.training
		FROM rooms r
		JOIN decks d ON d.id = r.deck_id
		JOIN users u ON u.id = r.host_id
		WHERE r.status IN ('waiting','reading','paused')
		ORDER BY r.created_at DESC
		LIMIT 50
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*RoomListItem
	for rows.Next() {
		item := &RoomListItem{}
		if err := rows.Scan(&item.ID, &item.Code, &item.Status, &item.IntervalSec, &item.Mode,
			&item.DeckName, &item.HostName, &item.PlayerCount, &item.Training); err != nil {
			return nil, err
		}
		list = append(list, item)
	}
	return list, rows.Err()
}

// UserStats 用户历史战绩统计
type UserStats struct {
	TotalGames      int     `json:"total_games"`
	Top3Games       int     `json:"top3_games"`
	Top3Rate        float64 `json:"top3_rate"`
	TotalScore      int     `json:"total_score"`
	BestScore       int     `json:"best_score"`
	FirstGames      int     `json:"first_games"`
	WorldFirstCount int     `json:"world_first_count"` // 世一网次数（抢到最后一张）
}

func (s *RoomStore) GetUserStats(userID int64) (*UserStats, error) {
	// 只统计已结束（end）的对局，且排除裁判模式下的房主（role=player 才算）
	// 每个房间算一场，按 score 排名，统计前三名
	row := s.db.QueryRow(`
		WITH ranked AS (
			SELECT
				rp.room_id,
				rp.score,
				RANK() OVER (PARTITION BY rp.room_id ORDER BY rp.score DESC) AS rnk
			FROM room_players rp
			JOIN rooms r ON r.id = rp.room_id
			WHERE r.status = 'end'
			  AND rp.role = 'player'
		),
		my_games AS (
			SELECT
				rp.room_id,
				rp.score,
				ranked.rnk
			FROM room_players rp
			JOIN ranked ON ranked.room_id = rp.room_id
			JOIN rooms r ON r.id = rp.room_id
			WHERE rp.user_id = ?
			  AND r.status = 'end'
			  AND rp.role = 'player'
		)
		SELECT
			COUNT(*)                          AS total_games,
			SUM(CASE WHEN rnk <= 3 THEN 1 ELSE 0 END) AS top3_games,
			SUM(CASE WHEN rnk = 1 THEN 1 ELSE 0 END)  AS first_games,
			COALESCE(SUM(score), 0)           AS total_score,
			COALESCE(MAX(score), 0)           AS best_score
		FROM my_games
	`, userID)

	stats := &UserStats{}
	if err := row.Scan(&stats.TotalGames, &stats.Top3Games, &stats.FirstGames,
		&stats.TotalScore, &stats.BestScore); err != nil {
		return nil, fmt.Errorf("get user stats: %w", err)
	}
	if stats.TotalGames > 0 {
		stats.Top3Rate = float64(stats.Top3Games) / float64(stats.TotalGames)
	}

	// 世一网次数：is_last=true 且 winner_id=userID 的记录数
	wfRow := s.db.QueryRow(`
		SELECT COUNT(*) FROM game_records
		WHERE winner_id = ? AND is_last = TRUE
	`, userID)
	_ = wfRow.Scan(&stats.WorldFirstCount)

	return stats, nil
}

func (s *RoomStore) GetPlayerRole(roomID, userID int64) string {
	var role string
	row := s.db.QueryRow(`SELECT role FROM room_players WHERE room_id = ? AND user_id = ?`, roomID, userID)
	if err := row.Scan(&role); err != nil {
		return "player"
	}
	return role
}

func (s *RoomStore) UpdateDuelConfig(roomID int64, totalCards int, flip, requeue bool, maxRounds, roundTime, grabChances, arrangeTime int) error {
	_, err := s.db.Exec(
		`UPDATE rooms SET duel_total_cards=?, duel_flip=?, duel_requeue=?, duel_max_rounds=?, duel_round_time=?, duel_grab_chances=?, duel_arrange_time=? WHERE id=?`,
		totalCards, flip, requeue, maxRounds, roundTime, grabChances, arrangeTime, roomID,
	)
	return err
}

func (s *RoomStore) UpdatePenaltyLast(roomID int64, penaltyLast int) error {
	_, err := s.db.Exec(`UPDATE rooms SET penalty_last=? WHERE id=?`, penaltyLast, roomID)
	return err
}

func (s *RoomStore) UpdateTraining(roomID int64, training bool) error {
	_, err := s.db.Exec(`UPDATE rooms SET training=? WHERE id=?`, training, roomID)
	return err
}

func (s *RoomStore) UpdateMinPlayTime(roomID int64, minPlayTime int) error {
	_, err := s.db.Exec(`UPDATE rooms SET min_play_time=? WHERE id=?`, minPlayTime, roomID)
	return err
}

func (s *RoomStore) UpdateMultiAudioMode(roomID int64, mode string) error {
	_, err := s.db.Exec(`UPDATE rooms SET multi_audio_mode=? WHERE id=?`, mode, roomID)
	return err
}

func (s *RoomStore) RemovePlayer(roomID, userID int64) error {
	_, err := s.db.Exec(`DELETE FROM room_players WHERE room_id = ? AND user_id = ?`, roomID, userID)
	return err
}

func (s *RoomStore) SetPlayerRole(roomID, userID int64, role string) error {
	_, err := s.db.Exec(`UPDATE room_players SET role = ? WHERE room_id = ? AND user_id = ?`, role, roomID, userID)
	return err
}

func (s *RoomStore) ClaimSeat(roomID, userID int64, seatRole string) (bool, error) {
	// Atomic: only succeeds if no one else has this seat AND user doesn't already have a seat
	res, err := s.db.Exec(
		`UPDATE room_players SET role = ?
		 WHERE room_id = ? AND user_id = ?
		   AND role NOT IN ('duel_p1', 'duel_p2')
		   AND NOT EXISTS (SELECT 1 FROM room_players WHERE room_id = ? AND role = ?)`,
		seatRole, roomID, userID, roomID, seatRole,
	)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

func (s *RoomStore) IsPlayerInRoom(roomID, userID int64) (bool, error) {
	var count int
	row := s.db.QueryRow(
		`SELECT COUNT(*) FROM room_players WHERE room_id = ? AND user_id = ?`,
		roomID, userID,
	)
	if err := row.Scan(&count); err != nil {
		return false, fmt.Errorf("is player in room: %w", err)
	}
	return count > 0, nil
}
