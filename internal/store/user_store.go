package store

import (
	"database/sql"
	"fmt"
	"karuta/internal/model"
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

func (s *UserStore) GetByUsername(username string) (*model.User, error) {
	row := s.db.QueryRow(
		`SELECT id, username, email, password, created_at FROM users WHERE username = ?`,
		username,
	)
	u := &model.User{}
	if err := row.Scan(&u.ID, &u.Username, &u.Email, &u.Password, &u.CreatedAt); err != nil {
		return nil, fmt.Errorf("get by username: %w", err)
	}
	return u, nil
}

func (s *UserStore) GetByID(id int64) (*model.User, error) {
	row := s.db.QueryRow(
		`SELECT id, username, email, password, created_at FROM users WHERE id = ?`,
		id,
	)
	u := &model.User{}
	if err := row.Scan(&u.ID, &u.Username, &u.Email, &u.Password, &u.CreatedAt); err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	return u, nil
}
