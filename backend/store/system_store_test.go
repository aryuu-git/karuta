package store

import (
	"errors"
	"path/filepath"
	"testing"
)

func TestSystemChangesArePersistedAndAudited(t *testing.T) {
	db, err := OpenDB(filepath.Join(t.TempDir(), "system.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	users := NewUserStore(db)
	actor, err := users.CreateUser("actor", "actor@example.test", "hash")
	if err != nil {
		t.Fatal(err)
	}
	target, err := users.CreateUser("target", "target@example.test", "hash")
	if err != nil {
		t.Fatal(err)
	}
	if err := users.SetAdmin(actor.ID, true); err != nil {
		t.Fatal(err)
	}

	system := NewSystemStore(db)
	if err := system.SetUserDisabled(actor.ID, target.ID, true, "192.0.2.1"); err != nil {
		t.Fatal(err)
	}
	if err := system.SetInviteRequired(actor.ID, true, "192.0.2.1"); err != nil {
		t.Fatal(err)
	}
	if required, err := system.InviteRequired(false); err != nil || !required {
		t.Fatalf("required=%v err=%v", required, err)
	}
	var auditCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM admin_audit_logs WHERE actor_id=? AND source_ip='192.0.2.1'`, actor.ID).Scan(&auditCount); err != nil {
		t.Fatal(err)
	}
	if auditCount != 2 {
		t.Fatalf("audit count=%d, want 2", auditCount)
	}
}

func TestCannotRemoveFinalAdministrator(t *testing.T) {
	db, err := OpenDB(filepath.Join(t.TempDir(), "admins.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	users := NewUserStore(db)
	admin, err := users.CreateUser("admin", "admin@example.test", "hash")
	if err != nil {
		t.Fatal(err)
	}
	if err := users.SetAdmin(admin.ID, true); err != nil {
		t.Fatal(err)
	}
	err = NewSystemStore(db).SetUserAdmin(admin.ID, admin.ID, false, "127.0.0.1")
	if !errors.Is(err, ErrLastAdmin) {
		t.Fatalf("err=%v, want ErrLastAdmin", err)
	}
}
