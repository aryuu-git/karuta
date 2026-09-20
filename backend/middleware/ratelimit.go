package middleware

import (
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"
)

type rateWindow struct {
	count int
	reset time.Time
}

const maxRateLimitBuckets = 10000

// RateLimit returns a lightweight per-IP fixed-window limiter suitable for the
// single-process deployment. A shared external limiter can replace it if the
// application is ever scaled to multiple instances.
func RateLimit(maxRequests int, window time.Duration) func(http.Handler) http.Handler {
	var mu sync.Mutex
	buckets := make(map[string]rateWindow)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			now := time.Now()
			key := clientIP(r)
			mu.Lock()
			bucket, exists := buckets[key]
			if !exists && len(buckets) >= maxRateLimitBuckets {
				for ip, candidate := range buckets {
					if !now.Before(candidate.reset) {
						delete(buckets, ip)
					}
				}
				if len(buckets) >= maxRateLimitBuckets {
					mu.Unlock()
					w.Header().Set("Retry-After", "1")
					http.Error(w, "rate limiter capacity exceeded", http.StatusServiceUnavailable)
					return
				}
			}
			if bucket.reset.IsZero() || !now.Before(bucket.reset) {
				bucket = rateWindow{reset: now.Add(window)}
			}
			bucket.count++
			buckets[key] = bucket
			allowed := bucket.count <= maxRequests
			retryAfter := int(time.Until(bucket.reset).Seconds()) + 1
			mu.Unlock()

			if !allowed {
				w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}
