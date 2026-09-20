package security

import (
	"net/http/httptest"
	"testing"
)

func TestOriginAllowed(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://app.example.com")

	tests := []struct {
		name   string
		host   string
		origin string
		want   bool
	}{
		{"native client", "api.example.com", "", true},
		{"same origin", "api.example.com", "https://api.example.com", true},
		{"configured origin", "api.example.com", "https://app.example.com", true},
		{"foreign origin", "api.example.com", "https://evil.example", false},
		{"malformed origin", "api.example.com", "://bad", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "http://"+tt.host+"/ws", nil)
			req.Host = tt.host
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			if got := OriginAllowed(req); got != tt.want {
				t.Fatalf("OriginAllowed()=%v want %v", got, tt.want)
			}
		})
	}
}

func TestOriginAllowedDevelopmentLoopback(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("CORS_ALLOWED_ORIGINS", "")
	req := httptest.NewRequest("GET", "http://localhost:8080/ws", nil)
	req.Host = "localhost:8080"
	req.Header.Set("Origin", "http://localhost:5173")
	if !OriginAllowed(req) {
		t.Fatal("development loopback origin should be allowed")
	}
}
