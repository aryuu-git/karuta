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

	"karuta/backend/achievement"
	"karuta/backend/media"
	"karuta/backend/middleware"
	"karuta/backend/model"
	"karuta/backend/storage"
	"karuta/backend/store"
	"karuta/backend/ws"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// 默认派生邮箱后缀：注册与游客身份的 email 由用户名派生。UpdateMe 改名时
// 据此判断是否同步重派生——email 有 UNIQUE 约束，改名若不迁移派生邮箱，
// 旧昵称会被幽灵占用、他人无法注册（2026-09-21 实测复现，修复 #1）。
const (
	defaultEmailSuffix = "@karuta.local"
	guestEmailSuffix   = "@guest.karuta"
	// defaultOpenInviteCode 邀请码开关关闭时的固定默认码（Owner 决策
	// 2026-09-21：恢复改造前交互——注册页邀请码框常驻，关态填 33989 即过）。
	// 注意：固定码无实际安全门槛，仅为交互仪式感；真正的门是开关开启后
	// 的数据库一次性码。
	defaultOpenInviteCode = "33989"
)

type AuthHandler struct {
	store          *store.Store
	storage        storage.Storage
	media          *media.Service
	jwtSecret      string
	inviteRequired atomic.Bool // toggled by admin at runtime
	// hubs：禁用账号时断开其全部存量 WS 连接（D12-补3；可为 nil，仅测试）
	hubs *ws.HubManager
}

func NewAuthHandler(s *store.Store, stor storage.Storage, mediaSvc *media.Service, jwtSecret string, inviteRequired bool, hubs *ws.HubManager) (*AuthHandler, error) {
	persistedInviteRequired, err := s.System.InviteRequired(inviteRequired)
	if err != nil {
		return nil, fmt.Errorf("load invite setting: %w", err)
	}
	h := &AuthHandler{store: s, storage: stor, media: mediaSvc, jwtSecret: jwtSecret, hubs: hubs}
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
			// 模糊化防用户名枚举（D12）：不区分"正式用户占用"与"其他不可用原因"，
			// 攻击者无法借此区分游客账号与正式账号
			writeError(w, http.StatusConflict, "GUEST_NAME_UNAVAILABLE", "guest nickname is unavailable")
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
		user, err = h.store.Users.CreateGuest(username, username+guestEmailSuffix, hashGuestRecoveryToken(issuedRecoveryToken))
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
	// 与 GuestLogin 同标准（修复 #2）：trim + 2–20。此前服务端只查非空，
	// " spaced " 与 "spaced" 双账号、1 字符/超长昵称均可绕过前端校验直调 API 创建。
	username := strings.TrimSpace(req.Username)
	if len(username) < 2 || len(username) > 20 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "username must be 2-20 characters")
		return
	}
	req.Username = username
	if req.Password == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "username and password are required")
		return
	}
	// 邀请码门（Owner 决策 2026-09-21）：框常驻双态校验——
	// 开关开启：数据库一次性码（事务内消费）；开关关闭：固定默认码 33989。
	inviteRequired := h.inviteRequired.Load()
	if inviteRequired {
		if req.InviteCode == "" {
			writeError(w, http.StatusBadRequest, "INVITE_REQUIRED", "invite code is required")
			return
		}
	} else if req.InviteCode != defaultOpenInviteCode {
		writeError(w, http.StatusBadRequest, "INVALID_INVITE", "invalid or already used invite code")
		return
	}
	if req.Email == "" {
		req.Email = req.Username + defaultEmailSuffix
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

	var user *model.User
	var inviterID int64
	if inviteRequired {
		// 单事务注册（修复 #2）：消费邀请码、建用户、记录邀请人原子完成，
		// 任一步失败整体回滚。原三步独立写 + DeleteByID 补偿会被
		// invites.used_by 外键阻断，产生幽灵用户与烧毁的邀请码。
		user, inviterID, err = h.store.Users.CreateUserWithInvite(req.Username, req.Email, string(hash), req.InviteCode)
		if err != nil {
			if errors.Is(err, store.ErrInvalidInvite) {
				writeError(w, http.StatusBadRequest, "INVALID_INVITE", "invalid or already used invite code")
				return
			}
			if isUniqueConstraintError(err) {
				writeError(w, http.StatusConflict, "USER_EXISTS", "username or email already taken")
				return
			}
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create user")
			return
		}
	} else {
		user, err = h.store.Users.CreateUser(req.Username, req.Email, string(hash))
		if err != nil {
			if isUniqueConstraintError(err) {
				writeError(w, http.StatusConflict, "USER_EXISTS", "username or email already taken")
				return
			}
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create user")
			return
		}
	}

	token, err := h.issueToken(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to issue token")
		return
	}

	// 成就：邀请人的邀请码被成功使用（best-effort；邀请人通常离线，
	// 解锁静默落库，下次拉取成就时前端 diff 弹出）
	if inviterID != 0 {
		achievement.NewEvaluator(h.store).OnContentEvent(inviterID, "invite")
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
	// 被禁用的账号：存量 JWT 在会话恢复时即失效（前端收到 403 会清 token），
	// 将"禁用"从仅挡新登录收紧为下次刷新即失权（D11 审计修复）
	if user.Disabled {
		writeError(w, http.StatusForbidden, "ACCOUNT_DISABLED", "account is disabled")
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
	current, err := h.store.Users.GetByID(userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to fetch user")
		return
	}
	// 游客禁止改名（修复 #1）：恢复码 localStorage 以「昵称原样」为键，
	// 改名即与本地凭据永久失配（换设备 401 锁死）；产品本无游客改名入口。
	if current.IsGuest {
		writeError(w, http.StatusForbidden, "GUEST_RENAME_FORBIDDEN", "guest accounts cannot rename")
		return
	}
	// 派生默认邮箱随改名重派生（修复 #1）：否则旧昵称的默认邮箱被幽灵占用，
	// 该昵称永久无法被他人注册（实测复现）。非派生邮箱（用户自带）不动。
	newEmail := current.Email
	if current.Email == current.Username+defaultEmailSuffix {
		newEmail = username + defaultEmailSuffix
	}
	if err := h.store.Users.UpdateUsername(userID, username, newEmail); err != nil {
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
		// 与卡牌上传路径一致：配额超限映射 413 QUOTA_EXCEEDED（原 500 丢失语义）
		writeMediaPutError(w, err)
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
	if u == nil || !u.IsAdmin || u.Disabled {
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
	if u == nil || !u.IsAdmin || u.Disabled {
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
	// 修复 #1：禁止直接禁用其他管理员。降级是显式、审计且受 LAST_ADMIN
	// 保护的动作；若允许「先禁用再降级」，禁用绕过最后一个可用管理员保护、
	// 后续降级又因 target 已禁用而被放行——组合即可无痕清除同僚管理员。
	if req.Disabled {
		target, err := h.store.Users.GetByID(targetID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeError(w, http.StatusNotFound, "NOT_FOUND", "user not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to fetch user")
			return
		}
		if target.IsAdmin {
			writeError(w, http.StatusConflict, "TARGET_IS_ADMIN", "demote the administrator before disabling")
			return
		}
	}
	if err := h.store.System.SetUserDisabled(userID, targetID, req.Disabled, clientIP(r)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update user")
		return
	}
	// 禁用即时生效到实时通道：断开该用户全部存量 WS 连接（D12-补3，
	// 否则被禁用玩家可继续抢牌聊天直到自己断线）
	if req.Disabled && h.hubs != nil {
		h.hubs.DisconnectUserEverywhere(targetID)
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
	if u == nil || !u.IsAdmin || u.Disabled {
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
	// 修复 #3：游客是恢复码续命的临时身份，不允许授予管理员
	// （临时身份持高权限，凭据轮换/找回机制均不适用）。
	if req.IsAdmin {
		target, err := h.store.Users.GetByID(targetID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeError(w, http.StatusNotFound, "NOT_FOUND", "user not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to fetch user")
			return
		}
		if target.IsGuest {
			writeError(w, http.StatusBadRequest, "GUEST_NOT_ALLOWED", "guest accounts cannot be granted administrator")
			return
		}
	}
	if err := h.store.System.SetUserAdmin(userID, targetID, req.IsAdmin, clientIP(r)); err != nil {
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
	if u == nil || !u.IsAdmin || u.Disabled {
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
	if err := h.store.System.SetInviteRequired(userID, req.Enabled, clientIP(r)); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to save invite setting")
		return
	}
	h.inviteRequired.Store(req.Enabled)
	writeJSON(w, http.StatusOK, map[string]interface{}{"invite_required": req.Enabled})
}

// GET /api/admin/invite-status — 管理员读取开关状态（修复 #6：补齐管理门禁，
// 与其余 /api/admin/* 端点语义一致；数据本身与公开端点相同，无信息增量）。
func (h *AuthHandler) AdminInviteStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	u, _ := h.store.Users.GetByID(userID)
	if u == nil || !u.IsAdmin || u.Disabled {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "admin only")
		return
	}
	h.InviteStatus(w, r)
}

// GET /api/auth/invite-status — 注册页读取当前公开注册模式。
func (h *AuthHandler) InviteStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{"invite_required": h.inviteRequired.Load()})
}

// POST /api/me/password — 已登录改密（旧密码验证 + 新密码写入）
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid body")
		return
	}
	user, err := h.store.Users.GetByID(userID)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "user not found")
		return
	}
	// 游客无密码体系——想设密码请走转正（/api/me/upgrade）
	if user.IsGuest {
		writeError(w, http.StatusBadRequest, "GUEST_UPGRADE_REQUIRED", "guest accounts have no password; upgrade first")
		return
	}
	if len(req.NewPassword) < 6 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "password must be at least 6 characters")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.OldPassword)) != nil {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "old password is incorrect")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), 12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to hash password")
		return
	}
	if err := h.store.Users.UpdatePassword(userID, string(hash)); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update password")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// POST /api/me/upgrade — 游客转正：换昵称/密码成为正式账号。
// JWT 不变（sub 同一 uid），战绩与成就零迁移；旧恢复码作废。
func (h *AuthHandler) UpgradeGuest(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid body")
		return
	}
	username := strings.TrimSpace(req.Username)
	if len(username) < 2 || len(username) > 20 {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "username must be 2-20 characters")
		return
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
	user, err := h.store.Users.UpgradeGuest(userID, username, username+defaultEmailSuffix, string(hash))
	if err != nil {
		if errors.Is(err, store.ErrNotGuest) {
			writeError(w, http.StatusBadRequest, "ALREADY_MEMBER", "account is not a guest")
			return
		}
		if isUniqueConstraintError(err) {
			writeError(w, http.StatusConflict, "USER_EXISTS", "username already taken")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to upgrade account")
		return
	}
	fillAvatarURL(user)
	writeJSON(w, http.StatusOK, map[string]interface{}{"user": user})
}

// GET /api/me/achievements — 成就全量（注册表定义 × 用户侧状态）。
// 前端个人页网格与右下角弹层（diff）共用此端点。
func (h *AuthHandler) MyAchievements(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "not authenticated")
		return
	}
	list, err := achievement.NewEvaluator(h.store).ListForUser(userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list achievements")
		return
	}
	if list == nil {
		list = []achievement.UserAchievement{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"achievements": list})
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
