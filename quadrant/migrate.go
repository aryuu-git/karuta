package quadrant

import "database/sql"

func Migrate(db *sql.DB) error {
	ddl := `
CREATE TABLE IF NOT EXISTS q_banks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    owner_id INTEGER NOT NULL,
    visibility TEXT DEFAULT 'private',
    category TEXT DEFAULT 'custom',
    play_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS q_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_id INTEGER NOT NULL REFERENCES q_banks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    image_url TEXT DEFAULT '',
    source TEXT DEFAULT 'manual',
    source_id TEXT DEFAULT '',
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS q_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_id INTEGER NOT NULL REFERENCES q_banks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE(bank_id, name)
);

CREATE TABLE IF NOT EXISTS q_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_id INTEGER NOT NULL REFERENCES q_banks(id) ON DELETE CASCADE,
    axis_x_label_id INTEGER NOT NULL REFERENCES q_labels(id),
    axis_y_label_id INTEGER NOT NULL REFERENCES q_labels(id),
    score_source TEXT DEFAULT 'manual',
    quality REAL DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS q_question_candidates (
    question_id INTEGER NOT NULL REFERENCES q_questions(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES q_labels(id),
    PRIMARY KEY (question_id, label_id)
);

CREATE TABLE IF NOT EXISTS q_placements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL REFERENCES q_questions(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES q_items(id),
    x REAL NOT NULL,
    y REAL NOT NULL,
    reveal_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS q_tag_scores (
    item_id INTEGER NOT NULL,
    label_name TEXT NOT NULL,
    source TEXT NOT NULL,
    score REAL NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (item_id, label_name, source)
);

CREATE TABLE IF NOT EXISTS q_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    host_id INTEGER NOT NULL,
    judge_id INTEGER DEFAULT 0,
    bank_id INTEGER DEFAULT 0,
    status TEXT DEFAULT 'waiting',
    visibility TEXT DEFAULT 'private',
    max_players INTEGER DEFAULT 8,
    rounds_total INTEGER DEFAULT 1,
    rounds_current INTEGER DEFAULT 0,
    candidate_count INTEGER DEFAULT 8,
    reveal_interval INTEGER DEFAULT 10,
    guess_window INTEGER DEFAULT 0,
    base_score INTEGER DEFAULT 100,
    decay_per_reveal INTEGER DEFAULT 10,
    wrong_penalty INTEGER DEFAULT 20,
    cooldown_rounds INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS q_players (
    room_id INTEGER NOT NULL REFERENCES q_rooms(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    username TEXT DEFAULT '',
    role TEXT DEFAULT 'player',
    score INTEGER DEFAULT 0,
    is_ready BOOLEAN DEFAULT FALSE,
    joined_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS q_guesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    guess_x_name TEXT NOT NULL,
    guess_y_name TEXT NOT NULL,
    correct BOOLEAN DEFAULT FALSE,
    score INTEGER DEFAULT 0,
    revealed_at INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
);
`
	_, err := db.Exec(ddl)
	return err
}
