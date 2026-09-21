// 管理员逻辑加固回归测试（2026-09-21 六项修复）：
// #1 禁用同僚管理员被拒（须先降级，防「禁用→降级」绕过 LAST_ADMIN 清除同僚）
// #2 注册+邀请码消费单事务（失败整体回滚，无幽灵用户/烧毁邀请码）
// #3 游客不可授予管理员
// #4 审计 source_ip 取自反代头（X-Real-IP），不再是 RemoteAddr 的代理地址
package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"karuta/backend/middleware"

	"github.com/go-chi/chi/v5"
)

// serveWithHeader 与 serve 同构，但允许注入请求头（审计 IP 回归用）。
func (e *adminEnv) serveWithHeader(t *testing.T, method, path string, userID int64, body string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	r.Group(func(pr chi.Router) {
		pr.Use(middleware.Auth(adminTestSecret, nil))
		pr.Post("/api/admin/users/{id}/disable", e.handler.AdminToggleUser)
		pr.Post("/api/admin/users/{id}/admin", e.handler.AdminSetAdmin)
	})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tokenFor(t, userID))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// #1 核心回归：管理员不可直接禁用另一管理员；降级后方可禁用。
// 修复前存在「A 禁用 B（无拦）→ 降级 B（target 已禁用故放行）」的同僚清除链。
func TestCannotDisablePeerAdminBeforeDemote(t *testing.T) {
	e := newAdminEnv(t)
	if _, err := e.db.Exec(`INSERT INTO users (id, username, email, password, is_admin) VALUES (13, 'peer_admin', 'p@example.test', 'x', TRUE)`); err != nil {
		t.Fatal(err)
	}

	disablePath := "/api/admin/users/13/disable"
	w := e.serve(t, http.MethodPost, disablePath, e.active, `{"disabled":true}`)
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "TARGET_IS_ADMIN") {
		t.Fatalf("expected 409 TARGET_IS_ADMIN on peer-admin disable, got %d: %s", w.Code, w.Body.String())
	}

	// 显式降级（受 LAST_ADMIN 保护）后，禁用放行——正确的两步语义。
	if w := e.serve(t, http.MethodPost, "/api/admin/users/13/admin", e.active, `{"is_admin":false}`); w.Code != http.StatusOK {
		t.Fatalf("expected 200 on demote, got %d: %s", w.Code, w.Body.String())
	}
	if w := e.serve(t, http.MethodPost, disablePath, e.active, `{"disabled":true}`); w.Code != http.StatusOK {
		t.Fatalf("expected 200 on disable after demote, got %d: %s", w.Code, w.Body.String())
	}
}

// #3 核心回归：游客（恢复码续命的临时身份）不可被授予管理员。
func TestGuestCannotBeGrantedAdmin(t *testing.T) {
	e := newAdminEnv(t)
	if _, err := e.db.Exec(`INSERT INTO users (id, username, email, password, is_guest, guest_token_hash) VALUES (14, 'guest_one', 'guest1@example.test', '', TRUE, 'hash')`); err != nil {
		t.Fatal(err)
	}
	w := e.serve(t, http.MethodPost, "/api/admin/users/14/admin", e.active, `{"is_admin":true}`)
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "GUEST_NOT_ALLOWED") {
		t.Fatalf("expected 400 GUEST_NOT_ALLOWED on guest promotion, got %d: %s", w.Code, w.Body.String())
	}
	var isAdmin bool
	if err := e.db.QueryRow(`SELECT COALESCE(is_admin, FALSE) FROM users WHERE id = 14`).Scan(&isAdmin); err != nil {
		t.Fatal(err)
	}
	if isAdmin {
		t.Fatal("guest was granted administrator despite rejection")
	}
}

// #2 核心回归：邀请码注册单事务——成功路径记录邀请人与消费；失败路径
// 整体回滚（修复前失败补偿 DeleteByID 会被 invites.used_by 外键阻断，
// 留下幽灵用户与烧毁的邀请码）。
func TestRegisterWithInviteSingleTransaction(t *testing.T) {
	e := newAdminEnv(t)
	e.handler.inviteRequired.Store(true)
	inv, err := e.store.Invites.Generate(e.active)
	if err != nil {
		t.Fatal(err)
	}

	register := func(username, code string) *httptest.ResponseRecorder {
		body := `{"username":"` + username + `","password":"secret1","invite_code":"` + code + `"}`
		req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
		w := httptest.NewRecorder()
		e.handler.Register(w, req)
		return w
	}

	// 成功路径：用户建立、invited_by 指向邀请人、邀请码被消费
	if w := register("newbie", inv.Code); w.Code != http.StatusCreated {
		t.Fatalf("expected 201 on valid invite, got %d: %s", w.Code, w.Body.String())
	}
	var userID, invitedBy, usedBy int64
	if err := e.db.QueryRow(`SELECT id, COALESCE(invited_by, 0) FROM users WHERE username = 'newbie'`).Scan(&userID, &invitedBy); err != nil {
		t.Fatal(err)
	}
	if invitedBy != e.active {
		t.Fatalf("invited_by=%d, want %d", invitedBy, e.active)
	}
	if err := e.db.QueryRow(`SELECT used_by FROM invites WHERE id = ?`, inv.ID).Scan(&usedBy); err != nil {
		t.Fatal(err)
	}
	if usedBy != userID {
		t.Fatalf("invite used_by=%d, want %d", usedBy, userID)
	}

	// 复用邀请码：400 且不残留用户（事务回滚）
	if w := register("newbie2", inv.Code); w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "INVALID_INVITE") {
		t.Fatalf("expected 400 INVALID_INVITE on reuse, got %d: %s", w.Code, w.Body.String())
	}
	// 无效邀请码：400 且不残留用户
	if w := register("newbie3", "ZZZZZZZZ"); w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "INVALID_INVITE") {
		t.Fatalf("expected 400 INVALID_INVITE on bad code, got %d: %s", w.Code, w.Body.String())
	}
	var ghosts int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM users WHERE username IN ('newbie2', 'newbie3')`).Scan(&ghosts); err != nil {
		t.Fatal(err)
	}
	if ghosts != 0 {
		t.Fatalf("expected no residual users after failed registration, got %d", ghosts)
	}
}

// #4 核心回归：审计记录的 source_ip 来自反代注入的 X-Real-IP，
// 修复前取 r.RemoteAddr——生产经 nginx 反代时全部记录为 127.0.0.1。
func TestAuditRecordsProxyClientIP(t *testing.T) {
	e := newAdminEnv(t)
	w := e.serveWithHeader(t, http.MethodPost, "/api/admin/users/12/disable", e.active, `{"disabled":true}`,
		map[string]string{"X-Real-IP": "203.0.113.9"})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on disable, got %d: %s", w.Code, w.Body.String())
	}
	var sourceIP string
	if err := e.db.QueryRow(`SELECT source_ip FROM admin_audit_logs WHERE action = 'user.disabled_changed' ORDER BY id DESC LIMIT 1`).Scan(&sourceIP); err != nil {
		t.Fatal(err)
	}
	if sourceIP != "203.0.113.9" {
		t.Fatalf("audit source_ip=%q, want 203.0.113.9", sourceIP)
	}
}
