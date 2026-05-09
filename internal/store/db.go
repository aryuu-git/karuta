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
`
	if _, err := db.Exec(ddl); err != nil {
		return err
	}
	// Migrate existing tables — ignore error if column already exists
	_, _ = db.Exec(`ALTER TABLE rooms ADD COLUMN mode TEXT DEFAULT 'auto'`)
	_, _ = db.Exec(`ALTER TABLE game_records ADD COLUMN is_last BOOLEAN DEFAULT FALSE`)
	_, _ = db.Exec(`ALTER TABLE game_records ADD COLUMN card_audio_id INTEGER DEFAULT NULL`)
	_, _ = db.Exec(`ALTER TABLE game_records ADD COLUMN hint_text TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE cards ADD COLUMN owner_id INTEGER REFERENCES users(id)`)
	_, _ = db.Exec(`ALTER TABLE cards ADD COLUMN series TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE cards ADD COLUMN tags TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE cards ADD COLUMN is_shared BOOLEAN DEFAULT TRUE`)
	_, _ = db.Exec(`ALTER TABLE decks ADD COLUMN share_level TEXT DEFAULT 'private'`)
	_, _ = db.Exec(`ALTER TABLE decks ADD COLUMN edit_level TEXT DEFAULT 'add_only'`)
	_, _ = db.Exec(`ALTER TABLE rooms ADD COLUMN mask_enabled BOOLEAN DEFAULT FALSE`)
	_, _ = db.Exec(`ALTER TABLE rooms ADD COLUMN mask_difficulty TEXT DEFAULT 'normal'`)
	_, _ = db.Exec(`ALTER TABLE rooms ADD COLUMN mask_seed INTEGER DEFAULT 0`)
	_, _ = db.Exec(`ALTER TABLE rooms ADD COLUMN penalty_wrong BOOLEAN DEFAULT TRUE`)
	_, _ = db.Exec(`ALTER TABLE rooms ADD COLUMN penalty_slow BOOLEAN DEFAULT TRUE`)
	_, _ = db.Exec(`ALTER TABLE rooms ADD COLUMN shuffle_remaining INTEGER DEFAULT 0`)
	_, _ = db.Exec(`ALTER TABLE rooms ADD COLUMN random_start BOOLEAN DEFAULT FALSE`)
	_, _ = db.Exec(`ALTER TABLE rooms ADD COLUMN random_start_max INTEGER DEFAULT 50`)

	// 存量数据兼容：旧的 is_public=TRUE 牌组同步到 share_level='playable'
	_, _ = db.Exec(`UPDATE decks SET share_level = 'playable' WHERE is_public = TRUE AND share_level = 'private'`)

	// 存量数据兼容：cards.owner_id 为 NULL 时从 deck 推导
	_, _ = db.Exec(`
		UPDATE cards SET owner_id = (
			SELECT owner_id FROM decks WHERE decks.id = cards.deck_id
		) WHERE owner_id IS NULL AND deck_id IS NOT NULL
	`)

	// 存量数据兼容：将 cards.audio_path 迁移到 card_audios（如果还没迁）
	_, _ = db.Exec(`
		INSERT OR IGNORE INTO card_audios (card_id, audio_path, hint_text, sort_order)
		SELECT id, audio_path, hint_text, 0 FROM cards
		WHERE audio_path != '' AND audio_path IS NOT NULL
		  AND id NOT IN (SELECT card_id FROM card_audios)
	`)

	// 存量数据兼容：将 cards.deck_id 关系迁移到 deck_cards（如果还没迁）
	_, _ = db.Exec(`
		INSERT OR IGNORE INTO deck_cards (deck_id, card_id, sort_order, added_by, added_at)
		SELECT deck_id, id, sort_order, owner_id, created_at FROM cards
		WHERE deck_id IS NOT NULL
		  AND deck_id IN (SELECT id FROM decks)
		  AND id NOT IN (SELECT card_id FROM deck_cards WHERE deck_id = cards.deck_id)
	`)

	return nil
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
	}
}
