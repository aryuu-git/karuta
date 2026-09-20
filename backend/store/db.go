package store

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

const CurrentSchemaVersion = 4

func OpenDB(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	// SQLite pragmas are connection-scoped. Keeping a single pooled connection
	// ensures WAL, foreign-key enforcement and busy_timeout apply consistently
	// and avoids write-lock contention inside this single-process application.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return nil, fmt.Errorf("enable WAL: %w", err)
	}

	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}

	if _, err := db.Exec("PRAGMA busy_timeout=5000"); err != nil {
		return nil, fmt.Errorf("set busy timeout: %w", err)
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
    invited_by INTEGER DEFAULT 0,
    disabled BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    is_guest BOOLEAN DEFAULT FALSE,
	guest_token_hash TEXT DEFAULT '',
    avatar_path TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    is_public BOOLEAN DEFAULT FALSE,
    share_level TEXT DEFAULT 'private',
    edit_level TEXT DEFAULT 'add_only',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id INTEGER REFERENCES decks(id) ON DELETE SET NULL,
    owner_id INTEGER REFERENCES users(id),
    audio_path TEXT DEFAULT '',
    cover_path TEXT DEFAULT '',
    hint_text TEXT DEFAULT '',
    display_text TEXT NOT NULL,
    series TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    is_shared BOOLEAN DEFAULT TRUE,
    share_level TEXT DEFAULT 'playable',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS card_audios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    audio_path TEXT NOT NULL,
    hint_text TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS deck_cards (
    deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    added_by INTEGER REFERENCES users(id),
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (deck_id, card_id)
);
CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    deck_id INTEGER NOT NULL REFERENCES decks(id),
    host_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'waiting',
    interval_sec INTEGER DEFAULT 5,
    mode TEXT DEFAULT 'auto',
    mask_enabled BOOLEAN DEFAULT FALSE,
    mask_difficulty TEXT DEFAULT 'normal',
    mask_seed INTEGER DEFAULT 0,
    penalty_wrong BOOLEAN DEFAULT TRUE,
    penalty_slow BOOLEAN DEFAULT TRUE,
    shuffle_remaining INTEGER DEFAULT 0,
    random_start BOOLEAN DEFAULT FALSE,
    random_start_max INTEGER DEFAULT 50,
    duel_total_cards INTEGER DEFAULT 50,
    duel_flip BOOLEAN DEFAULT TRUE,
    duel_requeue BOOLEAN DEFAULT TRUE,
    duel_max_rounds INTEGER DEFAULT 0,
    duel_round_time INTEGER DEFAULT 30,
    duel_grab_chances INTEGER DEFAULT 1,
    duel_arrange_time INTEGER DEFAULT 60,
    penalty_last INTEGER DEFAULT 0,
    training BOOLEAN DEFAULT FALSE,
    min_play_time INTEGER DEFAULT 0,
    multi_audio_mode TEXT DEFAULT 'all',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    creator_id INTEGER NOT NULL REFERENCES users(id),
    used_by INTEGER REFERENCES users(id),
    used_at DATETIME,
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
    card_audio_id INTEGER DEFAULT NULL,
    winner_id INTEGER REFERENCES users(id),
    grabbed_at DATETIME,
    is_last BOOLEAN DEFAULT FALSE,
    hint_text TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS app_settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_audit_logs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	actor_id INTEGER NOT NULL REFERENCES users(id),
	action TEXT NOT NULL,
	target_type TEXT NOT NULL,
	target_id TEXT DEFAULT '',
	details TEXT DEFAULT '{}',
	source_ip TEXT DEFAULT '',
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC);
CREATE TABLE IF NOT EXISTS media_assets (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	kind TEXT NOT NULL,
	object_key TEXT NOT NULL UNIQUE,
	sha256 TEXT NOT NULL,
	mime_type TEXT NOT NULL,
	size_bytes INTEGER NOT NULL,
	status TEXT NOT NULL DEFAULT 'ready',
	created_by INTEGER REFERENCES users(id),
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	deleted_at DATETIME
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_assets_sha_kind ON media_assets(sha256, kind);
`
	if _, err := db.Exec(ddl); err != nil {
		return err
	}
	columns := []struct {
		table, name, ddl string
	}{
		{"rooms", "mode", `ALTER TABLE rooms ADD COLUMN mode TEXT DEFAULT 'auto'`},
		{"game_records", "is_last", `ALTER TABLE game_records ADD COLUMN is_last BOOLEAN DEFAULT FALSE`},
		{"game_records", "card_audio_id", `ALTER TABLE game_records ADD COLUMN card_audio_id INTEGER DEFAULT NULL`},
		{"game_records", "hint_text", `ALTER TABLE game_records ADD COLUMN hint_text TEXT DEFAULT ''`},
		{"cards", "owner_id", `ALTER TABLE cards ADD COLUMN owner_id INTEGER REFERENCES users(id)`},
		{"cards", "series", `ALTER TABLE cards ADD COLUMN series TEXT DEFAULT ''`},
		{"cards", "tags", `ALTER TABLE cards ADD COLUMN tags TEXT DEFAULT ''`},
		{"cards", "is_shared", `ALTER TABLE cards ADD COLUMN is_shared BOOLEAN DEFAULT TRUE`},
		{"cards", "share_level", `ALTER TABLE cards ADD COLUMN share_level TEXT DEFAULT 'playable'`},
		{"decks", "share_level", `ALTER TABLE decks ADD COLUMN share_level TEXT DEFAULT 'private'`},
		{"decks", "edit_level", `ALTER TABLE decks ADD COLUMN edit_level TEXT DEFAULT 'add_only'`},
		{"rooms", "mask_enabled", `ALTER TABLE rooms ADD COLUMN mask_enabled BOOLEAN DEFAULT FALSE`},
		{"rooms", "mask_difficulty", `ALTER TABLE rooms ADD COLUMN mask_difficulty TEXT DEFAULT 'normal'`},
		{"rooms", "mask_seed", `ALTER TABLE rooms ADD COLUMN mask_seed INTEGER DEFAULT 0`},
		{"rooms", "penalty_wrong", `ALTER TABLE rooms ADD COLUMN penalty_wrong BOOLEAN DEFAULT TRUE`},
		{"rooms", "penalty_slow", `ALTER TABLE rooms ADD COLUMN penalty_slow BOOLEAN DEFAULT TRUE`},
		{"rooms", "shuffle_remaining", `ALTER TABLE rooms ADD COLUMN shuffle_remaining INTEGER DEFAULT 0`},
		{"rooms", "random_start", `ALTER TABLE rooms ADD COLUMN random_start BOOLEAN DEFAULT FALSE`},
		{"rooms", "random_start_max", `ALTER TABLE rooms ADD COLUMN random_start_max INTEGER DEFAULT 50`},
		{"rooms", "duel_total_cards", `ALTER TABLE rooms ADD COLUMN duel_total_cards INTEGER DEFAULT 50`},
		{"rooms", "duel_flip", `ALTER TABLE rooms ADD COLUMN duel_flip BOOLEAN DEFAULT TRUE`},
		{"rooms", "duel_requeue", `ALTER TABLE rooms ADD COLUMN duel_requeue BOOLEAN DEFAULT TRUE`},
		{"rooms", "duel_max_rounds", `ALTER TABLE rooms ADD COLUMN duel_max_rounds INTEGER DEFAULT 0`},
		{"rooms", "duel_round_time", `ALTER TABLE rooms ADD COLUMN duel_round_time INTEGER DEFAULT 30`},
		{"rooms", "duel_grab_chances", `ALTER TABLE rooms ADD COLUMN duel_grab_chances INTEGER DEFAULT 1`},
		{"rooms", "duel_arrange_time", `ALTER TABLE rooms ADD COLUMN duel_arrange_time INTEGER DEFAULT 60`},
		{"rooms", "penalty_last", `ALTER TABLE rooms ADD COLUMN penalty_last INTEGER DEFAULT 0`},
		{"rooms", "training", `ALTER TABLE rooms ADD COLUMN training BOOLEAN DEFAULT FALSE`},
		{"rooms", "min_play_time", `ALTER TABLE rooms ADD COLUMN min_play_time INTEGER DEFAULT 0`},
		{"rooms", "multi_audio_mode", `ALTER TABLE rooms ADD COLUMN multi_audio_mode TEXT DEFAULT 'all'`},
		{"users", "invited_by", `ALTER TABLE users ADD COLUMN invited_by INTEGER DEFAULT 0`},
		{"users", "disabled", `ALTER TABLE users ADD COLUMN disabled BOOLEAN DEFAULT FALSE`},
		{"users", "is_admin", `ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE`},
		{"users", "avatar_path", `ALTER TABLE users ADD COLUMN avatar_path TEXT DEFAULT ''`},
		{"users", "is_guest", `ALTER TABLE users ADD COLUMN is_guest BOOLEAN DEFAULT FALSE`},
		{"users", "guest_token_hash", `ALTER TABLE users ADD COLUMN guest_token_hash TEXT DEFAULT ''`},
		{"card_audios", "duration_sec", `ALTER TABLE card_audios ADD COLUMN duration_sec REAL DEFAULT 0`},
	}
	for _, column := range columns {
		if err := ensureColumn(db, column.table, column.name, column.ddl); err != nil {
			return fmt.Errorf("migrate %s.%s: %w", column.table, column.name, err)
		}
	}

	dataMigrations := []string{
		`UPDATE decks SET share_level = 'playable' WHERE is_public = TRUE AND share_level = 'private'`,
		`UPDATE cards SET share_level = 'playable' WHERE is_shared = TRUE AND share_level = 'playable'`,
		`UPDATE cards SET share_level = 'private' WHERE is_shared = FALSE`,
		`
		UPDATE cards SET owner_id = (
			SELECT owner_id FROM decks WHERE decks.id = cards.deck_id
		) WHERE owner_id IS NULL AND deck_id IS NOT NULL
	`,
		`
		INSERT OR IGNORE INTO card_audios (card_id, audio_path, hint_text, sort_order)
		SELECT id, audio_path, hint_text, 0 FROM cards
		WHERE audio_path != '' AND audio_path IS NOT NULL
		  AND id NOT IN (SELECT card_id FROM card_audios)
	`,
		`
		INSERT OR IGNORE INTO deck_cards (deck_id, card_id, sort_order, added_by, added_at)
		SELECT deck_id, id, sort_order, owner_id, created_at FROM cards
		WHERE deck_id IS NOT NULL
		  AND deck_id IN (SELECT id FROM decks)
		  AND id NOT IN (SELECT card_id FROM deck_cards WHERE deck_id = cards.deck_id)
	`,
	}
	for i, statement := range dataMigrations {
		if _, err := db.Exec(statement); err != nil {
			return fmt.Errorf("data migration %d: %w", i+1, err)
		}
	}
	if _, err := db.Exec(`INSERT OR IGNORE INTO schema_migrations(version) VALUES (?)`, CurrentSchemaVersion); err != nil {
		return fmt.Errorf("record schema version: %w", err)
	}

	return nil
}

func ensureColumn(db *sql.DB, table, column, ddl string) error {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return err
	}
	found := false
	for rows.Next() {
		var cid, notNull, primaryKey int
		var name, columnType string
		var defaultValue interface{}
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			rows.Close()
			return err
		}
		if name == column {
			found = true
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if found {
		return nil
	}
	_, err = db.Exec(ddl)
	return err
}

func SchemaVersion(db *sql.DB) (int, error) {
	var version int
	err := db.QueryRow(`SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&version)
	return version, err
}

// Store is the unified entry point to all sub-stores.
type Store struct {
	Users       *UserStore
	Decks       *DeckStore
	Cards       *CardStore
	CardAudios  *CardAudioStore
	DeckCards   *DeckCardStore
	Rooms       *RoomStore
	GameRecords *GameRecordStore
	Invites     *InviteStore
	System      *SystemStore
	MediaAssets *MediaAssetStore
}

func NewStore(db *sql.DB) *Store {
	return &Store{
		Users:       NewUserStore(db),
		Decks:       NewDeckStore(db),
		Cards:       NewCardStore(db),
		CardAudios:  NewCardAudioStore(db),
		DeckCards:   NewDeckCardStore(db),
		Rooms:       NewRoomStore(db),
		GameRecords: NewGameRecordStore(db),
		Invites:     NewInviteStore(db),
		System:      NewSystemStore(db),
		MediaAssets: NewMediaAssetStore(db),
	}
}
