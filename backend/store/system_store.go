package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
)

var ErrLastAdmin = errors.New("cannot remove final administrator")

type SystemStore struct {
	db *sql.DB
}

func NewSystemStore(db *sql.DB) *SystemStore {
	return &SystemStore{db: db}
}

func (s *SystemStore) InviteRequired(fallback bool) (bool, error) {
	var value string
	err := s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'invite_required'`).Scan(&value)
	if err == sql.ErrNoRows {
		return fallback, nil
	}
	if err != nil {
		return false, err
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("parse invite_required: %w", err)
	}
	return parsed, nil
}

func (s *SystemStore) SetUserDisabled(actorID, targetID int64, disabled bool, sourceIP string) error {
	return s.userChangeWithAudit(actorID, targetID, "user.disabled_changed", "disabled", disabled, sourceIP,
		`UPDATE users SET disabled = ? WHERE id = ?`)
}

func (s *SystemStore) SetUserAdmin(actorID, targetID int64, enabled bool, sourceIP string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var currentlyAdmin bool
	if err := tx.QueryRow(`SELECT is_admin FROM users WHERE id = ?`, targetID).Scan(&currentlyAdmin); err != nil {
		return err
	}
	if currentlyAdmin && !enabled {
		var adminCount int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM users WHERE is_admin = TRUE AND disabled = FALSE`).Scan(&adminCount); err != nil {
			return err
		}
		if adminCount <= 1 {
			return ErrLastAdmin
		}
	}
	if _, err := tx.Exec(`UPDATE users SET is_admin = ? WHERE id = ?`, enabled, targetID); err != nil {
		return err
	}
	details, _ := json.Marshal(map[string]bool{"is_admin": enabled})
	if _, err := tx.Exec(`INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, details, source_ip) VALUES (?, 'user.admin_changed', 'user', ?, ?, ?)`,
		actorID, strconv.FormatInt(targetID, 10), string(details), sourceIP); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *SystemStore) userChangeWithAudit(actorID, targetID int64, action, field string, value bool, sourceIP, updateSQL string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.Exec(updateSQL, value, targetID)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected != 1 {
		return sql.ErrNoRows
	}
	details, _ := json.Marshal(map[string]bool{field: value})
	if _, err := tx.Exec(`INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, details, source_ip) VALUES (?, ?, 'user', ?, ?, ?)`,
		actorID, action, strconv.FormatInt(targetID, 10), string(details), sourceIP); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *SystemStore) SetInviteRequired(actorID int64, enabled bool, sourceIP string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`INSERT INTO app_settings(key, value, updated_at) VALUES ('invite_required', ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`, strconv.FormatBool(enabled)); err != nil {
		return err
	}
	details, _ := json.Marshal(map[string]bool{"enabled": enabled})
	if _, err := tx.Exec(`INSERT INTO admin_audit_logs(actor_id, action, target_type, target_id, details, source_ip) VALUES (?, 'registration.invite_required_changed', 'setting', 'invite_required', ?, ?)`,
		actorID, string(details), sourceIP); err != nil {
		return err
	}
	return tx.Commit()
}
