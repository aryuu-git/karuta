package config

import (
	"fmt"
	"os"
	"strings"
)

const DefaultJWTSecret = "karuta-secret-key"

type Config struct {
	Environment string
	BindAddr    string
	Port        string
	JWTSecret   string
	DBPath      string

	// Bangumi API (optional)
	BangumiToken string

	// Invite system: "true" = require a one-time code from the database;
	// false = open registration.
	InviteRequired bool

	// COS object storage: the only media backend. Server-local storage has
	// been removed; media objects live exclusively in COS.
	COSSecretID  string
	COSSecretKey string
	COSBucket    string
	COSRegion    string
	COSCDNDomain string

	// Expensive compatibility maintenance job is opt-in. It must not scan
	// the complete bucket on every normal application restart.
	COSFixCacheOnStart bool

	// B2 媒体配额：每用户总容量（字节）与单日上传次数；0 = 不限制。
	QuotaUserBytes   int64
	QuotaDailyUploads int64
}

func Load() *Config {
	environment := getEnv("APP_ENV", "development")
	defaultBindAddr := ""
	if strings.EqualFold(environment, "production") {
		defaultBindAddr = "127.0.0.1"
	}
	return &Config{
		Environment: environment,
		BindAddr:    getEnv("BIND_ADDR", defaultBindAddr),
		Port:        getEnv("PORT", "8080"),
		JWTSecret:   getEnv("JWT_SECRET", DefaultJWTSecret),
		DBPath:      getEnv("DB_PATH", "./data/karuta.db"),

		BangumiToken:   getEnv("BANGUMI_TOKEN", ""),
		InviteRequired: getEnv("INVITE_REQUIRED", "") == "true",

		COSSecretID:  getEnv("COS_SECRET_ID", ""),
		COSSecretKey: getEnv("COS_SECRET_KEY", ""),
		COSBucket:    getEnv("COS_BUCKET", "karuta-1321249409"),
		COSRegion:    getEnv("COS_REGION", "ap-shanghai"),
		COSFixCacheOnStart: getEnv("COS_FIX_CACHE_ON_START", "") == "true",

		QuotaUserBytes:    getEnvInt64("QUOTA_USER_BYTES", 0),
		QuotaDailyUploads: getEnvInt64("QUOTA_DAILY_UPLOADS", 0),
	}
}

// getEnvInt64 读取整型环境变量，非法值回退默认。
func getEnvInt64(key string, defaultVal int64) int64 {
	if v := os.Getenv(key); v != "" {
		var n int64
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil {
			return n
		}
	}
	return defaultVal
}

// Validate rejects unsafe or incomplete configuration. COS credentials are
// mandatory in every environment because all media is served from COS.
func (c *Config) Validate() error {
	if strings.EqualFold(c.Environment, "production") && (c.JWTSecret == DefaultJWTSecret || len(c.JWTSecret) < 32) {
		return fmt.Errorf("JWT_SECRET must contain at least 32 characters when APP_ENV=production")
	}
	if c.COSSecretID == "" || c.COSSecretKey == "" {
		return fmt.Errorf("COS_SECRET_ID and COS_SECRET_KEY are required: media is stored exclusively in COS")
	}
	if c.COSBucket == "" || c.COSRegion == "" {
		return fmt.Errorf("COS_BUCKET and COS_REGION are required: media is stored exclusively in COS")
	}
	return nil
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
