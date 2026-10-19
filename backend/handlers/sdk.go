package handlers

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"jike-auth/cache"
	"jike-auth/database"
	"jike-auth/middleware"
	"jike-auth/models"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/mojocn/base64Captcha"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ========== SDK AES加解密 ==========
// HTTP SDK 接口和 WebSocket SDK 共用这套 AES-CBC/签名规则。
// 客户端请求一般是明文 app_code + 加密 data + sign，data 解密后才是业务字段。

// 格式化时间为易读格式 (YYYY-MM-DD HH:MM:SS)
func formatTime(t *time.Time) interface{} {
	if t == nil {
		return nil
	}
	return t.Format("2006-01-02 15:04:05")
}

// SDK PKCS7填充
func sdkPkcs7Pad(data []byte, blockSize int) []byte {
	padding := blockSize - len(data)%blockSize
	padText := bytes.Repeat([]byte{byte(padding)}, padding)
	return append(data, padText...)
}

// SDK PKCS7去填充
func sdkPkcs7Unpad(data []byte) []byte {
	length := len(data)
	if length == 0 {
		return data
	}
	padding := int(data[length-1])
	// 验证填充值的合法性
	if padding == 0 || padding > length || padding > aes.BlockSize {
		return data
	}
	// 验证所有填充字节是否一致（防止 Padding Oracle 攻击）
	for i := length - padding; i < length; i++ {
		if data[i] != byte(padding) {
			return data // 填充无效，返回原数据
		}
	}
	return data[:length-padding]
}

// SDK AES-CBC加密（随机IV，IV附加在密文前）
func sdkAesEncrypt(plainText, key string) (string, error) {
	// 固定使用 AES-256-CBC，密钥截取/补零到32字节
	keyBytes := []byte(key)
	if len(keyBytes) < 32 {
		keyBytes = append(keyBytes, bytes.Repeat([]byte{0}, 32-len(keyBytes))...)
	} else {
		keyBytes = keyBytes[:32]
	}

	block, err := aes.NewCipher(keyBytes)
	if err != nil {
		return "", err
	}

	plainBytes := sdkPkcs7Pad([]byte(plainText), block.BlockSize())

	// 随机生成IV
	iv := make([]byte, block.BlockSize())
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return "", err
	}

	mode := cipher.NewCBCEncrypter(block, iv)
	cipherBytes := make([]byte, len(plainBytes))
	mode.CryptBlocks(cipherBytes, plainBytes)

	// IV + 密文 一起编码
	result := append(iv, cipherBytes...)
	return base64.StdEncoding.EncodeToString(result), nil
}

// SDK AES-256-CBC解密（从密文前提取IV）
func sdkAesDecrypt(cipherText, key string) (string, error) {
	keyBytes := []byte(key)
	if len(keyBytes) < 32 {
		keyBytes = append(keyBytes, bytes.Repeat([]byte{0}, 32-len(keyBytes))...)
	} else {
		keyBytes = keyBytes[:32]
	}

	data, err := base64.StdEncoding.DecodeString(cipherText)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(keyBytes)
	if err != nil {
		return "", err
	}

	if len(data) < block.BlockSize() {
		return "", fmt.Errorf("密文太短")
	}

	// 前16字节是IV，后面是密文
	iv := data[:block.BlockSize()]
	cipherBytes := data[block.BlockSize():]

	if len(cipherBytes)%block.BlockSize() != 0 {
		return "", fmt.Errorf("密文长度不正确")
	}

	mode := cipher.NewCBCDecrypter(block, iv)
	plainBytes := make([]byte, len(cipherBytes))
	mode.CryptBlocks(plainBytes, cipherBytes)

	return string(sdkPkcs7Unpad(plainBytes)), nil
}

// ========== 签名计算 ==========

// 计算签名 - 将算法模板中的[data]替换为密文，[key]替换为AES密钥，然后SHA-256
func sdkCalcSign(signAlgo, data, key string) string {
	if signAlgo == "" {
		return ""
	}
	// 替换变量
	signStr := strings.ReplaceAll(signAlgo, "[data]", data)
	signStr = strings.ReplaceAll(signStr, "[key]", key)
	// SHA-256
	hash := sha256.Sum256([]byte(signStr))
	return hex.EncodeToString(hash[:])
}

// 验证客户端签名（使用服务端签名算法）
func sdkVerifySign(app *models.App, data, clientSign string) bool {
	if app == nil {
		return false
	}
	if app.ServerSignAlgo == "" {
		// 未配置签名算法，允许跳过签名验证
		return true
	}
	// 配置了签名算法，必须验证签名
	if clientSign == "" {
		return false
	}
	expectedSign := sdkCalcSign(app.ServerSignAlgo, data, app.AppKey)
	return expectedSign == clientSign
}

// ========== 公共参数 ==========
// SDK 接口要求每次请求携带公共参数，防火墙、版本校验、在线会话都依赖这些字段。

// SDK公共请求参数
type SDKCommonParams struct {
	Feature  string `json:"feature"`   // 设备特征码
	Version  string `json:"version"`   // 客户端版本
	ClientID string `json:"client_id"` // 客户端ID（每次启动固定）
	ClientOS string `json:"client_os"` // 客户端系统
	MD5      string `json:"md5"`       // 应用版本MD5
	UUID     string `json:"uuid"`      // 随机UUID（每次请求随机）
}

// 验证公共参数
func validateCommonParams(params *SDKCommonParams) error {
	if params.Feature == "" {
		return fmt.Errorf("缺少feature参数")
	}
	if params.Version == "" {
		return fmt.Errorf("缺少version参数")
	}
	if params.ClientID == "" {
		return fmt.Errorf("缺少client_id参数")
	}
	if params.UUID == "" {
		return fmt.Errorf("缺少uuid参数")
	}
	return nil
}

func versionResponse(version models.AppVersion) gin.H {
	return gin.H{
		"id":            version.ID,
		"version":       version.Version,
		"check_md5":     version.CheckMD5,
		"md5_value":     version.MD5Value,
		"is_beta":       version.IsBeta,
		"is_default":    version.IsDefault,
		"min_required":  version.MinRequired,
		"force_update":  version.ForceUpdate,
		"gray_enabled":  version.GrayEnabled,
		"gray_features": version.GrayFeatures,
		"status":        version.Status,
		"download_url":  version.DownloadURL,
		"changelog":     version.Changelog,
		"published_at":  version.PublishedAt,
	}
}

func versionVisibleForClient(version models.AppVersion, params SDKCommonParams) bool {
	// 灰度版本仅对配置在 gray_features 中的设备特征可见。
	if version.Status == 0 {
		return false
	}

	if version.GrayEnabled == 1 {
		return strings.TrimSpace(version.GrayFeatures) != "" && listContains(version.GrayFeatures, params.Feature)
	}

	return true
}

func listContains(list string, value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	for _, item := range strings.FieldsFunc(list, func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r' || r == ';' || r == '，'
	}) {
		if strings.EqualFold(strings.TrimSpace(item), value) {
			return true
		}
	}
	return false
}

// 版本校验错误（独立错误码214）
type VersionError struct {
	Msg string
}

func (e *VersionError) Error() string {
	return e.Msg
}

// 根据错误类型返回对应错误码，版本错误返回214，其他返回201
func getErrorCode(err error) int {
	if _, ok := err.(*VersionError); ok {
		return 214
	}
	return 201
}

func compareVersionString(a, b string) int {
	// 支持 1.2.3、v1.2.3-beta 这类版本号，比较时只提取数字段。
	parse := func(s string) []int {
		parts := strings.FieldsFunc(s, func(r rune) bool { return !unicode.IsDigit(r) })
		nums := make([]int, 0, len(parts))
		for _, p := range parts {
			if p == "" {
				continue
			}
			n, _ := strconv.Atoi(p)
			nums = append(nums, n)
		}
		return nums
	}
	aNums := parse(a)
	bNums := parse(b)
	max := len(aNums)
	if len(bNums) > max {
		max = len(bNums)
	}
	for i := 0; i < max; i++ {
		av, bv := 0, 0
		if i < len(aNums) {
			av = aNums[i]
		}
		if i < len(bNums) {
			bv = bNums[i]
		}
		if av > bv {
			return 1
		}
		if av < bv {
			return -1
		}
	}
	return 0
}

// 验证公共参数并检查版本（需要appID）
func validateCommonParamsWithVersion(params *SDKCommonParams, appID uint) error {
	if err := validateCommonParams(params); err != nil {
		return err
	}

	// 每个客户端请求都必须声明一个后台已发布的版本，便于强更、灰度和 MD5 校验。
	var version models.AppVersion
	if err := database.DB.Where("app_id = ? AND version = ?", appID, params.Version).First(&version).Error; err != nil {
		return &VersionError{Msg: fmt.Sprintf("版本 %s 不存在", params.Version)}
	}

	// 检查版本是否被禁用
	if version.Status == 0 {
		return &VersionError{Msg: fmt.Sprintf("版本 %s 已被禁用", params.Version)}
	}

	var minVersion models.AppVersion
	if err := database.DB.Where("app_id = ? AND min_required = 1 AND status = 1", appID).First(&minVersion).Error; err == nil {
		if compareVersionString(params.Version, minVersion.Version) < 0 {
			return &VersionError{Msg: fmt.Sprintf("当前版本%s低于最低可用版本%s，请升级", params.Version, minVersion.Version)}
		}
	}

	// 检查MD5校验
	if version.CheckMD5 == 1 {
		if params.MD5 == "" {
			return &VersionError{Msg: "缺少md5参数"}
		}
		if params.MD5 != version.MD5Value {
			return &VersionError{Msg: "MD5校验失败"}
		}
	}

	return nil
}

// 从context获取公共参数
func getSDKCommonParams(c *gin.Context) *SDKCommonParams {
	// 解密请求时会把公共参数放到 gin.Context，响应时再回传 uuid/client_id 便于客户端匹配。
	params, exists := c.Get("sdk_common_params")
	if exists {
		if p, ok := params.(*SDKCommonParams); ok {
			return p
		}
	}
	return &SDKCommonParams{}
}

// 获取客户端IP
func getClientIP(c *gin.Context) string {
	// 优先从X-Forwarded-For获取
	xff := c.GetHeader("X-Forwarded-For")
	if xff != "" {
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}
	// 其次从X-Real-IP获取
	xri := c.GetHeader("X-Real-IP")
	if xri != "" {
		return xri
	}
	return c.ClientIP()
}

// SDK加密响应 - 返回加密数据和签名
func sdkEncryptedResponse(c *gin.Context, app *models.App, code int, message string, data interface{}) {
	// 获取请求中的公共参数
	commonParams := getSDKCommonParams(c)

	resp := gin.H{
		"code":      code,
		"message":   message,
		"data":      data,
		"time":      time.Now().Unix(),
		"uuid":      commonParams.UUID,
		"client_id": commonParams.ClientID,
	}

	jsonData, _ := json.Marshal(resp)
	encrypted, err := sdkEncryptPayload(string(jsonData), app)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 500, "message": "加密响应失败"})
		return
	}
	sign := sdkCalcSign(app.SignAlgo, encrypted, app.AppKey)
	c.JSON(http.StatusOK, gin.H{
		"data": encrypted,
		"sign": sign,
	})
}

// 解密请求数据 - app_code 明文，data 字段加密，sign 字段签名。
// 请求格式: {"app_code": "xxx", "data": "加密的base64字符串", "sign": "签名"}
// data 解密后包含公共参数和业务参数。新增 SDK 接口时优先复用这个函数解析请求。
func sdkDecryptRequest(c *gin.Context, app *models.App, target interface{}) error {
	bodyBytes, _ := c.GetRawData()

	var encReq struct {
		AppCode string `json:"app_code"`
		Data    string `json:"data"`
		Sign    string `json:"sign"`
	}
	if err := json.Unmarshal(bodyBytes, &encReq); err != nil || encReq.Data == "" {
		return fmt.Errorf("缺少加密数据")
	}

	// 验证签名
	if !sdkVerifySign(app, encReq.Data, encReq.Sign) {
		return fmt.Errorf("签名验证失败")
	}

	// 解密data字段
	decrypted, err := sdkDecryptPayload(encReq.Data, app)
	if err != nil {
		return fmt.Errorf("解密失败")
	}

	// 提取公共参数
	var commonParams SDKCommonParams
	json.Unmarshal([]byte(decrypted), &commonParams)
	c.Set("sdk_common_params", &commonParams)

	// 验证公共参数并检查版本
	if err := validateCommonParamsWithVersion(&commonParams, app.ID); err != nil {
		return err
	}

	// 解析解密后的数据到target
	if target != nil {
		if err := json.Unmarshal([]byte(decrypted), target); err != nil {
			return fmt.Errorf("数据格式错误")
		}
	}
	return nil
}

// 解密客户端异常上报请求。异常可能在版本校验失败或登录态失效时发生，因此只校验基础公共参数。
func sdkDecryptReportRequest(c *gin.Context, app *models.App, target interface{}) error {
	bodyBytes, _ := c.GetRawData()

	var encReq struct {
		Data string `json:"data"`
		Sign string `json:"sign"`
	}
	if err := json.Unmarshal(bodyBytes, &encReq); err != nil || encReq.Data == "" {
		return fmt.Errorf("缺少加密数据")
	}
	if !sdkVerifySign(app, encReq.Data, encReq.Sign) {
		return fmt.Errorf("签名验证失败")
	}

	decrypted, err := sdkDecryptPayload(encReq.Data, app)
	if err != nil {
		return fmt.Errorf("解密失败")
	}

	var commonParams SDKCommonParams
	json.Unmarshal([]byte(decrypted), &commonParams)
	c.Set("sdk_common_params", &commonParams)
	if err := validateCommonParams(&commonParams); err != nil {
		return err
	}

	if target != nil {
		if err := json.Unmarshal([]byte(decrypted), target); err != nil {
			return fmt.Errorf("数据格式错误")
		}
	}
	return nil
}

func trimSDKString(s string, max int) string {
	s = strings.TrimSpace(s)
	if max > 0 && len([]rune(s)) > max {
		return string([]rune(s)[:max])
	}
	return s
}

func validClientErrorSeverity(severity string) string {
	switch severity {
	case "info", "warning", "error", "fatal":
		return severity
	default:
		return "error"
	}
}

// SDKReportError 客户端异常/崩溃日志上报
func SDKReportError(c *gin.Context) {
	// 异常上报允许在登录态失效时调用，所以只校验 app_code、加密签名和基础公共参数。
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)
	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	var req struct {
		SDKCommonParams
		Severity   string                 `json:"severity"`
		ErrorType  string                 `json:"error_type"`
		Message    string                 `json:"message"`
		Stack      string                 `json:"stack"`
		Context    map[string]interface{} `json:"context"`
		OccurredAt string                 `json:"occurred_at"`
		Username   string                 `json:"username"`
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptReportRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}
	if strings.TrimSpace(req.Message) == "" && strings.TrimSpace(req.Stack) == "" {
		sdkEncryptedResponse(c, app, 201, "缺少异常信息", nil)
		return
	}

	var session models.OnlineSession
	var appUserID *uint
	username := trimSDKString(req.Username, 50)
	token := c.GetHeader("X-Token")
	if token != "" {
		if err := database.DB.Preload("AppUser").Where("token = ? AND app_id = ?", token, app.ID).First(&session).Error; err == nil {
			appUserID = &session.AppUserID
			if session.AppUser != nil {
				username = session.AppUser.Username
			}
		}
	}

	var contextJSON string
	if req.Context != nil {
		if b, err := json.Marshal(req.Context); err == nil {
			contextJSON = string(b)
		}
	}
	var occurredAt *time.Time
	if req.OccurredAt != "" {
		if t, err := parseTime(req.OccurredAt); err == nil {
			occurredAt = &t
		}
	}

	log := &models.ClientErrorLog{
		AppID:      app.ID,
		AppUserID:  appUserID,
		Username:   username,
		Severity:   validClientErrorSeverity(req.Severity),
		ErrorType:  trimSDKString(req.ErrorType, 100),
		Message:    trimSDKString(req.Message, 1000),
		Stack:      trimSDKString(req.Stack, 20000),
		Context:    trimSDKString(contextJSON, 20000),
		Version:    trimSDKString(req.Version, 50),
		ClientID:   trimSDKString(req.ClientID, 100),
		ClientOS:   trimSDKString(req.ClientOS, 100),
		ClientIP:   getClientIP(c),
		Feature:    trimSDKString(req.Feature, 500),
		OccurredAt: occurredAt,
	}
	if err := database.DB.Create(log).Error; err != nil {
		sdkEncryptedResponse(c, app, 500, "保存异常日志失败", nil)
		return
	}
	sdkEncryptedResponse(c, app, 0, "上报成功", gin.H{"id": log.ID})
}

// 检查会话超时的统一函数
func checkSessionTimeout(session *models.OnlineSession) error {
	// 心跳间隔的 5 倍内没有活动则认为会话失效，防止客户端异常退出后长期占用通道。
	if session == nil {
		return fmt.Errorf("session not found")
	}
	if session.App != nil && session.App.Heartbeat > 0 {
		maxIdleTime := time.Duration(session.App.Heartbeat*5) * time.Second
		if time.Since(session.HeartbeatAt) > maxIdleTime {
			database.DB.Delete(session)
			return fmt.Errorf("session expired, please login again")
		}
	}
	return nil
}

// 解密带Token的请求（已登录接口）
func sdkDecryptRequestWithToken(c *gin.Context, target interface{}) (*models.App, error) {
	// 登录后接口统一走这里：先通过 app_code 找应用，再解密 data，最后校验 X-Token 会话。
	bodyBytes, _ := c.GetRawData()

	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		return nil, fmt.Errorf("缺少app_code")
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		return nil, err
	}

	// 解密请求数据
	var encReq struct {
		Data string `json:"data"`
		Sign string `json:"sign"`
	}
	if err := json.Unmarshal(bodyBytes, &encReq); err != nil || encReq.Data == "" {
		return app, fmt.Errorf("缺少加密数据")
	}

	if !sdkVerifySign(app, encReq.Data, encReq.Sign) {
		return app, fmt.Errorf("签名验证失败")
	}

	decrypted, err := sdkDecryptPayload(encReq.Data, app)
	if err != nil {
		return app, fmt.Errorf("解密失败")
	}

	// 提取公共参数
	var commonParams SDKCommonParams
	json.Unmarshal([]byte(decrypted), &commonParams)
	c.Set("sdk_common_params", &commonParams)

	// 验证公共参数并检查版本
	if err := validateCommonParamsWithVersion(&commonParams, app.ID); err != nil {
		return app, err
	}

	if target != nil {
		if err := json.Unmarshal([]byte(decrypted), target); err != nil {
			return app, fmt.Errorf("数据格式错误")
		}
	}

	// 验证 Token
	token := c.GetHeader("X-Token")
	if token == "" {
		return app, fmt.Errorf("缺少令牌")
	}

	var session models.OnlineSession
	if err := database.DB.Preload("App").Preload("AppUser").Where("token = ?", token).First(&session).Error; err != nil {
		return app, fmt.Errorf("会话不存在或已过期")
	}

	if err := checkSessionTimeout(&session); err != nil {
		return app, err
	}

	c.Set("sdk_session", &session)

	return app, nil
}

// SDK响应格式（无加密，用于公开接口或错误响应）
func sdkResponse(c *gin.Context, code int, message string, data interface{}) {
	// 获取请求中的公共参数
	commonParams := getSDKCommonParams(c)

	c.JSON(http.StatusOK, gin.H{
		"code":      code,
		"message":   message,
		"data":      data,
		"time":      time.Now().Unix(),
		"uuid":      commonParams.UUID,
		"client_id": commonParams.ClientID,
	})
}

// sdkErrorResponse 根据 app 是否存在决定用加密还是明文响应
func sdkErrorResponse(c *gin.Context, app *models.App, code int, message string) {
	if app != nil {
		sdkEncryptedResponse(c, app, code, message, nil)
	} else {
		sdkResponse(c, code, message, nil)
	}
}

// 验证应用（通过 app_code）
func validateApp(appCode string) (*models.App, error) {
	var app models.App

	// Redis 缓存
	if cache.Enabled {
		cacheKey := "app:" + appCode
		if cache.GetJSON(cacheKey, &app) {
			if app.Maintenance == 1 {
				return &app, fmt.Errorf("应用维护中，暂停服务")
			}
			return &app, nil
		}
		// 缓存未命中，查数据库
		if err := database.DB.Where("app_code = ? AND status = 1", appCode).First(&app).Error; err != nil {
			return nil, fmt.Errorf("应用不存在或已禁用")
		}
		cache.SetJSON(cacheKey, &app, 60*time.Second)
		if app.Maintenance == 1 {
			return &app, fmt.Errorf("应用维护中，暂停服务")
		}
		return &app, nil
	}

	// 无 Redis，直接查库
	if err := database.DB.Where("app_code = ? AND status = 1", appCode).First(&app).Error; err != nil {
		return nil, fmt.Errorf("应用不存在或已禁用")
	}
	if app.Maintenance == 1 {
		return &app, fmt.Errorf("应用维护中，暂停服务")
	}
	return &app, nil
}

// ========== SDK验证码 ==========

func SDKGenerateCaptcha(c *gin.Context) {
	// 先读取app_code（明文）
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	// 解密请求数据
	var req struct {
		SDKCommonParams
		Type string `json:"type"` // login, register, recharge, changepwd
	}

	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	if req.Type == "" {
		sdkEncryptedResponse(c, app, 201, "缺少type参数（login/register/recharge/changepwd）", nil)
		return
	}

	validTypes := map[string]bool{"login": true, "register": true, "recharge": true, "changepwd": true}
	if !validTypes[req.Type] {
		sdkEncryptedResponse(c, app, 201, "type参数无效", nil)
		return
	}

	driver := captchaDriver.ConvertFonts()
	cap := base64Captcha.NewCaptcha(driver, captchaStore)
	id, b64s, answer, err := cap.Generate()
	if err != nil {
		sdkEncryptedResponse(c, app, 1, "生成验证码失败", nil)
		return
	}

	// 存入数据库
	record := &models.SDKCaptcha{
		CaptchaID: id,
		Type:      req.Type,
		Answer:    answer,
		ExpireAt:  time.Now().Add(5 * time.Minute),
	}
	database.DB.Create(record)

	// 清理过期验证码（异步）
	go database.DB.Where("expire_at < ?", time.Now()).Delete(&models.SDKCaptcha{})

	sdkEncryptedResponse(c, app, 0, "success", gin.H{
		"captcha_id":  id,
		"captcha_img": b64s,
	})
}

// checkSDKCaptcha 通用验证码校验
func checkSDKCaptcha(c *gin.Context, app *models.App, captchaType, captchaID, captchaVal string) (needCaptcha bool, passed bool) {
	fwCfg, ok := c.Get("fw_config")
	if !ok {
		return false, true
	}
	fw := fwCfg.(*models.FirewallConfig)

	var enabled bool
	switch captchaType {
	case "login":
		enabled = fw.CaptchaLoginEnable == 1
	case "register":
		enabled = fw.CaptchaRegEnable == 1
	case "recharge":
		enabled = fw.CaptchaRechargeEnable == 1
	case "changepwd":
		enabled = fw.CaptchaChangePwdEnable == 1
	}

	if !enabled {
		return false, true
	}

	// 需要验证码
	if captchaID == "" || captchaVal == "" {
		return true, false
	}

	// 从数据库校验：类型必须匹配、未使用、未过期
	var record models.SDKCaptcha
	if err := database.DB.Where("captcha_id = ? AND type = ? AND used = 0 AND expire_at > ?",
		captchaID, captchaType, time.Now()).First(&record).Error; err != nil {
		return true, false
	}

	// 标记已使用
	database.DB.Model(&record).Update("used", 1)

	// 校验答案（不区分大小写）
	if !strings.EqualFold(record.Answer, captchaVal) {
		return true, false
	}

	return true, true
}

// ========== 发送邮箱验证码 ==========
func SDKSendEmailCode(c *gin.Context) {
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	var req struct {
		SDKCommonParams
		Email string `json:"email"`
		Type  int    `json:"type"` // 1:注册 2:找回密码
	}

	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	if req.Email == "" {
		sdkEncryptedResponse(c, app, 201, "缺少email参数", nil)
		return
	}
	if req.Type == 0 {
		req.Type = 1
	}

	// 检查发送频率（1分钟内只能发送一次）
	var lastCode models.EmailCode
	database.DB.Where("email = ? AND type = ? AND created_at > ?", req.Email, req.Type, time.Now().Add(-time.Minute)).First(&lastCode)
	if lastCode.ID > 0 {
		sdkEncryptedResponse(c, app, 211, "发送太频繁，请稍后再试", nil)
		return
	}

	// 同IP每小时最多发送10次验证码
	clientIP := getClientIP(c)
	var ipSendCount int64
	database.DB.Model(&models.EmailCode{}).Where("ip = ? AND created_at > ?", clientIP, time.Now().Add(-time.Hour)).Count(&ipSendCount)
	if ipSendCount >= 10 {
		sdkEncryptedResponse(c, app, 211, "发送太频繁，请稍后再试", nil)
		return
	}

	// 获取应用作者的邮箱配置
	var emailConfig models.EmailConfig
	// 先查作者自己的配置
	if database.DB.Where("user_id = ?", app.UserID).First(&emailConfig).Error != nil {
		// 没有则查全局配置
		database.DB.Where("user_id = 0 OR user_id IS NULL").First(&emailConfig)
	}
	if emailConfig.ID == 0 || emailConfig.SMTPHost == "" {
		sdkEncryptedResponse(c, app, 211, "邮件服务未配置", nil)
		return
	}

	var siteConfig models.SiteConfig
	database.DB.First(&siteConfig)

	// 生成6位验证码
	codeBytes := make([]byte, 3)
	rand.Read(codeBytes)
	codeNum := (int(codeBytes[0])<<16 | int(codeBytes[1])<<8 | int(codeBytes[2])) % 1000000
	code := fmt.Sprintf("%06d", codeNum)

	typeLabel := "注册"
	if req.Type == 2 {
		typeLabel = "密码重置"
	}

	subject := typeLabel + "验证码"
	if siteConfig.SiteName != "" {
		subject = siteConfig.SiteName + " - " + subject
	}

	var body string
	if emailConfig.CodeTemplate != "" {
		// 使用作者自定义模板，替换变量（对用户可控内容做 HTML 转义防止 XSS）
		body = strings.ReplaceAll(emailConfig.CodeTemplate, "{code}", code)
		body = strings.ReplaceAll(body, "{type}", typeLabel)
		body = strings.ReplaceAll(body, "{site_name}", html.EscapeString(siteConfig.SiteName))
		body = strings.ReplaceAll(body, "{app_name}", html.EscapeString(app.AppName))
	} else {
		body = fmt.Sprintf(`<div style="padding:20px;font-family:sans-serif;">
<h2>%s验证码</h2>
<p>您的验证码：<code style="font-size:18px;background:#f5f5f5;padding:4px 12px;border-radius:4px;">%s</code></p>
<p style="color:#999;font-size:13px;">验证码5分钟内有效。如非本人操作，请忽略此邮件。</p>
</div>`, typeLabel, code)
	}

	if err := sendEmail(emailConfig, req.Email, subject, body); err != nil {
		sdkEncryptedResponse(c, app, 211, "验证码发送失败", nil)
		return
	}

	// 保存验证码
	database.DB.Create(&models.EmailCode{
		AppID:    app.ID,
		Email:    req.Email,
		Code:     code,
		Type:     req.Type,
		IP:       clientIP,
		ExpireAt: time.Now().Add(5 * time.Minute),
	})

	sdkEncryptedResponse(c, app, 0, "验证码已发送", nil)
}

// ========== 获取应用信息 ==========
func SDKGetAppInfo(c *gin.Context) {
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	// 解密请求
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, nil); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	// 查找默认版本
	var responseData gin.H
	cacheKey := fmt.Sprintf("sdk:appinfo:%d", app.ID)
	if cache.Enabled {
		if cache.GetJSON(cacheKey, &responseData) {
			sdkEncryptedResponse(c, app, 0, "success", responseData)
			return
		}
	}

	var defaultVersion models.AppVersion
	var versionInfo gin.H
	if err := database.DB.Where("app_id = ? AND is_default = 1", app.ID).First(&defaultVersion).Error; err == nil {
		versionInfo = gin.H{
			"version":      defaultVersion.Version,
			"download_url": defaultVersion.DownloadURL,
			"changelog":    defaultVersion.Changelog,
			"published_at": formatTime(defaultVersion.PublishedAt),
			"force_update": defaultVersion.ForceUpdate,
			"min_required": defaultVersion.MinRequired,
		}
	}
	var minVersion models.AppVersion
	var minVersionInfo gin.H
	if err := database.DB.Where("app_id = ? AND min_required = 1", app.ID).First(&minVersion).Error; err == nil {
		minVersionInfo = gin.H{
			"version":      minVersion.Version,
			"download_url": minVersion.DownloadURL,
			"changelog":    minVersion.Changelog,
			"published_at": formatTime(minVersion.PublishedAt),
		}
	}

	responseData = gin.H{
		"app_name":        app.AppName,
		"description":     app.Description,
		"default_version": versionInfo,
		"min_version":     minVersionInfo,
		"custom_crypto":   sdkCustomCryptoPublicConfig(),
	}
	if cache.Enabled {
		cache.SetJSON(cacheKey, responseData, 120*time.Second)
	}
	sdkEncryptedResponse(c, app, 0, "success", responseData)
}

// ========== 获取应用自定义字段 ==========
func SDKGetCustomField(c *gin.Context) {
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	var req struct {
		SDKCommonParams
		FieldName string `json:"field_name"`
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	fieldName := strings.TrimSpace(req.FieldName)
	if fieldName == "" {
		sdkEncryptedResponse(c, app, 201, "缺少field_name参数", nil)
		return
	}

	fields := sdkAppCustomFields(app)
	value, ok := fields[fieldName]
	if !ok {
		sdkEncryptedResponse(c, app, 203, "自定义字段不存在", nil)
		return
	}

	sdkEncryptedResponse(c, app, 0, "success", gin.H{
		"field_name": fieldName,
		"value":      value,
	})
}

// ========== 用户注册 ==========
func SDKRegister(c *gin.Context) {
	// 先读取app_code（明文）
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	// 解密请求数据（包含公共参数和业务参数）
	var req struct {
		SDKCommonParams        // 嵌入公共参数
		Username        string `json:"user"`
		Password        string `json:"password"`
		InviteCode      string `json:"invite_code"`
		CardNo          string `json:"card_no"`
		CaptchaID       string `json:"captcha_id"`
		Captcha         string `json:"captcha"`
		QQ              string `json:"qq"`
		Wechat          string `json:"wechat"`
		Phone           string `json:"phone"`
		Email           string `json:"email"`
		EmailCode       string `json:"email_code"`
	}

	// 恢复body用于解密
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	if req.Username == "" {
		sdkEncryptedResponse(c, app, 201, "缺少user参数", nil)
		return
	}
	if len(req.Username) < 5 || len(req.Username) > 14 {
		sdkEncryptedResponse(c, app, 201, "用户名长度需在5-14位之间", nil)
		return
	}
	if !alphanumRegex.MatchString(req.Username) {
		sdkEncryptedResponse(c, app, 201, "用户名只能包含大小写字母和数字", nil)
		return
	}
	if req.Password == "" {
		sdkEncryptedResponse(c, app, 201, "缺少password参数", nil)
		return
	}
	if len(req.Password) < 6 || len(req.Password) > 16 {
		sdkEncryptedResponse(c, app, 201, "密码长度需在6-16位之间", nil)
		return
	}
	if !alphanumRegex.MatchString(req.Password) {
		sdkEncryptedResponse(c, app, 201, "密码只能包含大小写字母和数字", nil)
		return
	}
	// 黑名单检查（IP和特征码）
	if blocked, reason := checkSDKBlacklist(app.ID, getClientIP(c), req.Feature); blocked {
		logFirewallEvent(app.ID, "blacklist", getClientIP(c), req.Feature, req.Username, "block", reason)
		sdkEncryptedResponse(c, app, 212, reason, nil)
		return
	}

	// 注册验证码检查
	if needCaptcha, passed := checkSDKCaptcha(c, app, "register", req.CaptchaID, req.Captcha); needCaptcha && !passed {
		sdkEncryptedResponse(c, app, 216, "请输入验证码", nil)
		return
	}

	// 邮箱验证码检查：填了邮箱就必须验证
	if req.Email != "" {
		if req.EmailCode == "" {
			sdkEncryptedResponse(c, app, 215, "请输入邮箱验证码", nil)
			return
		}
		var emailCode models.EmailCode
		if database.DB.Where("email = ? AND code = ? AND type = 1 AND used = 0 AND expire_at > ?",
			req.Email, req.EmailCode, time.Now()).First(&emailCode).Error != nil {
			sdkEncryptedResponse(c, app, 215, "邮箱验证码错误或已过期", nil)
			return
		}
		database.DB.Model(&emailCode).Update("used", 1)
	}

	// 检查注册模式
	if app.RegMode == 1 {
		sdkEncryptedResponse(c, app, 203, "该应用已关闭注册", nil)
		return
	}

	// 注册模式3：需充值卡，验证卡号
	var regCard *models.Card
	if app.RegMode == 3 {
		if req.CardNo == "" {
			sdkEncryptedResponse(c, app, 201, "该应用注册需要充值卡，请提供card_no", nil)
			return
		}
		var card models.Card
		if err := database.DB.Preload("CardType").Where("card_no = ? AND app_id = ?", req.CardNo, app.ID).First(&card).Error; err != nil {
			sdkEncryptedResponse(c, app, 203, "卡号不存在", nil)
			return
		}
		if card.Status == 3 {
			sdkEncryptedResponse(c, app, 205, "卡号已被禁用", nil)
			return
		}
		if card.CardType.Category != 1 {
			sdkEncryptedResponse(c, app, 205, "该卡号不是充值卡", nil)
			return
		}
		if card.UsedCount >= card.CardType.MaxUse {
			sdkEncryptedResponse(c, app, 206, "卡号已被使用", nil)
			return
		}
		regCard = &card
	}

	// 检查用户数量限制
	var userCount int64
	database.DB.Model(&models.AppUser{}).Where("app_id IN (SELECT id FROM apps WHERE user_id = ?)", app.UserID).Count(&userCount)
	var appOwner models.User
	if err := database.DB.First(&appOwner, app.UserID).Error; err == nil {
		_, maxUsers, _, _ := getUserTotalQuota(&appOwner)
		if maxUsers >= 0 && int(userCount) >= maxUsers {
			sdkEncryptedResponse(c, app, 207, "用户数量已达上限", nil)
			return
		}
	}

	// 检查用户名是否存在（同一应用下唯一）
	var count int64
	database.DB.Model(&models.AppUser{}).Where("app_id = ? AND username = ?", app.ID, req.Username).Count(&count)
	if count > 0 {
		sdkEncryptedResponse(c, app, 204, "用户名已存在", nil)
		return
	}

	// 特征码限制检查（使用事务确保原子性）
	if app.RegMode == 4 && req.Feature != "" {
		// 开启事务
		tx := database.DB.Begin()
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()

		// 在事务中检查特征码注册次数
		var featureCount int64
		tx.Model(&models.AppUser{}).Where("app_id = ? AND reg_feature = ?", app.ID, req.Feature).Count(&featureCount)
		if int(featureCount) >= app.RegLimit {
			tx.Rollback()
			sdkEncryptedResponse(c, app, 205, "该设备注册次数已达上限", nil)
			return
		}

		// 查找推广人
		var inviterID *uint = nil
		if req.InviteCode != "" {
			inviter := FindInviterByCode(app.ID, req.InviteCode)
			if inviter != nil {
				inviterID = &inviter.ID
			}
		}

		// 创建用户
		hashedPwd, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		inviteCode := generateInviteCode()

		appUser := &models.AppUser{
			AppID:         app.ID,
			Username:      req.Username,
			Password:      string(hashedPwd),
			Status:        1,
			Channels:      app.RegChannels,
			Features:      app.RegFeatures,
			UnbindDay:     -1,
			UnbindWeek:    -1,
			UnbindMonth:   -1,
			UnbindQuarter: -1,
			UnbindHalfY:   -1,
			UnbindYear:    -1,
			UnbindTotal:   -1,
			RegFeature:    req.Feature,
			InviteCode:    inviteCode,
			InviterID:     inviterID,
			RegIP:         getClientIP(c),
			QQ:            req.QQ,
			Wechat:        req.Wechat,
			Phone:         req.Phone,
			Email:         req.Email,
		}

		// 使用代理卡注册：用户归属到制卡代理，否则代理端看不到该用户
		if regCard != nil && regCard.AgentID != nil {
			appUser.AgentID = regCard.AgentID
		}

		// 注册默认通道/特征最小为1
		if appUser.Channels < 1 {
			appUser.Channels = 1
		}
		if appUser.Features < 1 {
			appUser.Features = 1
		}

		// 注册赠送时长
		if app.RegDuration > 0 {
			expire := time.Now().Add(time.Duration(app.RegDuration) * time.Minute)
			appUser.ExpireAt = &expire
		}

		// 注册赠送点数
		if app.RegPoints > 0 {
			appUser.Points = app.RegPoints
		}

		if err := tx.Create(appUser).Error; err != nil {
			tx.Rollback()
			// 记录详细错误到服务端日志
			fmt.Printf("[SDK注册失败-事务] 用户名: %s, 应用ID: %d, 错误: %v\n", req.Username, app.ID, err)
			sdkEncryptedResponse(c, app, 206, "注册失败", nil)
			return
		}

		// 绑定特征码
		if req.Feature != "" && app.BindDevice == 1 {
			device := &models.AppUserDevice{
				AppUserID: appUser.ID,
				Feature:   req.Feature,
				Remark:    "注册绑定",
			}
			tx.Create(device)
		}

		// 注册模式3：充值卡充值到新用户（事务内）
		if regCard != nil {
			cardUpdates := map[string]interface{}{}
			if regCard.CardType.Duration != 0 {
				var newExpire time.Time
				if regCard.CardType.Duration == -1 {
					newExpire = time.Date(2099, 12, 31, 23, 59, 59, 0, time.Local)
				} else {
					base := time.Now()
					if appUser.ExpireAt != nil && appUser.ExpireAt.After(base) {
						base = *appUser.ExpireAt
					}
					newExpire = base.Add(time.Duration(regCard.CardType.Duration) * time.Minute)
				}
				cardUpdates["expire_at"] = &newExpire
				cardUpdates["is_paid"] = 1
				cardUpdates["last_recharge_at"] = time.Now()
			}
			if regCard.CardType.Points > 0 {
				cardUpdates["points"] = appUser.Points + regCard.CardType.Points
				cardUpdates["is_paid"] = 1
				cardUpdates["last_recharge_at"] = time.Now()
			}
			if regCard.CardType.Channels > 0 {
				cardUpdates["channels"] = regCard.CardType.Channels
			}
			if regCard.CardType.Features > 0 {
				cardUpdates["features"] = regCard.CardType.Features
			}
			if len(cardUpdates) > 0 {
				tx.Model(appUser).Updates(cardUpdates)
			}
			tx.Model(regCard).Updates(map[string]interface{}{
				"used_count": regCard.UsedCount + 1,
				"used_at":    time.Now(),
				"status":     cardStatusAfterUse(*regCard),
			})
		}

		// 提交事务
		if err := tx.Commit().Error; err != nil {
			fmt.Printf("[SDK注册失败-提交事务] 用户名: %s, 应用ID: %d, 错误: %v\n", req.Username, app.ID, err)
			sdkEncryptedResponse(c, app, 206, "注册失败", nil)
			return
		}

		// 处理推广返利
		if inviterID != nil {
			go ProcessRegisterRebate(app.UserID, appUser)
		}

		sdkEncryptedResponse(c, app, 0, "注册成功", gin.H{
			"user":        appUser.Username,
			"invite_code": inviteCode,
		})
		return
	}

	// 非特征码限制模式，正常注册流程
	// 查找推广人
	var inviterID *uint = nil
	if req.InviteCode != "" {
		inviter := FindInviterByCode(app.ID, req.InviteCode)
		if inviter != nil {
			inviterID = &inviter.ID
		}
	}

	// 创建用户
	hashedPwd, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	inviteCode := generateInviteCode()

	appUser := &models.AppUser{
		AppID:         app.ID,
		Username:      req.Username,
		Password:      string(hashedPwd),
		Status:        1,
		Channels:      app.RegChannels,
		Features:      app.RegFeatures,
		UnbindDay:     -1,
		UnbindWeek:    -1,
		UnbindMonth:   -1,
		UnbindQuarter: -1,
		UnbindHalfY:   -1,
		UnbindYear:    -1,
		UnbindTotal:   -1,
		RegFeature:    req.Feature,
		InviteCode:    inviteCode,
		InviterID:     inviterID,
		RegIP:         getClientIP(c),
		QQ:            req.QQ,
		Wechat:        req.Wechat,
		Phone:         req.Phone,
		Email:         req.Email,
	}

	// 使用代理卡注册：用户归属到制卡代理，否则代理端看不到该用户
	if regCard != nil && regCard.AgentID != nil {
		appUser.AgentID = regCard.AgentID
	}

	// 注册默认通道/特征最小为1
	if appUser.Channels < 1 {
		appUser.Channels = 1
	}
	if appUser.Features < 1 {
		appUser.Features = 1
	}

	// 注册赠送时长
	if app.RegDuration > 0 {
		expire := time.Now().Add(time.Duration(app.RegDuration) * time.Minute)
		appUser.ExpireAt = &expire
	}

	// 注册赠送点数
	if app.RegPoints > 0 {
		appUser.Points = app.RegPoints
	}

	if err := database.DB.Create(appUser).Error; err != nil {
		// 记录详细错误到服务端日志
		fmt.Printf("[SDK注册失败] 用户名: %s, 应用ID: %d, 错误: %v\n", req.Username, app.ID, err)
		sdkEncryptedResponse(c, app, 206, "注册失败", nil)
		return
	}

	// 绑定特征码
	if req.Feature != "" && app.BindDevice == 1 {
		device := &models.AppUserDevice{
			AppUserID: appUser.ID,
			Feature:   req.Feature,
			Remark:    "注册绑定",
		}
		database.DB.Create(device)
	}

	// 注册模式3：充值卡充值到新用户
	if regCard != nil {
		updates := map[string]interface{}{}
		if regCard.CardType.Duration != 0 {
			var newExpire time.Time
			if regCard.CardType.Duration == -1 {
				newExpire = time.Date(2099, 12, 31, 23, 59, 59, 0, time.Local)
			} else {
				base := time.Now()
				if appUser.ExpireAt != nil && appUser.ExpireAt.After(base) {
					base = *appUser.ExpireAt
				}
				newExpire = base.Add(time.Duration(regCard.CardType.Duration) * time.Minute)
			}
			updates["expire_at"] = &newExpire
			updates["is_paid"] = 1
			updates["last_recharge_at"] = time.Now()
		}
		if regCard.CardType.Points > 0 {
			updates["points"] = appUser.Points + regCard.CardType.Points
			updates["is_paid"] = 1
			updates["last_recharge_at"] = time.Now()
		}
		if regCard.CardType.Channels > 0 {
			updates["channels"] = regCard.CardType.Channels
		}
		if regCard.CardType.Features > 0 {
			updates["features"] = regCard.CardType.Features
		}
		if len(updates) > 0 {
			database.DB.Model(appUser).Updates(updates)
		}
		// 更新卡号状态
		database.DB.Model(regCard).Updates(map[string]interface{}{
			"used_count": regCard.UsedCount + 1,
			"used_at":    time.Now(),
			"status":     cardStatusAfterUse(*regCard),
		})
		// 记录卡号使用日志
		go database.DB.Create(&models.CardUseLog{
			CardID: regCard.ID, AppID: app.ID, AppUserID: appUser.ID,
			Username: appUser.Username, Action: "register_recharge",
			IP: getClientIP(c), Feature: req.Feature,
		})
	}

	// 处理推广返利
	if inviterID != nil {
		go ProcessRegisterRebate(app.UserID, appUser)
	}

	sdkEncryptedResponse(c, app, 0, "注册成功", gin.H{
		"user":        appUser.Username,
		"invite_code": inviteCode,
	})
}

// ========== 试用登录 ==========
func SDKTrial(c *gin.Context) {
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	var req struct {
		SDKCommonParams
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	if req.Feature == "" {
		sdkEncryptedResponse(c, app, 201, "缺少feature参数", nil)
		return
	}

	// 检查试用是否开启
	if app.TrialDuration <= 0 && app.TrialPoints <= 0 {
		sdkEncryptedResponse(c, app, 203, "该应用未开启试用功能", nil)
		return
	}

	// 黑名单检查
	if blocked, reason := checkSDKBlacklist(app.ID, getClientIP(c), req.Feature); blocked {
		sdkEncryptedResponse(c, app, 212, reason, nil)
		return
	}

	// 检查该特征码试用次数
	if app.TrialLimit > 0 {
		var trialCount int64
		database.DB.Model(&models.TrialFeatureLog{}).Where("app_id = ? AND feature = ?", app.ID, req.Feature).Count(&trialCount)
		if int(trialCount) >= app.TrialLimit {
			sdkEncryptedResponse(c, app, 205, "该设备试用次数已达上限", nil)
			return
		}
	}

	// 生成试用用户
	trialUsername := fmt.Sprintf("trial_%d", time.Now().UnixNano()%1000000000)
	hashedPwd, _ := bcrypt.GenerateFromPassword([]byte(trialUsername), bcrypt.DefaultCost)
	inviteCode := generateInviteCode()

	now := time.Now()
	var expireAt *time.Time
	if app.TrialDuration > 0 {
		t := now.Add(time.Duration(app.TrialDuration) * time.Minute)
		expireAt = &t
	}

	appUser := &models.AppUser{
		AppID:      app.ID,
		Username:   trialUsername,
		Password:   string(hashedPwd),
		Status:     1,
		IsTrial:    1,
		ExpireAt:   expireAt,
		Points:     app.TrialPoints,
		Channels:   app.RegChannels,
		Features:   app.RegFeatures,
		InviteCode: inviteCode,
		RegFeature: req.Feature,
		RegIP:      getClientIP(c),
	}
	if err := database.DB.Create(appUser).Error; err != nil {
		sdkEncryptedResponse(c, app, 206, "试用失败", nil)
		return
	}

	// 记录试用特征
	database.DB.Create(&models.TrialFeatureLog{
		AppID: app.ID, Feature: req.Feature, AppUserID: appUser.ID,
	})

	// 绑定特征码
	if app.BindDevice == 1 && req.Feature != "" {
		database.DB.Create(&models.AppUserDevice{
			AppUserID: appUser.ID, Feature: req.Feature, Remark: "试用绑定",
		})
	}

	// 创建在线会话
	token := uuid.New().String()
	session := &models.OnlineSession{
		AppID: app.ID, AppUserID: appUser.ID, Token: token,
		Version: req.Version, ClientID: req.ClientID, ClientOS: req.ClientOS,
		ClientIP: getClientIP(c), Feature: req.Feature,
		LoginAt: now, HeartbeatAt: now,
		ExpireAt: appUser.ExpireAt, Points: appUser.Points,
	}
	database.DB.Create(session)

	sdkEncryptedResponse(c, app, 0, "试用成功", gin.H{
		"token":     token,
		"user":      appUser.Username,
		"expire_at": formatTime(appUser.ExpireAt),
		"points":    appUser.Points,
	})
}

// ========== 用户登录 ==========
func SDKLogin(c *gin.Context) {
	// 先读取app_code（明文）
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	// 解密请求数据（包含公共参数和业务参数）
	var req struct {
		SDKCommonParams        // 嵌入公共参数
		Username        string `json:"user"`
		Password        string `json:"password"`
		CaptchaID       string `json:"captcha_id"`
		Captcha         string `json:"captcha"`
	}

	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	if req.Username == "" {
		sdkEncryptedResponse(c, app, 201, "缺少user参数", nil)
		return
	}
	if req.Password == "" {
		sdkEncryptedResponse(c, app, 201, "缺少password参数", nil)
		return
	}

	// 黑名单检查（IP和特征码）
	if blocked, reason := checkSDKBlacklist(app.ID, getClientIP(c), req.Feature); blocked {
		logFirewallEvent(app.ID, "blacklist", getClientIP(c), req.Feature, req.Username, "block", reason)
		sdkEncryptedResponse(c, app, 212, reason, nil)
		return
	}

	// 防火墙：检查登录失败锁定
	if fwCfg, ok := c.Get("fw_config"); ok {
		if locked, _ := middleware.CheckSDKLoginFail(app.ID, getClientIP(c), fwCfg.(*models.FirewallConfig)); locked {
			sdkEncryptedResponse(c, app, 211, "登录失败次数过多，请稍后再试", nil)
			return
		}
	}

	// 防火墙：登录验证码检查
	if needCaptcha, passed := checkSDKCaptcha(c, app, "login", req.CaptchaID, req.Captcha); needCaptcha && !passed {
		sdkEncryptedResponse(c, app, 216, "请输入验证码", nil)
		return
	}

	// 查找用户（同一应用下）
	var appUser models.AppUser
	if err := database.DB.Where("app_id = ? AND username = ?", app.ID, req.Username).First(&appUser).Error; err != nil {
		// 记录登录失败
		if fwCfg, ok := c.Get("fw_config"); ok {
			middleware.RecordSDKLoginFail(app.ID, getClientIP(c), fwCfg.(*models.FirewallConfig))
			logFirewallEvent(app.ID, "login_fail", getClientIP(c), req.Feature, req.Username, "fail", "认证失败")
		}
		sdkEncryptedResponse(c, app, 203, "用户名或密码错误", nil)
		return
	}

	// 验证密码
	if err := bcrypt.CompareHashAndPassword([]byte(appUser.Password), []byte(req.Password)); err != nil {
		// 记录登录失败
		if fwCfg, ok := c.Get("fw_config"); ok {
			middleware.RecordSDKLoginFail(app.ID, getClientIP(c), fwCfg.(*models.FirewallConfig))
			logFirewallEvent(app.ID, "login_fail", getClientIP(c), req.Feature, req.Username, "fail", "认证失败")
		}
		sdkEncryptedResponse(c, app, 203, "用户名或密码错误", nil)
		return
	}

	// 检查用户状态
	if appUser.Status == 2 {
		sdkEncryptedResponse(c, app, 205, "账号已被封停", nil)
		return
	}
	if appUser.Status == 3 {
		sdkEncryptedResponse(c, app, 206, "账号已被冻结", nil)
		return
	}

	// 登录成功，清除失败记录
	middleware.ClearSDKLoginFail(app.ID, getClientIP(c))

	// 检查到期时间（计时模式）
	if app.BillingMode == 2 {
		// 如果没有到期时间，说明未充值，应该拒绝登录
		if appUser.ExpireAt == nil {
			sdkEncryptedResponse(c, app, 207, "账号未充值，请先充值", nil)
			return
		}
		// 如果已经过期，也拒绝登录
		if appUser.ExpireAt.Before(time.Now()) {
			sdkEncryptedResponse(c, app, 207, "账号已到期", nil)
			return
		}
	}

	// 检查点数（计点模式）
	if app.BillingMode == 3 && appUser.Points <= 0 {
		sdkEncryptedResponse(c, app, 213, "点数不足，请先充值", nil)
		return
	}

	// 检查特征码绑定
	if app.BindDevice == 1 && req.Feature != "" {
		var deviceCount int64
		database.DB.Model(&models.AppUserDevice{}).Where("app_user_id = ?", appUser.ID).Count(&deviceCount)

		if deviceCount > 0 {
			// 检查是否已绑定该特征码
			var device models.AppUserDevice
			if err := database.DB.Where("app_user_id = ? AND feature = ?", appUser.ID, req.Feature).First(&device).Error; err != nil {
				// 检查是否还能绑定更多特征码
				if int(deviceCount) >= appUser.Features {
					sdkEncryptedResponse(c, app, 208, "设备数量已达上限，请先解绑", nil)
					return
				}
				// 绑定新特征码
				newDevice := &models.AppUserDevice{
					AppUserID: appUser.ID,
					Feature:   req.Feature,
					Remark:    "登录绑定",
				}
				database.DB.Create(newDevice)
				LogAppUserOperation(app.ID, appUser.ID, "bind", "登录软件前检测,自动绑定特征码["+req.Feature+"]", getClientIP(c))
			}
		} else {
			// 首次绑定
			device := &models.AppUserDevice{
				AppUserID: appUser.ID,
				Feature:   req.Feature,
				Remark:    "首次登录绑定",
			}
			database.DB.Create(device)
			LogAppUserOperation(app.ID, appUser.ID, "bind", "登录软件前检测,自动绑定特征码["+req.Feature+"]", getClientIP(c))
		}
	}

	// 检查通道数（多开限制）
	{
		var onlineCount int64
		var whereClause string
		var whereArgs []interface{}
		if app.ChannelMode == 1 {
			// 单绑定通道：按特征码计算
			whereClause = "app_user_id = ? AND feature = ?"
			whereArgs = []interface{}{appUser.ID, req.Feature}
		} else {
			// 账户总通道：按用户计算
			whereClause = "app_user_id = ?"
			whereArgs = []interface{}{appUser.ID}
		}
		database.DB.Model(&models.OnlineSession{}).Where(whereClause, whereArgs...).Count(&onlineCount)
		if int(onlineCount) >= appUser.Channels {
			if app.LoginKick == 1 {
				// 顶号模式：踢掉最早的会话
				var oldSessions []models.OnlineSession
				database.DB.Where(whereClause, whereArgs...).Order("login_at asc").Limit(int(onlineCount) - appUser.Channels + 1).Find(&oldSessions)
				for _, s := range oldSessions {
					database.DB.Delete(&s)
				}
			} else {
				sdkEncryptedResponse(c, app, 209, "登录通道已满，请先退出其他设备", nil)
				return
			}
		}
	}

	// 生成令牌
	token := uuid.New().String()

	// 获取公共参数
	commonParams := getSDKCommonParams(c)

	// 创建在线会话
	session := &models.OnlineSession{
		AppID:       app.ID,
		AppUserID:   appUser.ID,
		Token:       token,
		Version:     commonParams.Version,
		ClientID:    commonParams.ClientID,
		ClientOS:    commonParams.ClientOS,
		ClientIP:    getClientIP(c),
		Feature:     commonParams.Feature,
		LoginAt:     time.Now(),
		HeartbeatAt: time.Now(),
		ExpireAt:    appUser.ExpireAt,
		Points:      appUser.Points,
	}
	database.DB.Create(session)

	// 记录登录操作日志
	LogAppUserOperation(app.ID, appUser.ID, "login", fmt.Sprintf("登录软件成功,软件版本:%s,特征码[%s]", commonParams.Version, commonParams.Feature), getClientIP(c))

	// 返回用户信息（加密响应）
	sdkEncryptedResponse(c, app, 0, "登录成功", gin.H{
		"token":       token,
		"user":        appUser.Username,
		"expire_at":   formatTime(appUser.ExpireAt),
		"points":      appUser.Points,
		"invite_code": appUser.InviteCode,
		"heartbeat":   app.Heartbeat,
	})
}

// ========== 心跳 ==========
func SDKHeartbeat(c *gin.Context) {
	app, err := sdkDecryptRequestWithToken(c, nil)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}

	session := c.MustGet("sdk_session").(*models.OnlineSession)

	// 获取最新用户数据
	var appUser models.AppUser
	database.DB.First(&appUser, session.AppUserID)

	// 检查用户状态
	if appUser.Status == 2 {
		database.DB.Where("token = ?", session.Token).Delete(&models.OnlineSession{})
		sdkEncryptedResponse(c, app, 205, "账号已被封停", nil)
		return
	}
	if appUser.Status == 3 {
		database.DB.Where("token = ?", session.Token).Delete(&models.OnlineSession{})
		sdkEncryptedResponse(c, app, 206, "账号已被冻结", nil)
		return
	}

	// 检查到期时间（计时模式）
	if app.BillingMode == 2 {
		// 如果没有到期时间，说明未充值
		if appUser.ExpireAt == nil {
			sdkEncryptedResponse(c, app, 207, "账号未充值，请先充值", nil)
			return
		}
		// 如果已经过期
		if appUser.ExpireAt.Before(time.Now()) {
			sdkEncryptedResponse(c, app, 207, "账号已到期", nil)
			return
		}
	}

	// 检查点数（计点模式）
	if app.BillingMode == 3 && appUser.Points <= 0 {
		sdkEncryptedResponse(c, app, 213, "点数不足，请先充值", nil)
		return
	}

	// 更新心跳时间和会话数据
	database.DB.Model(&session).Updates(map[string]interface{}{
		"heartbeat_at": time.Now(),
		"expire_at":    appUser.ExpireAt,
		"points":       appUser.Points,
	})

	sdkEncryptedResponse(c, app, 0, "success", gin.H{
		"expire_at": formatTime(appUser.ExpireAt),
		"points":    appUser.Points,
	})
}

// ========== 注销登录 ==========
func SDKLogout(c *gin.Context) {
	app, err := sdkDecryptRequestWithToken(c, nil)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}

	session := c.MustGet("sdk_session").(*models.OnlineSession)
	database.DB.Where("token = ?", session.Token).Delete(&models.OnlineSession{})
	sdkEncryptedResponse(c, app, 0, "注销成功", nil)
}

// ========== 卡号登录 ==========
func SDKCardLogin(c *gin.Context) {
	// 先读取app_code（明文）
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	// 解密请求数据
	var req struct {
		SDKCommonParams
		CardNo    string `json:"card_no"`
		CaptchaID string `json:"captcha_id"`
		Captcha   string `json:"captcha"`
	}

	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	if req.CardNo == "" {
		sdkEncryptedResponse(c, app, 201, "缺少card_no参数", nil)
		return
	}

	// 黑名单检查
	if blocked, reason := checkSDKBlacklist(app.ID, getClientIP(c), req.Feature); blocked {
		logFirewallEvent(app.ID, "blacklist", getClientIP(c), req.Feature, req.CardNo, "block", reason)
		sdkEncryptedResponse(c, app, 212, reason, nil)
		return
	}

	// 防火墙：检查登录失败锁定
	if fwCfg, ok := c.Get("fw_config"); ok {
		if locked, _ := middleware.CheckSDKLoginFail(app.ID, getClientIP(c), fwCfg.(*models.FirewallConfig)); locked {
			sdkEncryptedResponse(c, app, 211, "登录失败次数过多，请稍后再试", nil)
			return
		}
	}

	// 防火墙：登录验证码检查
	if needCaptcha, passed := checkSDKCaptcha(c, app, "login", req.CaptchaID, req.Captcha); needCaptcha && !passed {
		sdkEncryptedResponse(c, app, 216, "请输入验证码", nil)
		return
	}

	// 先查找是否已有该卡号关联的用户（用户名为卡号）
	var appUser models.AppUser
	userExists := database.DB.Where("app_id = ? AND username = ? AND is_card_user = 1", app.ID, req.CardNo).First(&appUser).Error == nil

	if userExists {
		// ===== 非首次登录：用户已存在，直接走登录流程 =====
		middleware.ClearSDKLoginFail(app.ID, getClientIP(c))

		if appUser.Status == 2 {
			sdkEncryptedResponse(c, app, 205, "账号已被封停", nil)
			return
		}
		if appUser.Status == 3 {
			sdkEncryptedResponse(c, app, 206, "账号已被冻结", nil)
			return
		}

		// 检查到期时间（计时模式）
		if app.BillingMode == 2 {
			if appUser.ExpireAt == nil {
				sdkEncryptedResponse(c, app, 207, "账号未充值，请先充值", nil)
				return
			}
			if appUser.ExpireAt.Before(time.Now()) {
				sdkEncryptedResponse(c, app, 207, "账号已到期", nil)
				return
			}
		}

		// 检查点数（计点模式）
		if app.BillingMode == 3 && appUser.Points <= 0 {
			sdkEncryptedResponse(c, app, 213, "点数不足，请先充值", nil)
			return
		}

		// 检查特征码绑定
		if app.BindDevice == 1 && req.Feature != "" {
			var deviceCount int64
			database.DB.Model(&models.AppUserDevice{}).Where("app_user_id = ?", appUser.ID).Count(&deviceCount)
			if deviceCount > 0 {
				var device models.AppUserDevice
				if err := database.DB.Where("app_user_id = ? AND feature = ?", appUser.ID, req.Feature).First(&device).Error; err != nil {
					if int(deviceCount) >= appUser.Features {
						sdkEncryptedResponse(c, app, 208, "设备数量已达上限，请先解绑", nil)
						return
					}
					newDevice := &models.AppUserDevice{
						AppUserID: appUser.ID,
						Feature:   req.Feature,
						Remark:    "卡号登录绑定",
					}
					database.DB.Create(newDevice)
					LogAppUserOperation(app.ID, appUser.ID, "bind", "登录软件前检测,自动绑定特征码["+req.Feature+"]", getClientIP(c))
				}
			} else {
				device := &models.AppUserDevice{
					AppUserID: appUser.ID,
					Feature:   req.Feature,
					Remark:    "首次卡号登录绑定",
				}
				database.DB.Create(device)
				LogAppUserOperation(app.ID, appUser.ID, "bind", "登录软件前检测,自动绑定特征码["+req.Feature+"]", getClientIP(c))
			}
		}
	} else {
		// ===== 首次登录：用户不存在，查卡号仓库 =====

		// 查找卡号
		var card models.Card
		if err := database.DB.Preload("CardType").Where("card_no = ? AND app_id = ?", req.CardNo, app.ID).First(&card).Error; err != nil {
			if fwCfg, ok := c.Get("fw_config"); ok {
				middleware.RecordSDKLoginFail(app.ID, getClientIP(c), fwCfg.(*models.FirewallConfig))
			}
			sdkEncryptedResponse(c, app, 203, "卡号不存在", nil)
			return
		}

		// 检查卡号状态
		if card.Status == 3 {
			sdkEncryptedResponse(c, app, 205, "卡号已被禁用", nil)
			return
		}

		// 检查卡种分类：必须是登录卡
		if card.CardType.Category != 2 {
			sdkEncryptedResponse(c, app, 205, "该卡号不是登录卡", nil)
			return
		}

		// 检查使用次数
		if card.UsedCount >= card.CardType.MaxUse {
			sdkEncryptedResponse(c, app, 206, "卡号已被使用", nil)
			return
		}

		middleware.ClearSDKLoginFail(app.ID, getClientIP(c))

		// 检查用户数量限制
		var userCount int64
		database.DB.Model(&models.AppUser{}).Where("app_id IN (SELECT id FROM apps WHERE user_id = ?)", app.UserID).Count(&userCount)
		var appOwner models.User
		if err := database.DB.First(&appOwner, app.UserID).Error; err == nil {
			_, maxUsers, _, _ := getUserTotalQuota(&appOwner)
			if maxUsers >= 0 && int(userCount) >= maxUsers {
				sdkEncryptedResponse(c, app, 207, "用户数量已达上限", nil)
				return
			}
		}

		// 开启事务
		tx := database.DB.Begin()
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()

		inviteCode := generateInviteCode()
		appUser = models.AppUser{
			AppID:         app.ID,
			Username:      req.CardNo,
			Password:      "", // 卡号用户密码为空
			Status:        1,
			IsCardUser:    1,
			AgentID:       card.AgentID, // 归属到制卡代理，否则代理端看不到该用户
			Channels:      card.CardType.Channels,
			Features:      card.CardType.Features,
			UnbindDay:     card.CardType.UnbindDay,
			UnbindWeek:    card.CardType.UnbindWeek,
			UnbindMonth:   card.CardType.UnbindMonth,
			UnbindQuarter: card.CardType.UnbindQuarter,
			UnbindHalfY:   card.CardType.UnbindHalfY,
			UnbindYear:    card.CardType.UnbindYear,
			UnbindTotal:   card.CardType.UnbindTotal,
			RegFeature:    req.Feature,
			InviteCode:    inviteCode,
			RegIP:         getClientIP(c),
		}

		// 充值时间
		if card.CardType.Duration != 0 {
			now := time.Now()
			var newExpire time.Time
			if card.CardType.Duration == -1 {
				newExpire = time.Date(2099, 12, 31, 23, 59, 59, 0, time.Local)
			} else {
				newExpire = now.Add(time.Duration(card.CardType.Duration) * time.Minute)
			}
			appUser.ExpireAt = &newExpire
			appUser.IsPaid = 1
			appUser.LastRechargeAt = &now
		}

		// 充值点数
		if card.CardType.Points > 0 {
			appUser.Points = card.CardType.Points
			appUser.IsPaid = 1
			now := time.Now()
			appUser.LastRechargeAt = &now
		}

		if err := tx.Create(&appUser).Error; err != nil {
			tx.Rollback()
			fmt.Printf("[SDK卡号登录-创建用户失败] 卡号: %s, 应用ID: %d, 错误: %v\n", req.CardNo, app.ID, err)
			sdkEncryptedResponse(c, app, 206, "登录失败", nil)
			return
		}

		// 绑定特征码
		if req.Feature != "" && app.BindDevice == 1 {
			device := &models.AppUserDevice{
				AppUserID: appUser.ID,
				Feature:   req.Feature,
				Remark:    "卡号登录绑定",
			}
			tx.Create(device)
		}

		// 更新卡号状态
		cardUpdates := map[string]interface{}{
			"used_count": card.UsedCount + 1,
			"used_at":    time.Now(),
			"status":     cardStatusAfterUse(card),
		}
		if err := tx.Model(&card).Updates(cardUpdates).Error; err != nil {
			tx.Rollback()
			sdkEncryptedResponse(c, app, 206, "登录失败", nil)
			return
		}

		// 提交事务
		if err := tx.Commit().Error; err != nil {
			sdkEncryptedResponse(c, app, 206, "登录失败", nil)
			return
		}

		// 记录卡号使用日志（首次登录）
		go database.DB.Create(&models.CardUseLog{
			CardID:    card.ID,
			AppID:     app.ID,
			AppUserID: appUser.ID,
			Username:  appUser.Username,
			Action:    "login",
			IP:        getClientIP(c),
			Feature:   req.Feature,
			ClientID:  req.ClientID,
			ClientOS:  req.ClientOS,
		})
	}

	// 检查通道数（多开限制）
	{
		var onlineCount int64
		var whereClause string
		var whereArgs []interface{}
		if app.ChannelMode == 1 {
			// 单绑定通道：按特征码计算
			whereClause = "app_user_id = ? AND feature = ?"
			whereArgs = []interface{}{appUser.ID, req.Feature}
		} else {
			// 账户总通道：按用户计算
			whereClause = "app_user_id = ?"
			whereArgs = []interface{}{appUser.ID}
		}
		database.DB.Model(&models.OnlineSession{}).Where(whereClause, whereArgs...).Count(&onlineCount)
		if int(onlineCount) >= appUser.Channels {
			if app.LoginKick == 1 {
				// 顶号模式：踢掉最早的会话
				var oldSessions []models.OnlineSession
				database.DB.Where(whereClause, whereArgs...).Order("login_at asc").Limit(int(onlineCount) - appUser.Channels + 1).Find(&oldSessions)
				for _, s := range oldSessions {
					database.DB.Delete(&s)
				}
			} else {
				sdkEncryptedResponse(c, app, 209, "登录通道已满，请先退出其他设备", nil)
				return
			}
		}
	}

	// 生成令牌
	token := uuid.New().String()
	commonParams := getSDKCommonParams(c)

	// 创建在线会话
	session := &models.OnlineSession{
		AppID:       app.ID,
		AppUserID:   appUser.ID,
		Token:       token,
		Version:     commonParams.Version,
		ClientID:    commonParams.ClientID,
		ClientOS:    commonParams.ClientOS,
		ClientIP:    getClientIP(c),
		Feature:     commonParams.Feature,
		LoginAt:     time.Now(),
		HeartbeatAt: time.Now(),
		ExpireAt:    appUser.ExpireAt,
		Points:      appUser.Points,
	}
	database.DB.Create(session)

	// 记录登录操作日志
	LogAppUserOperation(app.ID, appUser.ID, "login", fmt.Sprintf("登录软件成功,软件版本:%s,特征码[%s]", commonParams.Version, commonParams.Feature), getClientIP(c))

	sdkEncryptedResponse(c, app, 0, "登录成功", gin.H{
		"token":       token,
		"user":        appUser.Username,
		"expire_at":   formatTime(appUser.ExpireAt),
		"points":      appUser.Points,
		"invite_code": appUser.InviteCode,
		"heartbeat":   app.Heartbeat,
	})
}

// ========== 充值卡密 ==========
func SDKRecharge(c *gin.Context) {
	var req struct {
		CardNo    string `json:"card_no"`
		CaptchaID string `json:"captcha_id"`
		Captcha   string `json:"captcha"`
	}
	app, err := sdkDecryptRequestWithToken(c, &req)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}

	if req.CardNo == "" {
		sdkEncryptedResponse(c, app, 201, "缺少card_no参数", nil)
		return
	}

	// 充值验证码检查
	if needCaptcha, passed := checkSDKCaptcha(c, app, "recharge", req.CaptchaID, req.Captcha); needCaptcha && !passed {
		sdkEncryptedResponse(c, app, 216, "请输入验证码", nil)
		return
	}

	// 重新获取session
	session := c.MustGet("sdk_session").(*models.OnlineSession)

	// 开启事务
	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 查找卡号（加行锁防止并发重复使用）
	var card models.Card
	if err := tx.Set("gorm:query_option", "FOR UPDATE").Preload("CardType").Where("card_no = ? AND app_id = ?", req.CardNo, session.AppID).First(&card).Error; err != nil {
		tx.Rollback()
		sdkEncryptedResponse(c, app, 203, "卡号不存在", nil)
		return
	}

	// 检查卡号状态
	if card.Status == 3 {
		tx.Rollback()
		sdkEncryptedResponse(c, app, 205, "卡号已被禁用", nil)
		return
	}

	// 检查卡种分类：登录卡不允许充值
	if card.CardType.Category == 2 {
		tx.Rollback()
		sdkEncryptedResponse(c, app, 205, "该卡号为登录卡，无法用于充值", nil)
		return
	}

	// 检查使用次数（优先于状态检查，因为卡种的MaxUse可能被修改）
	if card.UsedCount >= card.CardType.MaxUse {
		tx.Rollback()
		sdkEncryptedResponse(c, app, 206, "卡号使用次数已达上限", nil)
		return
	}

	// 如果状态是"已使用"但次数未达上限，说明卡种的MaxUse被增加了，允许继续使用
	// 只有状态为禁用(3)才真正拒绝

	// 检查用户使用次数
	usedBy := make(map[string]int)
	if card.UsedBy != "" {
		json.Unmarshal([]byte(card.UsedBy), &usedBy)
	}
	userKey := strconv.Itoa(int(session.AppUserID))
	if usedBy[userKey] >= card.CardType.MaxUserUse {
		tx.Rollback()
		sdkEncryptedResponse(c, app, 207, "您已达到该卡号使用上限", nil)
		return
	}

	// 获取用户数据
	var appUser models.AppUser
	tx.First(&appUser, session.AppUserID)

	// 代理归属：老用户首次使用代理卡充值时补写代理ID（首触归属，不覆盖已有归属）
	if appUser.AgentID == nil && card.AgentID != nil {
		if err := tx.Model(&appUser).Update("agent_id", *card.AgentID).Error; err != nil {
			tx.Rollback()
			sdkEncryptedResponse(c, app, 208, "充值失败", nil)
			return
		}
	}

	// 充值
	now := time.Now()
	updates := make(map[string]interface{})

	// 充值时间
	if card.CardType.Duration != 0 {
		var newExpire time.Time
		if card.CardType.Duration == -1 {
			// 永久
			newExpire = time.Date(2099, 12, 31, 23, 59, 59, 0, time.Local)
		} else {
			// 计算新到期时间
			if appUser.ExpireAt != nil && appUser.ExpireAt.After(now) {
				newExpire = appUser.ExpireAt.Add(time.Duration(card.CardType.Duration) * time.Minute)
			} else {
				newExpire = now.Add(time.Duration(card.CardType.Duration) * time.Minute)
			}
		}
		updates["expire_at"] = newExpire
		updates["is_paid"] = 1
	}

	// 充值点数
	if card.CardType.Points > 0 {
		updates["points"] = appUser.Points + card.CardType.Points
		updates["is_paid"] = 1
	}

	// 更新通道数、特征数（直接覆盖为卡种配置）
	updates["channels"] = card.CardType.Channels
	updates["features"] = card.CardType.Features

	// 同步解绑次数限制（直接覆盖为卡种配置）
	updates["unbind_day"] = card.CardType.UnbindDay
	updates["unbind_week"] = card.CardType.UnbindWeek
	updates["unbind_month"] = card.CardType.UnbindMonth
	updates["unbind_quarter"] = card.CardType.UnbindQuarter
	updates["unbind_half_y"] = card.CardType.UnbindHalfY
	updates["unbind_year"] = card.CardType.UnbindYear
	updates["unbind_total"] = card.CardType.UnbindTotal
	updates["last_recharge_at"] = time.Now()

	if err := tx.Model(&appUser).Updates(updates).Error; err != nil {
		tx.Rollback()
		sdkEncryptedResponse(c, app, 208, "充值失败", nil)
		return
	}

	// 更新卡号状态
	usedBy[userKey] = usedBy[userKey] + 1
	usedByJSON, _ := json.Marshal(usedBy)
	cardUpdates := map[string]interface{}{
		"used_count": card.UsedCount + 1,
		"used_by":    string(usedByJSON),
		"used_at":    now,
	}
	cardUpdates["status"] = cardStatusAfterUse(card)
	if err := tx.Model(&card).Updates(cardUpdates).Error; err != nil {
		tx.Rollback()
		sdkEncryptedResponse(c, app, 208, "充值失败", nil)
		return
	}

	// 提交事务
	if err := tx.Commit().Error; err != nil {
		sdkEncryptedResponse(c, app, 208, "充值失败", nil)
		return
	}

	// 记录卡号使用日志
	commonParamsLog := getSDKCommonParams(c)
	go database.DB.Create(&models.CardUseLog{
		CardID:    card.ID,
		AppID:     session.AppID,
		AppUserID: session.AppUserID,
		Username:  appUser.Username,
		Action:    "recharge",
		IP:        getClientIP(c),
		Feature:   commonParamsLog.Feature,
		ClientID:  commonParamsLog.ClientID,
		ClientOS:  commonParamsLog.ClientOS,
	})

	// 处理消费返利（按卡种固定积分）
	if card.CardType.RebatePoints > 0 {
		go ProcessConsumeRebate(session.App.UserID, &appUser, card.CardType.RebatePoints)
	}

	// 获取更新后的数据
	database.DB.First(&appUser, session.AppUserID)

	// 记录充值操作日志
	LogAppUserOperation(session.AppID, session.AppUserID, "recharge", fmt.Sprintf("进行账户充值,充值卡号[%s]", req.CardNo), getClientIP(c))

	sdkEncryptedResponse(c, app, 0, "充值成功", gin.H{
		"expire_at":    formatTime(appUser.ExpireAt),
		"points":       appUser.Points,
		"duration":     card.CardType.Duration,
		"added_points": card.CardType.Points,
	})
}

// ========== 离线充值 ==========
func SDKRechargeOffline(c *gin.Context) {
	// 先读取app_code（明文）
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code参数", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	// 解密请求数据
	var req struct {
		SDKCommonParams
		Username string `json:"user"`
		Password string `json:"password"`
		CardNo   string `json:"card_no"`
	}

	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	if req.Username == "" {
		sdkEncryptedResponse(c, app, 201, "缺少user参数", nil)
		return
	}
	if req.Password == "" {
		sdkEncryptedResponse(c, app, 201, "缺少password参数", nil)
		return
	}
	if req.CardNo == "" {
		sdkEncryptedResponse(c, app, 201, "缺少card_no参数", nil)
		return
	}

	// 查找用户
	var appUser models.AppUser
	if err := database.DB.Where("app_id = ? AND username = ?", app.ID, req.Username).First(&appUser).Error; err != nil {
		sdkEncryptedResponse(c, app, 203, "用户不存在", nil)
		return
	}

	// 验证密码
	if err := bcrypt.CompareHashAndPassword([]byte(appUser.Password), []byte(req.Password)); err != nil {
		sdkEncryptedResponse(c, app, 204, "密码错误", nil)
		return
	}

	// 开启事务
	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 查找卡号（加行锁防止并发重复使用）
	var card models.Card
	if err := tx.Set("gorm:query_option", "FOR UPDATE").Preload("CardType").Where("card_no = ? AND app_id = ?", req.CardNo, app.ID).First(&card).Error; err != nil {
		tx.Rollback()
		sdkEncryptedResponse(c, app, 205, "卡号不存在", nil)
		return
	}

	// 检查卡号状态
	if card.Status == 3 {
		tx.Rollback()
		sdkEncryptedResponse(c, app, 207, "卡号已被禁用", nil)
		return
	}

	// 检查使用次数（优先于状态检查，因为卡种的MaxUse可能被修改）
	if card.UsedCount >= card.CardType.MaxUse {
		tx.Rollback()
		sdkEncryptedResponse(c, app, 208, "卡号使用次数已达上限", nil)
		return
	}

	// 如果状态是"已使用"但次数未达上限，说明卡种的MaxUse被增加了，允许继续使用
	// 只有状态为禁用(3)才真正拒绝

	// 检查用户使用次数
	usedBy := make(map[string]int)
	if card.UsedBy != "" {
		json.Unmarshal([]byte(card.UsedBy), &usedBy)
	}
	userKey := strconv.Itoa(int(appUser.ID))
	if usedBy[userKey] >= card.CardType.MaxUserUse {
		tx.Rollback()
		sdkEncryptedResponse(c, app, 209, "您已达到该卡号使用上限", nil)
		return
	}

	// 充值
	now := time.Now()
	updates := make(map[string]interface{})

	// 充值时间
	if card.CardType.Duration != 0 {
		var newExpire time.Time
		if card.CardType.Duration == -1 {
			// 永久
			newExpire = time.Date(2099, 12, 31, 23, 59, 59, 0, time.Local)
		} else {
			// 计算新到期时间
			if appUser.ExpireAt != nil && appUser.ExpireAt.After(now) {
				newExpire = appUser.ExpireAt.Add(time.Duration(card.CardType.Duration) * time.Minute)
			} else {
				newExpire = now.Add(time.Duration(card.CardType.Duration) * time.Minute)
			}
		}
		updates["expire_at"] = newExpire
		updates["is_paid"] = 1
	}

	// 充值点数
	if card.CardType.Points > 0 {
		updates["points"] = appUser.Points + card.CardType.Points
		updates["is_paid"] = 1
	}

	// 更新通道数、特征数（直接覆盖为卡种配置）
	updates["channels"] = card.CardType.Channels
	updates["features"] = card.CardType.Features

	// 同步解绑次数限制（直接覆盖为卡种配置）
	updates["unbind_day"] = card.CardType.UnbindDay
	updates["unbind_week"] = card.CardType.UnbindWeek
	updates["unbind_month"] = card.CardType.UnbindMonth
	updates["unbind_quarter"] = card.CardType.UnbindQuarter
	updates["unbind_half_y"] = card.CardType.UnbindHalfY
	updates["unbind_year"] = card.CardType.UnbindYear
	updates["unbind_total"] = card.CardType.UnbindTotal
	updates["last_recharge_at"] = time.Now()

	if err := tx.Model(&appUser).Updates(updates).Error; err != nil {
		tx.Rollback()
		sdkEncryptedResponse(c, app, 210, "充值失败", nil)
		return
	}

	// 更新卡号状态
	usedBy[userKey] = usedBy[userKey] + 1
	usedByJSON, _ := json.Marshal(usedBy)
	cardUpdates := map[string]interface{}{
		"used_count": card.UsedCount + 1,
		"used_by":    string(usedByJSON),
		"used_at":    now,
	}
	cardUpdates["status"] = cardStatusAfterUse(card)
	if err := tx.Model(&card).Updates(cardUpdates).Error; err != nil {
		tx.Rollback()
		sdkEncryptedResponse(c, app, 210, "充值失败", nil)
		return
	}

	// 提交事务
	if err := tx.Commit().Error; err != nil {
		sdkEncryptedResponse(c, app, 210, "充值失败", nil)
		return
	}

	// 处理消费返利（按卡种固定积分）
	if card.CardType.RebatePoints > 0 {
		go ProcessConsumeRebate(app.UserID, &appUser, card.CardType.RebatePoints)
	}

	// 记录卡号使用日志
	offlineCommonParams := getSDKCommonParams(c)
	go database.DB.Create(&models.CardUseLog{
		CardID:    card.ID,
		AppID:     app.ID,
		AppUserID: appUser.ID,
		Username:  appUser.Username,
		Action:    "recharge",
		IP:        getClientIP(c),
		Feature:   offlineCommonParams.Feature,
		ClientID:  offlineCommonParams.ClientID,
		ClientOS:  offlineCommonParams.ClientOS,
	})

	// 获取更新后的数据
	database.DB.First(&appUser, appUser.ID)

	// 记录充值操作日志
	LogAppUserOperation(app.ID, appUser.ID, "recharge", fmt.Sprintf("进行账户充值,充值卡号[%s]", req.CardNo), getClientIP(c))

	sdkEncryptedResponse(c, app, 0, "充值成功", gin.H{
		"expire_at":    formatTime(appUser.ExpireAt),
		"points":       appUser.Points,
		"duration":     card.CardType.Duration,
		"added_points": card.CardType.Points,
	})
}

// ========== 扣点 ==========
func SDKDeductPoints(c *gin.Context) {
	var req struct {
		Points int    `json:"points"`
		Reason string `json:"reason"`
	}
	app, err := sdkDecryptRequestWithToken(c, &req)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}

	if req.Points <= 0 {
		sdkEncryptedResponse(c, app, 201, "points参数必须大于0", nil)
		return
	}

	session := c.MustGet("sdk_session").(*models.OnlineSession)

	// 使用原子操作：只有当点数足够时才扣除
	result := database.DB.Model(&models.AppUser{}).
		Where("id = ? AND points >= ?", session.AppUserID, req.Points).
		UpdateColumn("points", gorm.Expr("points - ?", req.Points))

	if result.RowsAffected == 0 {
		// 没有更新任何记录，说明点数不足
		sdkEncryptedResponse(c, app, 203, "点数不足", nil)
		return
	}

	// 获取更新后的点数
	var appUser models.AppUser
	database.DB.First(&appUser, session.AppUserID)

	detail := fmt.Sprintf("扣除点数[%d],剩余点数[%d]", req.Points, appUser.Points)
	if strings.TrimSpace(req.Reason) != "" {
		detail += ",原因[" + strings.TrimSpace(req.Reason) + "]"
	}
	LogAppUserOperation(session.AppID, session.AppUserID, "deduct", detail, getClientIP(c))

	sdkEncryptedResponse(c, app, 0, "扣点成功", gin.H{
		"points": appUser.Points,
	})
}

// ========== 扣时 ==========
func SDKDeductTime(c *gin.Context) {
	var req struct {
		Minutes int    `json:"minutes"`
		Reason  string `json:"reason"`
	}
	app, err := sdkDecryptRequestWithToken(c, &req)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}

	if req.Minutes <= 0 {
		sdkEncryptedResponse(c, app, 201, "minutes参数必须大于0", nil)
		return
	}

	session := c.MustGet("sdk_session").(*models.OnlineSession)

	// 先获取当前用户数据
	var appUser models.AppUser
	database.DB.First(&appUser, session.AppUserID)

	if appUser.ExpireAt == nil {
		sdkEncryptedResponse(c, app, 203, "用户无到期时间", nil)
		return
	}

	newExpire := appUser.ExpireAt.Add(-time.Duration(req.Minutes) * time.Minute)
	now := time.Now()
	if newExpire.Before(now) || newExpire.Equal(now) {
		sdkEncryptedResponse(c, app, 204, "扣时后账号将到期", nil)
		return
	}

	// 使用原子操作更新（检查 expire_at 未被其他请求修改）
	result := database.DB.Model(&models.AppUser{}).
		Where("id = ? AND expire_at = ?", session.AppUserID, appUser.ExpireAt).
		Update("expire_at", newExpire)

	if result.RowsAffected == 0 {
		// 并发冲突，到期时间已被其他请求修改
		sdkEncryptedResponse(c, app, 205, "操作失败，请重试", nil)
		return
	}

	detail := fmt.Sprintf("扣除时长[%d分钟],到期时间[%s]", req.Minutes, formatTime(&newExpire))
	if strings.TrimSpace(req.Reason) != "" {
		detail += ",原因[" + strings.TrimSpace(req.Reason) + "]"
	}
	LogAppUserOperation(session.AppID, session.AppUserID, "deduct", detail, getClientIP(c))

	sdkEncryptedResponse(c, app, 0, "扣时成功", gin.H{
		"expire_at": formatTime(&newExpire),
	})
}

// ========== 获取版本列表 ==========
func SDKGetVersions(c *gin.Context) {
	// 先读取app_code（明文）
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	// 解密请求数据
	var req struct {
		SDKCommonParams
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	var versions []models.AppVersion
	var result []gin.H

	database.DB.Where("app_id = ? AND status = 1", app.ID).Order("id desc").Find(&versions)

	for _, v := range versions {
		if versionVisibleForClient(v, req.SDKCommonParams) {
			result = append(result, versionResponse(v))
		}
	}
	sdkEncryptedResponse(c, app, 0, "success", result)
}

// ========== 获取应用公告列表 ==========
func SDKGetAnnouncements(c *gin.Context) {
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	var req struct {
		SDKCommonParams
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	var announcements []models.AppAnnouncement
	var result []gin.H

	cacheKey := fmt.Sprintf("sdk:announcements:%d", app.ID)
	if cache.Enabled {
		if cache.GetJSON(cacheKey, &result) {
			sdkEncryptedResponse(c, app, 0, "success", result)
			return
		}
	}

	database.DB.Where("app_id = ? AND status = 1", app.ID).Order("sort desc, id desc").Find(&announcements)

	for _, a := range announcements {
		result = append(result, gin.H{
			"id":         a.ID,
			"title":      a.Title,
			"content":    a.Content,
			"sort":       a.Sort,
			"created_at": a.CreatedAt,
		})
	}

	if cache.Enabled {
		cache.SetJSON(cacheKey, result, 60*time.Second)
	}
	sdkEncryptedResponse(c, app, 0, "success", result)
}

// ========== 获取指定版本 ==========
func SDKGetVersion(c *gin.Context) {
	// 先读取app_code（明文）
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	// 解密请求数据
	var req struct {
		SDKCommonParams
		Version string `json:"version"`
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	var appVersion models.AppVersion
	query := database.DB.Where("app_id = ? AND status = 1", app.ID)

	if req.Version != "" {
		query = query.Where("version = ?", req.Version)
	} else {
		query = query.Where("is_default = 1")
	}

	if err := query.First(&appVersion).Error; err != nil {
		sdkEncryptedResponse(c, app, 203, "版本不存在", nil)
		return
	}
	if !versionVisibleForClient(appVersion, req.SDKCommonParams) {
		sdkEncryptedResponse(c, app, 203, "版本不存在", nil)
		return
	}

	sdkEncryptedResponse(c, app, 0, "success", versionResponse(appVersion))
}

// ========== 获取用户数据 ==========
func SDKGetUserInfo(c *gin.Context) {
	app, err := sdkDecryptRequestWithToken(c, nil)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}

	session := c.MustGet("sdk_session").(*models.OnlineSession)

	sdkEncryptedResponse(c, app, 0, "success", gin.H{
		"user":          session.AppUser.Username,
		"avatar":        session.AppUser.Avatar,
		"expire_at":     formatTime(session.AppUser.ExpireAt),
		"points":        session.AppUser.Points,
		"rebate_points": session.AppUser.RebatePoints,
		"is_paid":       session.AppUser.IsPaid,
		"is_tester":     session.AppUser.IsTester,
		"channels":      session.AppUser.Channels,
		"features":      session.AppUser.Features,
		"extra_data":    session.AppUser.ExtraData,
		"cloud_data":    session.AppUser.CloudData,
		"invite_code":   session.AppUser.InviteCode,
		"qq":            session.AppUser.QQ,
		"email":         session.AppUser.Email,
		"wechat":        session.AppUser.Wechat,
		"phone":         session.AppUser.Phone,
	})
}

func SDKUploadAppUserAvatar(c *gin.Context) {
	appCode := strings.TrimSpace(c.PostForm("app_code"))
	if appCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}
	app, err := validateApp(appCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}
	token := c.GetHeader("X-Token")
	if token == "" {
		sdkEncryptedResponse(c, app, 201, "缺少令牌", nil)
		return
	}
	var session models.OnlineSession
	if err := database.DB.Preload("AppUser").Where("token = ? AND app_id = ?", token, app.ID).First(&session).Error; err != nil {
		sdkEncryptedResponse(c, app, 203, "会话不存在或已过期", nil)
		return
	}
	if err := checkSessionTimeout(&session); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}
	if session.AppUser == nil {
		sdkEncryptedResponse(c, app, 203, "用户不存在", nil)
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		sdkEncryptedResponse(c, app, 201, "请选择文件", nil)
		return
	}
	if file.Size > 2*1024*1024 {
		sdkEncryptedResponse(c, app, 201, "文件大小不能超过2MB", nil)
		return
	}
	ext, ok := appUserAvatarExt(file.Header.Get("Content-Type"))
	if !ok {
		sdkEncryptedResponse(c, app, 201, "只支持 JPG/PNG/GIF/WebP 格式", nil)
		return
	}
	dir := filepath.Join(appUserAvatarBaseDir, strconv.Itoa(int(session.AppID)), strconv.Itoa(int(session.AppUserID)))
	if err := os.MkdirAll(dir, 0755); err != nil {
		sdkEncryptedResponse(c, app, 500, "创建目录失败", nil)
		return
	}
	for _, oldExt := range []string{".jpg", ".png", ".gif", ".webp"} {
		_ = os.Remove(filepath.Join(dir, "avatar"+oldExt))
	}
	savePath := filepath.Join(dir, "avatar"+ext)
	if err := c.SaveUploadedFile(file, savePath); err != nil {
		sdkEncryptedResponse(c, app, 500, "保存失败", nil)
		return
	}
	avatarURL := "/" + filepath.ToSlash(savePath)
	if err := database.DB.Model(&models.AppUser{}).Where("id = ?", session.AppUserID).Update("avatar", avatarURL).Error; err != nil {
		sdkEncryptedResponse(c, app, 500, "更新头像失败", nil)
		return
	}
	sdkEncryptedResponse(c, app, 0, "上传成功", gin.H{"avatar": avatarURL})
}

// ========== 获取附加数据（只读） ==========
func SDKGetExtraData(c *gin.Context) {
	app, err := sdkDecryptRequestWithToken(c, nil)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}

	session := c.MustGet("sdk_session").(*models.OnlineSession)

	sdkEncryptedResponse(c, app, 0, "success", gin.H{
		"extra_data": session.AppUser.ExtraData,
	})
}

// ========== 获取云端数据 ==========
func SDKGetCloudData(c *gin.Context) {
	app, err := sdkDecryptRequestWithToken(c, nil)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}

	session := c.MustGet("sdk_session").(*models.OnlineSession)

	sdkEncryptedResponse(c, app, 0, "success", gin.H{
		"cloud_data": session.AppUser.CloudData,
	})
}

// ========== 设置云端数据 ==========
func SDKSetCloudData(c *gin.Context) {
	var req struct {
		CloudData string `json:"cloud_data"`
	}
	app, err := sdkDecryptRequestWithToken(c, &req)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}

	session := c.MustGet("sdk_session").(*models.OnlineSession)

	database.DB.Model(&models.AppUser{}).Where("id = ?", session.AppUserID).Update("cloud_data", req.CloudData)

	sdkEncryptedResponse(c, app, 0, "success", nil)
}

// ========== 获取数据池列表 ==========
func SDKGetDataPools(c *gin.Context) {
	// 先读取app_code（明文）
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	// 解密请求数据
	var req struct {
		SDKCommonParams
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	var pools []models.DataPool
	var result []gin.H

	cacheKey := fmt.Sprintf("sdk:datapools:%d", app.ID)
	if cache.Enabled {
		if cache.GetJSON(cacheKey, &result) {
			sdkEncryptedResponse(c, app, 0, "success", result)
			return
		}
	}

	database.DB.Where("app_id = ?", app.ID).Order("sort asc, id asc").Find(&pools)

	for _, p := range pools {
		result = append(result, gin.H{
			"id":   p.ID,
			"name": p.Name,
			"code": p.Code,
		})
	}

	if cache.Enabled {
		cache.SetJSON(cacheKey, result, 60*time.Second)
	}
	sdkEncryptedResponse(c, app, 0, "success", result)
}

// ========== 获取数据池数据项 ==========
func SDKGetDataItem(c *gin.Context) {
	// 先读取app_code（明文）
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code参数", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	// 解密请求数据
	var req struct {
		SDKCommonParams
		PoolCode string `json:"pool_code"`
		ItemCode string `json:"item_code"`
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	if req.PoolCode == "" {
		sdkEncryptedResponse(c, app, 201, "缺少pool_code参数", nil)
		return
	}
	if req.ItemCode == "" {
		sdkEncryptedResponse(c, app, 201, "缺少item_code参数", nil)
		return
	}

	// 查找数据池
	var pool models.DataPool
	if err := database.DB.Where("app_id = ? AND code = ?", app.ID, req.PoolCode).First(&pool).Error; err != nil {
		sdkEncryptedResponse(c, app, 203, "数据池不存在", nil)
		return
	}

	// 查找数据项
	var item models.DataItem
	if err := database.DB.Where("data_pool_id = ? AND code = ?", pool.ID, req.ItemCode).First(&item).Error; err != nil {
		sdkEncryptedResponse(c, app, 204, "数据项不存在", nil)
		return
	}

	// 检查是否需要登录
	if item.RequireLogin == 1 || item.RequirePaid == 1 {
		token := c.GetHeader("X-Token")
		if token == "" {
			sdkEncryptedResponse(c, app, 205, "该数据需要登录后访问", nil)
			return
		}
		var session models.OnlineSession
		if err := database.DB.Preload("AppUser").Where("token = ?", token).First(&session).Error; err != nil {
			sdkEncryptedResponse(c, app, 205, "会话不存在", nil)
			return
		}
		// 检查是否需要付费用户
		if item.RequirePaid == 1 {
			if session.AppUser == nil || session.AppUser.IsPaid != 1 {
				sdkEncryptedResponse(c, app, 207, "该数据仅限付费用户访问", nil)
				return
			}
		}
	}

	// 检查是否过期
	if item.ExpireAt != nil && item.ExpireAt.Before(time.Now()) {
		sdkEncryptedResponse(c, app, 206, "数据已过期", nil)
		return
	}

	sdkEncryptedResponse(c, app, 0, "success", gin.H{
		"name":    item.Name,
		"code":    item.Code,
		"content": item.Content,
	})
}

// ========== 新增数据池 ==========
func SDKCreateDataPool(c *gin.Context) {
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	var req struct {
		SDKCommonParams
		Name         string `json:"name"`
		Code         string `json:"code"`
		RequireLogin int    `json:"require_login"`
		Remark       string `json:"remark"`
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	if req.Name == "" {
		sdkEncryptedResponse(c, app, 201, "缺少name参数", nil)
		return
	}
	if req.Code == "" {
		sdkEncryptedResponse(c, app, 201, "缺少code参数", nil)
		return
	}

	var count int64
	database.DB.Model(&models.DataPool{}).Where("app_id = ? AND code = ?", app.ID, req.Code).Count(&count)
	if count > 0 {
		sdkEncryptedResponse(c, app, 203, "数据池编码已存在", nil)
		return
	}

	pool := models.DataPool{
		AppID:        app.ID,
		Name:         req.Name,
		Code:         req.Code,
		RequireLogin: req.RequireLogin,
		Remark:       req.Remark,
	}
	if err := database.DB.Create(&pool).Error; err != nil {
		sdkEncryptedResponse(c, app, 201, "创建失败", nil)
		return
	}

	sdkEncryptedResponse(c, app, 0, "success", gin.H{
		"id":   pool.ID,
		"name": pool.Name,
		"code": pool.Code,
	})
}

// ========== 新增数据项 ==========
func SDKCreateDataItem(c *gin.Context) {
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	var req struct {
		SDKCommonParams
		PoolCode     string `json:"pool_code"`
		Name         string `json:"name"`
		Code         string `json:"code"`
		Content      string `json:"content"`
		RequireLogin int    `json:"require_login"`
		RequirePaid  int    `json:"require_paid"`
		AllowDelete  int    `json:"allow_delete"`
		AllowModify  int    `json:"allow_modify"`
		AllowExpire  int    `json:"allow_expire"`
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	if req.PoolCode == "" {
		sdkEncryptedResponse(c, app, 201, "缺少pool_code参数", nil)
		return
	}
	if req.Name == "" {
		sdkEncryptedResponse(c, app, 201, "缺少name参数", nil)
		return
	}
	if req.Code == "" {
		sdkEncryptedResponse(c, app, 201, "缺少code参数", nil)
		return
	}

	var pool models.DataPool
	if err := database.DB.Where("app_id = ? AND code = ?", app.ID, req.PoolCode).First(&pool).Error; err != nil {
		sdkEncryptedResponse(c, app, 203, "数据池不存在", nil)
		return
	}

	// 检查数据池是否要求登录
	if pool.RequireLogin == 1 {
		token := c.GetHeader("X-Token")
		if token == "" {
			sdkEncryptedResponse(c, app, 205, "该数据池需要登录后操作", nil)
			return
		}
		var session models.OnlineSession
		if err := database.DB.Where("token = ?", token).First(&session).Error; err != nil {
			sdkEncryptedResponse(c, app, 205, "会话不存在", nil)
			return
		}
	}

	var count int64
	database.DB.Model(&models.DataItem{}).Where("data_pool_id = ? AND code = ?", pool.ID, req.Code).Count(&count)
	if count > 0 {
		sdkEncryptedResponse(c, app, 203, "数据编号已存在", nil)
		return
	}

	item := models.DataItem{
		DataPoolID:   pool.ID,
		Name:         req.Name,
		Code:         req.Code,
		Content:      req.Content,
		RequireLogin: req.RequireLogin,
		RequirePaid:  req.RequirePaid,
		AllowDelete:  req.AllowDelete,
		AllowModify:  req.AllowModify,
		AllowExpire:  req.AllowExpire,
	}
	if err := database.DB.Create(&item).Error; err != nil {
		sdkEncryptedResponse(c, app, 201, "创建失败", nil)
		return
	}

	sdkEncryptedResponse(c, app, 0, "success", gin.H{
		"id":   item.ID,
		"name": item.Name,
		"code": item.Code,
	})
}

// ========== 删除数据项 ==========
func SDKDeleteDataItem(c *gin.Context) {
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	var req struct {
		SDKCommonParams
		PoolCode string `json:"pool_code"`
		ItemCode string `json:"item_code"`
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	if req.PoolCode == "" {
		sdkEncryptedResponse(c, app, 201, "缺少pool_code参数", nil)
		return
	}
	if req.ItemCode == "" {
		sdkEncryptedResponse(c, app, 201, "缺少item_code参数", nil)
		return
	}

	var pool models.DataPool
	if err := database.DB.Where("app_id = ? AND code = ?", app.ID, req.PoolCode).First(&pool).Error; err != nil {
		sdkEncryptedResponse(c, app, 203, "数据池不存在", nil)
		return
	}

	var item models.DataItem
	if err := database.DB.Where("data_pool_id = ? AND code = ?", pool.ID, req.ItemCode).First(&item).Error; err != nil {
		sdkEncryptedResponse(c, app, 204, "数据项不存在", nil)
		return
	}

	if item.AllowDelete != 1 {
		sdkEncryptedResponse(c, app, 208, "该数据项不允许删除", nil)
		return
	}

	database.DB.Delete(&item)
	sdkEncryptedResponse(c, app, 0, "success", nil)
}

// ========== 修改数据项 ==========
func SDKUpdateDataItem(c *gin.Context) {
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	var req struct {
		SDKCommonParams
		PoolCode string `json:"pool_code"`
		ItemCode string `json:"item_code"`
		Content  string `json:"content"`
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	if req.PoolCode == "" {
		sdkEncryptedResponse(c, app, 201, "缺少pool_code参数", nil)
		return
	}
	if req.ItemCode == "" {
		sdkEncryptedResponse(c, app, 201, "缺少item_code参数", nil)
		return
	}

	var pool models.DataPool
	if err := database.DB.Where("app_id = ? AND code = ?", app.ID, req.PoolCode).First(&pool).Error; err != nil {
		sdkEncryptedResponse(c, app, 203, "数据池不存在", nil)
		return
	}

	var item models.DataItem
	if err := database.DB.Where("data_pool_id = ? AND code = ?", pool.ID, req.ItemCode).First(&item).Error; err != nil {
		sdkEncryptedResponse(c, app, 204, "数据项不存在", nil)
		return
	}

	if item.AllowModify != 1 {
		sdkEncryptedResponse(c, app, 209, "该数据项不允许修改", nil)
		return
	}

	// 检查过期
	if item.ExpireAt != nil && item.ExpireAt.Before(time.Now()) && item.AllowExpire != 1 {
		sdkEncryptedResponse(c, app, 206, "数据已过期且不允许修改", nil)
		return
	}

	// 检查修改次数
	if item.ModifyCount != -1 && item.ModifiedCount >= item.ModifyCount {
		sdkEncryptedResponse(c, app, 210, "修改次数已用完", nil)
		return
	}

	database.DB.Model(&item).Updates(map[string]interface{}{
		"content":        req.Content,
		"modified_count": item.ModifiedCount + 1,
	})

	sdkEncryptedResponse(c, app, 0, "success", gin.H{
		"name":           item.Name,
		"code":           item.Code,
		"content":        req.Content,
		"modified_count": item.ModifiedCount + 1,
		"modify_count":   item.ModifyCount,
	})
}

// ========== 获取用户标识数据 ==========
func SDKGetUserData(c *gin.Context) {
	var req struct {
		Key string `json:"key"`
	}
	app, err := sdkDecryptRequestWithToken(c, &req)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}

	session := c.MustGet("sdk_session").(*models.OnlineSession)

	query := database.DB.Model(&models.AppUserData{}).Where("app_user_id = ?", session.AppUserID)
	if req.Key != "" {
		query = query.Where("`key` = ?", req.Key)
	}

	var dataList []models.AppUserData
	query.Find(&dataList)

	var result []gin.H
	for _, d := range dataList {
		result = append(result, gin.H{
			"key":       d.Key,
			"value":     d.Value,
			"expire_at": d.ExpireAt,
		})
	}

	sdkEncryptedResponse(c, app, 0, "success", result)
}

// ========== 写入用户标识数据 ==========
func SDKSetUserData(c *gin.Context) {
	var req struct {
		Key      string `json:"key"`
		Value    string `json:"value"`
		ExpireAt string `json:"expire_at"`
	}
	app, err := sdkDecryptRequestWithToken(c, &req)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}

	if req.Key == "" {
		sdkEncryptedResponse(c, app, 201, "缺少key参数", nil)
		return
	}

	session := c.MustGet("sdk_session").(*models.OnlineSession)

	// 查找是否已存在
	var data models.AppUserData
	dbErr := database.DB.Where("app_user_id = ? AND `key` = ?", session.AppUserID, req.Key).First(&data).Error

	var expireAt *time.Time
	if req.ExpireAt != "" {
		t, _ := time.Parse("2006-01-02 15:04:05", req.ExpireAt)
		expireAt = &t
	}

	if dbErr != nil {
		// 创建
		data = models.AppUserData{
			AppUserID: session.AppUserID,
			Key:       req.Key,
			Value:     req.Value,
			ExpireAt:  expireAt,
		}
		database.DB.Create(&data)
	} else {
		// 更新
		database.DB.Model(&data).Updates(map[string]interface{}{
			"value":     req.Value,
			"expire_at": expireAt,
		})
	}

	sdkEncryptedResponse(c, app, 0, "success", nil)
}

type sdkDeviceAuthRequest struct {
	SDKCommonParams
	Username string `json:"user"`
	Password string `json:"password"`
	CardNo   string `json:"card_no"`
	DeviceID *uint  `json:"device_id"`
}

func sdkDecryptDeviceAuthRequest(c *gin.Context, req *sdkDeviceAuthRequest) (*models.App, *models.AppUser, error) {
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)
	if appCodeReq.AppCode == "" {
		return nil, nil, fmt.Errorf("缺少app_code")
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		return nil, nil, err
	}

	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, req); err != nil {
		return app, nil, err
	}

	appUser, err := sdkVerifyDeviceAuth(app, req)
	if err != nil {
		return app, nil, err
	}
	return app, appUser, nil
}

func sdkVerifyDeviceAuth(app *models.App, req *sdkDeviceAuthRequest) (*models.AppUser, error) {
	if strings.TrimSpace(req.CardNo) != "" {
		var appUser models.AppUser
		if err := database.DB.Where("app_id = ? AND username = ? AND is_card_user = 1", app.ID, strings.TrimSpace(req.CardNo)).First(&appUser).Error; err != nil {
			return nil, fmt.Errorf("卡号用户不存在，请先登录")
		}
		return &appUser, nil
	}

	if strings.TrimSpace(req.Username) == "" || req.Password == "" {
		return nil, fmt.Errorf("请提供user/password或card_no")
	}

	var appUser models.AppUser
	if err := database.DB.Where("app_id = ? AND username = ?", app.ID, strings.TrimSpace(req.Username)).First(&appUser).Error; err != nil {
		return nil, fmt.Errorf("用户名或密码错误")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(appUser.Password), []byte(req.Password)); err != nil {
		return nil, fmt.Errorf("用户名或密码错误")
	}
	return &appUser, nil
}

// ========== 获取用户特征码列表 ==========
func SDKGetDevices(c *gin.Context) {
	var req sdkDeviceAuthRequest
	app, appUser, err := sdkDecryptDeviceAuthRequest(c, &req)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}

	var devices []models.AppUserDevice
	database.DB.Where("app_user_id = ?", appUser.ID).Order("id asc").Find(&devices)

	var result []gin.H
	for _, d := range devices {
		result = append(result, gin.H{
			"id":         d.ID,
			"feature":    d.Feature,
			"remark":     d.Remark,
			"created_at": d.CreatedAt,
		})
	}

	sdkEncryptedResponse(c, app, 0, "success", result)
}

// ========== 解绑特征码 ==========
func SDKUnbindDevice(c *gin.Context) {
	var req sdkDeviceAuthRequest
	app, appUser, err := sdkDecryptDeviceAuthRequest(c, &req)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}

	if req.DeviceID == nil || *req.DeviceID == 0 {
		sdkEncryptedResponse(c, app, 201, "缺少device_id参数", nil)
		return
	}

	// 查找要解绑的设备（先查出来，后面记录日志用）
	device, err := findAppUserDeviceByOrderedSerial(appUser.ID, *req.DeviceID)
	if err != nil {
		sdkEncryptedResponse(c, app, 203, "特征码不存在", nil)
		return
	}

	// 检查各周期解绑次数限制
	now := time.Now()

	// 日限制
	if appUser.UnbindDay >= 0 {
		var dayCount int64
		dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		database.DB.Model(&models.AppUserUnbindLog{}).Where("app_user_id = ? AND created_at >= ?", appUser.ID, dayStart).Count(&dayCount)
		if int(dayCount) >= appUser.UnbindDay {
			sdkEncryptedResponse(c, app, 210, "今日解绑次数已达上限", nil)
			return
		}
	}

	// 周限制
	if appUser.UnbindWeek >= 0 {
		var weekCount int64
		weekday := int(now.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		weekStart := time.Date(now.Year(), now.Month(), now.Day()-weekday+1, 0, 0, 0, 0, now.Location())
		database.DB.Model(&models.AppUserUnbindLog{}).Where("app_user_id = ? AND created_at >= ?", appUser.ID, weekStart).Count(&weekCount)
		if int(weekCount) >= appUser.UnbindWeek {
			sdkEncryptedResponse(c, app, 210, "本周解绑次数已达上限", nil)
			return
		}
	}

	// 月限制
	if appUser.UnbindMonth >= 0 {
		var monthCount int64
		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		database.DB.Model(&models.AppUserUnbindLog{}).Where("app_user_id = ? AND created_at >= ?", appUser.ID, monthStart).Count(&monthCount)
		if int(monthCount) >= appUser.UnbindMonth {
			sdkEncryptedResponse(c, app, 210, "本月解绑次数已达上限", nil)
			return
		}
	}

	// 季度限制
	if appUser.UnbindQuarter >= 0 {
		var quarterCount int64
		// 计算当前季度的开始时间
		currentMonth := int(now.Month())
		quarterStartMonth := ((currentMonth-1)/3)*3 + 1
		quarterStart := time.Date(now.Year(), time.Month(quarterStartMonth), 1, 0, 0, 0, 0, now.Location())
		database.DB.Model(&models.AppUserUnbindLog{}).Where("app_user_id = ? AND created_at >= ?", appUser.ID, quarterStart).Count(&quarterCount)
		if int(quarterCount) >= appUser.UnbindQuarter {
			sdkEncryptedResponse(c, app, 210, "本季度解绑次数已达上限", nil)
			return
		}
	}

	// 半年限制
	if appUser.UnbindHalfY >= 0 {
		var halfYCount int64
		halfYStart := now.AddDate(0, -6, 0)
		database.DB.Model(&models.AppUserUnbindLog{}).Where("app_user_id = ? AND created_at >= ?", appUser.ID, halfYStart).Count(&halfYCount)
		if int(halfYCount) >= appUser.UnbindHalfY {
			sdkEncryptedResponse(c, app, 210, "半年内解绑次数已达上限", nil)
			return
		}
	}

	// 年限制
	if appUser.UnbindYear >= 0 {
		var yearCount int64
		yearStart := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
		database.DB.Model(&models.AppUserUnbindLog{}).Where("app_user_id = ? AND created_at >= ?", appUser.ID, yearStart).Count(&yearCount)
		if int(yearCount) >= appUser.UnbindYear {
			sdkEncryptedResponse(c, app, 210, "本年解绑次数已达上限", nil)
			return
		}
	}

	// 总限制
	if appUser.UnbindTotal >= 0 {
		var totalCount int64
		database.DB.Model(&models.AppUserUnbindLog{}).Where("app_user_id = ?", appUser.ID).Count(&totalCount)
		if int(totalCount) >= appUser.UnbindTotal {
			sdkEncryptedResponse(c, app, 210, "解绑总次数已达上限", nil)
			return
		}
	}

	// 删除特征码
	if err := database.DB.Delete(device).Error; err != nil {
		sdkEncryptedResponse(c, app, 204, "解绑失败", nil)
		return
	}

	// 记录解绑日志
	unbindLog := &models.AppUserUnbindLog{
		AppUserID: appUser.ID,
		DeviceID:  device.ID,
		Feature:   device.Feature,
	}
	database.DB.Create(unbindLog)

	// 记录操作日志
	LogAppUserOperation(app.ID, appUser.ID, "unbind", "解绑特征码["+device.Feature+"]", getClientIP(c))

	sdkEncryptedResponse(c, app, 0, "解绑成功", nil)
}

func findAppUserDeviceByOrderedSerial(appUserID uint, deviceSerial uint) (*models.AppUserDevice, error) {
	var device models.AppUserDevice
	if err := database.DB.Where("app_user_id = ?", appUserID).Order("id asc").Offset(int(deviceSerial - 1)).Limit(1).First(&device).Error; err != nil {
		return nil, err
	}
	return &device, nil
}

// ========== 修改密码 ==========
func SDKChangePassword(c *gin.Context) {
	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
		CaptchaID   string `json:"captcha_id"`
		Captcha     string `json:"captcha"`
	}
	app, err := sdkDecryptRequestWithToken(c, &req)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}

	if req.OldPassword == "" {
		sdkEncryptedResponse(c, app, 201, "缺少old_password参数", nil)
		return
	}
	if req.NewPassword == "" {
		sdkEncryptedResponse(c, app, 201, "缺少new_password参数", nil)
		return
	}
	if len(req.NewPassword) < 6 || len(req.NewPassword) > 16 {
		sdkEncryptedResponse(c, app, 201, "密码长度需在6-16位之间", nil)
		return
	}
	if !alphanumRegex.MatchString(req.NewPassword) {
		sdkEncryptedResponse(c, app, 201, "密码只能包含大小写字母和数字", nil)
		return
	}

	// 修改密码验证码检查
	if needCaptcha, passed := checkSDKCaptcha(c, app, "changepwd", req.CaptchaID, req.Captcha); needCaptcha && !passed {
		sdkEncryptedResponse(c, app, 216, "请输入验证码", nil)
		return
	}

	session := c.MustGet("sdk_session").(*models.OnlineSession)

	// 验证旧密码
	if err := bcrypt.CompareHashAndPassword([]byte(session.AppUser.Password), []byte(req.OldPassword)); err != nil {
		sdkEncryptedResponse(c, app, 203, "原密码错误", nil)
		return
	}

	// 更新密码
	hashedPwd, _ := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	database.DB.Model(&models.AppUser{}).Where("id = ?", session.AppUserID).Update("password", string(hashedPwd))

	sdkEncryptedResponse(c, app, 0, "密码修改成功", nil)
}


// checkSDKBlacklist 检查IP和特征码黑名单（解密后调用，独立于防火墙开关）
func checkSDKBlacklist(appID uint, clientIP, feature string) (bool, string) {
	now := time.Now()

	// 检查IP黑名单
	var ipBan models.Blacklist
	if err := database.DB.Where("app_id = ? AND type = 1 AND value = ? AND (expire_at IS NULL OR expire_at > ?)",
		appID, clientIP, now).First(&ipBan).Error; err == nil {
		return true, "IP已被封禁"
	}

	// 检查特征码黑名单
	if feature != "" {
		var featureBan models.Blacklist
		if err := database.DB.Where("app_id = ? AND type = 2 AND value = ? AND (expire_at IS NULL OR expire_at > ?)",
			appID, feature, now).First(&featureBan).Error; err == nil {
			return true, "设备已被封禁"
		}
	}

	return false, ""
}

// logFirewallEvent 记录防火墙日志（供SDK handler调用）
func logFirewallEvent(appID uint, logType, ip, feature, username, action, detail string) {
	log := &models.FirewallLog{
		AppID:    appID,
		Type:     logType,
		IP:       ip,
		Feature:  feature,
		Username: username,
		Action:   action,
		Detail:   detail,
	}
	database.DB.Create(log)
}

// ========== 签名验证 ==========
func generateSign(params map[string]string, secret string) string {
	// 按key排序拼接
	var keys []string
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var builder strings.Builder
	for _, k := range keys {
		builder.WriteString(k)
		builder.WriteString("=")
		builder.WriteString(params[k])
		builder.WriteString("&")
	}
	builder.WriteString("secret=")
	builder.WriteString(secret)

	hash := sha256.Sum256([]byte(builder.String()))
	return hex.EncodeToString(hash[:])
}

// ========== 找回密码 ==========
func SDKForgotPassword(c *gin.Context) {
	// 先读取app_code（明文）
	bodyBytes, _ := c.GetRawData()
	var appCodeReq struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &appCodeReq)

	if appCodeReq.AppCode == "" {
		sdkResponse(c, 201, "缺少app_code", nil)
		return
	}

	app, err := validateApp(appCodeReq.AppCode)
	if err != nil {
		sdkResponse(c, 202, err.Error(), nil)
		return
	}

	// 解密请求数据
	var req struct {
		SDKCommonParams
		Username    string `json:"user"`
		Email       string `json:"email"`
		Code        string `json:"code"`
		NewPassword string `json:"new_password"`
	}

	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if err := sdkDecryptRequest(c, app, &req); err != nil {
		sdkEncryptedResponse(c, app, getErrorCode(err), err.Error(), nil)
		return
	}

	if req.Username == "" {
		sdkEncryptedResponse(c, app, 201, "缺少user参数", nil)
		return
	}
	if req.Email == "" {
		sdkEncryptedResponse(c, app, 201, "缺少email参数", nil)
		return
	}

	// 查找用户
	var appUser models.AppUser
	if err := database.DB.Where("app_id = ? AND username = ?", app.ID, req.Username).First(&appUser).Error; err != nil {
		sdkEncryptedResponse(c, app, 208, "用户不存在", nil)
		return
	}

	// 验证邮箱是否匹配
	if appUser.Email == "" || !strings.EqualFold(appUser.Email, req.Email) {
		sdkEncryptedResponse(c, app, 209, "邮箱与账号不匹配", nil)
		return
	}

	// 如果没有提供验证码，则发送验证码
	if req.Code == "" {
		// 检查发送频率（1分钟内只能发送一次）
		var lastCode models.EmailCode
		database.DB.Where("email = ? AND type = 2 AND created_at > ?", req.Email, time.Now().Add(-time.Minute)).First(&lastCode)
		if lastCode.ID > 0 {
			sdkEncryptedResponse(c, app, 211, "发送太频繁，请稍后再试", nil)
			return
		}

		// 同IP每小时最多发送10次验证码
		clientIP := getClientIP(c)
		var ipSendCount int64
		database.DB.Model(&models.EmailCode{}).Where("ip = ? AND created_at > ?", clientIP, time.Now().Add(-time.Hour)).Count(&ipSendCount)
		if ipSendCount >= 10 {
			sdkEncryptedResponse(c, app, 211, "发送太频繁，请稍后再试", nil)
			return
		}

		// 获取应用作者的邮箱配置
		var emailConfig models.EmailConfig
		if database.DB.Where("user_id = ?", app.UserID).First(&emailConfig).Error != nil {
			database.DB.Where("user_id = 0 OR user_id IS NULL").First(&emailConfig)
		}
		if emailConfig.ID == 0 || emailConfig.SMTPHost == "" {
			sdkEncryptedResponse(c, app, 211, "邮件服务未配置", nil)
			return
		}

		// 获取站点配置
		var siteConfig models.SiteConfig
		database.DB.First(&siteConfig)

		// 生成6位验证码
		codeBytes := make([]byte, 3)
		rand.Read(codeBytes)
		codeNum := (int(codeBytes[0])<<16 | int(codeBytes[1])<<8 | int(codeBytes[2])) % 1000000
		code := fmt.Sprintf("%06d", codeNum)

		subject := "密码重置验证码"
		if siteConfig.SiteName != "" {
			subject = siteConfig.SiteName + " - " + subject
		}
		body := fmt.Sprintf(`<div style="padding:20px;font-family:sans-serif;">
<h2>密码重置验证码</h2>
<p>您好 <b>%s</b>，您正在重置密码。</p>
<p>验证码：<code style="font-size:18px;background:#f5f5f5;padding:4px 12px;border-radius:4px;">%s</code></p>
<p style="color:#999;font-size:13px;">验证码5分钟内有效。如非本人操作，请忽略此邮件。</p>
</div>`, appUser.Username, code)

		if err := sendEmail(emailConfig, req.Email, subject, body); err != nil {
			sdkEncryptedResponse(c, app, 211, "邮件发送失败", nil)
			return
		}

		// 保存验证码
		emailCode := models.EmailCode{
			Email:    req.Email,
			Code:     code,
			Type:     2,
			Used:     0,
			IP:       clientIP,
			ExpireAt: time.Now().Add(5 * time.Minute),
		}
		database.DB.Create(&emailCode)

		sdkEncryptedResponse(c, app, 0, "验证码已发送，请查收邮件", nil)
		return
	}

	// 提供了验证码，验证并重置密码
	if req.NewPassword == "" {
		sdkEncryptedResponse(c, app, 201, "缺少new_password参数", nil)
		return
	}
	if len(req.NewPassword) < 6 || len(req.NewPassword) > 16 {
		sdkEncryptedResponse(c, app, 201, "密码长度需在6-16位之间", nil)
		return
	}
	if !alphanumRegex.MatchString(req.NewPassword) {
		sdkEncryptedResponse(c, app, 201, "密码只能包含大小写字母和数字", nil)
		return
	}

	// 验证验证码
	var emailCode models.EmailCode
	database.DB.Where("email = ? AND code = ? AND type = 2 AND used = 0 AND expire_at > ?",
		req.Email, req.Code, time.Now()).First(&emailCode)
	if emailCode.ID == 0 {
		sdkEncryptedResponse(c, app, 210, "验证码错误或已过期", nil)
		return
	}

	// 加密新密码
	hashedPwd, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		sdkEncryptedResponse(c, app, 210, "重置密码失败", nil)
		return
	}

	// 更新密码
	database.DB.Model(&appUser).Update("password", string(hashedPwd))
	// 标记验证码已使用
	database.DB.Model(&emailCode).Update("used", 1)

	sdkEncryptedResponse(c, app, 0, "密码重置成功", nil)
}

// generateRandomPassword 生成随机密码（大小写字母+数字）
func generateRandomPassword(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	randBytes := make([]byte, length)
	rand.Read(randBytes)
	for i := range b {
		b[i] = charset[int(randBytes[i])%len(charset)]
	}
	return string(b)
}
