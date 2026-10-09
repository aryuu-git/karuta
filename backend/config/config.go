package config

import (
	"fmt"
	"os"
	"strings"
)

const DefaultJWTSecret = "karuta-secret-key"

type Config struct {
	Environment   string
	BindAddr      string
	Port          string
	JWTSecret     string
	DBPath        string
	MediaStorage  string
	LocalMediaDir string
	LocalDemoData bool

	// Invite system: "true" = require a one-time code from the database;
	// false = open registration.
	InviteRequired bool

	// COS remains the default media backend. Local storage is opt-in for development.
	COSSecretID  string
	COSSecretKey string
	COSBucket    string
	COSRegion    string
	COSCDNDomain string

	// Expensive compatibility maintenance job is opt-in. It must not scan
	// the complete bucket on every normal application restart.
	COSFixCacheOnStart bool

	// B2 媒体配额：每用户总容量（字节）与单日上传次数；0 = 不限制。
	QuotaUserBytes    int64
	QuotaDailyUploads int64
}

func Load() *Config {
	environment := getEnv("APP_ENV", "development")
	mediaStorage := getEnv("MEDIA_STORAGE", "cos")
	defaultBindAddr := ""
	defaultDBPath := "./data/karuta.db"
	if mediaStorage == "local" {
		defaultDBPath = "./data/local/karuta.db"
	}
	if strings.EqualFold(environment, "production") || mediaStorage == "local" {
		defaultBindAddr = "127.0.0.1"
	}
	return &Config{
		Environment:   environment,
		BindAddr:      getEnv("BIND_ADDR", defaultBindAddr),
		Port:          getEnv("PORT", "8080"),
		JWTSecret:     getEnv("JWT_SECRET", DefaultJWTSecret),
		DBPath:        getEnv("DB_PATH", defaultDBPath),
		MediaStorage:  mediaStorage,
		LocalMediaDir: getEnv("LOCAL_MEDIA_DIR", "./data/local/uploads"),
		LocalDemoData: getEnv("LOCAL_DEMO_DATA", "") == "true",

		InviteRequired: getEnv("INVITE_REQUIRED", "") == "true",

		COSSecretID:        getEnv("COS_SECRET_ID", ""),
		COSSecretKey:       getEnv("COS_SECRET_KEY", ""),
		COSBucket:          getEnv("COS_BUCKET", "karuta-1321249409"),
		COSRegion:          getEnv("COS_REGION", "ap-shanghai"),
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

// Validate keeps COS mandatory by default and permits local media only in development.
func (c *Config) Validate() error {
	if strings.EqualFold(c.Environment, "production") && (c.JWTSecret == DefaultJWTSecret || len(c.JWTSecret) < 32) {
		return fmt.Errorf("JWT_SECRET must contain at least 32 characters when APP_ENV=production")
	}
	if c.LocalDemoData && c.MediaStorage != "local" {
		return fmt.Errorf("LOCAL_DEMO_DATA requires MEDIA_STORAGE=local")
	}
	if c.MediaStorage == "local" {
		if !strings.EqualFold(c.Environment, "development") {
			return fmt.Errorf("MEDIA_STORAGE=local is only available when APP_ENV=development")
		}
		if c.LocalMediaDir == "" {
			return fmt.Errorf("LOCAL_MEDIA_DIR is required for local storage")
		}
		return nil
	}
	if c.MediaStorage != "" && c.MediaStorage != "cos" {
		return fmt.Errorf("unsupported MEDIA_STORAGE %q: use cos or local", c.MediaStorage)
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
