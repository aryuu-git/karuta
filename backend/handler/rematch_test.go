package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"karuta/backend/middleware"
	"karuta/backend/model"
	"karuta/backend/store"
	"karuta/backend/ws"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

const rematchTestSecret = "test-secret"

// rematchEnv 测试环境：临时 sqlite 库 + 真实鉴权中间件（JWT 注入 userID）。
type rematchEnv struct {
	handler *RoomHandler
	store   *store.Store
	roomID  int64
	source  *model.Room
}

// newRematchEnv 预置 3 名用户（host/guest/spectator）、一副牌组、一个配置齐全的房间。
// 配置列全部取非默认值，供逐列继承断言。
func newRematchEnv(t *testing.T, status string) *rematchEnv {
	t.Helper()
	db, err := store.OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := store.NewStore(db)
	if _, err := db.Exec(`
		INSERT INTO users (id, username, email, password) VALUES (1, 'host', 'host@example.test', 'x');
		INSERT INTO users (id, username, email, password) VALUES (2, 'guest', 'guest@example.test', 'x');
		INSERT INTO users (id, username, email, password) VALUES (3, 'viewer', 'viewer@example.test', 'x');
		INSERT INTO decks (id, owner_id, name) VALUES (1, 1, 'deck');
	`); err != nil {
		t.Fatal(err)
	}
	room, err := s.Rooms.CreateRoom("SRC001", 1, 1, 7, "duel", true, "hard", false, false, 3, true, 33, false, 0)
	if err != nil {
		t.Fatal(err)
	}
	steps := []struct {
		msg string
		fn  func() error
	}{
		{"duel config", func() error { return s.Rooms.UpdateDuelConfig(room.ID, 41, false, false, 5, 45, 2, 90) }},
		{"penalty last", func() error { return s.Rooms.UpdatePenaltyLast(room.ID, 2) }},
		{"training", func() error { return s.Rooms.UpdateTraining(room.ID, true) }},
		{"min play time", func() error { return s.Rooms.UpdateMinPlayTime(room.ID, 40) }},
		{"multi audio", func() error { return s.Rooms.UpdateMultiAudioMode(room.ID, "once") }},
		{"mask seed", func() error { return s.Rooms.UpdateMaskSeed(room.ID, 12345) }},
		{"add host", func() error { return s.Rooms.AddPlayer(room.ID, 1, "player") }},
		{"add guest", func() error { return s.Rooms.AddPlayer(room.ID, 2, "player") }},
		{"add spectator", func() error { return s.Rooms.AddPlayer(room.ID, 3, "spectator") }},
		{"status", func() error { return s.Rooms.UpdateStatus(room.ID, status) }},
	}
	for _, step := range steps {
		if err := step.fn(); err != nil {
			t.Fatalf("%s: %v", step.msg, err)
		}
	}
	source, err := s.Rooms.GetByID(room.ID)
	if err != nil {
		t.Fatal(err)
	}
	return &rematchEnv{
		handler: NewRoomHandler(s, ws.NewHubManager()),
		store:   s,
		roomID:  room.ID,
		source:  source,
	}
}

// mintRematchToken 签发测试 JWT，供 middleware.Auth 解析出 userID。
func mintRematchToken(t *testing.T, userID int64) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": float64(userID)})
	signed, err := token.SignedString([]byte(rematchTestSecret))
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

// do 通过真实路由（含 {id} 参数解析与鉴权中间件）调用 rematch 端点。
func (e *rematchEnv) do(t *testing.T, userID int64, roomID int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	router := chi.NewRouter()
	router.With(middleware.Auth(rematchTestSecret, e.store.Users)).Post("/api/rooms/{id}/rematch", e.handler.Rematch)
	req := httptest.NewRequest(http.MethodPost, "/api/rooms/"+strconv.FormatInt(roomID, 10)+"/rematch", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+mintRematchToken(t, userID))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestRematchForbiddenForNonHost(t *testing.T) {
	e := newRematchEnv(t, "end")
	rec := e.do(t, 2, e.roomID, "")
	if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "FORBIDDEN") {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestRematchRequiresEndedRoom(t *testing.T) {
	e := newRematchEnv(t, "waiting")
	rec := e.do(t, 1, e.roomID, "")
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "ROOM_NOT_ENDED") {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestRematchMissingRoomReturns404(t *testing.T) {
	e := newRematchEnv(t, "end")
	rec := e.do(t, 1, 999999, "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestRematchSuccessCopiesConfigAndReinvites(t *testing.T) {
	e := newRematchEnv(t, "end")
	// 空 body → reinvite 缺省 true
	rec := e.do(t, 1, e.roomID, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Room *model.Room `json:"room"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Room == nil {
		t.Fatalf("response has no room: %s", rec.Body.String())
	}
	nr := resp.Room
	if nr.ID == e.roomID {
		t.Fatalf("new room id = source id %d", nr.ID)
	}
	if len(nr.Code) != 6 || nr.Code == e.source.Code {
		t.Fatalf("new code = %q, want fresh 6-char code", nr.Code)
	}
	if nr.HostID != 1 {
		t.Fatalf("host_id=%d, want original host 1", nr.HostID)
	}
	if nr.Status != "waiting" {
		t.Fatalf("status=%q, want waiting", nr.Status)
	}
	assertRoomConfigEqual(t, e.source, nr)

	// mask_seed 不继承：新房开局时才生成（JSON 不含该字段，回查 DB）
	fresh, err := e.store.Rooms.GetByID(nr.ID)
	if err != nil {
		t.Fatal(err)
	}
	if fresh.MaskSeed != 0 {
		t.Fatalf("mask_seed=%d, want 0 for a fresh room", fresh.MaskSeed)
	}

	// 原班整体迁入：全员 role=player、score=0（旁观者也归位为玩家）
	players, err := e.store.Rooms.ListPlayers(nr.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(players) != 3 {
		t.Fatalf("migrated players=%d, want 3", len(players))
	}
	for _, p := range players {
		if p.Role != "player" || p.Score != 0 {
			t.Fatalf("player %d role=%q score=%d, want role=player score=0", p.UserID, p.Role, p.Score)
		}
	}
}

func TestRematchWithoutReinviteKeepsOnlyHost(t *testing.T) {
	e := newRematchEnv(t, "end")
	rec := e.do(t, 1, e.roomID, `{"reinvite": false}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Room *model.Room `json:"room"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	players, err := e.store.Rooms.ListPlayers(resp.Room.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(players) != 1 || players[0].UserID != 1 || players[0].Role != "player" {
		t.Fatalf("players=%+v, want only host as player", players)
	}
}

// assertRoomConfigEqual 逐列断言配置继承（与 rooms 表配置列一一对应）。
func assertRoomConfigEqual(t *testing.T, src, got *model.Room) {
	t.Helper()
	checks := []struct {
		name  string
		equal bool
	}{
		{"deck_id", got.DeckID == src.DeckID},
		{"interval_sec", got.IntervalSec == src.IntervalSec},
		{"mode", got.Mode == src.Mode},
		{"mask_enabled", got.MaskEnabled == src.MaskEnabled},
		{"mask_difficulty", got.MaskDifficulty == src.MaskDifficulty},
		{"penalty_wrong", got.PenaltyWrong == src.PenaltyWrong},
		{"penalty_slow", got.PenaltySlow == src.PenaltySlow},
		{"penalty_last", got.PenaltyLast == src.PenaltyLast},
		{"training", got.Training == src.Training},
		{"min_play_time", got.MinPlayTime == src.MinPlayTime},
		{"multi_audio_mode", got.MultiAudioMode == src.MultiAudioMode},
		{"shuffle_remaining", got.ShuffleRemaining == src.ShuffleRemaining},
		{"random_start", got.RandomStart == src.RandomStart},
		{"random_start_max", got.RandomStartMax == src.RandomStartMax},
		{"duel_total_cards", got.DuelTotalCards == src.DuelTotalCards},
		{"duel_flip", got.DuelFlip == src.DuelFlip},
		{"duel_requeue", got.DuelRequeue == src.DuelRequeue},
		{"duel_max_rounds", got.DuelMaxRounds == src.DuelMaxRounds},
		{"duel_round_time", got.DuelRoundTime == src.DuelRoundTime},
		{"duel_grab_chances", got.DuelGrabChances == src.DuelGrabChances},
		{"duel_arrange_time", got.DuelArrangeTime == src.DuelArrangeTime},
	}
	for _, c := range checks {
		if !c.equal {
			t.Errorf("config column %s not inherited", c.name)
		}
	}
}
