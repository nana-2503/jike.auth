package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestLoadGeneratesAndWritesInvalidJWTSecret(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	data := []byte("jwt:\n  secret: change-this-secret\n  expire: 168h\n")
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	if err := Load(path); err != nil {
		t.Fatalf("load config: %v", err)
	}

	if !isValidJWTSecret(Cfg.JWT.Secret) {
		t.Fatalf("generated invalid secret: %q", Cfg.JWT.Secret)
	}
	if Cfg.JWT.Secret == "change-this-secret" {
		t.Fatal("secret was not replaced")
	}

	written, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read written config: %v", err)
	}
	if !strings.Contains(string(written), Cfg.JWT.Secret) {
		t.Fatal("generated secret was not written to config")
	}
}

func TestLoadKeepsValidJWTSecret(t *testing.T) {
	secret := strings.Repeat("a", jwtSecretLength)
	path := filepath.Join(t.TempDir(), "config.yaml")
	data := []byte("jwt:\n  secret: " + secret + "\n  expire: 168h\n")
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	if err := Load(path); err != nil {
		t.Fatalf("load config: %v", err)
	}

	if Cfg.JWT.Secret != secret {
		t.Fatalf("secret changed: got %q want %q", Cfg.JWT.Secret, secret)
	}

	written, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	if string(written) != string(data) {
		t.Fatal("config was rewritten even though secret was valid")
	}
}

func TestIsValidJWTSecretRejectsNonAlphanumeric(t *testing.T) {
	secret := strings.Repeat("a", jwtSecretLength-1) + "-"
	if isValidJWTSecret(secret) {
		t.Fatal("secret with non-alphanumeric character was accepted")
	}
}

func TestWriteJWTSecretAddsMissingJWTSection(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	data := []byte("server:\n  port: 8081\n")
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	secret := strings.Repeat("b", jwtSecretLength)
	if err := writeJWTSecret(path, data, secret); err != nil {
		t.Fatalf("write jwt secret: %v", err)
	}

	written, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read written config: %v", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(written, &cfg); err != nil {
		t.Fatalf("unmarshal written config: %v", err)
	}
	if cfg.JWT.Secret != secret {
		t.Fatalf("written secret mismatch: got %q want %q", cfg.JWT.Secret, secret)
	}
}
