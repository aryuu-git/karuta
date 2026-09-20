package middleware

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

func TestRateLimit(t *testing.T) {
	handler := RateLimit(2, time.Minute)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	for i, want := range []int{http.StatusNoContent, http.StatusNoContent, http.StatusTooManyRequests} {
		req := httptest.NewRequest(http.MethodPost, "/login", nil)
		req.RemoteAddr = "192.0.2.1:1234"
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != want {
			t.Fatalf("request %d status=%d want=%d", i+1, res.Code, want)
		}
	}
}

func TestRateLimitSeparatesAddresses(t *testing.T) {
	handler := RateLimit(1, time.Minute)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	for _, address := range []string{"192.0.2.1:1", "192.0.2.2:1"} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = address
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != http.StatusNoContent {
			t.Fatalf("address %s unexpectedly limited", address)
		}
	}
}

func TestRateLimitCapsAddressBuckets(t *testing.T) {
	handler := RateLimit(1, time.Hour)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	for i := 0; i < maxRateLimitBuckets; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "bucket-" + strconv.Itoa(i)
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != http.StatusNoContent {
			t.Fatalf("bucket %d status=%d", i, res.Code)
		}
	}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "one-too-many"
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("overflow status=%d", res.Code)
	}
}
