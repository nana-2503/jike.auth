// Package jkauth 极客授权系统 Go SDK
package jkauth

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
	"io"
	"net/http"
	"strings"
	"time"
)

// Config SDK配置。创建客户端前，从作者后台“应用管理”里复制 app_code/app_key/app_secret/签名算法。
type Config struct {
	BaseURL        string // API地址，如 http://localhost:8081/api/sdk
	AppCode        string // 应用编码
	AppKey         string // 应用密钥
	AppSecret      string // AES加密密钥（为空则不加密）
	ClientSignAlgo string // 客户端签名算法
	ServerSignAlgo string // 服务端签名算法
	Feature        string // 设备特征码
	Version        string // 客户端版本
	ClientOS       string // 客户端系统
	MD5            string // 应用版本MD5
}

// Client SDK客户端。登录成功后 Token 会保存在这里，后续需要登录的接口自动携带 X-Token。
type Client struct {
	Config   Config
	Token    string
	ClientID string
	http     *http.Client
}

// Response 通用响应。Data 是原始 JSON，调用 DataAs 可解析到业务结构体。
type Response struct {
	Code     int             `json:"code"`
	Message  string          `json:"message"`
	Data     json.RawMessage `json:"data"`
	Time     int64           `json:"time"`
	UUID     string          `json:"uuid"`
	ClientID string          `json:"client_id"`
}

// EncryptedResponse 加密响应
type EncryptedResponse struct {
	Data string `json:"data"`
	Sign string `json:"sign"`
}

// ErrorReport 客户端异常/崩溃上报内容。
type ErrorReport struct {
	Severity   string                 `json:"severity,omitempty"`    // info, warning, error, fatal
	ErrorType  string                 `json:"error_type,omitempty"`  // 异常类型，如 panic、network、runtime
	Message    string                 `json:"message,omitempty"`     // 异常摘要
	Stack      string                 `json:"stack,omitempty"`       // 堆栈或详细日志
	Context    map[string]interface{} `json:"context,omitempty"`     // 自定义上下文
	OccurredAt string                 `json:"occurred_at,omitempty"` // 发生时间，建议 RFC3339
	Username   string                 `json:"username,omitempty"`    // 未登录时可传用户名
}

// NewClient 创建SDK客户端
func NewClient(cfg Config) *Client {
	h := sha256.Sum256([]byte(fmt.Sprintf("%d", time.Now().UnixNano())))
	return &Client{
		Config:   cfg,
		ClientID: hex.EncodeToString(h[:16]),
		http:     &http.Client{Timeout: 15 * time.Second},
	}
}

// ==================== 加解密 ====================
// 这里的算法必须和后端 handlers/sdk.go 保持一致。修改加密/签名规则时要同步改服务端、文档和示例。

func pkcs7Pad(data []byte, blockSize int) []byte {
	padding := blockSize - len(data)%blockSize
	padText := bytes.Repeat([]byte{byte(padding)}, padding)
	return append(data, padText...)
}

func pkcs7Unpad(data []byte) []byte {
	length := len(data)
	if length == 0 {
		return data
	}
	padding := int(data[length-1])
	if padding > length || padding > aes.BlockSize {
		return data
	}
	return data[:length-padding]
}

func adjustKey(key []byte) []byte {
	// HTTP Go SDK 兼容 AES-128/192/256：根据 app_secret 长度裁剪或补齐到合法 AES key 长度。
	if len(key) < 16 {
		padded := make([]byte, 16)
		copy(padded, key)
		return padded
	} else if len(key) <= 16 {
		return key[:16]
	} else if len(key) <= 24 {
		return key[:24]
	}
	return key[:32]
}

func aesEncrypt(plainText, key string) (string, error) {
	keyBytes := adjustKey([]byte(key))
	block, err := aes.NewCipher(keyBytes)
	if err != nil {
		return "", err
	}

	plainBytes := pkcs7Pad([]byte(plainText), block.BlockSize())
	iv := make([]byte, block.BlockSize())
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return "", err
	}

	mode := cipher.NewCBCEncrypter(block, iv)
	cipherBytes := make([]byte, len(plainBytes))
	mode.CryptBlocks(cipherBytes, plainBytes)

	result := append(iv, cipherBytes...)
	return base64.StdEncoding.EncodeToString(result), nil
}

func aesDecrypt(cipherText, key string) (string, error) {
	keyBytes := adjustKey([]byte(key))
	data, err := base64.StdEncoding.DecodeString(cipherText)
	if err != nil {
		return "", err
	}
	if len(data) < 16 {
		return "", fmt.Errorf("密文太短")
	}

	iv := data[:16]
	encrypted := data[16:]
	if len(encrypted)%aes.BlockSize != 0 {
		return "", fmt.Errorf("密文长度不正确")
	}

	block, err := aes.NewCipher(keyBytes)
	if err != nil {
		return "", err
	}

	mode := cipher.NewCBCDecrypter(block, iv)
	decrypted := make([]byte, len(encrypted))
	mode.CryptBlocks(decrypted, encrypted)
	decrypted = pkcs7Unpad(decrypted)

	return string(decrypted), nil
}

func calcSign(signAlgo, data, key string) string {
	// 签名模板支持 [data] 和 [key] 两个占位符，最终对替换后的字符串做 SHA-256。
	if signAlgo == "" {
		return ""
	}
	signStr := strings.ReplaceAll(signAlgo, "[data]", data)
	signStr = strings.ReplaceAll(signStr, "[key]", key)
	hash := sha256.Sum256([]byte(signStr))
	return hex.EncodeToString(hash[:])
}

// ==================== 请求方法 ====================

func (c *Client) buildCommonParams() map[string]interface{} {
	// 每个 SDK 请求都携带公共参数。版本、防火墙、设备绑定、重放检测都依赖这些字段。
	return map[string]interface{}{
		"feature":   c.Config.Feature,
		"version":   c.Config.Version,
		"client_id": c.ClientID,
		"client_os": c.Config.ClientOS,
		"md5":       c.Config.MD5,
		"uuid":      fmt.Sprintf("%d", time.Now().UnixNano()),
	}
}

// request 发送POST请求
func (c *Client) request(endpoint string, data map[string]interface{}, needToken bool) (*Response, error) {
	// 合并公共参数
	params := c.buildCommonParams()
	for k, v := range data {
		params[k] = v
	}
	params["app_code"] = c.Config.AppCode

	var body []byte
	var err error

	if c.Config.AppSecret != "" {
		// 加密请求：外层只保留 app_code/data/sign，业务字段放进加密后的 data。
		jsonData, _ := json.Marshal(params)
		encrypted, err := aesEncrypt(string(jsonData), c.Config.AppSecret)
		if err != nil {
			return nil, fmt.Errorf("加密失败: %v", err)
		}
		// 客户端发送请求时，使用 ServerSignAlgo 计算签名（服务端用 ServerSignAlgo 验证）
		sign := calcSign(c.Config.ServerSignAlgo, encrypted, c.Config.AppKey)
		encReq := map[string]string{
			"app_code": c.Config.AppCode,
			"data":     encrypted,
			"sign":     sign,
		}
		body, err = json.Marshal(encReq)
		if err != nil {
			return nil, err
		}
	} else {
		body, err = json.Marshal(params)
		if err != nil {
			return nil, err
		}
	}

	req, err := http.NewRequest("POST", c.Config.BaseURL+endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if needToken && c.Token != "" {
		// 登录后接口用 X-Token 标识在线会话，不使用后台 JWT。
		req.Header.Set("X-Token", c.Token)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %v", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	return c.parseResponse(respBody)
}


// parseResponse 解析响应（支持加密和明文）
func (c *Client) parseResponse(body []byte) (*Response, error) {
	// 尝试解析为加密响应
	if c.Config.AppSecret != "" {
		var encResp EncryptedResponse
		if err := json.Unmarshal(body, &encResp); err == nil && encResp.Data != "" {
			// 验证服务端签名（服务端用 ClientSignAlgo 签名，客户端用 ClientSignAlgo 验证）
			if c.Config.ClientSignAlgo != "" {
				expectedSign := calcSign(c.Config.ClientSignAlgo, encResp.Data, c.Config.AppKey)
				if expectedSign != encResp.Sign {
					return nil, fmt.Errorf("服务端签名验证失败")
				}
			}
			// 解密
			decrypted, err := aesDecrypt(encResp.Data, c.Config.AppSecret)
			if err != nil {
				return nil, fmt.Errorf("解密响应失败: %v", err)
			}
			var resp Response
			if err := json.Unmarshal([]byte(decrypted), &resp); err != nil {
				return nil, fmt.Errorf("解析响应失败: %v", err)
			}
			return &resp, nil
		}
	}

	// 明文响应
	var resp Response
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("解析响应失败: %v", err)
	}
	return &resp, nil
}

// DataAs 将 Response.Data 解析到目标结构体
func (r *Response) DataAs(target interface{}) error {
	// 示例：var info UserInfo; err := resp.DataAs(&info)
	if r.Data == nil {
		return fmt.Errorf("data is nil")
	}
	return json.Unmarshal(r.Data, target)
}

// ==================== API 方法 ====================

// Register 用户注册
func (c *Client) Register(username, password string, inviteCode ...string) (*Response, error) {
	data := map[string]interface{}{
		"user": username,
		"password": password,
	}
	if len(inviteCode) > 0 && inviteCode[0] != "" {
		data["invite_code"] = inviteCode[0]
	}
	return c.request("/register", data, false)
}

// Login 用户登录
func (c *Client) Login(username, password string) (*Response, error) {
	// 登录成功后保存 token；后续 Heartbeat、Recharge、GetUserInfo 等接口会自动带上。
	resp, err := c.request("/login", map[string]interface{}{
		"user": username,
		"password": password,
	}, false)
	if err != nil {
		return nil, err
	}
	if resp.Code == 0 {
		var loginData struct {
			Token string `json:"token"`
		}
		resp.DataAs(&loginData)
		c.Token = loginData.Token
	}
	return resp, nil
}

// CardLogin 卡号登录（登录卡专用）
func (c *Client) CardLogin(cardNo string) (*Response, error) {
	// 登录卡模式使用卡号直接登录，成功后同样获得在线会话 token。
	resp, err := c.request("/card-login", map[string]interface{}{
		"card_no": cardNo,
	}, false)
	if err != nil {
		return nil, err
	}
	if resp.Code == 0 {
		var loginData struct {
			Token string `json:"token"`
		}
		resp.DataAs(&loginData)
		c.Token = loginData.Token
	}
	return resp, nil
}

// Trial 试用登录
func (c *Client) Trial() (*Response, error) {
	resp, err := c.request("/trial", nil, false)
	if err != nil {
		return nil, err
	}
	if resp.Code == 0 {
		var loginData struct {
			Token string `json:"token"`
		}
		resp.DataAs(&loginData)
		c.Token = loginData.Token
	}
	return resp, nil
}

// Logout 登出
func (c *Client) Logout() (*Response, error) {
	resp, err := c.request("/logout", nil, true)
	if err == nil && resp.Code == 0 {
		c.Token = ""
	}
	return resp, err
}

// Heartbeat 心跳
func (c *Client) Heartbeat() (*Response, error) {
	// 客户端应按应用 heartbeat 配置定期调用，保持在线会话和通道占用状态。
	return c.request("/heartbeat", nil, true)
}

// Recharge 在线充值（需要先登录）
func (c *Client) Recharge(cardNo string) (*Response, error) {
	return c.request("/recharge", map[string]interface{}{
		"card_no": cardNo,
	}, true)
}

// RechargeOffline 离线充值（无需登录）
func (c *Client) RechargeOffline(username, password, cardNo string) (*Response, error) {
	return c.request("/recharge-offline", map[string]interface{}{
		"user": username,
		"password": password,
		"card_no":  cardNo,
	}, false)
}

// DeductPoints 扣点
func (c *Client) DeductPoints(points int, reason ...string) (*Response, error) {
	data := map[string]interface{}{"points": points}
	if len(reason) > 0 {
		data["reason"] = reason[0]
	}
	return c.request("/deduct-points", data, true)
}

// DeductTime 扣时（分钟）
func (c *Client) DeductTime(minutes int, reason ...string) (*Response, error) {
	data := map[string]interface{}{"minutes": minutes}
	if len(reason) > 0 {
		data["reason"] = reason[0]
	}
	return c.request("/deduct-time", data, true)
}

// GetUserInfo 获取用户信息
func (c *Client) GetUserInfo() (*Response, error) {
	return c.request("/userinfo", nil, true)
}

// GetExtraData 获取附加数据（只读）
func (c *Client) GetExtraData() (*Response, error) {
	return c.request("/extradata", nil, true)
}

// GetCloudData 获取云端数据
func (c *Client) GetCloudData() (*Response, error) {
	return c.request("/clouddata/get", nil, true)
}

// SetCloudData 设置云端数据
func (c *Client) SetCloudData(cloudData string) (*Response, error) {
	return c.request("/clouddata/set", map[string]interface{}{
		"cloud_data": cloudData,
	}, true)
}

// GetVersions 获取版本列表
func (c *Client) GetVersions() (*Response, error) {
	return c.request("/versions", nil, false)
}

// GetVersion 获取指定版本信息
func (c *Client) GetVersion(version string) (*Response, error) {
	return c.request("/version", map[string]interface{}{"version": version}, false)
}

// GetDataPools 获取数据池列表
func (c *Client) GetDataPools() (*Response, error) {
	return c.request("/datapools", nil, false)
}

// GetDataItem 获取数据池数据项
func (c *Client) GetDataItem(poolCode, itemCode string) (*Response, error) {
	return c.request("/dataitem", map[string]interface{}{
		"pool_code": poolCode,
		"item_code": itemCode,
	}, false)
}

// GetUserData 获取用户标识数据
func (c *Client) GetUserData(key string) (*Response, error) {
	return c.request("/usermark/get", map[string]interface{}{"key": key}, true)
}

// SetUserData 写入用户标识数据
func (c *Client) SetUserData(key, value string, expireAt ...string) (*Response, error) {
	params := map[string]interface{}{
		"key":   key,
		"value": value,
	}
	if len(expireAt) > 0 && expireAt[0] != "" {
		params["expire_at"] = expireAt[0]
	}
	return c.request("/usermark/set", params, true)
}

// GetDevices 获取设备列表
func (c *Client) GetDevices() (*Response, error) {
	return c.request("/devices", nil, true)
}

// UnbindDevice 解绑设备。deviceSerial 按 GetDevices 返回顺序计算，1 表示第一条。
func (c *Client) UnbindDevice(deviceSerial uint) (*Response, error) {
	return c.request("/unbind-device", map[string]interface{}{
		"device_id": deviceSerial,
	}, true)
}

// ChangePassword 修改密码
func (c *Client) ChangePassword(oldPassword, newPassword string) (*Response, error) {
	return c.request("/change-password", map[string]interface{}{
		"old_password": oldPassword,
		"new_password": newPassword,
	}, true)
}

// ForgotPassword 找回密码（通过邮箱重置）
func (c *Client) ForgotPassword(username, email string) (*Response, error) {
	return c.request("/forgot-password", map[string]interface{}{
		"user": username,
		"email":    email,
	}, false)
}

// ReportError 上报客户端异常/崩溃日志；如果当前已登录，会自动携带 X-Token 关联软件用户。
func (c *Client) ReportError(report ErrorReport) (*Response, error) {
	data := map[string]interface{}{
		"severity":    report.Severity,
		"error_type":  report.ErrorType,
		"message":     report.Message,
		"stack":       report.Stack,
		"context":     report.Context,
		"occurred_at": report.OccurredAt,
		"username":    report.Username,
	}
	return c.request("/report-error", data, c.Token != "")
}

// ListPointShopItems 获取当前应用可兑换的积分商城商品和返利积分余额。
func (c *Client) ListPointShopItems() (*Response, error) {
	return c.request("/point-shop/items", nil, true)
}

// ExchangePointShopItem 使用返利积分兑换积分商城商品。
func (c *Client) ExchangePointShopItem(itemID uint) (*Response, error) {
	return c.request("/point-shop/exchange", map[string]interface{}{
		"item_id": itemID,
	}, true)
}

// ListPointShopExchanges 获取当前用户最近的积分商城兑换记录。
func (c *Client) ListPointShopExchanges() (*Response, error) {
	return c.request("/point-shop/exchanges", nil, true)
}
