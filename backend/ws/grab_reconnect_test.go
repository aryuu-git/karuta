package ws

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"karuta/backend/model"
	"karuta/backend/store"

	"github.com/gorilla/websocket"
)

func newGrabTestSession(t *testing.T, mode string) *GameSession {
	t.Helper()
	db, err := store.OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec(`
		INSERT INTO users (id, username, email, password) VALUES (99, 'host', 'host@test', 'x'), (100, 'player', 'player@test', 'x');
		INSERT INTO decks (id, owner_id, name) VALUES (1, 99, 'deck');
		INSERT INTO cards (id, owner_id, display_text) VALUES (7, 99, 'card');
		INSERT INTO rooms (id, code, deck_id, host_id, status) VALUES (1, 'GRAB01', 1, 99, 'reading');
		INSERT INTO room_players (room_id, user_id, role, score) VALUES (1, 100, 'player', 0);
	`); err != nil {
		t.Fatal(err)
	}
	gs := newGameSession(newRoomHub(1, nil), &model.Room{ID: 1, HostID: 99, Mode: mode, PenaltySlow: true}, nil, store.NewStore(db))
	gs.hub.session = gs
	gs.cardRemainingCount[7] = 4
	for i := 0; i < 4; i++ {
		gs.playItems = append(gs.playItems, &PlayItem{Index: i, CardID: 7})
	}
	return gs
}

// Use the real WebSocket read pump; a new connection represents a refreshed page.
func connectGrabTestClient(t *testing.T, gs *GameSession) (*websocket.Conn, func()) {
	t.Helper()
	done := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer close(done)
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade: %v", err)
			return
		}
		client := &Client{hub: gs.hub, conn: conn, userID: 100, role: "player"}
		client.readPump()
	}))
	t.Cleanup(server.Close)
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	closeClient := func() {
		conn.Close()
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Error("client read pump did not exit")
		}
	}
	t.Cleanup(closeClient)
	return conn, closeClient
}

func openGrabTestRound(gs *GameSession, round int) {
	gs.mu.Lock()
	defer gs.mu.Unlock()
	gs.currentIdx = round
	gs.grabWindow = map[int]time.Time{round: time.Now()}
	gs.wrongUsers = make(map[int64]bool)
}

func sendTestGrab(t *testing.T, conn *websocket.Conn, cardID, cmdID int64) {
	t.Helper()
	if err := conn.WriteJSON(wsMessage{Type: "grab", CardID: cardID, CmdID: cmdID}); err != nil {
		t.Fatal(err)
	}
}

func awaitTestClaim(t *testing.T, gs *GameSession) {
	t.Helper()
	timeout := time.NewTimer(time.Second)
	defer timeout.Stop()
	for {
		select {
		case raw := <-gs.hub.broadcast:
			var event struct{ Type string }
			if err := json.Unmarshal(raw, &event); err != nil {
				t.Fatal(err)
			}
			if event.Type == "card_claimed" {
				return
			}
		case <-timeout.C:
			t.Fatal("first valid grab was ignored")
		}
	}
}

func assertGrabTestScore(t *testing.T, gs *GameSession, want int) {
	t.Helper()
	players, err := gs.store.Rooms.ListPlayers(gs.room.ID)
	if err != nil || len(players) != 1 {
		t.Fatalf("players = %v, err = %v", players, err)
	}
	if players[0].Score != want {
		t.Fatalf("score = %d, want %d", players[0].Score, want)
	}
}

func TestGrabFirstClickAfterReconnect(t *testing.T) {
	for _, mode := range []string{"auto", "judge"} {
		for _, previousCmdID := range []int64{2, 50} {
			t.Run(fmt.Sprintf("%s/previous_%d", mode, previousCmdID), func(t *testing.T) {
				gs := newGrabTestSession(t, mode)
				for round, cmdID := range []int64{previousCmdID, 1, 1} {
					openGrabTestRound(gs, round)
					conn, closeClient := connectGrabTestClient(t, gs)
					sendTestGrab(t, conn, 7, cmdID)
					awaitTestClaim(t, gs)
					closeClient()
					assertGrabTestScore(t, gs, round+1)
				}
			})
		}
	}
}

func TestGrabConnectionIgnoresDuplicateAndOlderCommands(t *testing.T) {
	gs := newGrabTestSession(t, "auto")
	conn, closeClient := connectGrabTestClient(t, gs)
	openGrabTestRound(gs, 0)
	sendTestGrab(t, conn, 7, 5)
	awaitTestClaim(t, gs)
	// Replays must not claim the next round or trigger its slow-grab penalty.
	sendTestGrab(t, conn, 7, 5)
	sendTestGrab(t, conn, 7, 3)
	openGrabTestRound(gs, 1)
	sendTestGrab(t, conn, 7, 5)
	sendTestGrab(t, conn, 7, 3)
	sendTestGrab(t, conn, 7, 6)
	awaitTestClaim(t, gs)
	closeClient()
	assertGrabTestScore(t, gs, 2)
	if gs.wrongUsers[100] || gs.cardRemainingCount[7] != 2 {
		t.Fatalf("replays changed game state: banned=%v remaining=%d", gs.wrongUsers[100], gs.cardRemainingCount[7])
	}
}

func TestGrabLegacyClientWithoutCommandID(t *testing.T) {
	gs := newGrabTestSession(t, "auto")
	conn, closeClient := connectGrabTestClient(t, gs)
	for round := 0; round < 2; round++ {
		openGrabTestRound(gs, round)
		sendTestGrab(t, conn, 7, 0)
		awaitTestClaim(t, gs)
	}
	closeClient()
	assertGrabTestScore(t, gs, 2)
}

func TestGrabReconnectDoesNotClearRoundBan(t *testing.T) {
	gs := newGrabTestSession(t, "auto")
	openGrabTestRound(gs, 0)
	conn, closeClient := connectGrabTestClient(t, gs)
	sendTestGrab(t, conn, 8, 2)
	closeClient()
	if !gs.wrongUsers[100] {
		t.Fatal("wrong grab did not ban player")
	}
	conn, closeClient = connectGrabTestClient(t, gs)
	sendTestGrab(t, conn, 7, 1)
	closeClient()
	assertGrabTestScore(t, gs, 0)
	if !gs.wrongUsers[100] || len(gs.roundResults) != 0 {
		t.Fatal("reconnecting bypassed the round ban")
	}
}
