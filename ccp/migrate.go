package ccp

import "database/sql"

// Migrate 创建 ccp 模块所需的数据库表
func Migrate(db *sql.DB) error {
	ddl := `
CREATE TABLE IF NOT EXISTS c_banks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    uploader_id INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS c_bank_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_id INTEGER NOT NULL REFERENCES c_banks(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    answer_keywords TEXT DEFAULT '',
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS c_rooms (
    code TEXT PRIMARY KEY,
    host_user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'waiting',
    judge_mode TEXT DEFAULT 'judge',
    grid_size INTEGER DEFAULT 3,
    max_guesses INTEGER DEFAULT 3,
    difficulty TEXT DEFAULT 'normal',
    blur_level INTEGER DEFAULT 3,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS c_room_images (
    room_code TEXT NOT NULL REFERENCES c_rooms(code) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    answer_keywords TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (room_code, sort_order)
);

CREATE TABLE IF NOT EXISTS c_players (
    room_code TEXT NOT NULL REFERENCES c_rooms(code) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    is_host BOOLEAN DEFAULT FALSE,
    is_ready BOOLEAN DEFAULT FALSE,
    score INTEGER DEFAULT 0,
    guess_count INTEGER DEFAULT 0,
    joined_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (room_code, user_id)
);

CREATE TABLE IF NOT EXISTS c_game_states (
    room_code TEXT PRIMARY KEY REFERENCES c_rooms(code) ON DELETE CASCADE,
    state_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_c_bank_images_bank ON c_bank_images(bank_id);
CREATE INDEX IF NOT EXISTS idx_c_players_room ON c_players(room_code);
`
	if _, err := db.Exec(ddl); err != nil {
		return err
	}

	// 存量数据兼容：为旧表补充新增列（列已存在时忽略错误）
	_, _ = db.Exec(`ALTER TABLE c_room_images ADD COLUMN answer_keywords TEXT DEFAULT ''`)
	_, _ = db.Exec(`ALTER TABLE c_bank_images ADD COLUMN answer_keywords TEXT DEFAULT ''`)

	return nil
}
