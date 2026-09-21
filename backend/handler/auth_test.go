package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"karuta/backend/store"
)

func TestRegisterInviteModes(t *testing.T) {
	// Owner 决策 2026-09-21：邀请码框常驻——开放注册态改为校验固定默认码 33989
	// （原「无需任何码」契约作废；双态矩阵详见 TestRegisterInviteGateModes）。
	t.Run("open registration requires the fixed default code", func(t *testing.T) {
		h := newTestAuthHandler(t, false)
		req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(`{
			"username":"open-user","email":"open@example.test","password":"secret1","invite_code":"33989"
		}`))
		rec := httptest.NewRecorder()
		h.Register(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
	})

	t.Run("closed registration requires database invite", func(t *testing.T) {
		h := newTestAuthHandler(t, true)
		req := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(`{
			"username":"closed-user","email":"closed@example.test","password":"secret1"
		}`))
		rec := httptest.NewRecorder()
		h.Register(rec, req)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "INVITE_REQUIRED") {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
		// 固定默认码在开态同样无效（一次性码语义）
		req2 := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(`{
			"username":"closed-user2","email":"closed2@example.test","password":"secret1","invite_code":"33989"
		}`))
		rec2 := httptest.NewRecorder()
		h.Register(rec2, req2)
		if rec2.Code != http.StatusBadRequest {
			t.Fatalf("default code must be rejected when invite gate is on, status=%d body=%s", rec2.Code, rec2.Body.String())
		}
	})
}

func TestGuestLoginRequiresRecoveryTokenForExistingNickname(t *testing.T) {
	h := newTestAuthHandler(t, false)
	login := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/guest", strings.NewReader(body))
		rec := httptest.NewRecorder()
		h.GuestLogin(rec, req)
		return rec
	}

	first := login(`{"username":"visitor"}`)
	if first.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", first.Code, first.Body.String())
	}
	var created struct {
		RecoveryToken string `json:"guest_recovery_token"`
	}
	if err := json.Unmarshal(first.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.RecoveryToken == "" {
		t.Fatal("new guest did not receive a recovery token")
	}

	withoutToken := login(`{"username":"visitor"}`)
	if withoutToken.Code != http.StatusUnauthorized {
		t.Fatalf("reused nickname status=%d body=%s", withoutToken.Code, withoutToken.Body.String())
	}

	withToken := login(`{"username":"visitor","recovery_token":"` + created.RecoveryToken + `"}`)
	if withToken.Code != http.StatusCreated {
		t.Fatalf("recovery status=%d body=%s", withToken.Code, withToken.Body.String())
	}
}

func newTestAuthHandler(t *testing.T, inviteRequired bool) *AuthHandler {
	t.Helper()
	db, err := store.OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	h, err := NewAuthHandler(store.NewStore(db), nil, nil, "test-secret", inviteRequired, nil)
	if err != nil {
		t.Fatal(err)
	}
	return h
}
