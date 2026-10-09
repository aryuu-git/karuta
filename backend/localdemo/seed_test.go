package localdemo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"karuta/backend/media"
	"karuta/backend/storage"
	"karuta/backend/store"

	"golang.org/x/crypto/bcrypt"
)

func TestSeedCreatesPlayableDatasetAndPreservesEdits(t *testing.T) {
	db, err := store.OpenDB(filepath.Join(t.TempDir(), "demo.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s := store.NewStore(db)
	local, err := storage.NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	mediaSvc := media.NewService(local, s.MediaAssets)
	if err := Seed(context.Background(), db, mediaSvc); err != nil {
		t.Fatal(err)
	}
	user, err := s.Users.GetByUsername(Username)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(Password)) != nil {
		t.Fatalf("demo account is not usable: %v", err)
	}
	decks, err := s.Decks.ListByOwner(user.ID)
	if err != nil || len(decks) != 2 {
		t.Fatalf("demo decks = %d, error = %v", len(decks), err)
	}
	for _, deck := range decks {
		cards, err := s.DeckCards.ListCardsByDeck(deck.ID)
		if err != nil || len(cards) != 6 {
			t.Fatalf("demo cards = %d, error = %v", len(cards), err)
		}
		for _, card := range cards {
			audios, err := s.CardAudios.ListByCardID(card.ID)
			if err != nil || len(audios) != 1 || audios[0].DurationSec != 4 {
				t.Fatalf("demo audio = %+v, error = %v", audios, err)
			}
			for _, key := range []string{card.CoverPath, audios[0].AudioPath} {
				w := httptest.NewRecorder()
				local.ServeHTTP(w, httptest.NewRequest(http.MethodGet, local.URL(key), nil))
				if w.Code != http.StatusOK || w.Body.Len() == 0 {
					t.Fatalf("demo media is unavailable: %s", key)
				}
			}
		}
	}
	if _, err := db.Exec(`UPDATE decks SET name = 'edited' WHERE id = ?`, decks[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`DELETE FROM decks WHERE id = ?`, decks[1].ID); err != nil {
		t.Fatal(err)
	}
	if err := Seed(context.Background(), db, mediaSvc); err != nil {
		t.Fatal(err)
	}
	decks, err = s.Decks.ListByOwner(user.ID)
	if err != nil || len(decks) != 1 || decks[0].Name != "edited" {
		t.Fatal("restart overwrote user edits or duplicated demo data")
	}
	stats, err := s.MediaAssets.Stats()
	if err != nil || stats.Assets != 12 {
		t.Fatalf("demo media count = %+v, error = %v", stats, err)
	}
}
