// 安全与行为修复回归（2026-09-21 全仓审计轮）：
// S1 UpdateAudio IDOR：借自己的卡改他人音频 hint（修复前 200，修复后 404）
// S2 AddCardsToDeck 私有卡泄露：他人 private 卡塞入可编辑牌组（修复前成功，修复后 403）
// SetSpectate 仅 waiting 可切身份（修复前对局中可中途切旁观/玩家）
// detectAudioFormat AAC 先于 mp3 判定（修复前恒误判 mp3）
package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"karuta/backend/media"
	"karuta/backend/middleware"
	"karuta/backend/storage"
	"karuta/backend/ws"

	"github.com/go-chi/chi/v5"
)

type secEnv struct {
	*adminEnv
	cardH *CardHandler
	deckH *DeckHandler
	roomH *RoomHandler
}

// newSecEnv 复用 adminEnv 的临时库（用户 10=active / 12=normal），补挂 card/deck/room handler
func newSecEnv(t *testing.T) *secEnv {
	t.Helper()
	e := newAdminEnv(t)
	cosStorage, err := storage.NewCOSStorage("test", "test", "bucket", "ap-test", "")
	if err != nil {
		t.Fatal(err)
	}
	return &secEnv{
		adminEnv: e,
		cardH:    NewCardHandler(e.store, cosStorage, media.NewService(cosStorage, e.store.MediaAssets)),
		deckH:    NewDeckHandler(e.store),
		roomH:    NewRoomHandler(e.store, ws.NewHubManager()),
	}
}
// seedSecurityFixtures：
//   - 卡 101（用户10，含音频 201）——受害者资产
//   - 卡 102（用户10，private，无音频）——受害者私有卡
//   - 卡 103（用户10，playable）——受害者公开卡
//   - 卡 104（用户12，含音频 204）——攻击者自有卡（IDOR 跳板）
//   - 牌组 201（用户12）——攻击者自有牌组
func seedSecurityFixtures(t *testing.T, e *secEnv) {
	t.Helper()
	if _, err := e.db.Exec(`
		INSERT INTO cards (id, owner_id, display_text, cover_path, share_level) VALUES
			(101, 10, 'victim card', 'covers/v1.jpg', 'playable'),
			(102, 10, 'victim private', 'covers/v2.jpg', 'private'),
			(103, 10, 'victim public', 'covers/v3.jpg', 'playable'),
			(104, 12, 'attacker card', 'covers/a1.jpg', 'playable');
		INSERT INTO card_audios (id, card_id, audio_path) VALUES
			(201, 101, 'audio/v1.mp3'),
			(204, 104, 'audio/a1.mp3');
		INSERT INTO decks (id, owner_id, name, share_level) VALUES (201, 12, 'attacker deck', 'private');
	`); err != nil {
		t.Fatal(err)
	}
}

// serveSec 挂真实鉴权中间件并按 chi 参数路由转发（pattern 含 {param}，path 为具体值）
func serveSec(t *testing.T, h http.HandlerFunc, method, pattern, path string, userID int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	r.Group(func(pr chi.Router) {
		pr.Use(middleware.Auth(adminTestSecret, nil))
		pr.Method(method, pattern, h)
	})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tokenFor(t, userID))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// S1 核心回归：借自己的卡（104）改他人音频（201）必须被拒；归属内更新正常
func TestUpdateAudioRejectsCrossCardAudio(t *testing.T) {
	e := newSecEnv(t)
	seedSecurityFixtures(t, e)
	h := e.cardH.UpdateAudio

	// 攻击：自己的卡 ID + 受害者音频 ID（修复前直接改掉 hint）
	w := serveSec(t, h, http.MethodPatch, "/api/cards/{id}/audios/{audioID}", "/api/cards/104/audios/201", 12, `{"hint_text":"pwned"}`)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-card audio update, got %d: %s", w.Code, w.Body.String())
	}
	var hint string
	if err := e.db.QueryRow(`SELECT hint_text FROM card_audios WHERE id = 201`).Scan(&hint); err != nil {
		t.Fatal(err)
	}
	if hint == "pwned" {
		t.Fatal("victim audio hint was modified via IDOR")
	}

	// 正常路径不受影响：更新自己卡自己的音频
	w2 := serveSec(t, h, http.MethodPatch, "/api/cards/{id}/audios/{audioID}", "/api/cards/104/audios/204", 12, `{"hint_text":"legit"}`)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200 for own audio update, got %d: %s", w2.Code, w2.Body.String())
	}
}

// S2 核心回归：他人 private 卡不可加入牌组；可见卡正常
func TestAddCardsToDeckRejectsInvisibleCards(t *testing.T) {
	e := newSecEnv(t)
	seedSecurityFixtures(t, e)
	h := e.deckH.AddCardsToDeck

	// 攻击：把用户10的 private 卡 102 塞进自己的牌组（修复前成功并可经牌组泄露）
	w := serveSec(t, h, http.MethodPost, "/api/decks/{id}/cards", "/api/decks/201/cards", 12, `{"card_ids":[102]}`)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 adding someone else's private card, got %d: %s", w.Code, w.Body.String())
	}
	var inDeck int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM deck_cards WHERE deck_id = 201 AND card_id = 102`).Scan(&inDeck); err != nil {
		t.Fatal(err)
	}
	if inDeck != 0 {
		t.Fatal("private card was added to deck despite rejection")
	}

	// 正常路径：可见卡（playable）与自己的卡都可加
	w2 := serveSec(t, h, http.MethodPost, "/api/decks/{id}/cards", "/api/decks/201/cards", 12, `{"card_ids":[103,104]}`)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200 adding visible cards, got %d: %s", w2.Code, w2.Body.String())
	}
}

// 对局中切换身份（Owner 裁定 2026-09-21：中途下场是合法玩法，waiting-only
// 限制已撤）：reading 态切换成功且角色生效
func TestSetSpectateAllowedMidGame(t *testing.T) {
	e := newSecEnv(t)
	seedSecurityFixtures(t, e)
	if _, err := e.db.Exec(`
		INSERT INTO rooms (id, code, deck_id, host_id, status) VALUES (301, 'SPEC01', 201, 10, 'reading');
		INSERT INTO room_players (room_id, user_id, role) VALUES (301, 10, 'player');
	`); err != nil {
		t.Fatal(err)
	}
	// 对局中切旁观：允许
	w := serveSec(t, e.roomH.SetSpectate, http.MethodPost, "/api/rooms/{id}/spectate", "/api/rooms/301/spectate", 10, `{"spectate":true}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 mid-game spectate switch, got %d: %s", w.Code, w.Body.String())
	}
	var role string
	if err := e.db.QueryRow(`SELECT role FROM room_players WHERE room_id = 301 AND user_id = 10`).Scan(&role); err != nil {
		t.Fatal(err)
	}
	if role != "spectator" {
		t.Fatalf("role=%q want spectator", role)
	}
	// 切回玩家（中途下场）：同样允许
	w = serveSec(t, e.roomH.SetSpectate, http.MethodPost, "/api/rooms/{id}/spectate", "/api/rooms/301/spectate", 10, `{"spectate":false}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 mid-game rejoin, got %d: %s", w.Code, w.Body.String())
	}
	if err := e.db.QueryRow(`SELECT role FROM room_players WHERE room_id = 301 AND user_id = 10`).Scan(&role); err != nil {
		t.Fatal(err)
	}
	if role != "player" {
		t.Fatalf("role=%q want player after rejoin", role)
	}
}

// GetCard 可见性门（权限审查修复）：private 卡对非 owner 404（不暴露存在性），
// owner 与非 private 正常
func TestGetCardVisibilityGate(t *testing.T) {
	e := newSecEnv(t)
	seedSecurityFixtures(t, e)
	h := e.cardH.GetCard

	// 攻击：按 ID 拉他人 private 卡（修复前 200 且 hint/音频 URL 直出）
	if w := serveSec(t, h, http.MethodGet, "/api/cards/{id}", "/api/cards/102", 12, ""); w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for someone else's private card, got %d: %s", w.Code, w.Body.String())
	}
	// owner 可读自己的 private 卡
	if w := serveSec(t, h, http.MethodGet, "/api/cards/{id}", "/api/cards/102", 10, ""); w.Code != http.StatusOK {
		t.Fatalf("owner must read own private card, got %d: %s", w.Code, w.Body.String())
	}
	// 非 private（playable）对所有人可读
	if w := serveSec(t, h, http.MethodGet, "/api/cards/{id}", "/api/cards/103", 12, ""); w.Code != http.StatusOK {
		t.Fatalf("playable card must be readable, got %d: %s", w.Code, w.Body.String())
	}
}

// share_level/edit_level 值域校验（权限审查）：垃圾值此前可落库，
// canPlayDeck 的 != 'private' 会把垃圾牌组判为公开——意外泄露
func TestShareLevelValueDomain(t *testing.T) {
	e := newSecEnv(t)
	seedSecurityFixtures(t, e)

	if w := serveSec(t, e.cardH.UpdateCard, http.MethodPatch, "/api/cards/{id}", "/api/cards/104", 12, `{"share_level":"public"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("card garbage share_level expected 400, got %d: %s", w.Code, w.Body.String())
	}
	if w := serveSec(t, e.deckH.UpdateDeck, http.MethodPatch, "/api/decks/{id}", "/api/decks/201", 12, `{"share_level":"xyz"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("deck garbage share_level expected 400, got %d: %s", w.Code, w.Body.String())
	}
	if w := serveSec(t, e.deckH.UpdateDeck, http.MethodPatch, "/api/decks/{id}", "/api/decks/201", 12, `{"edit_level":"superuser"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("deck garbage edit_level expected 400, got %d: %s", w.Code, w.Body.String())
	}
	if w := serveSec(t, e.deckH.CreateDeck, http.MethodPost, "/api/decks", "/api/decks", 12, `{"name":"d","share_level":"open"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("create deck garbage share_level expected 400, got %d: %s", w.Code, w.Body.String())
	}

	// 合法值不受影响
	if w := serveSec(t, e.deckH.UpdateDeck, http.MethodPatch, "/api/decks/{id}", "/api/decks/201", 12, `{"share_level":"playable","edit_level":"full"}`); w.Code != http.StatusOK {
		t.Fatalf("valid share/edit levels expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// detectAudioFormat：AAC（ADTS sync）不再被 mp3 分支吞掉
func TestDetectAudioFormatAAC(t *testing.T) {
	cases := []struct {
		data []byte
		want string
	}{
		{[]byte{0xFF, 0xF1, 0x50, 0x80}, "aac"},
		{[]byte{0xFF, 0xF9, 0x50, 0x80}, "aac"},
		{[]byte{0xFF, 0xFB, 0x90, 0x00}, "mp3"},
		{[]byte{'I', 'D', '3', 0x04}, "mp3"},
	}
	for _, c := range cases {
		ext, ok := detectAudioFormat(c.data)
		if !ok || ext != c.want {
			t.Fatalf("detectAudioFormat(%v)=%q,%v want %q", c.data, ext, ok, c.want)
		}
	}
}
