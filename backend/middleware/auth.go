package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const userIDKey contextKey = "userID"

// DisabledChecker 被禁用账号判定。由 store.UserStore 实现；测试可注入 fake。
type DisabledChecker interface {
	IsDisabled(userID int64) (bool, error)
}

// Auth returns a middleware that validates the Bearer JWT, rejects disabled
// accounts (D12-补：存量 JWT 任意请求即失权，消除禁用后的 7 天窗口), and
// injects userID into context. checker 为 nil 时跳过禁用校验（仅测试便利）。
func Auth(jwtSecret string, checker DisabledChecker) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, `{"error":"UNAUTHORIZED","message":"missing authorization header"}`, http.StatusUnauthorized)
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				http.Error(w, `{"error":"UNAUTHORIZED","message":"invalid authorization header format"}`, http.StatusUnauthorized)
				return
			}

			tokenStr := parts[1]
			token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return []byte(jwtSecret), nil
			})
			if err != nil || !token.Valid {
				http.Error(w, `{"error":"UNAUTHORIZED","message":"invalid or expired token"}`, http.StatusUnauthorized)
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				http.Error(w, `{"error":"UNAUTHORIZED","message":"invalid token claims"}`, http.StatusUnauthorized)
				return
			}

			// sub is stored as float64 in MapClaims
			subRaw, ok := claims["sub"]
			if !ok {
				http.Error(w, `{"error":"UNAUTHORIZED","message":"missing sub claim"}`, http.StatusUnauthorized)
				return
			}
			var userID int64
			switch v := subRaw.(type) {
			case float64:
				userID = int64(v)
			case int64:
				userID = v
			default:
				http.Error(w, `{"error":"UNAUTHORIZED","message":"invalid sub claim type"}`, http.StatusUnauthorized)
				return
			}

			// 禁用账号：存量 JWT 任意请求即失权（D12-补，消除 7 天窗口）
			if checker != nil {
				disabled, err := checker.IsDisabled(userID)
				if err != nil {
					http.Error(w, `{"error":"INTERNAL_ERROR","message":"failed to verify account state"}`, http.StatusInternalServerError)
					return
				}
				if disabled {
					http.Error(w, `{"error":"ACCOUNT_DISABLED","message":"account is disabled"}`, http.StatusForbidden)
					return
				}
			}

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserID extracts the userID from the request context.
func GetUserID(ctx context.Context) (int64, bool) {
	v := ctx.Value(userIDKey)
	if v == nil {
		return 0, false
	}
	id, ok := v.(int64)
	return id, ok
}
