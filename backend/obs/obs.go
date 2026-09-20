// Package obs 提供最小可观测性基线：结构化日志（slog JSON，统一 snake_case 字段）、
// HTTP 请求日志中间件、进程内事件计数器。刻意不引入 Prometheus 全家桶——
// 运维消费方是日志文件与 /metrics 简单 JSON 端点（见 cmd/server/main.go）。
package obs

import (
	"log/slog"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

// Setup 将全局 slog 默认 logger 切换为 JSON 输出（stdout）。
// 字段约定：time/level/msg 为 slog 内建，业务字段一律 snake_case
// （如 room_id、user_id、duration_ms、err）。
func Setup() {
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})
	slog.SetDefault(slog.New(handler))
}

// statusWriter 捕获响应状态码，供请求日志使用。
type statusWriter struct {
	http.ResponseWriter
	status int
}

// HTTPRequestsTotal 累计处理的 HTTP 请求总数（进程生命周期内）。
var HTTPRequestsTotal atomic.Int64

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

// RequestLogger 返回结构化访问日志中间件，替代 chi 的文本 Logger：
// 记录 method、path、status、duration_ms、remote_addr，并累计请求数。
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		HTTPRequestsTotal.Add(1)
		slog.Info("http_request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", sw.status,
			"duration_ms", time.Since(start).Milliseconds(),
			"remote_addr", r.RemoteAddr,
		)
	})
}

// Counter 是进程内事件计数器（原子操作，无锁热点）。
// 只用于增速感知（如上传次数、WS 消息量），不保证重启后持久。
type Counter struct {
	v atomic.Int64
}

func (c *Counter) Inc(delta int64) { c.v.Add(delta) }
func (c *Counter) Value() int64    { return c.v.Load() }

// Counters 是具名计数器的注册表。
type Counters struct {
	mu    sync.RWMutex
	items map[string]*Counter
}

func NewCounters() *Counters {
	return &Counters{items: make(map[string]*Counter)}
}

// Get 返回指定名称的计数器（不存在则创建）。
func (cs *Counters) Get(name string) *Counter {
	cs.mu.RLock()
	c, ok := cs.items[name]
	cs.mu.RUnlock()
	if ok {
		return c
	}
	cs.mu.Lock()
	defer cs.mu.Unlock()
	if c, ok = cs.items[name]; !ok {
		c = &Counter{}
		cs.items[name] = c
	}
	return c
}

// Snapshot 返回全部计数器的只读快照（供 /metrics 序列化）。
func (cs *Counters) Snapshot() map[string]int64 {
	cs.mu.RLock()
	defer cs.mu.RUnlock()
	out := make(map[string]int64, len(cs.items))
	for name, c := range cs.items {
		out[name] = c.Value()
	}
	return out
}

