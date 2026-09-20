package handler

import (
	"strconv"
	"testing"
)

func TestAllowedBangumiHost(t *testing.T) {
	tests := map[string]bool{
		"bgm.tv":               true,
		"lain.bgm.tv":          true,
		"bangumi.tv":           true,
		"cdn.bangumi.tv":       true,
		"bgm.tv.evil.example":  false,
		"evil-bgm.tv":          false,
		"example.com?x=bgm.tv": false,
	}
	for host, want := range tests {
		if got := allowedBangumiHost(host); got != want {
			t.Errorf("allowedBangumiHost(%q)=%v want=%v", host, got, want)
		}
	}
}

func TestBangumiCacheIsBoundedLRU(t *testing.T) {
	h := NewBangumiHandler("")
	for i := 0; i <= bangumiCacheMaxEntries; i++ {
		h.cachePut(strconv.Itoa(i), []byte{byte(i)})
	}
	if len(h.cache) != bangumiCacheMaxEntries {
		t.Fatalf("cache size=%d", len(h.cache))
	}
	if _, ok := h.cacheGet("0"); ok {
		t.Fatal("oldest entry was not evicted")
	}
	if _, ok := h.cacheGet(strconv.Itoa(bangumiCacheMaxEntries)); !ok {
		t.Fatal("newest entry was evicted")
	}
}
