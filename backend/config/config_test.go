package config

import "testing"

func TestValidateRejectsDefaultProductionSecret(t *testing.T) {
	cfg := &Config{Environment: "production", JWTSecret: DefaultJWTSecret}
	if err := cfg.Validate(); err == nil {
		t.Fatal("expected unsafe production secret to be rejected")
	}
}

func TestValidateKeepsDevelopmentCompatibleWithCOS(t *testing.T) {
	cfg := &Config{
		Environment:  "development",
		JWTSecret:    DefaultJWTSecret,
		COSSecretID:  "id",
		COSSecretKey: "key",
		COSBucket:    "bucket",
		COSRegion:    "region",
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("valid development config rejected: %v", err)
	}
}

func TestValidateRejectsShortProductionSecret(t *testing.T) {
	cfg := &Config{Environment: "production", JWTSecret: "short-secret"}
	if err := cfg.Validate(); err == nil {
		t.Fatal("expected short production secret to be rejected")
	}
}

func TestLoadBindsProductionToLoopbackByDefault(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("BIND_ADDR", "")
	if got := Load().BindAddr; got != "127.0.0.1" {
		t.Fatalf("production bind address = %q", got)
	}
}

func TestValidateRequiresCOSCredentials(t *testing.T) {
	cfg := &Config{
		Environment: "production",
		JWTSecret:   "a-long-production-secret-with-32-characters",
		COSBucket:   "bucket",
		COSRegion:   "region",
	}
	if err := cfg.Validate(); err == nil {
		t.Fatal("expected missing COS credentials to be rejected")
	}
}

func TestLoadLocalDefaultsAreIsolated(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("MEDIA_STORAGE", "local")
	t.Setenv("DB_PATH", "")
	t.Setenv("BIND_ADDR", "")
	t.Setenv("LOCAL_MEDIA_DIR", "")
	t.Setenv("LOCAL_DEMO_DATA", "true")
	t.Setenv("COS_SECRET_ID", "")
	t.Setenv("COS_SECRET_KEY", "")
	cfg := Load()
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	if cfg.BindAddr != "127.0.0.1" || cfg.DBPath != "./data/local/karuta.db" || cfg.LocalMediaDir != "./data/local/uploads" || !cfg.LocalDemoData {
		t.Fatalf("local defaults are not isolated: %+v", cfg)
	}
}

func TestValidateLocalModeRestrictions(t *testing.T) {
	for _, cfg := range []Config{
		{Environment: "production", JWTSecret: "a-production-secret-with-at-least-32-characters", MediaStorage: "local", LocalMediaDir: "uploads"},
		{Environment: "staging", MediaStorage: "local", LocalMediaDir: "uploads"},
		{Environment: "development", MediaStorage: "local"},
		{Environment: "development", MediaStorage: "other"},
		{Environment: "development", MediaStorage: "cos", LocalDemoData: true},
	} {
		if err := cfg.Validate(); err == nil {
			t.Fatalf("invalid config accepted: %+v", cfg)
		}
	}
}

func TestLoadKeepsCOSAsDefault(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("MEDIA_STORAGE", "")
	t.Setenv("DB_PATH", "")
	t.Setenv("LOCAL_DEMO_DATA", "")
	t.Setenv("COS_SECRET_ID", "")
	t.Setenv("COS_SECRET_KEY", "")
	cfg := Load()
	if cfg.MediaStorage != "cos" || cfg.DBPath != "./data/karuta.db" || cfg.LocalDemoData {
		t.Fatalf("COS defaults changed: %+v", cfg)
	}
	if err := cfg.Validate(); err == nil {
		t.Fatal("default COS mode should still require credentials")
	}
}
