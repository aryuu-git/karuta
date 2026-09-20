package handler

import "testing"

func TestValidWebSocketPath(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{"/ws/rooms/1", true},
		{"/ws/ccp/rooms/ABCD", true},
		{"/ws/quadrant/rooms/42", true},
		{"/ws/rooms/not-a-number", false},
		{"/ws/rooms/1?token=secret", false},
		{"/ws/ccp-local", false},
		{"https://example.test/ws/rooms/1", false},
		{"/api/rooms/1", false},
	}
	for _, tt := range tests {
		if got := validWebSocketPath(tt.path); got != tt.want {
			t.Errorf("validWebSocketPath(%q) = %v, want %v", tt.path, got, tt.want)
		}
	}
}
