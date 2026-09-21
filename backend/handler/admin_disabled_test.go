// 管理员禁用鉴权回归测试（D11 审计修复）：
// 被禁用的管理员曾可用存量 JWT 行使管理权并自解禁（实测复现过），修复后必须 403。
package handler

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"karuta/backend/media"
	"karuta/backend/middleware"
	"karuta/backend/storage"
	"karuta/backend/store"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

const adminTestSecret = "test-secret" //nolint:gosec // 测试常量

// adminEnv：临时 sqlite + 真实鉴权中间件。预置两名管理员（admin_active / admin_disabled）。
type adminEnv struct {
	handler *AuthHandler
	store   *store.Store
	db      *sql.DB
	active  int64
	banned  int64
}

func newAdminEnv(t *testing.T) *adminEnv {
	t.Helper()
	db, err := store.OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := store.NewStore(db)
	if _, err := db.Exec(`
		INSERT INTO users (id, username, email, password, is_admin) VALUES (10, 'admin_active', 'a@example.test', 'x', TRUE);
		INSERT INTO users (id, username, email, password, is_admin, disabled) VALUES (11, 'admin_disabled', 'b@example.test', 'x', TRUE, TRUE);
		INSERT INTO users (id, username, email, password) VALUES (12, 'normal', 'c@example.test', 'x');
	`); err != nil {
		t.Fatal(err)
	}
	// storage/media 仅满足构造依赖：admin/me 端点不触碰对象存储
	cosStorage, err := storage.NewCOSStorage("test", "test", "bucket", "ap-test", "")
	if err != nil {
		t.Fatal(err)
	}
	authH, err := NewAuthHandler(s, cosStorage, media.NewService(cosStorage, s.MediaAssets), adminTestSecret, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	return &adminEnv{handler: authH, store: s, db: db, active: 10, banned: 11}
}

// tokenFor 签发与 main.go 同构的 HS256 JWT（middleware.Auth 校验；sub 为数值 claim）
func tokenFor(t *testing.T, userID int64) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
	})
	signed, err := tok.SignedString([]byte(adminTestSecret))
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

// serve 挂载真实路由（chi + Auth 中间件）并带指定用户 token 发请求
func (e *adminEnv) serve(t *testing.T, method, path string, userID int64, body string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	r.Group(func(pr chi.Router) {
		pr.Use(middleware.Auth(adminTestSecret, nil))
		pr.Get("/api/admin/users", e.handler.AdminListUsers)
		pr.Post("/api/admin/users/{id}/disable", e.handler.AdminToggleUser)
		pr.Post("/api/admin/users/{id}/admin", e.handler.AdminSetAdmin)
		pr.Get("/api/me", e.handler.Me)
	})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tokenFor(t, userID))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// 正常管理员对照：admin API 可用
func TestActiveAdminCanListUsers(t *testing.T) {
	e := newAdminEnv(t)
	if w := e.serve(t, http.MethodGet, "/api/admin/users", e.active, ""); w.Code != http.StatusOK {
		t.Fatalf("expected 200 for active admin, got %d: %s", w.Code, w.Body.String())
	}
}

// 核心回归：被禁用的管理员调 admin API 必须 403（修复前实测为 200）
func TestDisabledAdminRejectedFromAdminAPI(t *testing.T) {
	e := newAdminEnv(t)
	if w := e.serve(t, http.MethodGet, "/api/admin/users", e.banned, ""); w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for disabled admin, got %d: %s", w.Code, w.Body.String())
	}
}

// 核心回归：被禁用的管理员不能自解禁（修复前实测为 200，禁令形同虚设）
func TestDisabledAdminCannotSelfReenable(t *testing.T) {
	e := newAdminEnv(t)
	path := "/api/admin/users/" + strconv.FormatInt(e.banned, 10) + "/disable"
	if w := e.serve(t, http.MethodPost, path, e.banned, `{"disabled":false}`); w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 on self-reenable, got %d: %s", w.Code, w.Body.String())
	}
}

// me 端点：被禁用账号的存量 JWT 在会话恢复时即失效
func TestMeRejectsDisabledUser(t *testing.T) {
	e := newAdminEnv(t)
	if w := e.serve(t, http.MethodGet, "/api/me", e.banned, ""); w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 from /me for disabled user, got %d: %s", w.Code, w.Body.String())
	}
	// 对照：正常用户可用
	if w := e.serve(t, http.MethodGet, "/api/me", e.active, ""); w.Code != http.StatusOK {
		t.Fatalf("expected 200 from /me for active user, got %d: %s", w.Code, w.Body.String())
	}
}

// middleware 级回归（D12-补）：被禁用账号的存量 JWT 在任意请求即 403（7 天窗口归零）
func TestMiddlewareRejectsDisabledToken(t *testing.T) {
	e := newAdminEnv(t)
	r := chi.NewRouter()
	r.Group(func(pr chi.Router) {
		pr.Use(middleware.Auth(adminTestSecret, e.store.Users))
		pr.Get("/api/me", e.handler.Me)
	})
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+tokenFor(t, e.banned))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "ACCOUNT_DISABLED") {
		t.Fatalf("expected 403 ACCOUNT_DISABLED at middleware, got %d: %s", w.Code, w.Body.String())
	}
}

// LAST_ADMIN 语义回归（D12 边缘瑕疵修复）：
// 唯一可用管理员不可被降级；但被禁用的管理员可以被降级（它不在可用集合中，降级不损失保护目标）。
func TestLastAdminSemantics(t *testing.T) {
	e := newAdminEnv(t)
	// 场景 1：系统仅 1 个可用管理员（active），降级它 → 409 LAST_ADMIN
	if w := e.serve(t, http.MethodPost, "/api/admin/users/10/admin", e.active, `{"is_admin":false}`); w.Code != http.StatusConflict {
		t.Fatalf("expected 409 demoting sole active admin, got %d: %s", w.Code, w.Body.String())
	}
	// 场景 2：降级被禁用的管理员（banned，admin+disabled）→ 允许（修复前误拦 409）
	if w := e.serve(t, http.MethodPost, "/api/admin/users/11/admin", e.active, `{"is_admin":false}`); w.Code != http.StatusOK {
		t.Fatalf("expected 200 demoting disabled admin, got %d: %s", w.Code, w.Body.String())
	}
}

// 游客昵称枚举模糊化（D12）：正式用户占用与游客占用返回同一不可用语义（409 GUEST_NAME_UNAVAILABLE）
func TestGuestNameEnumerationBlurred(t *testing.T) {
	e := newAdminEnv(t)
	guestH, err := NewAuthHandler(e.store, nil, nil, adminTestSecret, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	r := chi.NewRouter()
	r.Post("/api/auth/guest", guestH.GuestLogin)
	// 撞正式用户（normal, id=12）
	req := httptest.NewRequest(http.MethodPost, "/api/auth/guest", strings.NewReader(`{"username":"normal"}`))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "GUEST_NAME_UNAVAILABLE") {
		t.Fatalf("expected blurred 409 GUEST_NAME_UNAVAILABLE, got %d: %s", w.Code, w.Body.String())
	}
}
