// 身份链路回归测试（2026-09-21 三 bug 修复）：
// #1 改名重派生默认邮箱（旧昵称可再注册，不再幽灵占用）+ 游客禁止改名
// #2 Register 服务端 trim + 2–20 长度校验（与 GuestLogin 对齐）
package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"karuta/backend/middleware"

	"github.com/go-chi/chi/v5"
)

// authRouter 挂载 Register 与带鉴权中间件的 PATCH /api/me（与 main.go 同构）
func authRouter(e *adminEnv) *chi.Mux {
	r := chi.NewRouter()
	r.Post("/api/auth/register", e.handler.Register)
	r.Group(func(pr chi.Router) {
		pr.Use(middleware.Auth(adminTestSecret, nil))
		pr.Patch("/api/me", e.handler.UpdateMe)
	})
	return r
}

func doRegister(t *testing.T, r *chi.Mux, body string) (*httptest.ResponseRecorder, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var res struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	return w, res.Token
}

func doRename(t *testing.T, r *chi.Mux, token, username string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPatch, "/api/me", strings.NewReader(`{"username":"`+username+`"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// #1 核心回归：改名后派生默认邮箱同步迁移，旧昵称可被他人注册。
// 修复前实测：alice→bob 后 bob 仍持有 alice@karuta.local，第三人注册 alice 409。
func TestRenameReleasesOldUsername(t *testing.T) {
	e := newAdminEnv(t)
	r := authRouter(e)

	w1, token := doRegister(t, r, `{"username":"alice","password":"secret1","invite_code":"33989"}`)
	if w1.Code != http.StatusCreated {
		t.Fatalf("register alice: %d %s", w1.Code, w1.Body.String())
	}
	if w := doRename(t, r, token, "bob"); w.Code != http.StatusOK {
		t.Fatalf("rename bob: %d %s", w.Code, w.Body.String())
	}

	var email string
	if err := e.db.QueryRow(`SELECT email FROM users WHERE username = 'bob'`).Scan(&email); err != nil {
		t.Fatal(err)
	}
	if email != "bob@karuta.local" {
		t.Fatalf("derived email not re-derived on rename: %q", email)
	}

	// 旧昵称空出后可被他人注册
	if w3, _ := doRegister(t, r, `{"username":"alice","password":"secret2","invite_code":"33989"}`); w3.Code != http.StatusCreated {
		t.Fatalf("expected 201 re-registering released username, got %d: %s", w3.Code, w3.Body.String())
	}
}

// #1 对称面：用户自带邮箱（非派生值）不随改名迁移
func TestRenameKeepsCustomEmail(t *testing.T) {
	e := newAdminEnv(t)
	r := authRouter(e)

	w1, token := doRegister(t, r, `{"username":"carol","password":"secret1","email":"custom@example.test","invite_code":"33989"}`)
	if w1.Code != http.StatusCreated {
		t.Fatalf("register carol: %d %s", w1.Code, w1.Body.String())
	}
	if w := doRename(t, r, token, "dave"); w.Code != http.StatusOK {
		t.Fatalf("rename dave: %d %s", w.Code, w.Body.String())
	}
	var email string
	if err := e.db.QueryRow(`SELECT email FROM users WHERE username = 'dave'`).Scan(&email); err != nil {
		t.Fatal(err)
	}
	if email != "custom@example.test" {
		t.Fatalf("custom email must not be rewritten, got %q", email)
	}
}

// #1 游客禁止改名：恢复码以昵称原样为键，改名即永久失配（换设备锁死）
func TestGuestCannotRename(t *testing.T) {
	e := newAdminEnv(t)
	r := authRouter(e)
	if _, err := e.db.Exec(`INSERT INTO users (id, username, email, password, is_guest, guest_token_hash) VALUES (20, 'ghost', 'ghost@guest.karuta', '', TRUE, 'h')`); err != nil {
		t.Fatal(err)
	}
	w := doRename(t, r, tokenFor(t, 20), "ghost2")
	if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "GUEST_RENAME_FORBIDDEN") {
		t.Fatalf("expected 403 GUEST_RENAME_FORBIDDEN, got %d: %s", w.Code, w.Body.String())
	}
	var name string
	if err := e.db.QueryRow(`SELECT username FROM users WHERE id = 20`).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "ghost" {
		t.Fatalf("guest username changed despite rejection: %q", name)
	}
}

// #2 Register 服务端校验与 GuestLogin 对齐：trim + 2–20
func TestRegisterValidatesUsername(t *testing.T) {
	e := newAdminEnv(t)
	r := authRouter(e)

	// trim 后仅 1 字符 → 400（修复前 201）
	if w, _ := doRegister(t, r, `{"username":" q ","password":"secret1","invite_code":"33989"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for 1-char name, got %d: %s", w.Code, w.Body.String())
	}
	// 64 字符 → 400（修复前 201）
	long := strings.Repeat("n", 64)
	if w, _ := doRegister(t, r, `{"username":"`+long+`","password":"secret1","invite_code":"33989"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for 64-char name, got %d: %s", w.Code, w.Body.String())
	}
	// 前后空格被吞：入库昵称为 trim 后值（修复前 ' spaced ' 与 'spaced' 双账号并存）
	if w, _ := doRegister(t, r, `{"username":"  spaced  ","password":"secret1","invite_code":"33989"}`); w.Code != http.StatusCreated {
		t.Fatalf("expected 201 for spaced name, got %d: %s", w.Code, w.Body.String())
	}
	var stored string
	if err := e.db.QueryRow(`SELECT username FROM users WHERE username = 'spaced'`).Scan(&stored); err != nil {
		t.Fatalf("trimmed username not stored: %v", err)
	}
	var spacedSibling int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM users WHERE username = '  spaced  '`).Scan(&spacedSibling); err != nil {
		t.Fatal(err)
	}
	if spacedSibling != 0 {
		t.Fatal("untrimmed sibling account exists")
	}
}

// Owner 决策 2026-09-21：邀请码框常驻双态——开关关闭校验固定默认码 33989，
// 开启后仅数据库一次性码有效（33989 同样被拒）。
func TestRegisterInviteGateModes(t *testing.T) {
	e := newAdminEnv(t) // fallback false = 关态
	r := authRouter(e)

	// 关态：无码 400 / 错码 400 INVALID_INVITE / 33989 放行
	if w, _ := doRegister(t, r, `{"username":"nocode01","password":"secret1"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("closed mode: expected 400 without code, got %d: %s", w.Code, w.Body.String())
	}
	if w, _ := doRegister(t, r, `{"username":"wrongcd","password":"secret1","invite_code":"12345"}`); w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "INVALID_INVITE") {
		t.Fatalf("closed mode: expected 400 INVALID_INVITE for wrong default code, got %d: %s", w.Code, w.Body.String())
	}
	if w, _ := doRegister(t, r, `{"username":"withdef","password":"secret1","invite_code":"33989"}`); w.Code != http.StatusCreated {
		t.Fatalf("closed mode: expected 201 with default code, got %d: %s", w.Code, w.Body.String())
	}

	// 开态：默认码失效；一次性码 201；空码 INVITE_REQUIRED
	e.handler.inviteRequired.Store(true)
	if w, _ := doRegister(t, r, `{"username":"opendef","password":"secret1","invite_code":"33989"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("open mode: expected 400 for fixed default code, got %d: %s", w.Code, w.Body.String())
	}
	inv, err := e.store.Invites.Generate(e.active)
	if err != nil {
		t.Fatal(err)
	}
	if w, _ := doRegister(t, r, `{"username":"openok1","password":"secret1","invite_code":"`+inv.Code+`"}`); w.Code != http.StatusCreated {
		t.Fatalf("open mode: expected 201 with one-time code, got %d: %s", w.Code, w.Body.String())
	}
	if w, _ := doRegister(t, r, `{"username":"openemp","password":"secret1"}`); w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "INVITE_REQUIRED") {
		t.Fatalf("open mode: expected 400 INVITE_REQUIRED, got %d: %s", w.Code, w.Body.String())
	}
}
