package store

import (
	"path/filepath"
	"testing"
)

func TestMigrationRecordsCurrentSchemaVersion(t *testing.T) {
	db, err := OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	version, err := SchemaVersion(db)
	if err != nil {
		t.Fatal(err)
	}
	if version != CurrentSchemaVersion {
		t.Fatalf("schema version = %d, want %d", version, CurrentSchemaVersion)
	}

	if err := migrate(db); err != nil {
		t.Fatalf("migration must be idempotent: %v", err)
	}
}

func TestAbortInterruptedRooms(t *testing.T) {
	db, err := OpenDB(filepath.Join(t.TempDir(), "recovery.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`
		INSERT INTO users(id, username, email, password) VALUES (1, 'host', 'host@example.test', 'x');
		INSERT INTO decks(id, owner_id, name) VALUES (1, 1, 'deck');
		INSERT INTO rooms(id, code, deck_id, host_id, status) VALUES
			(1, 'READ01', 1, 1, 'reading'),
			(2, 'WAIT01', 1, 1, 'waiting');
	`); err != nil {
		t.Fatal(err)
	}
	affected, err := NewRoomStore(db).AbortInterrupted()
	if err != nil || affected != 1 {
		t.Fatalf("affected=%d err=%v", affected, err)
	}
	var interrupted, waiting string
	if err := db.QueryRow(`SELECT status FROM rooms WHERE id=1`).Scan(&interrupted); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT status FROM rooms WHERE id=2`).Scan(&waiting); err != nil {
		t.Fatal(err)
	}
	if interrupted != "aborted" || waiting != "waiting" {
		t.Fatalf("statuses = %q, %q", interrupted, waiting)
	}
}

func TestRoomStatusTransitionIsConditional(t *testing.T) {
	db, err := OpenDB(filepath.Join(t.TempDir(), "transition.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`
		INSERT INTO users(id, username, email, password) VALUES (1, 'host', 'host@example.test', 'x');
		INSERT INTO decks(id, owner_id, name) VALUES (1, 1, 'deck');
		INSERT INTO rooms(id, code, deck_id, host_id, status) VALUES (1, 'ROOM01', 1, 1, 'waiting');
	`); err != nil {
		t.Fatal(err)
	}
	rooms := NewRoomStore(db)
	first, err := rooms.TransitionStatus(1, "waiting", "reading")
	if err != nil || !first {
		t.Fatalf("first transition=%v err=%v", first, err)
	}
	second, err := rooms.TransitionStatus(1, "waiting", "reading")
	if err != nil || second {
		t.Fatalf("second transition=%v err=%v", second, err)
	}
}
