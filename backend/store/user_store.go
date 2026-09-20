package store

import (
	"database/sql"
	"fmt"
	"karuta/backend/model"
)

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

func (s *UserStore) UpdateUsername(id int64, username string) error {
	_, err := s.db.Exec(`UPDATE users SET username = ? WHERE id = ?`, username, id)
	return err
}

func (s *UserStore) SetInvitedBy(id, inviterID int64) error {
	_, err := s.db.Exec(`UPDATE users SET invited_by = ? WHERE id = ?`, inviterID, id)
	return err
}

func (s *UserStore) DeleteByID(id int64) error {
	_, err := s.db.Exec(`DELETE FROM users WHERE id = ?`, id)
	return err
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

func (s *UserStore) CountAvatarPathReferences(avatarPath string) (int, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users WHERE avatar_path = ?`, avatarPath).Scan(&count)
	return count, err
}
