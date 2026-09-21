package main

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestBackupDatabase(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "source.db")
	destination := filepath.Join(dir, "backups", "copy.db")
	db, err := sql.Open("sqlite", source)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE sample (value TEXT); INSERT INTO sample VALUES ('ok')`); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	if err := backupDatabase(source, destination); err != nil {
		t.Fatal(err)
	}
	copyDB, err := sql.Open("sqlite", destination)
	if err != nil {
		t.Fatal(err)
	}
	defer copyDB.Close()
	var value string
	if err := copyDB.QueryRow(`SELECT value FROM sample`).Scan(&value); err != nil {
		t.Fatal(err)
	}
	if value != "ok" {
		t.Fatalf("backup value=%q", value)
	}
}

func TestSetAdmin(t *testing.T) {
	database := filepath.Join(t.TempDir(), "users.db")
	db, err := sql.Open("sqlite", database)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, is_admin BOOLEAN DEFAULT FALSE, is_guest BOOLEAN DEFAULT FALSE);
CREATE TABLE admin_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT DEFAULT '', details TEXT DEFAULT '{}', source_ip TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
INSERT INTO users(id, username) VALUES (1, 'owner');
INSERT INTO users(id, username, is_guest) VALUES (2, 'wanderer', TRUE);`); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	if err := setAdmin(database, "owner", true); err != nil {
		t.Fatal(err)
	}
	// 游客守卫（修复 #3，CLI 与 API 同语义）
	if err := setAdmin(database, "wanderer", true); err == nil {
		t.Fatal("expected error granting administrator to guest via CLI")
	}
	db, err = sql.Open("sqlite", database)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var enabled bool
	if err := db.QueryRow(`SELECT is_admin FROM users WHERE username = 'owner'`).Scan(&enabled); err != nil {
		t.Fatal(err)
	}
	if !enabled {
		t.Fatal("administrator role was not granted")
	}
	// 审计落痕（修复 #5）：CLI 提权写入 admin_audit_logs
	var audits int
	if err := db.QueryRow(`SELECT COUNT(*) FROM admin_audit_logs WHERE action = 'user.admin_changed_cli' AND source_ip = 'cli-local'`).Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if audits != 1 {
		t.Fatalf("expected 1 CLI audit row, got %d", audits)
	}
	var guestAdmin bool
	if err := db.QueryRow(`SELECT COALESCE(is_admin, FALSE) FROM users WHERE username = 'wanderer'`).Scan(&guestAdmin); err != nil {
		t.Fatal(err)
	}
	if guestAdmin {
		t.Fatal("guest was granted administrator via CLI despite rejection")
	}
}
