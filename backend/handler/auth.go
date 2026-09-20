package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"karuta/backend/media"
	"karuta/backend/middleware"
	"karuta/backend/model"
	"karuta/backend/storage"
	"karuta/backend/store"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	store          *store.Store
	storage        storage.Storage
	media          *media.Service
	jwtSecret      string
	inviteRequired atomic.Bool // toggled by admin at runtime
}

func NewAuthHandler(s *store.Store, stor storage.Storage, mediaSvc *media.Service, jwtSecret string, inviteRequired bool) (*AuthHandler, error) {
	persistedInviteRequired, err := s.System.InviteRequired(inviteRequired)
	if err != nil {
		return nil, fmt.Errorf("load invite setting: %w", err)
	}
	h := &AuthHandler{store: s, storage: stor, media: mediaSvc, jwtSecret: jwtSecret}
	h.inviteRequired.Store(persistedInviteRequired)
	return h, nil
}

// POST /api/auth/guest — 游客登录（创建临时用户）
func (h *AuthHandler) GuestLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username      string `json:"username"`
		RecoveryToken string `json:"recovery_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid body")
		return
	}
	username := strings.TrimSpace(req.Username)
	if username == "" || len(username) < 2 || len(username) > 20 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "username must be 2-20 characters")
		return
	}

	existing, err := h.store.Users.GetByUsername(username)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to check guest")
		return
	}
	var user *model.User
	var issuedRecoveryToken string
	if existing != nil {
		if !existing.IsGuest {
			writeError(w, http.StatusConflict, "USER_EXISTS", "username already taken by a registered user")
			return
		}
		if existing.Disabled {
			writeError(w, http.StatusForbidden, "ACCOUNT_DISABLED", "account is disabled")
			return
		}
		if existing.GuestTokenHash == "" {
			writeError(w, http.StatusUnauthorized, "GUEST_RECOVERY_REQUIRED", "legacy guest identity must be recovered from an existing signed-in session")
			return
		}
		if req.RecoveryToken == "" || !validGuestRecoveryToken(existing.GuestTokenHash, req.RecoveryToken) {
			writeError(w, http.StatusUnauthorized, "INVALID_GUEST_RECOVERY", "guest nickname is already in use on another session")
			return
		}
		user = existing
	} else {
		issuedRecoveryToken, err = newGuestRecoveryToken()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to secure guest")
			return
		}
		user, err = h.store.Users.CreateGuest(username, username+"@guest.karuta", hashGuestRecoveryToken(issuedRecoveryToken))
		if err != nil {
			if isUniqueConstraintError(err) {
				writeError(w, http.StatusConflict, "USER_EXISTS", "guest nickname is already in use")
				return
			}
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create guest")
			return
		}
	}

	token, err := h.issueToken(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to issue token")
		return
	}

	fillAvatarURL(user)
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"token":                token,
		"user":                 user,
		"guest_recovery_token": issuedRecoveryToken,
	})
}

// POST /api/me/guest-recovery lets authenticated legacy guests establish a
// recovery secret before their existing JWT expires or they log out.
func (h *AuthHandler) IssueGuestRecovery(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	user, err := h.store.Users.GetByID(userID)
	if err != nil || !user.IsGuest || user.Disabled {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "guest account required")
		return
	}
	recoveryToken, err := newGuestRecoveryToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create recovery token")
		return
	}
	if err := h.store.Users.UpdateGuestTokenHash(userID, hashGuestRecoveryToken(recoveryToken)); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to save recovery token")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"guest_recovery_token": recoveryToken})
}

func newGuestRecoveryToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func hashGuestRecoveryToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

func validGuestRecoveryToken(expectedHash, token string) bool {
	actualHash := hashGuestRecoveryToken(token)
	return subtle.ConstantTimeCompare([]byte(expectedHash), []byte(actualHash)) == 1
}

// POST /api/auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username   string `json:"username"`
		Email      string `json:"email"`
		Password   string `json:"password"`
		InviteCode string `json:"invite_code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "username and password are required")
		return
	}
	inviteRequired := h.inviteRequired.Load()
	if inviteRequired && req.InviteCode == "" {
		writeError(w, http.StatusBadRequest, "INVITE_REQUIRED", "invite code is required")
		return
	}
	if req.Email == "" {
		req.Email = req.Username + "@karuta.local"
	}
	if len(req.Password) < 6 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "password must be at least 6 characters")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to hash password")
		return
	}

	user, err := h.store.Users.CreateUser(req.Username, req.Email, string(hash))
	if err != nil {
		if isUniqueConstraintError(err) {
			writeError(w, http.StatusConflict, "USER_EXISTS", "username or email already taken")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create user")
		return
	}

	// Use invite code and record relationship (only when invite system is ON)
	if inviteRequired {
		inviterID, err := h.store.Invites.UseCode(req.InviteCode, user.ID)
		if err != nil {
			_ = h.store.Users.DeleteByID(user.ID)
			writeError(w, http.StatusBadRequest, "INVALID_INVITE", "invalid or already used invite code")
			return
		}
		if err := h.store.Users.SetInvitedBy(user.ID, inviterID); err != nil {
			_ = h.store.Users.DeleteByID(user.ID)
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to record invitation")
			return
		}
	}

	token, err := h.issueToken(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to issue token")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"token": token,
		"user":  user,
	})
}

// POST /api/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid request body")
		return
	}
	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "username and password are required")
		return
	}

	user, err := h.store.Users.GetByUsername(req.Username)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid username or password")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to fetch user")
		return
	}

	if user.Disabled {
		writeError(w, http.StatusForbidden, "ACCOUNT_DISABLED", "account is disabled")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "invalid username or password")
		return
	}

	token, err := h.issueToken(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to issue token")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user":  user,
	})
}

// GET /api/me
func fillAvatarURL(u *model.User) {
	if u != nil && u.AvatarPath != "" {
		u.AvatarURL = storage.FileURL(u.AvatarPath, "avatars")
	}
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}

	user, err := h.store.Users.GetByID(userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to fetch user")
		return
	}
	fillAvatarURL(user)

	writeJSON(w, http.StatusOK, user)
}

// PATCH /api/me — 修改用户信息（用户名）
func (h *AuthHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	var req struct {
		Username string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid body")
		return
	}
	username := strings.TrimSpace(req.Username)
	if username == "" || len(username) < 2 || len(username) > 20 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "username must be 2-20 characters")
		return
	}
	if err := h.store.Users.UpdateUsername(userID, username); err != nil {
		if isUniqueConstraintError(err) {
			writeError(w, http.StatusConflict, "CONFLICT", "username already taken")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update username")
		return
	}
	user, _ := h.store.Users.GetByID(userID)
	writeJSON(w, http.StatusOK, user)
}

// POST /api/me/avatar — 上传头像
func (h *AuthHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	if err := r.ParseMultipartForm(5 * 1024 * 1024); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "failed to parse form")
		return
	}
	file, header, err := r.FormFile("avatar")
	if err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "avatar file is required")
		return
	}
	defer file.Close()
	if header.Size > 2*1024*1024 {
		writeError(w, http.StatusBadRequest, "FILE_TOO_LARGE", "avatar must be <= 2MB")
		return
	}
	data, _ := io.ReadAll(io.LimitReader(file, 2*1024*1024+1))
	ext, ok2 := detectImageFormat(data)
	if !ok2 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "unsupported format (jpg/png/webp)")
		return
	}
	oldUser, _ := h.store.Users.GetByID(userID)
	ct := "image/" + ext
	if ext == "jpg" {
		ct = "image/jpeg"
	}
	key, err := h.media.Put(r.Context(), "avatar", "avatars", ext, ct, data, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to upload")
		return
	}
	if err := h.store.Users.UpdateAvatar(userID, key); err != nil {
		// Hash keys can be shared with other users; clean up only when no
		// real reference remains.
		if refs, refErr := h.store.Users.CountAvatarPathReferences(key); refErr == nil && refs == 0 {
			if h.storage.Delete(r.Context(), key) == nil {
				_ = h.media.Forget(key)
			}
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update avatar")
		return
	}
	if oldUser != nil && oldUser.AvatarPath != "" {
		if refs, err := h.store.Users.CountAvatarPathReferences(oldUser.AvatarPath); err == nil && refs == 0 {
			oldKey := storage.PathToKey(oldUser.AvatarPath)
			if h.storage.Delete(r.Context(), oldKey) == nil {
				_ = h.media.Forget(oldKey)
			}
		}
	}
	user, _ := h.store.Users.GetByID(userID)
	fillAvatarURL(user)
	writeJSON(w, http.StatusOK, user)
}

// POST /api/me/invites — 生成邀请码
func (h *AuthHandler) GenerateInvite(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	invite, err := h.store.Invites.Generate(userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to generate invite")
		return
	}
	writeJSON(w, http.StatusOK, invite)
}

// GET /api/me/invites — 查看我的邀请码列表
func (h *AuthHandler) ListMyInvites(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	list, err := h.store.Invites.ListByCreator(userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list invites")
		return
	}
	if list == nil {
		list = []*store.Invite{}
	}
	writeJSON(w, http.StatusOK, list)
}

// GET /api/admin/users — 管理员查看所有用户（仅 aryuu）
func (h *AuthHandler) AdminListUsers(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	u, _ := h.store.Users.GetByID(userID)
	if u == nil || !u.IsAdmin {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	users, err := h.store.Users.ListAll()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list users")
		return
	}
	writeJSON(w, http.StatusOK, users)
}

// POST /api/admin/users/{id}/disable — 禁用/启用用户
func (h *AuthHandler) AdminToggleUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	u, _ := h.store.Users.GetByID(userID)
	if u == nil || !u.IsAdmin {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	var req struct {
		Disabled bool `json:"disabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid body")
		return
	}
	targetID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if targetID == 0 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid user id")
		return
	}
	if targetID == userID && req.Disabled {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "cannot disable your own account")
		return
	}
	if err := h.store.System.SetUserDisabled(userID, targetID, req.Disabled, r.RemoteAddr); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update user")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// POST /api/admin/users/{id}/admin — 设置/取消管理员
func (h *AuthHandler) AdminSetAdmin(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	u, _ := h.store.Users.GetByID(userID)
	if u == nil || !u.IsAdmin {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	var req struct {
		IsAdmin bool `json:"is_admin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid body")
		return
	}
	targetID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if targetID == 0 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid user id")
		return
	}
	if err := h.store.System.SetUserAdmin(userID, targetID, req.IsAdmin, r.RemoteAddr); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "user not found")
			return
		}
		if errors.Is(err, store.ErrLastAdmin) {
			writeError(w, http.StatusConflict, "LAST_ADMIN", "cannot remove the final administrator")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update administrator")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// POST /api/admin/invite-toggle — 切换邀请码注册开关
func (h *AuthHandler) AdminToggleInvite(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	u, _ := h.store.Users.GetByID(userID)
	if u == nil || !u.IsAdmin {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid body")
		return
	}
	if err := h.store.System.SetInviteRequired(userID, req.Enabled, r.RemoteAddr); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to save invite setting")
		return
	}
	h.inviteRequired.Store(req.Enabled)
	writeJSON(w, http.StatusOK, map[string]interface{}{"invite_required": req.Enabled})
}

// GET /api/admin/invite-status — 获取邀请码开关状态
func (h *AuthHandler) AdminInviteStatus(w http.ResponseWriter, r *http.Request) {
	h.InviteStatus(w, r)
}

// GET /api/auth/invite-status — 注册页读取当前公开注册模式。
func (h *AuthHandler) InviteStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{"invite_required": h.inviteRequired.Load()})
}

// GET /api/me/stats
func (h *AuthHandler) MyStats(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	stats, err := h.store.Rooms.GetUserStats(userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get stats")
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (h *AuthHandler) issueToken(userID int64) (string, error) {
	claims := jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(7 * 24 * time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.jwtSecret))
}
