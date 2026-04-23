package store

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

func OpenDB(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return nil, fmt.Errorf("enable WAL: %w", err)
	}

	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}

	if err := migrate(db); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return db, nil
}

func migrate(db *sql.DB) error {
	ddl := `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    is_public BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    audio_path TEXT NOT NULL,
    cover_path TEXT DEFAULT '',
    hint_text TEXT DEFAULT '',
    display_text TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    deck_id INTEGER NOT NULL REFERENCES decks(id),
    host_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'waiting',
    interval_sec INTEGER DEFAULT 5,
    mode TEXT DEFAULT 'auto',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS room_players (
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT DEFAULT 'player',
    score INTEGER DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id)
);
CREATE TABLE IF NOT EXISTS game_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    card_id INTEGER NOT NULL REFERENCES cards(id),
    winner_id INTEGER REFERENCES users(id),
    grabbed_at DATETIME,
    is_last BOOLEAN DEFAULT FALSE
);
`
	if _, err := db.Exec(ddl); err != nil {
		return err
	}
	// Migrate existing tables — ignore error if column already exists
	_, _ = db.Exec(`ALTER TABLE rooms ADD COLUMN mode TEXT DEFAULT 'auto'`)
	_, _ = db.Exec(`ALTER TABLE game_records ADD COLUMN is_last BOOLEAN DEFAULT FALSE`)
	return nil
}

// Store is the unified entry point to all sub-stores.
type Store struct {
	Users       *UserStore
	Decks       *DeckStore
	Cards       *CardStore
	Rooms       *RoomStore
	GameRecords *GameRecordStore
}

func NewStore(db *sql.DB) *Store {
	return &Store{
		Users:       NewUserStore(db),
		Decks:       NewDeckStore(db),
		Cards:       NewCardStore(db),
		Rooms:       NewRoomStore(db),
		GameRecords: NewGameRecordStore(db),
	}
}
