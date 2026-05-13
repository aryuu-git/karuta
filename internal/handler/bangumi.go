package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type BangumiHandler struct {
	token string
	cache sync.Map // key -> {data, time}
}

type cacheEntry struct {
	data []byte
	time time.Time
}

func NewBangumiHandler(token string) *BangumiHandler {
	return &BangumiHandler{token: token}
}

// GET /api/bangumi/image?url=xxx — 代理下载 Bangumi 图片（绕过 CORS）
func (h *BangumiHandler) ProxyImage(w http.ResponseWriter, r *http.Request) {
	imgURL := r.URL.Query().Get("url")
	if imgURL == "" || (!strings.Contains(imgURL, "bgm.tv") && !strings.Contains(imgURL, "bangumi")) {
		http.Error(w, "invalid url", http.StatusBadRequest)
		return
	}
	client := &http.Client{Timeout: 15 * time.Second}
	req, _ := http.NewRequest("GET", imgURL, nil)
	req.Header.Set("User-Agent", "karuta-game/1.0")
	req.Header.Set("Referer", "https://bgm.tv/")
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		http.Error(w, "fetch failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.Header().Set("Cache-Control", "public, max-age=86400")
	io.Copy(w, resp.Body)
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
	if entry, ok := h.cache.Load(cacheKey); ok {
		ce := entry.(*cacheEntry)
		if time.Since(ce.time) < 5*time.Minute {
			w.Header().Set("Content-Type", "application/json")
			w.Write(ce.data)
			return
		}
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
	req, err := http.NewRequest("POST", "https://api.bgm.tv/v0/search/subjects?limit=20", strings.NewReader(string(bodyJSON)))
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

	respBody, _ := io.ReadAll(resp.Body)

	// Cache result
	h.cache.Store(cacheKey, &cacheEntry{data: respBody, time: time.Now()})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	w.Write(respBody)
}
