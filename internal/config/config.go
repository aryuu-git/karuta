package config

import "os"

type Config struct {
	Port      string
	JWTSecret string
	UploadDir string
	DBPath    string

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
