package config

import "os"

type Config struct {
	Port      string
	JWTSecret string
	UploadDir string
	DBPath    string
}

func Load() *Config {
	return &Config{
		Port:      getEnv("PORT", "8080"),
		JWTSecret: getEnv("JWT_SECRET", "karuta-secret-key"),
		UploadDir: getEnv("UPLOAD_DIR", "./uploads"),
		DBPath:    getEnv("DB_PATH", "./karuta.db"),
	}
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
