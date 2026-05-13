package config

import "os"

type Config struct {
	Port      string
	JWTSecret string
	UploadDir string
	DBPath    string

	// Bangumi API (optional)
	BangumiToken string

	// Invite system: "true" = require invite code from DB, else fixed code "33989"
	InviteRequired bool

	// COS object storage configuration
	COSEnabled   bool
	COSSecretID  string
	COSSecretKey string
	COSBucket    string
	COSRegion    string
	COSCDNDomain string
}

func Load() *Config {
	return &Config{
		Port:      getEnv("PORT", "8080"),
		JWTSecret: getEnv("JWT_SECRET", "karuta-secret-key"),
		UploadDir: getEnv("UPLOAD_DIR", "./uploads"),
		DBPath:    getEnv("DB_PATH", "./karuta.db"),

		BangumiToken:   getEnv("BANGUMI_TOKEN", ""),
		InviteRequired: getEnv("INVITE_REQUIRED", "") == "true",

		COSEnabled:   getEnv("COS_ENABLED", "") == "true",
		COSSecretID:  getEnv("COS_SECRET_ID", ""),
		COSSecretKey: getEnv("COS_SECRET_KEY", ""),
		COSBucket:    getEnv("COS_BUCKET", "karuta-1321249409"),
		COSRegion:    getEnv("COS_REGION", "ap-shanghai"),
		COSCDNDomain: getEnv("COS_CDN_DOMAIN", ""),
	}
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
