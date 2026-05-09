package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "modernc.org/sqlite"
)

func main() {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./karuta.db"
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		log.Fatalf("enable WAL: %v", err)
	}
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		log.Fatalf("enable FK: %v", err)
	}

	fmt.Println("=== Karuta Library Migration ===")
	fmt.Printf("Database: %s\n\n", dbPath)

	// Step 1: Ensure new tables exist
	fmt.Println("[1/5] Creating new tables if not exist...")
	ddl := `
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
`
	if _, err := db.Exec(ddl); err != nil {
		log.Fatalf("create tables: %v", err)
	}

	// Step 2: Add new columns (ignore if already exist)
	fmt.Println("[2/5] Adding new columns...")
	alters := []string{
		`ALTER TABLE cards ADD COLUMN owner_id INTEGER REFERENCES users(id)`,
		`ALTER TABLE cards ADD COLUMN series TEXT DEFAULT ''`,
		`ALTER TABLE cards ADD COLUMN tags TEXT DEFAULT ''`,
		`ALTER TABLE cards ADD COLUMN is_shared BOOLEAN DEFAULT TRUE`,
		`ALTER TABLE decks ADD COLUMN share_level TEXT DEFAULT 'private'`,
		`ALTER TABLE decks ADD COLUMN edit_level TEXT DEFAULT 'add_only'`,
		`ALTER TABLE game_records ADD COLUMN card_audio_id INTEGER DEFAULT NULL`,
		`ALTER TABLE game_records ADD COLUMN hint_text TEXT DEFAULT ''`,
	}
	for _, a := range alters {
		_, _ = db.Exec(a) // ignore "duplicate column" errors
	}

	// Step 3: Fill cards.owner_id from decks.owner_id
	fmt.Println("[3/5] Filling cards.owner_id from deck ownership...")
	res, err := db.Exec(`
		UPDATE cards SET owner_id = (
			SELECT owner_id FROM decks WHERE decks.id = cards.deck_id
		) WHERE owner_id IS NULL AND deck_id IS NOT NULL
	`)
	if err != nil {
		log.Fatalf("fill owner_id: %v", err)
	}
	affected, _ := res.RowsAffected()
	fmt.Printf("   Updated %d cards with owner_id\n", affected)

	// Step 4: Migrate cards.audio_path -> card_audios
	fmt.Println("[4/5] Migrating audio_path to card_audios table...")
	res, err = db.Exec(`
		INSERT INTO card_audios (card_id, audio_path, hint_text, sort_order)
		SELECT id, audio_path, hint_text, 0 FROM cards
		WHERE audio_path != '' AND audio_path IS NOT NULL
		  AND id NOT IN (SELECT card_id FROM card_audios)
	`)
	if err != nil {
		log.Fatalf("migrate audios: %v", err)
	}
	affected, _ = res.RowsAffected()
	fmt.Printf("   Migrated %d audio records\n", affected)

	// Step 5: Migrate cards.deck_id -> deck_cards
	fmt.Println("[5/5] Migrating deck_id relationships to deck_cards...")
	res, err = db.Exec(`
		INSERT OR IGNORE INTO deck_cards (deck_id, card_id, sort_order, added_by, added_at)
		SELECT deck_id, id, sort_order, owner_id, created_at FROM cards
		WHERE deck_id IS NOT NULL
		  AND deck_id IN (SELECT id FROM decks)
	`)
	if err != nil {
		log.Fatalf("migrate deck_cards: %v", err)
	}
	affected, _ = res.RowsAffected()
	fmt.Printf("   Created %d deck_cards relationships\n", affected)

	// Step 5b: For orphan cards (deck_id IS NULL), assign to first user as owner
	_, _ = db.Exec(`
		UPDATE cards SET owner_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
		WHERE owner_id IS NULL
	`)

	// Bonus: Migrate decks.is_public -> share_level
	_, _ = db.Exec(`UPDATE decks SET share_level = 'playable' WHERE is_public = TRUE AND share_level = 'private'`)

	fmt.Println("\n✅ Migration complete!")

	// Print stats
	var cardCount, audioCount, deckCardCount int
	db.QueryRow(`SELECT COUNT(*) FROM cards`).Scan(&cardCount)
	db.QueryRow(`SELECT COUNT(*) FROM card_audios`).Scan(&audioCount)
	db.QueryRow(`SELECT COUNT(*) FROM deck_cards`).Scan(&deckCardCount)
	fmt.Printf("   Cards: %d | Card Audios: %d | Deck-Card links: %d\n", cardCount, audioCount, deckCardCount)
}
