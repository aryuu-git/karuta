package store

import (
	"database/sql"
	"fmt"
	"karuta/backend/model"
	"karuta/backend/storage"
	"time"
)

type RoomStore struct {
	db *sql.DB
}

func NewRoomStore(db *sql.DB) *RoomStore {
	return &RoomStore{db: db}
}

// CountByStatus 返回各状态房间数（供 /metrics 端点）。
func (s *RoomStore) CountByStatus() (map[string]int64, error) {
	rows, err := s.db.Query(`SELECT status, COUNT(*) FROM rooms GROUP BY status`)
	if err != nil {
		return nil, fmt.Errorf("count rooms by status: %w", err)
	}
	defer rows.Close()
	out := make(map[string]int64)
	for rows.Next() {
		var status string
		var n int64
		if err := rows.Scan(&status, &n); err != nil {
			return nil, fmt.Errorf("scan room status count: %w", err)
		}
		out[status] = n
	}
	return out, rows.Err()
}

func (s *RoomStore) CreateRoom(code string, deckID, hostID int64, intervalSec int, mode string, maskEnabled bool, maskDifficulty string, penaltyWrong, penaltySlow bool, shuffleRemaining int, randomStart bool, randomStartMax int, isPrivate bool, maxPlayers int) (*model.Room, error) {
	if mode == "" {
		mode = "auto"
	}
	if maskDifficulty == "" {
		maskDifficulty = "normal"
	}
	if maxPlayers <= 0 || maxPlayers > 32 {
		maxPlayers = 16
	}
	res, err := s.db.Exec(
		`INSERT INTO rooms (code, deck_id, host_id, interval_sec, mode, mask_enabled, mask_difficulty, penalty_wrong, penalty_slow, shuffle_remaining, random_start, random_start_max, is_private, max_players) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		code, deckID, hostID, intervalSec, mode, maskEnabled, maskDifficulty, penaltyWrong, penaltySlow, shuffleRemaining, randomStart, randomStartMax, isPrivate, maxPlayers,
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
		`SELECT id, code, deck_id, host_id, status, interval_sec, mode, mask_enabled, mask_difficulty, mask_seed, penalty_wrong, penalty_slow, shuffle_remaining, random_start, random_start_max, duel_total_cards, duel_flip, duel_requeue, duel_max_rounds, duel_round_time, duel_grab_chances, duel_arrange_time, penalty_last, training, min_play_time, multi_audio_mode, created_at, COALESCE(is_private, FALSE), COALESCE(max_players, 16) FROM rooms WHERE code = ?`,
		code,
	)
	r := &model.Room{}
	if err := row.Scan(&r.ID, &r.Code, &r.DeckID, &r.HostID, &r.Status, &r.IntervalSec, &r.Mode, &r.MaskEnabled, &r.MaskDifficulty, &r.MaskSeed, &r.PenaltyWrong, &r.PenaltySlow, &r.ShuffleRemaining, &r.RandomStart, &r.RandomStartMax, &r.DuelTotalCards, &r.DuelFlip, &r.DuelRequeue, &r.DuelMaxRounds, &r.DuelRoundTime, &r.DuelGrabChances, &r.DuelArrangeTime, &r.PenaltyLast, &r.Training, &r.MinPlayTime, &r.MultiAudioMode, &r.CreatedAt, &r.IsPrivate, &r.MaxPlayers); err != nil {
		return nil, fmt.Errorf("get room by code: %w", err)
	}
	return r, nil
}

func (s *RoomStore) GetByID(id int64) (*model.Room, error) {
	row := s.db.QueryRow(
		`SELECT id, code, deck_id, host_id, status, interval_sec, mode, mask_enabled, mask_difficulty, mask_seed, penalty_wrong, penalty_slow, shuffle_remaining, random_start, random_start_max, duel_total_cards, duel_flip, duel_requeue, duel_max_rounds, duel_round_time, duel_grab_chances, duel_arrange_time, penalty_last, training, min_play_time, multi_audio_mode, created_at, COALESCE(is_private, FALSE), COALESCE(max_players, 16) FROM rooms WHERE id = ?`,
		id,
	)
	r := &model.Room{}
	if err := row.Scan(&r.ID, &r.Code, &r.DeckID, &r.HostID, &r.Status, &r.IntervalSec, &r.Mode, &r.MaskEnabled, &r.MaskDifficulty, &r.MaskSeed, &r.PenaltyWrong, &r.PenaltySlow, &r.ShuffleRemaining, &r.RandomStart, &r.RandomStartMax, &r.DuelTotalCards, &r.DuelFlip, &r.DuelRequeue, &r.DuelMaxRounds, &r.DuelRoundTime, &r.DuelGrabChances, &r.DuelArrangeTime, &r.PenaltyLast, &r.Training, &r.MinPlayTime, &r.MultiAudioMode, &r.CreatedAt, &r.IsPrivate, &r.MaxPlayers); err != nil {
		return nil, fmt.Errorf("get room by id: %w", err)
	}
	return r, nil
}

// UpdateStatus 更新房间状态；转入 end 时同时落 ended_at（v5 新列，
// 连胜/夜猫等跨局成就与统计的时间维度依赖它）。
func (s *RoomStore) UpdateStatus(id int64, status string) error {
	if status == "end" {
		_, err := s.db.Exec(`UPDATE rooms SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?`, status, id)
		if err != nil {
			return fmt.Errorf("update room status: %w", err)
		}
		return nil
	}
	_, err := s.db.Exec(`UPDATE rooms SET status = ? WHERE id = ?`, status, id)
	if err != nil {
		return fmt.Errorf("update room status: %w", err)
	}
	return nil
}

func (s *RoomStore) TransitionStatus(id int64, from, to string) (bool, error) {
	result, err := s.db.Exec(`UPDATE rooms SET status = ? WHERE id = ? AND status = ?`, to, id, from)
	if err != nil {
		return false, fmt.Errorf("transition room status: %w", err)
	}
	affected, err := result.RowsAffected()
	return affected == 1, err
}

// AbortInterrupted marks games that cannot be reconstructed after a process
// restart. Waiting rooms remain joinable; completed games and statistics are
// not affected.
func (s *RoomStore) AbortInterrupted() (int64, error) {
	result, err := s.db.Exec(`UPDATE rooms SET status = 'aborted' WHERE status IN ('reading', 'paused')`)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
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

// AddPlayerWithCap 带人数上限的入座（单 SQL 原子判定，回顾修复：handler 层
// 「查数再插」在满员边界有并发窗口，可超员 1）。返回 joined=false 表示满员
// 且非在房成员；已在房成员（重连）幂等成功。maxPlayers<=0 表示不限。
func (s *RoomStore) AddPlayerWithCap(roomID, userID int64, role string, maxPlayers int) (bool, error) {
	if maxPlayers <= 0 {
		return true, s.AddPlayer(roomID, userID, role)
	}
	res, err := s.db.Exec(
		`INSERT OR IGNORE INTO room_players (room_id, user_id, role)
		 SELECT ?, ?, ?
		 WHERE (SELECT COUNT(*) FROM room_players WHERE room_id = ? AND role IN ('player','duel_p1','duel_p2')) < ?`,
		roomID, userID, role, roomID, maxPlayers,
	)
	if err != nil {
		return false, err
	}
	if affected, err := res.RowsAffected(); err == nil && affected == 1 {
		return true, nil
	}
	// 未插入：满员或已在房（OR IGNORE）——在房成员幂等成功
	inRoom, err := s.IsPlayerInRoom(roomID, userID)
	if err != nil {
		return false, err
	}
	return inRoom, nil
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
	// IsPrivate 仅管理员视角的列表会带出私密房（普通用户查询直接过滤）
	IsPrivate   bool   `json:"is_private"`
}

// ListActive 活跃房间列表。私密房对普通用户不可见；管理员（viewerAdmin）
// 可见并带 is_private 标记（2026-09-21 增长批次：私密房 + 管理员可见）。
func (s *RoomStore) ListActive(viewerAdmin bool) ([]*RoomListItem, error) {
	rows, err := s.db.Query(`
		SELECT r.id, r.code, r.status, r.interval_sec, r.mode,
		       d.name, u.username,
		       (SELECT COUNT(*) FROM room_players rp WHERE rp.room_id = r.id) AS player_count,
		       r.training, COALESCE(r.is_private, FALSE)
		FROM rooms r
		JOIN decks d ON d.id = r.deck_id
		JOIN users u ON u.id = r.host_id
		WHERE r.status IN ('waiting','reading','paused')
		  AND (COALESCE(r.is_private, FALSE) = FALSE OR ?)
		ORDER BY r.created_at DESC
		LIMIT 50`, viewerAdmin,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*RoomListItem
	for rows.Next() {
		item := &RoomListItem{}
		if err := rows.Scan(&item.ID, &item.Code, &item.Status, &item.IntervalSec, &item.Mode,
			&item.DeckName, &item.HostName, &item.PlayerCount, &item.Training, &item.IsPrivate); err != nil {
			return nil, err
		}
		list = append(list, item)
	}
	return list, rows.Err()
}

// UserGame 最近对局条目（历史对局页）。
type UserGame struct {
	RoomID      int64      `json:"room_id"`
	Mode        string     `json:"mode"`
	DeckName    string     `json:"deck_name"`
	Score       int        `json:"score"`
	Rank        int        `json:"rank"`
	PlayerCount int        `json:"player_count"`
	EndedAt     *time.Time `json:"ended_at"`
}

// UserGames 最近对局（与统计同口径：ROW_NUMBER 名次、排除 training、
// judge 剔除裁判；ended_at 缺失的旧局回退 created_at 排序）。
func (s *RoomStore) UserGames(userID int64, limit, offset int) ([]UserGame, error) {
	rows, err := s.db.Query(`
		WITH ranked AS (
			SELECT rp.room_id, rp.user_id, rp.score,
			       ROW_NUMBER() OVER (PARTITION BY rp.room_id ORDER BY rp.score DESC, rp.user_id ASC) AS rnk,
			       (SELECT COUNT(*) FROM room_players rp2 WHERE rp2.room_id = rp.room_id AND rp2.role IN ('player','duel_p1','duel_p2')) AS player_count
			FROM room_players rp
			JOIN rooms r ON r.id = rp.room_id
			WHERE rp.role IN ('player', 'duel_p1', 'duel_p2')
			  AND r.training = FALSE
			  AND NOT (r.mode = 'judge' AND rp.user_id = r.host_id)
		)
		SELECT ranked.room_id, r.mode, COALESCE(d.name, ''), ranked.score, ranked.rnk, ranked.player_count, r.ended_at
		FROM ranked
		JOIN rooms r ON r.id = ranked.room_id
		LEFT JOIN decks d ON d.id = r.deck_id
		WHERE ranked.user_id = ? AND r.status = 'end'
		ORDER BY COALESCE(r.ended_at, r.created_at) DESC
		LIMIT ? OFFSET ?
	`, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("user games: %w", err)
	}
	defer rows.Close()
	var list []UserGame
	for rows.Next() {
		g := UserGame{}
		if err := rows.Scan(&g.RoomID, &g.Mode, &g.DeckName, &g.Score, &g.Rank, &g.PlayerCount, &g.EndedAt); err != nil {
			return nil, err
		}
		list = append(list, g)
	}
	return list, rows.Err()
}

// RankingEntry 排行榜条目。
type RankingEntry struct {
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
	Value    int64  `json:"value"`
}

// Rankings 全站排行（kind=score|wins|world_first；与统计同口径，排除
// training 与 judge 裁判行；游客同榜——昵称本就公开）。
func (s *RoomStore) Rankings(kind string, limit int) ([]RankingEntry, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	var query string
	switch kind {
	case "wins":
		query = `
			WITH ranked AS (
				SELECT rp.room_id, rp.user_id, rp.score,
				       ROW_NUMBER() OVER (PARTITION BY rp.room_id ORDER BY rp.score DESC, rp.user_id ASC) AS rnk
				FROM room_players rp
				JOIN rooms r ON r.id = rp.room_id
				WHERE rp.role IN ('player','duel_p1','duel_p2') AND r.status = 'end' AND r.training = FALSE
				  AND NOT (r.mode = 'judge' AND rp.user_id = r.host_id)
			)
			SELECT u.id, u.username, COUNT(*) AS value
			FROM ranked JOIN users u ON u.id = ranked.user_id
			WHERE ranked.rnk = 1
			GROUP BY u.id, u.username
			ORDER BY value DESC, u.id ASC LIMIT ?`
	case "world_first":
		// 口径对齐（回顾修复）：排除练习局——game_records 对 training 局同样落流水，
		// 原查询未过滤导致世一网榜与 score/wins 榜口径漂移
		query = `
			SELECT u.id, u.username, COUNT(*) AS value
			FROM game_records gr JOIN users u ON u.id = gr.winner_id
			JOIN rooms r ON r.id = gr.room_id
			WHERE gr.is_last = TRUE AND r.training = FALSE
			GROUP BY u.id, u.username
			ORDER BY value DESC, u.id ASC LIMIT ?`
	default: // score
		query = `
			SELECT u.id, u.username, SUM(rp.score) AS value
			FROM room_players rp
			JOIN rooms r ON r.id = rp.room_id
			JOIN users u ON u.id = rp.user_id
			WHERE rp.role IN ('player','duel_p1','duel_p2') AND r.status = 'end' AND r.training = FALSE
			  AND NOT (r.mode = 'judge' AND rp.user_id = r.host_id)
			GROUP BY u.id, u.username
			ORDER BY value DESC, u.id ASC LIMIT ?`
	}
	rows, err := s.db.Query(query, limit)
	if err != nil {
		return nil, fmt.Errorf("rankings: %w", err)
	}
	defer rows.Close()
	var list []RankingEntry
	for rows.Next() {
		e := RankingEntry{}
		if err := rows.Scan(&e.UserID, &e.Username, &e.Value); err != nil {
			return nil, err
		}
		list = append(list, e)
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
	// 口径修复（2026-09-21）：ROW_NUMBER 唯一名次（原 RANK() 在同分/duel 0 分
	// 平局时全员并列第一，灌水「第一名次数」）；排除 training 练习局；
	// judge 模式排除裁判（房主）的参赛行。
	row := s.db.QueryRow(`
		WITH ranked AS (
			SELECT
				rp.room_id,
				rp.user_id,
				rp.score,
				ROW_NUMBER() OVER (PARTITION BY rp.room_id ORDER BY rp.score DESC, rp.user_id ASC) AS rnk
			FROM room_players rp
			JOIN rooms r ON r.id = rp.room_id
			WHERE r.status = 'end'
			  AND rp.role IN ('player', 'duel_p1', 'duel_p2')
			  AND r.training = FALSE
			  AND NOT (r.mode = 'judge' AND rp.user_id = r.host_id)
		),
		my_games AS (
			SELECT
				ranked.room_id,
				ranked.score,
				ranked.rnk
			FROM ranked
			WHERE ranked.user_id = ?
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

	// 世一网次数：is_last=true 且 winner_id=userID 的记录数（排除练习局，
	// 与排行/统计口径一致——回顾修复：game_records 对 training 局同样落流水）
	wfRow := s.db.QueryRow(`
		SELECT COUNT(*) FROM game_records gr
		JOIN rooms r ON r.id = gr.room_id
		WHERE gr.winner_id = ? AND gr.is_last = TRUE AND r.training = FALSE
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

// RematchAndMigrate 单事务完成 rematch：复制源房间全量配置列开新房 + 迁入玩家
// （reinvite=true 原班人马 role=player/score=0；false 仅房主入座）。
// 原两步独立写（RematchRoom + RematchCopyPlayers）第二步失败会留下无玩家
// 空房（2026-09-21 修复合并）。初始值与建房流程一致：status='waiting'、
// mask_seed=0（开局 CAS 后才生成）、created_at 走列默认；host_id 沿用源房间。
// 源房间不存在时返回 sql.ErrNoRows。
func (s *RoomStore) RematchAndMigrate(sourceRoomID int64, newCode string, reinvite bool) (*model.Room, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	res, err := tx.Exec(
		`INSERT INTO rooms (code, deck_id, host_id, status, interval_sec, mode, mask_enabled, mask_difficulty, mask_seed, penalty_wrong, penalty_slow, shuffle_remaining, random_start, random_start_max, duel_total_cards, duel_flip, duel_requeue, duel_max_rounds, duel_round_time, duel_grab_chances, duel_arrange_time, penalty_last, training, min_play_time, multi_audio_mode, is_private, max_players)
		 SELECT ?, deck_id, host_id, 'waiting', interval_sec, mode, mask_enabled, mask_difficulty, 0, penalty_wrong, penalty_slow, shuffle_remaining, random_start, random_start_max, duel_total_cards, duel_flip, duel_requeue, duel_max_rounds, duel_round_time, duel_grab_chances, duel_arrange_time, penalty_last, training, min_play_time, multi_audio_mode, COALESCE(is_private, FALSE), COALESCE(max_players, 16)
		 FROM rooms WHERE id = ?`,
		newCode, sourceRoomID,
	)
	if err != nil {
		return nil, fmt.Errorf("rematch room: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("rematch room rows affected: %w", err)
	}
	if affected == 0 {
		return nil, fmt.Errorf("rematch room: %w", sql.ErrNoRows)
	}
	newID, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("last insert id: %w", err)
	}

	if reinvite {
		if _, err := tx.Exec(
			`INSERT OR IGNORE INTO room_players (room_id, user_id, role, score)
			 SELECT ?, user_id, 'player', 0 FROM room_players WHERE room_id = ?`,
			newID, sourceRoomID,
		); err != nil {
			return nil, fmt.Errorf("rematch copy players: %w", err)
		}
	} else {
		// 不邀原班时仍保证房主在房内（与建房流程的房主自动入座一致）
		var hostID int64
		if err := tx.QueryRow(`SELECT host_id FROM rooms WHERE id = ?`, sourceRoomID).Scan(&hostID); err != nil {
			return nil, fmt.Errorf("rematch host lookup: %w", err)
		}
		if _, err := tx.Exec(
			`INSERT OR IGNORE INTO room_players (room_id, user_id, role) VALUES (?, ?, 'player')`,
			newID, hostID,
		); err != nil {
			return nil, fmt.Errorf("rematch add host: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetByID(newID)
}

// Delete 物理删除房间行。仅用于建房补偿：房主入座失败时清掉刚建的孤儿房
// （彼时房间尚无其他玩家/战绩，外键无阻塞）。
func (s *RoomStore) Delete(id int64) error {
	_, err := s.db.Exec(`DELETE FROM rooms WHERE id = ?`, id)
	return err
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
