package store

import (
	"database/sql"
	"errors"
	"fmt"

	"karuta/backend/model"
)

// ErrInvalidInvite 邀请码不存在或已被消费（注册单事务路径）。
var ErrInvalidInvite = errors.New("invalid or already used invite code")

type UserStore struct {
	db *sql.DB
}

func NewUserStore(db *sql.DB) *UserStore {
	return &UserStore{db: db}
}

func (s *UserStore) CreateUser(username, email, hashedPassword string) (*model.User, error) {
	res, err := s.db.Exec(
		`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
		username, email, hashedPassword,
	)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("last insert id: %w", err)
	}
	return s.GetByID(id)
}

func (s *UserStore) CreateGuest(username, email, guestTokenHash string) (*model.User, error) {
	res, err := s.db.Exec(
		`INSERT INTO users (username, email, password, is_guest, guest_token_hash) VALUES (?, ?, '', TRUE, ?)`,
		username, email, guestTokenHash,
	)
	if err != nil {
		return nil, fmt.Errorf("create guest: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("last insert id: %w", err)
	}
	return s.GetByID(id)
}

func (s *UserStore) GetByUsername(username string) (*model.User, error) {
	row := s.db.QueryRow(
		`SELECT id, username, email, password, COALESCE(invited_by,0), COALESCE(disabled,FALSE), COALESCE(is_admin,FALSE), COALESCE(is_guest,FALSE), COALESCE(guest_token_hash,''), COALESCE(avatar_path,''), created_at FROM users WHERE username = ?`,
		username,
	)
	u := &model.User{}
	if err := row.Scan(&u.ID, &u.Username, &u.Email, &u.Password, &u.InvitedBy, &u.Disabled, &u.IsAdmin, &u.IsGuest, &u.GuestTokenHash, &u.AvatarPath, &u.CreatedAt); err != nil {
		return nil, fmt.Errorf("get by username: %w", err)
	}
	return u, nil
}

func (s *UserStore) GetByID(id int64) (*model.User, error) {
	row := s.db.QueryRow(
		`SELECT id, username, email, password, COALESCE(invited_by,0), COALESCE(disabled,FALSE), COALESCE(is_admin,FALSE), COALESCE(is_guest,FALSE), COALESCE(guest_token_hash,''), COALESCE(avatar_path,''), created_at FROM users WHERE id = ?`,
		id,
	)
	u := &model.User{}
	if err := row.Scan(&u.ID, &u.Username, &u.Email, &u.Password, &u.InvitedBy, &u.Disabled, &u.IsAdmin, &u.IsGuest, &u.GuestTokenHash, &u.AvatarPath, &u.CreatedAt); err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	return u, nil
}

// UpdateUsername 改名并同步写邮箱（handler 侧判定 email 是否为派生默认值）。
// 单语句原子更新：email 有 UNIQUE 约束，若改名不迁移派生邮箱，旧昵称的默认
// 邮箱会幽灵占用、该昵称无法再被注册（2026-09-21 修复 #1）。
func (s *UserStore) UpdateUsername(id int64, username, email string) error {
	_, err := s.db.Exec(`UPDATE users SET username = ?, email = ? WHERE id = ?`, username, email, id)
	return err
}

// CreateUserWithInvite 在单事务内完成「消费邀请码 + 建用户 + 记录邀请人」。
// 原实现拆为 CreateUser → UseCode → SetInvitedBy 三步独立写，失败补偿依赖
// DeleteByID，但 invites.used_by 外键会阻止删除，产生幽灵用户与烧毁的邀请码
// （本次修复 #2）。任一步失败整体回滚，不存在半完成状态。
func (s *UserStore) CreateUserWithInvite(username, email, hashedPassword, inviteCode string) (*model.User, int64, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, 0, fmt.Errorf("begin register: %w", err)
	}
	defer tx.Rollback()

	var inviteID, creatorID int64
	if err := tx.QueryRow(
		`SELECT id, creator_id FROM invites WHERE code = ? AND used_by IS NULL`, inviteCode,
	).Scan(&inviteID, &creatorID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, 0, ErrInvalidInvite
		}
		return nil, 0, fmt.Errorf("lookup invite: %w", err)
	}

	res, err := tx.Exec(
		`INSERT INTO users (username, email, password, invited_by) VALUES (?, ?, ?, ?)`,
		username, email, hashedPassword, creatorID,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("create user: %w", err)
	}
	userID, err := res.LastInsertId()
	if err != nil {
		return nil, 0, fmt.Errorf("last insert id: %w", err)
	}

	// 条件更新 + 影响行数校验：并发复用同一邀请码时后到者失败并整体回滚。
	used, err := tx.Exec(`UPDATE invites SET used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_by IS NULL`, userID, inviteID)
	if err != nil {
		return nil, 0, fmt.Errorf("consume invite: %w", err)
	}
	if affected, err := used.RowsAffected(); err != nil || affected != 1 {
		return nil, 0, ErrInvalidInvite
	}

	if err := tx.Commit(); err != nil {
		return nil, 0, fmt.Errorf("commit register: %w", err)
	}
	user, err := s.GetByID(userID)
	return user, creatorID, err
}

func (s *UserStore) ListAll() ([]*model.User, error) {
	rows, err := s.db.Query(`SELECT id, username, email, password, COALESCE(invited_by,0), COALESCE(disabled,FALSE), COALESCE(is_admin,FALSE), COALESCE(is_guest,FALSE), COALESCE(guest_token_hash,''), COALESCE(avatar_path,''), created_at FROM users ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var users []*model.User
	for rows.Next() {
		u := &model.User{}
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.Password, &u.InvitedBy, &u.Disabled, &u.IsAdmin, &u.IsGuest, &u.GuestTokenHash, &u.AvatarPath, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

func (s *UserStore) SetAdmin(id int64, isAdmin bool) error {
	_, err := s.db.Exec(`UPDATE users SET is_admin = ? WHERE id = ?`, isAdmin, id)
	return err
}

func (s *UserStore) UpdateGuestTokenHash(id int64, tokenHash string) error {
	_, err := s.db.Exec(`UPDATE users SET guest_token_hash = ? WHERE id = ? AND is_guest = TRUE`, tokenHash, id)
	return err
}

func (s *UserStore) UpdateAvatar(id int64, avatarPath string) error {
	_, err := s.db.Exec(`UPDATE users SET avatar_path = ? WHERE id = ?`, avatarPath, id)
	return err
}

// UpdatePassword 更新密码哈希（已登录改密 / CLI 重置共用）。
func (s *UserStore) UpdatePassword(id int64, hashedPassword string) error {
	_, err := s.db.Exec(`UPDATE users SET password = ? WHERE id = ?`, hashedPassword, id)
	return err
}

// ErrNotGuest 转正请求的目标不是游客。
var ErrNotGuest = errors.New("account is not a guest")

// UpgradeGuest 游客转正（单事务）：换昵称/邮箱/密码并清除游客标记与恢复码。
// 战绩与成就本就挂 user_id，无需迁移；旧恢复码随之作废。昵称撞车由 UNIQUE
// 约束拦截并原样返回给上层映射 409。
func (s *UserStore) UpgradeGuest(id int64, username, email, hashedPassword string) (*model.User, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var isGuest bool
	if err := tx.QueryRow(`SELECT COALESCE(is_guest, FALSE) FROM users WHERE id = ?`, id).Scan(&isGuest); err != nil {
		return nil, err
	}
	if !isGuest {
		return nil, ErrNotGuest
	}
	if _, err := tx.Exec(
		`UPDATE users SET username = ?, email = ?, password = ?, is_guest = FALSE, guest_token_hash = '' WHERE id = ?`,
		username, email, hashedPassword, id,
	); err != nil {
		return nil, fmt.Errorf("upgrade guest: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.GetByID(id)
}

// IsDisabled 轻量单列查询：供鉴权中间件逐请求校验禁用态（D12-补），
// 将"禁用"从仅挡新登录收紧为任意请求即失权，消除存量 JWT 的 7 天窗口。
func (s *UserStore) IsDisabled(id int64) (bool, error) {
	var disabled bool
	err := s.db.QueryRow(`SELECT COALESCE(disabled, FALSE) FROM users WHERE id = ?`, id).Scan(&disabled)
	if err != nil {
		return false, err
	}
	return disabled, nil
}

func (s *UserStore) CountAvatarPathReferences(avatarPath string) (int, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users WHERE avatar_path = ?`, avatarPath).Scan(&count)
	return count, err
}
