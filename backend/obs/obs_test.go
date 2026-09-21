package obs

import (
	"bufio"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

// 验证计数器的并发累加与快照。
func TestCounters(t *testing.T) {
	cs := NewCounters()
	c := cs.Get("ws_messages")
	c.Inc(3)
	c.Inc(2)
	if got := c.Value(); got != 5 {
		t.Fatalf("counter value = %d, want 5", got)
	}
	// 重复 Get 应返回同一计数器
	if cs.Get("ws_messages") != c {
		t.Fatal("Get returned a new counter for existing name")
	}
	snap := cs.Snapshot()
	if snap["ws_messages"] != 5 {
		t.Fatalf("snapshot ws_messages = %d, want 5", snap["ws_messages"])
	}
}

// 验证请求日志中间件：状态码捕获与请求计数。
func TestRequestLogger(t *testing.T) {
	HTTPRequestsTotal.Store(0)
	handler := RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
		_, _ = w.Write([]byte("ok"))
	}))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest("GET", "/test", nil))
	if rec.Code != http.StatusTeapot {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusTeapot)
	}
	if got := HTTPRequestsTotal.Load(); got != 1 {
		t.Fatalf("http_requests_total = %d, want 1", got)
	}
}

// 回归：包装层必须透传 http.Hijacker，否则 WebSocket 升级失败
// （症状："websocket: response does not implement http.Hijacker"）。
type hijackableRecorder struct {
	*httptest.ResponseRecorder
	hijacked bool
}

func (h *hijackableRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h.hijacked = true
	return nil, nil, errors.New("test: no real connection")
}

func TestRequestLoggerPreservesHijacker(t *testing.T) {
	base := &hijackableRecorder{ResponseRecorder: httptest.NewRecorder()}
	handler := RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hj, ok := w.(http.Hijacker)
		if !ok {
			t.Fatal("wrapped writer lost http.Hijacker support")
		}
		_, _, _ = hj.Hijack()
	}))
	handler.ServeHTTP(base, httptest.NewRequest("GET", "/ws/rooms/1", nil))
	if !base.hijacked {
		t.Fatal("Hijack was not delegated to the underlying writer")
	}
}
