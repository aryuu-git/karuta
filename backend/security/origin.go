package security

import (
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// OriginAllowed applies the same-origin production policy used by HTTP CORS
// and every WebSocket endpoint. Native clients commonly omit Origin and remain
// supported. Additional browser origins can be configured as a comma-separated
// CORS_ALLOWED_ORIGINS list.
func OriginAllowed(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return false
	}
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	for _, allowed := range strings.Split(os.Getenv("CORS_ALLOWED_ORIGINS"), ",") {
		if strings.EqualFold(strings.TrimRight(strings.TrimSpace(allowed), "/"), strings.TrimRight(origin, "/")) {
			return true
		}
	}
	if !strings.EqualFold(os.Getenv("APP_ENV"), "production") {
		host := u.Hostname()
		return strings.EqualFold(host, "localhost") || net.ParseIP(host).IsLoopback()
	}
	return false
}
