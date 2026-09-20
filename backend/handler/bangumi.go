package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type BangumiHandler struct {
	token string
	mu    sync.Mutex
	cache map[string]cacheEntry
	order []string
}

type cacheEntry struct {
	data []byte
	time time.Time
}

func NewBangumiHandler(token string) *BangumiHandler {
	return &BangumiHandler{token: token, cache: make(map[string]cacheEntry)}
}

const (
	bangumiCacheTTL        = 5 * time.Minute
	bangumiCacheMaxEntries = 256
	maxBangumiImageBytes   = 10 * 1024 * 1024
	maxBangumiAPIBytes     = 2 * 1024 * 1024
)

// GET /api/bangumi/image?url=xxx — 代理下载 Bangumi 图片（绕过 CORS）
func (h *BangumiHandler) ProxyImage(w http.ResponseWriter, r *http.Request) {
	imgURL := r.URL.Query().Get("url")
	parsed, err := url.Parse(imgURL)
	if err != nil || parsed.Scheme != "https" || !allowedBangumiHost(parsed.Hostname()) {
		http.Error(w, "invalid url", http.StatusBadRequest)
		return
	}
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, parsed.String(), nil)
	if err != nil {
		http.Error(w, "invalid url", http.StatusBadRequest)
		return
	}
	req.Header.Set("User-Agent", "karuta-game/1.0")
	req.Header.Set("Referer", "https://bgm.tv/")
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		http.Error(w, "fetch failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	if resp.ContentLength > maxBangumiImageBytes {
		http.Error(w, "image too large", http.StatusBadGateway)
		return
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxBangumiImageBytes+1))
	if err != nil || len(data) > maxBangumiImageBytes {
		http.Error(w, "image too large", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.Header().Set("Cache-Control", "public, max-age=86400")
	_, _ = w.Write(data)
}

func allowedBangumiHost(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	return host == "bgm.tv" || strings.HasSuffix(host, ".bgm.tv") ||
		host == "bangumi.tv" || strings.HasSuffix(host, ".bangumi.tv")
}

// GET /api/bangumi/search?keyword=xxx&type=2
func (h *BangumiHandler) Search(w http.ResponseWriter, r *http.Request) {
	keyword := r.URL.Query().Get("keyword")
	if keyword == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "keyword is required")
		return
	}
	subjectType := r.URL.Query().Get("type") // 2=动画, 4=游戏, 空=全部

	cacheKey := keyword + "|" + subjectType
	if data, ok := h.cacheGet(cacheKey); ok {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(data)
		return
	}

	// Build request body
	body := map[string]interface{}{
		"keyword": keyword,
		"sort":    "match",
	}
	if subjectType != "" {
		var types []int
		for _, t := range strings.Split(subjectType, ",") {
			switch t {
			case "2":
				types = append(types, 2)
			case "4":
				types = append(types, 4)
			}
		}
		if len(types) > 0 {
			body["filter"] = map[string]interface{}{"type": types}
		}
	}

	bodyJSON, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, "https://api.bgm.tv/v0/search/subjects?limit=20", strings.NewReader(string(bodyJSON)))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create request")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "karuta-game/1.0 (https://github.com/karuta)")
	if h.token != "" {
		req.Header.Set("Authorization", "Bearer "+h.token)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, "UPSTREAM_ERROR", fmt.Sprintf("bangumi api error: %v", err))
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, maxBangumiAPIBytes+1))
	if err != nil || len(respBody) > maxBangumiAPIBytes {
		writeError(w, http.StatusBadGateway, "UPSTREAM_ERROR", "bangumi response too large")
		return
	}

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		h.cachePut(cacheKey, respBody)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBody)
}

func (h *BangumiHandler) cacheGet(key string) ([]byte, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	entry, ok := h.cache[key]
	if !ok {
		return nil, false
	}
	if time.Since(entry.time) >= bangumiCacheTTL {
		delete(h.cache, key)
		h.removeCacheOrder(key)
		return nil, false
	}
	h.removeCacheOrder(key)
	h.order = append(h.order, key)
	return entry.data, true
}

func (h *BangumiHandler) cachePut(key string, data []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, exists := h.cache[key]; exists {
		h.removeCacheOrder(key)
	}
	h.cache[key] = cacheEntry{data: data, time: time.Now()}
	h.order = append(h.order, key)
	for len(h.cache) > bangumiCacheMaxEntries && len(h.order) > 0 {
		oldest := h.order[0]
		h.order = h.order[1:]
		delete(h.cache, oldest)
	}
}

func (h *BangumiHandler) removeCacheOrder(key string) {
	for i, candidate := range h.order {
		if candidate == key {
			h.order = append(h.order[:i], h.order[i+1:]...)
			return
		}
	}
}
