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
		JWTSecret:   "a-long-production-secret",
		COSBucket:   "bucket",
		COSRegion:   "region",
	}
	if err := cfg.Validate(); err == nil {
		t.Fatal("expected missing COS credentials to be rejected")
	}
}
