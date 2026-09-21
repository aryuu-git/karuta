package store

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// AchievementRecord 成就侧用户状态（与定义注册表 join 后由 handler 输出）。
type AchievementRecord struct {
	Key        string     `json:"key"`
	Progress   int64      `json:"progress"`
	UnlockedAt *time.Time `json:"unlocked_at"`
}

// AchievementStore 成就解锁与进度存储。
// Owner 决策 2026-09-21：成就数据全新起算、事件驱动累计（progress 由评估器
// 逐事件递增），不做历史战绩回填。
type AchievementStore struct {
	db *sql.DB
}

func NewAchievementStore(db *sql.DB) *AchievementStore {
	return &AchievementStore{db: db}
}

// Increment 事件驱动累计：progress += delta；首次越过 target（>0）时解锁。
// 返回本次是否新解锁。幂等性由「解锁只发生一次」保证，重复事件只涨进度。
func (s *AchievementStore) Increment(userID int64, key string, delta, target int64) (bool, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	var progress int64
	var alreadyUnlocked bool
	err = tx.QueryRow(
		`SELECT progress, unlocked_at IS NOT NULL FROM user_achievements WHERE user_id = ? AND achievement_key = ?`,
		userID, key,
	).Scan(&progress, &alreadyUnlocked)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return false, fmt.Errorf("read achievement progress: %w", err)
	}

	newProgress := progress + int64(delta)
	unlockNow := !alreadyUnlocked && target > 0 && newProgress >= target
	if _, err := tx.Exec(
		`INSERT INTO user_achievements (user_id, achievement_key, progress, unlocked_at)
		 VALUES (?, ?, ?, CASE WHEN ? THEN CURRENT_TIMESTAMP END)
		 ON CONFLICT(user_id, achievement_key) DO UPDATE SET
		   progress = excluded.progress,
		   unlocked_at = COALESCE(user_achievements.unlocked_at, CASE WHEN ? THEN CURRENT_TIMESTAMP END)`,
		userID, key, newProgress, unlockNow, unlockNow,
	); err != nil {
		return false, fmt.Errorf("upsert achievement: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return unlockNow, nil
}

// Unlock 事件型直接解锁（Target<=0 的成就，如连胜/三冠王/忠诚）。
// 返回本次是否首次解锁。
func (s *AchievementStore) Unlock(userID int64, key string) (bool, error) {
	res, err := s.db.Exec(
		`INSERT INTO user_achievements (user_id, achievement_key, progress, unlocked_at)
		 VALUES (?, ?, 1, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id, achievement_key) DO UPDATE SET progress = user_achievements.progress + 1
		   WHERE user_achievements.unlocked_at IS NULL`,
		userID, key,
	)
	if err != nil {
		return false, fmt.Errorf("unlock achievement: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected == 1, nil
}

// CountCardAudios 某张卡当前音频数（组曲师成就判定）。
func (s *AchievementStore) CountCardAudios(cardID int64) (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM card_audios WHERE card_id = ?`, cardID).Scan(&n)
	return n, err
}

// Progress 读取某键当前进度（内部模式胜场计数等）。
func (s *AchievementStore) Progress(userID int64, key string) (int64, error) {
	var n int64
	err := s.db.QueryRow(
		`SELECT progress FROM user_achievements WHERE user_id = ? AND achievement_key = ?`,
		userID, key,
	).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return n, err
}

// List 返回用户全部成就状态行。
func (s *AchievementStore) List(userID int64) ([]AchievementRecord, error) {
	rows, err := s.db.Query(
		`SELECT achievement_key, progress, unlocked_at FROM user_achievements WHERE user_id = ?`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []AchievementRecord
	for rows.Next() {
		r := AchievementRecord{}
		if err := rows.Scan(&r.Key, &r.Progress, &r.UnlockedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

// WinStreakTop3 该用户最近三局是否全部第一（按 ended_at 倒序，含历史短窗口，
// 跨局状态不做持久化）。名次用 ROW_NUMBER 唯一化，与统计口径一致。
func (s *AchievementStore) WinStreakTop3(userID int64) (bool, error) {
	var ok bool
	err := s.db.QueryRow(`
		WITH recent AS (
			SELECT rp.room_id
			FROM room_players rp
			JOIN rooms r ON r.id = rp.room_id
			WHERE rp.user_id = ? AND r.status = 'end' AND r.training = FALSE
			  AND r.ended_at IS NOT NULL
			ORDER BY r.ended_at DESC
			LIMIT 3
		),
		ranked AS (
			SELECT rp.room_id, rp.user_id,
			       ROW_NUMBER() OVER (PARTITION BY rp.room_id ORDER BY rp.score DESC, rp.user_id ASC) AS rnk
			FROM room_players rp
			JOIN rooms r2 ON r2.id = rp.room_id
			WHERE rp.role IN ('player', 'duel_p1', 'duel_p2')
			  AND NOT (r2.mode = 'judge' AND rp.user_id = r2.host_id)
		)
		SELECT COUNT(*) = 3 AND SUM(CASE WHEN rnk = 1 THEN 1 ELSE 0 END) = 3
		FROM recent JOIN ranked ON ranked.room_id = recent.room_id AND ranked.user_id = ?
	`, userID, userID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("win streak: %w", err)
	}
	return ok, nil
}

// MaxSameDeckGames 同一副牌组的完赛局数最大值（loyal 用；历史局计入——
// 该成就是忠诚度度量而非事件计数）。
func (s *AchievementStore) MaxSameDeckGames(userID int64) (int64, error) {
	var n int64
	err := s.db.QueryRow(`
		SELECT COALESCE(MAX(cnt), 0) FROM (
			SELECT r.deck_id, COUNT(*) AS cnt
			FROM room_players rp
			JOIN rooms r ON r.id = rp.room_id
			WHERE rp.user_id = ? AND rp.role = 'player'
			  AND r.status = 'end' AND r.training = FALSE
			GROUP BY r.deck_id
		)
	`, userID).Scan(&n)
	return n, err
}
