package store

import (
	"path/filepath"
	"testing"
)

func TestSharedMediaReferencesSurviveCardDelete(t *testing.T) {
	db, err := OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s := NewStore(db)
	owner, err := s.Users.CreateUser("owner", "owner@example.test", "hash")
	if err != nil {
		t.Fatal(err)
	}
	first, err := s.Cards.CreateCard(owner.ID, "covers/shared.webp", "first", "", "", true)
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.Cards.CreateCard(owner.ID, "covers/shared.webp", "second", "", "", true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CardAudios.Create(first.ID, "audio/shared.mp3", "", 0); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CardAudios.Create(second.ID, "audio/shared.mp3", "", 0); err != nil {
		t.Fatal(err)
	}

	if err := s.Cards.DeleteCard(first.ID); err != nil {
		t.Fatal(err)
	}
	if refs, err := s.Cards.CountCoverPathReferences("covers/shared.webp"); err != nil || refs != 1 {
		t.Fatalf("cover refs=%d err=%v", refs, err)
	}
	if refs, err := s.CardAudios.CountPathReferences("audio/shared.mp3"); err != nil || refs != 1 {
		t.Fatalf("audio refs=%d err=%v", refs, err)
	}
}
