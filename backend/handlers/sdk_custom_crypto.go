package handlers

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/rand"
	"crypto/rc4"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"jike-auth/database"
	"jike-auth/models"
	"strings"
	"time"

	"github.com/dop251/goja"
)

type customCryptoStep struct {
	Op  string `json:"op"`
	Key string `json:"key"`
}

type customCryptoConfig struct {
	Encrypt []customCryptoStep `json:"encrypt"`
	Decrypt []customCryptoStep `json:"decrypt"`
}

func getSDKCryptoConfig() models.SDKCryptoConfig {
	var cfg models.SDKCryptoConfig
	database.DB.First(&cfg)
	return cfg
}

func sdkHasCustomCrypto(cfg models.SDKCryptoConfig) bool {
	if cfg.Enabled != 1 {
		return false
	}
	if cfg.Type == "js" {
		return strings.TrimSpace(cfg.EncryptScript) != "" && strings.TrimSpace(cfg.DecryptScript) != ""
	}
	return strings.TrimSpace(cfg.Config) != ""
}

func sdkCustomCryptoPublicConfig() map[string]interface{} {
	cfg := getSDKCryptoConfig()
	if !sdkHasCustomCrypto(cfg) {
		return map[string]interface{}{"enabled": false, "type": "builtin"}
	}
	return map[string]interface{}{
		"enabled":        true,
		"type":           cfg.Type,
		"config":         cfg.Config,
		"encrypt_script": cfg.EncryptScript,
		"decrypt_script": cfg.DecryptScript,
	}
}

func sdkEncryptPayload(plainText string, app *models.App) (string, error) {
	cfg := getSDKCryptoConfig()
	if sdkHasCustomCrypto(cfg) {
		return sdkRunCustomCrypto(plainText, app, cfg, true)
	}
	return sdkAesEncrypt(plainText, app.AppSecret)
}

func sdkDecryptPayload(cipherText string, app *models.App) (string, error) {
	cfg := getSDKCryptoConfig()
	if sdkHasCustomCrypto(cfg) {
		return sdkRunCustomCrypto(cipherText, app, cfg, false)
	}
	return sdkAesDecrypt(cipherText, app.AppSecret)
}

func sdkRunCustomCrypto(input string, app *models.App, cfg models.SDKCryptoConfig, encrypt bool) (string, error) {
	if cfg.Type == "js" {
		return sdkRunCustomCryptoJS(input, app, cfg, encrypt)
	}
	return sdkRunCustomCryptoPipeline(input, app, cfg, encrypt)
}

func sdkRunCustomCryptoPipeline(input string, app *models.App, cfg models.SDKCryptoConfig, encrypt bool) (string, error) {
	var pipeline customCryptoConfig
	if err := json.Unmarshal([]byte(cfg.Config), &pipeline); err != nil {
		return "", fmt.Errorf("自定义加解密配置格式错误")
	}
	steps := pipeline.Decrypt
	if encrypt {
		steps = pipeline.Encrypt
	}
	if len(steps) == 0 {
		return "", fmt.Errorf("自定义加解密步骤为空")
	}

	result := input
	var err error
	for _, step := range steps {
		result, err = sdkRunCustomCryptoStep(result, app, step)
		if err != nil {
			return "", err
		}
	}
	return result, nil
}

func sdkRunCustomCryptoStep(input string, app *models.App, step customCryptoStep) (string, error) {
	switch strings.ToLower(strings.TrimSpace(step.Op)) {
	case "base64_encode", "base64-encode":
		return base64.StdEncoding.EncodeToString([]byte(input)), nil
	case "base64_decode", "base64-decode":
		b, err := base64.StdEncoding.DecodeString(input)
		return string(b), err
	case "hex_encode", "hex-encode":
		return hex.EncodeToString([]byte(input)), nil
	case "hex_decode", "hex-decode":
		b, err := hex.DecodeString(input)
		return string(b), err
	case "reverse":
		return sdkReverseString(input), nil
	case "xor", "xor_key", "xor-key":
		return sdkXorString(input, sdkCustomStepKey(app, step.Key)), nil
	case "rc4_encrypt", "rc4-encrypt":
		return sdkRC4Encrypt(input, sdkCustomStepKey(app, step.Key))
	case "rc4_decrypt", "rc4-decrypt":
		return sdkRC4Decrypt(input, sdkCustomStepKey(app, step.Key))
	case "sha256", "sha256_hex", "sha256-hex":
		sum := sha256.Sum256([]byte(input))
		return hex.EncodeToString(sum[:]), nil
	case "aes_256_cbc_encrypt", "aes-256-cbc-encrypt":
		return sdkAesEncrypt(input, sdkCustomStepKey(app, step.Key))
	case "aes_256_cbc_decrypt", "aes-256-cbc-decrypt":
		return sdkAesDecrypt(input, sdkCustomStepKey(app, step.Key))
	case "ecc_encrypt", "ecc-encrypt", "ecies_encrypt", "ecies-encrypt":
		return sdkECCEncrypt(input, sdkCustomStepKey(app, step.Key))
	case "ecc_decrypt", "ecc-decrypt", "ecies_decrypt", "ecies-decrypt":
		return sdkECCDecrypt(input, sdkCustomStepKey(app, step.Key))
	default:
		return "", fmt.Errorf("不支持的自定义加解密步骤: %s", step.Op)
	}
}

func sdkDecodeCryptoKey(key string) ([]byte, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil, fmt.Errorf("加解密key不能为空")
	}
	if data, err := base64.StdEncoding.DecodeString(key); err == nil {
		return data, nil
	}
	if data, err := hex.DecodeString(key); err == nil {
		return data, nil
	}
	return []byte(key), nil
}

func sdkRC4Encrypt(input, key string) (string, error) {
	keyBytes, err := sdkDecodeCryptoKey(key)
	if err != nil {
		return "", err
	}
	c, err := rc4.NewCipher(keyBytes)
	if err != nil {
		return "", err
	}
	out := []byte(input)
	c.XORKeyStream(out, out)
	return base64.StdEncoding.EncodeToString(out), nil
}

func sdkRC4Decrypt(input, key string) (string, error) {
	keyBytes, err := sdkDecodeCryptoKey(key)
	if err != nil {
		return "", err
	}
	cipherText, err := base64.StdEncoding.DecodeString(input)
	if err != nil {
		return "", err
	}
	c, err := rc4.NewCipher(keyBytes)
	if err != nil {
		return "", err
	}
	c.XORKeyStream(cipherText, cipherText)
	return string(cipherText), nil
}

func sdkECCEncrypt(input, publicKey string) (string, error) {
	curve := ecdh.P256()
	publicKeyBytes, err := sdkDecodeCryptoKey(publicKey)
	if err != nil {
		return "", err
	}
	recipientPublicKey, err := curve.NewPublicKey(publicKeyBytes)
	if err != nil {
		return "", fmt.Errorf("ECC公钥格式错误")
	}
	ephemeralPrivateKey, err := curve.GenerateKey(rand.Reader)
	if err != nil {
		return "", err
	}
	sharedSecret, err := ephemeralPrivateKey.ECDH(recipientPublicKey)
	if err != nil {
		return "", err
	}
	aesKey := sha256.Sum256(sharedSecret)
	block, err := aes.NewCipher(aesKey[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	cipherText := gcm.Seal(nil, nonce, []byte(input), nil)
	envelope := append(ephemeralPrivateKey.PublicKey().Bytes(), nonce...)
	envelope = append(envelope, cipherText...)
	return base64.StdEncoding.EncodeToString(envelope), nil
}

func sdkECCDecrypt(input, privateKey string) (string, error) {
	curve := ecdh.P256()
	privateKeyBytes, err := sdkDecodeCryptoKey(privateKey)
	if err != nil {
		return "", err
	}
	privateKeyObj, err := curve.NewPrivateKey(privateKeyBytes)
	if err != nil {
		return "", fmt.Errorf("ECC私钥格式错误")
	}
	envelope, err := base64.StdEncoding.DecodeString(input)
	if err != nil {
		return "", err
	}
	publicKeySize := len(privateKeyObj.PublicKey().Bytes())
	if len(envelope) <= publicKeySize+12 {
		return "", fmt.Errorf("ECC密文格式错误")
	}
	ephemeralPublicKey, err := curve.NewPublicKey(envelope[:publicKeySize])
	if err != nil {
		return "", fmt.Errorf("ECC临时公钥格式错误")
	}
	sharedSecret, err := privateKeyObj.ECDH(ephemeralPublicKey)
	if err != nil {
		return "", err
	}
	aesKey := sha256.Sum256(sharedSecret)
	block, err := aes.NewCipher(aesKey[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceStart := publicKeySize
	nonceEnd := nonceStart + gcm.NonceSize()
	if len(envelope) <= nonceEnd {
		return "", fmt.Errorf("ECC密文格式错误")
	}
	plainText, err := gcm.Open(nil, envelope[nonceStart:nonceEnd], envelope[nonceEnd:], nil)
	if err != nil {
		return "", fmt.Errorf("ECC解密失败")
	}
	return string(plainText), nil
}

func sdkAppCustomFields(app *models.App) map[string]string {
	fields := make(map[string]string)
	if app == nil || strings.TrimSpace(app.CustomFields) == "" {
		return fields
	}
	_ = json.Unmarshal([]byte(app.CustomFields), &fields)
	return fields
}

func sdkCustomStepKey(app *models.App, key string) string {
	trimmedKey := strings.TrimSpace(key)
	lowerKey := strings.ToLower(trimmedKey)
	customFields := sdkAppCustomFields(app)
	if strings.HasPrefix(lowerKey, "custom_fields.") {
		return customFields[trimmedKey[len("custom_fields."):]]
	}
	if strings.HasPrefix(lowerKey, "custom.") {
		return customFields[trimmedKey[len("custom."):]]
	}
	if strings.HasPrefix(lowerKey, "custom:") {
		return customFields[trimmedKey[len("custom:"):]]
	}

	switch lowerKey {
	case "", "app_secret":
		return app.AppSecret
	case "app_key":
		return app.AppKey
	case "app_code":
		return app.AppCode
	default:
		return key
	}
}

func sdkRunCustomCryptoJS(input string, app *models.App, cfg models.SDKCryptoConfig, encrypt bool) (string, error) {
	script := cfg.DecryptScript
	fnName := "decrypt"
	if encrypt {
		script = cfg.EncryptScript
		fnName = "encrypt"
	}
	if strings.TrimSpace(script) == "" {
		return "", fmt.Errorf("自定义加解密脚本为空")
	}
	if len(script) > 20000 {
		return "", fmt.Errorf("自定义加解密脚本过长")
	}

	vm := goja.New()
	timer := time.AfterFunc(100*time.Millisecond, func() {
		vm.Interrupt("自定义加解密脚本执行超时")
	})
	defer timer.Stop()

	vm.Set("base64Encode", func(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) })
	vm.Set("base64Decode", func(s string) (string, error) { b, err := base64.StdEncoding.DecodeString(s); return string(b), err })
	vm.Set("hexEncode", func(s string) string { return hex.EncodeToString([]byte(s)) })
	vm.Set("hexDecode", func(s string) (string, error) { b, err := hex.DecodeString(s); return string(b), err })
	vm.Set("reverse", sdkReverseString)
	vm.Set("xor", sdkXorString)
	vm.Set("sha256Hex", func(s string) string { sum := sha256.Sum256([]byte(s)); return hex.EncodeToString(sum[:]) })
	vm.Set("aesCbcEncrypt", sdkAesEncrypt)
	vm.Set("aesCbcDecrypt", sdkAesDecrypt)

	if _, err := vm.RunString(script); err != nil {
		return "", fmt.Errorf("自定义加解密脚本错误: %w", err)
	}
	fn, ok := goja.AssertFunction(vm.Get(fnName))
	if !ok {
		return "", fmt.Errorf("脚本必须定义 %s(input, ctx) 函数", fnName)
	}
	ctx := map[string]interface{}{
		"app_key":       app.AppKey,
		"app_secret":    app.AppSecret,
		"app_code":      app.AppCode,
		"custom_fields": sdkAppCustomFields(app),
		"direction":     map[bool]string{true: "encrypt", false: "decrypt"}[encrypt],
	}
	value, err := fn(goja.Undefined(), vm.ToValue(input), vm.ToValue(ctx))
	if err != nil {
		return "", fmt.Errorf("自定义加解密脚本执行失败: %w", err)
	}
	return value.String(), nil
}

func sdkReverseString(s string) string {
	runes := []rune(s)
	for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
		runes[i], runes[j] = runes[j], runes[i]
	}
	return string(runes)
}

func sdkXorString(s, key string) string {
	if key == "" {
		return s
	}
	sb := []byte(s)
	kb := []byte(key)
	for i := range sb {
		sb[i] ^= kb[i%len(kb)]
	}
	return string(sb)
}
