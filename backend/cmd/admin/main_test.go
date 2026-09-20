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
	if _, err := db.Exec(`CREATE TABLE users (username TEXT PRIMARY KEY, is_admin BOOLEAN DEFAULT FALSE); INSERT INTO users(username) VALUES ('owner')`); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	if err := setAdmin(database, "owner", true); err != nil {
		t.Fatal(err)
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
}
