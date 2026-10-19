package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"jike-auth/database"
	"jike-auth/middleware"
	"jike-auth/models"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/mojocn/base64Captcha"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ========== 配置常量 ==========
// WebSocket 面向客户端长连接，必须限制空闲时间、消息大小、全局连接数和单连接消息频率。

const (
	wsReadTimeout    = 300 * time.Second // 5分钟无消息断开
	wsPingInterval   = 60 * time.Second  // 服务端每60秒发ping
	wsMaxMessageSize = 4096              // 单条消息最大4KB
	wsMaxConnections = 5000              // 全局最大连接数
	wsMsgRateLimit   = 30                // 每秒最大消息数
	wsMsgRateWindow  = time.Second
)

// ========== 数据结构 ==========

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// 客户端接入场景复杂，跨域控制不放在这里做；真实权限由 app_code、签名、token 校验。
		return true
	},
}

// WSConnection WebSocket连接
type WSConnection struct {
	Conn      *websocket.Conn
	App       *models.App // 登录后记住应用（用于加解密）
	Token     string
	AppUserID uint
	AppID     uint
	Username  string
	Feature   string
	mu        sync.Mutex
	closed    bool
	authed    bool // 是否已通过认证（login成功）
	clientIP  string

	// 消息频率限制
	msgCount   int
	msgResetAt time.Time
}

// WSRequest WebSocket请求（外层始终明文JSON）。
// 公开接口: { action, req_id, app_code, data: "加密base64", sign: "签名" }
// 认证接口: { action, req_id, app_code, data: "加密base64", sign: "签名" }
// req_id 由客户端生成，服务端原样回传，方便客户端把响应匹配回 pending 请求。
type WSRequest struct {
	Action  string          `json:"action"`
	ReqID   string          `json:"req_id"`
	AppCode string          `json:"app_code"`
	Data    json.RawMessage `json:"data"`
	Sign    string          `json:"sign"`
}

// WSResponse WebSocket响应
type WSResponse struct {
	Action  string      `json:"action"`
	ReqID   string      `json:"req_id"`
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Time    int64       `json:"time"`
}

// ========== 连接管理器 ==========
// wsConnections 用 token 索引已登录连接，后台踢下线时可通过 token 找到连接并推送 kicked。

var (
	wsConnections = make(map[string]*WSConnection)
	wsConnMu      sync.RWMutex
	wsConnCount   int64
	wsConnCountMu sync.Mutex
)

// ========== 安全辅助函数 ==========

func secureToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func secureHashPassword(password string) (string, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

func secureCheckPassword(password, hashedPassword string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password)) == nil
}

// ========== WS 加解密层 ==========

// wsDecryptData 解密请求的data字段，返回解密后的map
// data是加密的base64字符串，需要解密
func wsDecryptData(app *models.App, rawData json.RawMessage, sign string) (map[string]interface{}, error) {
	// WebSocket 与 HTTP SDK 使用同一套 app_secret 加密和 server_sign_algo 验签。
	if len(rawData) == 0 {
		return map[string]interface{}{}, nil
	}

	if app == nil || app.AppSecret == "" {
		return nil, fmt.Errorf("应用加密配置缺失")
	}

	// data应该是加密的base64字符串（JSON string）
	var encryptedStr string
	if err := json.Unmarshal(rawData, &encryptedStr); err != nil {
		return nil, fmt.Errorf("加密数据格式错误")
	}
	if encryptedStr == "" {
		return nil, fmt.Errorf("加密数据为空")
	}

	// 验证签名
	if !sdkVerifySign(app, encryptedStr, sign) {
		return nil, fmt.Errorf("签名验证失败")
	}

	// 解密
	decrypted, err := sdkDecryptPayload(encryptedStr, app)
	if err != nil {
		return nil, fmt.Errorf("解密失败")
	}

	var result map[string]interface{}
	if err := json.Unmarshal([]byte(decrypted), &result); err != nil {
		return nil, fmt.Errorf("数据格式错误")
	}

	// 验证公共参数
	if wsGetString(result, "feature") == "" {
		return nil, fmt.Errorf("缺少feature参数")
	}
	if wsGetString(result, "version") == "" {
		return nil, fmt.Errorf("缺少version参数")
	}
	if wsGetString(result, "client_id") == "" {
		return nil, fmt.Errorf("缺少client_id参数")
	}
	if wsGetString(result, "uuid") == "" {
		return nil, fmt.Errorf("缺少uuid参数")
	}

	return result, nil
}

// wsEncryptedSend 加密响应并发送
func (c *WSConnection) wsEncryptedSend(app *models.App, reqID, action string, code int, message string, data interface{}) {
	// 如果应用配置了 app_secret，服务端响应也加密；否则返回普通 WSResponse。
	resp := &WSResponse{
		Action:  action,
		ReqID:   reqID,
		Code:    code,
		Message: message,
		Data:    data,
		Time:    time.Now().Unix(),
	}

	if app == nil || app.AppSecret == "" {
		c.send(resp)
		return
	}

	plainResp := map[string]interface{}{
		"code":    code,
		"message": message,
		"data":    data,
		"time":    resp.Time,
	}
	jsonData, _ := json.Marshal(plainResp)
	encrypted, err := sdkEncryptPayload(string(jsonData), app)
	if err != nil {
		c.send(resp)
		return
	}
	sign := sdkCalcSign(app.SignAlgo, encrypted, app.AppKey)
	encResp := map[string]interface{}{
		"action": action,
		"req_id": reqID,
		"data":   encrypted,
		"sign":   sign,
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return
	}
	encData, _ := json.Marshal(encResp)
	c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	c.Conn.WriteMessage(websocket.TextMessage, encData)
}

// ========== 消息频率检查 ==========

func (c *WSConnection) checkRateLimit() bool {
	// 单连接本地限速，防止同一个连接刷消息。应用级限流在防火墙层处理。
	now := time.Now()
	if now.After(c.msgResetAt) {
		c.msgCount = 1
		c.msgResetAt = now.Add(wsMsgRateWindow)
		return true
	}
	c.msgCount++
	return c.msgCount <= wsMsgRateLimit
}

// ========== WSHandler 入口 ==========

func WSHandler(c *gin.Context) {
	// 连接建立前先做全局连接数保护，避免无限连接耗尽进程资源。
	wsConnCountMu.Lock()
	if wsConnCount >= wsMaxConnections {
		wsConnCountMu.Unlock()
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": 1, "message": "连接数已满"})
		return
	}
	wsConnCount++
	wsConnCountMu.Unlock()

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket升级失败: %v", err)
		wsConnCountMu.Lock()
		wsConnCount--
		wsConnCountMu.Unlock()
		return
	}

	conn.SetReadLimit(wsMaxMessageSize)

	wsConn := &WSConnection{
		Conn:     conn,
		clientIP: c.ClientIP(),
	}

	conn.SetReadDeadline(time.Now().Add(wsReadTimeout))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(wsReadTimeout))
		return nil
	})

	go wsConn.readPump()
	go wsConn.pingPump()
}

// ========== 读写循环 ==========

func (c *WSConnection) readPump() {
	// readPump 是连接的主循环：读取 JSON、限速、解析 action，然后分发到具体 handler。
	defer c.close()

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket读取错误: %v", err)
			}
			break
		}

		c.Conn.SetReadDeadline(time.Now().Add(wsReadTimeout))

		if !c.checkRateLimit() {
			c.sendError("", "", 429, "请求过于频繁")
			continue
		}

		var req WSRequest
		if err := json.Unmarshal(message, &req); err != nil {
			c.sendError("", "", 1, "请求格式错误")
			continue
		}

		if len(req.ReqID) > 64 {
			c.sendError("", req.Action, 1, "req_id过长")
			continue
		}

		c.handleRequest(&req)
	}
}

func (c *WSConnection) pingPump() {
	// 服务端定期 ping，客户端 pong 会刷新读超时；长时间无 pong 会触发 readPump 退出。
	ticker := time.NewTicker(wsPingInterval)
	defer ticker.Stop()

	for {
		<-ticker.C
		c.mu.Lock()
		if c.closed {
			c.mu.Unlock()
			return
		}
		err := c.Conn.WriteMessage(websocket.PingMessage, nil)
		c.mu.Unlock()
		if err != nil {
			return
		}
	}
}

func (c *WSConnection) close() {
	// close 必须幂等，readPump、pingPump、业务写失败都可能触发关闭。
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return
	}
	c.closed = true

	if c.Token != "" {
		wsConnMu.Lock()
		delete(wsConnections, c.Token)
		wsConnMu.Unlock()
	}

	c.Conn.Close()

	wsConnCountMu.Lock()
	wsConnCount--
	wsConnCountMu.Unlock()
}

// ========== 发送方法 ==========

func (c *WSConnection) send(resp *WSResponse) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return
	}

	resp.Time = time.Now().Unix()
	data, _ := json.Marshal(resp)
	c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	c.Conn.WriteMessage(websocket.TextMessage, data)
}

func (c *WSConnection) sendError(reqID, action string, code int, message string) {
	c.send(&WSResponse{
		Action:  action,
		ReqID:   reqID,
		Code:    code,
		Message: message,
	})
}

func (c *WSConnection) sendSuccess(reqID, action string, data interface{}) {
	c.send(&WSResponse{
		Action:  action,
		ReqID:   reqID,
		Code:    0,
		Message: "success",
		Data:    data,
	})
}

// ========== 请求路由 ==========

var wsPublicActions = map[string]bool{
	// 不需要已登录 token 的 action。是否需要 app_code/签名由各 action 自己的解析函数决定。
	"ping":              true,
	"register":          true,
	"login":             true,
	"card_login":        true,
	"trial":             true,
	"recharge_offline":  true,
	"get_version":       true,
	"get_versions":      true,
	"get_app_info":      true,
	"get_datapools":     true,
	"get_dataitem":      true,
	"create_datapool":   true,
	"create_dataitem":   true,
	"delete_dataitem":   true,
	"update_dataitem":   true,
	"get_announcements": true,
	"forgot_password":   true,
	"captcha":           true,
	"send_email_code":   true,
	"report_error":      true,
	"get_devices":       true,
	"unbind_device":     true,
}

func (c *WSConnection) handleRequest(req *WSRequest) {
	// 防火墙检查（ping 跳过）。登录前只能做 IP/API 维度，登录后还能用 Feature 查设备黑名单。
	if req.Action != "ping" && req.AppCode != "" {
		app, _ := validateApp(req.AppCode)
		if app != nil {
			if blocked, reason := middleware.WSFirewallCheck(app.ID, c.clientIP); blocked {
				c.wsEncryptedSend(app, req.ReqID, req.Action, 1, reason, nil)
				return
			}
			// 特征码黑名单检查（需要从已登录信息获取）
			if c.Feature != "" {
				if blocked, reason := checkSDKBlacklist(app.ID, c.clientIP, c.Feature); blocked {
					c.wsEncryptedSend(app, req.ReqID, req.Action, 1, reason, nil)
					return
				}
			}
		}
	}

	if wsPublicActions[req.Action] {
		switch req.Action {
		case "ping":
			c.handlePing(req)
		case "register":
			c.handleRegister(req)
		case "login":
			c.handleLogin(req)
		case "card_login":
			c.handleCardLogin(req)
		case "trial":
			c.handleTrial(req)
		case "recharge_offline":
			c.handleRechargeOffline(req)
		case "get_version":
			c.handleGetVersion(req)
		case "get_versions":
			c.handleGetVersions(req)
		case "get_app_info":
			c.handleGetAppInfo(req)
		case "get_datapools":
			c.handleGetDataPools(req)
		case "get_dataitem":
			c.handleGetDataItem(req)
		case "create_datapool":
			c.handleCreateDataPool(req)
		case "create_dataitem":
			c.handleCreateDataItem(req)
		case "delete_dataitem":
			c.handleDeleteDataItem(req)
		case "update_dataitem":
			c.handleUpdateDataItem(req)
		case "get_announcements":
			c.handleGetAnnouncements(req)
		case "forgot_password":
			c.handleForgotPassword(req)
		case "captcha":
			c.handleCaptcha(req)
		case "send_email_code":
			c.handleSendEmailCode(req)
		case "report_error":
			c.handleReportError(req)
		case "get_devices":
			c.handleGetDevices(req)
		case "unbind_device":
			c.handleUnbindDevice(req)
		}
		return
	}

	if !c.authed || c.Token == "" {
		c.sendError(req.ReqID, req.Action, 401, "未登录，请先执行login")
		return
	}

	// 已登录操作也必须带 app_code，与 HTTP SDK 接口保持一致，避免跨应用 token 混用。
	if req.AppCode == "" {
		c.sendError(req.ReqID, req.Action, 1, "缺少app_code")
		return
	}
	if c.App != nil && c.App.AppCode != req.AppCode {
		c.sendError(req.ReqID, req.Action, 1, "app_code与登录应用不匹配")
		return
	}

	var session models.OnlineSession
	if err := database.DB.Where("token = ?", c.Token).First(&session).Error; err != nil {
		c.sendError(req.ReqID, req.Action, 401, "会话已过期")
		c.authed = false
		c.Token = ""
		return
	}

	switch req.Action {
	case "heartbeat":
		c.handleHeartbeat(req, &session)
	case "logout":
		c.handleLogout(req)
	case "get_user_info":
		c.handleGetUserInfo(req, &session)
	case "change_password":
		c.handleChangePassword(req)
	case "recharge":
		c.handleRecharge(req, &session)
	case "deduct_points":
		c.handleDeductPoints(req, &session)
	case "deduct_time":
		c.handleDeductTime(req, &session)
	case "get_data":
		c.handleGetData(req, &session)
	case "set_data":
		c.handleSetData(req, &session)

	case "get_extra_data":
		c.handleGetExtraData(req, &session)
	case "get_cloud_data":
		c.handleGetCloudData(req, &session)
	case "set_cloud_data":
		c.handleSetCloudData(req, &session)
	case "get_point_shop_items":
		c.handleGetPointShopItems(req, &session)
	case "exchange_point_shop_item":
		c.handleExchangePointShopItem(req, &session)
	case "get_point_shop_exchanges":
		c.handleGetPointShopExchanges(req, &session)
	default:
		c.sendError(req.ReqID, req.Action, 1, "不支持的操作")
	}
}

// ========== 数据提取辅助 ==========

func wsGetString(data map[string]interface{}, key string) string {
	if v, ok := data[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func wsGetInt(data map[string]interface{}, key string) int {
	if v, ok := data[key]; ok {
		switch val := v.(type) {
		case float64:
			return int(val)
		case int:
			return val
		}
	}
	return 0
}

func wsGetUint(data map[string]interface{}, key string) (uint, bool) {
	if v, ok := data[key]; ok {
		switch val := v.(type) {
		case float64:
			if val < 0 || val != float64(uint(val)) {
				return 0, false
			}
			return uint(val), true
		case int:
			if val < 0 {
				return 0, false
			}
			return uint(val), true
		case uint:
			return val, true
		}
	}
	return 0, false
}

func wsCompareVersionString(a, b string) int {
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

// ========== 公开操作辅助：解析app_code并解密data ==========

// wsResolveApp 公开接口通用：从请求中获取app_code，查找应用，解密data
func wsResolveApp(req *WSRequest) (*models.App, map[string]interface{}, error) {
	if req.AppCode == "" {
		return nil, nil, fmt.Errorf("缺少app_code")
	}

	var app models.App
	if err := database.DB.Where("app_code = ? AND status = 1", req.AppCode).First(&app).Error; err != nil {
		return nil, nil, fmt.Errorf("应用不存在或已禁用")
	}

	if app.Maintenance == 1 {
		return &app, nil, fmt.Errorf("应用维护中，暂停服务")
	}

	data, err := wsDecryptData(&app, req.Data, req.Sign)
	if err != nil {
		return &app, nil, err
	}

	if err := wsValidateVersion(app.ID, data); err != nil {
		return &app, nil, err
	}

	return &app, data, nil
}

// wsValidateVersion 验证版本号是否存在、是否启用、MD5校验
func wsValidateVersion(appID uint, data map[string]interface{}) error {
	versionStr := wsGetString(data, "version")
	if versionStr == "" {
		return nil // validateCommonParams 已经检查过了
	}

	var version models.AppVersion
	if err := database.DB.Where("app_id = ? AND version = ?", appID, versionStr).First(&version).Error; err != nil {
		return fmt.Errorf("版本 %s 不存在", versionStr)
	}

	if version.Status == 0 {
		return fmt.Errorf("版本 %s 已被禁用", versionStr)
	}

	var minVersion models.AppVersion
	if err := database.DB.Where("app_id = ? AND min_required = 1 AND status = 1", appID).First(&minVersion).Error; err == nil {
		if wsCompareVersionString(versionStr, minVersion.Version) < 0 {
			return fmt.Errorf("当前版本%s低于最低可用版本%s，请升级", versionStr, minVersion.Version)
		}
	}

	if version.CheckMD5 == 1 {
		md5 := wsGetString(data, "md5")
		if md5 == "" {
			return fmt.Errorf("缺少md5参数")
		}
		if md5 != version.MD5Value {
			return fmt.Errorf("MD5校验失败")
		}
	}

	return nil
}

// wsResolveAuthData 认证接口通用：用连接上记住的App解密data
// app_code验证已在handleRequest中统一完成
func (c *WSConnection) wsResolveAuthData(req *WSRequest) (map[string]interface{}, error) {
	data, err := wsDecryptData(c.App, req.Data, req.Sign)
	if err != nil {
		return nil, err
	}
	if err := wsValidateVersion(c.App.ID, data); err != nil {
		return nil, err
	}
	return data, nil
}

// ========== 公开操作：ping ==========

func (c *WSConnection) handlePing(req *WSRequest) {
	c.sendSuccess(req.ReqID, "ping", nil)
}

// ========== 公开操作：注册 ==========

func (c *WSConnection) handleRegister(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	username := wsGetString(data, "user")
	password := wsGetString(data, "password")
	feature := wsGetString(data, "feature")
	inviteCodeStr := wsGetString(data, "invite_code")
	qq := wsGetString(data, "qq")
	wechat := wsGetString(data, "wechat")
	phone := wsGetString(data, "phone")
	email := wsGetString(data, "email")
	emailCode := wsGetString(data, "email_code")

	if username == "" || password == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "参数不完整", nil)
		return
	}
	if len(username) < 5 || len(username) > 14 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "用户名长度需在5-14位之间", nil)
		return
	}
	if !alphanumRegex.MatchString(username) {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "用户名只能包含大小写字母和数字", nil)
		return
	}
	if len(password) < 6 || len(password) > 16 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "密码长度需在6-16位之间", nil)
		return
	}
	if !alphanumRegex.MatchString(password) {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "密码只能包含大小写字母和数字", nil)
		return
	}
	// 黑名单检查
	if feature != "" {
		if blocked, reason := checkSDKBlacklist(app.ID, c.clientIP, feature); blocked {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, reason, nil)
			return
		}
	}

	if app.RegMode == 1 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "该应用已关闭注册", nil)
		return
	}

	// 邮箱验证码检查：填了邮箱就必须验证
	if email != "" {
		if emailCode == "" {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "请输入邮箱验证码", nil)
			return
		}
		var ec models.EmailCode
		if database.DB.Where("email = ? AND code = ? AND type = 1 AND used = 0 AND expire_at > ?",
			email, emailCode, time.Now()).First(&ec).Error != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "邮箱验证码错误或已过期", nil)
			return
		}
		database.DB.Model(&ec).Update("used", 1)
	}

	// 检查用户数量限制
	var userCount int64
	database.DB.Model(&models.AppUser{}).Where("app_id IN (SELECT id FROM apps WHERE user_id = ?)", app.UserID).Count(&userCount)
	var appOwner models.User
	if err := database.DB.First(&appOwner, app.UserID).Error; err == nil {
		_, maxUsers, _, _ := getUserTotalQuota(&appOwner)
		if maxUsers >= 0 && int(userCount) >= maxUsers {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "用户数量已达上限", nil)
			return
		}
	}

	var count int64
	database.DB.Model(&models.AppUser{}).Where("app_id = ? AND username = ?", app.ID, username).Count(&count)
	if count > 0 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "用户名已存在", nil)
		return
	}

	var inviterID *uint
	if inviteCodeStr != "" {
		inviter := FindInviterByCode(app.ID, inviteCodeStr)
		if inviter != nil {
			inviterID = &inviter.ID
		}
	}

	hashedPwd, err := secureHashPassword(password)
	if err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "注册失败", nil)
		return
	}

	inviteCode := generateInviteCode()

	// 特征码限制注册模式
	if app.RegMode == 4 && feature != "" {
		tx := database.DB.Begin()
		var featureCount int64
		tx.Model(&models.AppUser{}).Where("app_id = ? AND reg_feature = ?", app.ID, feature).Count(&featureCount)
		if int(featureCount) >= app.RegLimit {
			tx.Rollback()
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "该设备注册次数已达上限", nil)
			return
		}

		newUser := &models.AppUser{
			AppID: app.ID, Username: username, Password: hashedPwd, Status: 1,
			Channels: app.RegChannels, Features: app.RegFeatures, UnbindDay: -1, UnbindWeek: -1, UnbindMonth: -1,
			UnbindQuarter: -1, UnbindHalfY: -1, UnbindYear: -1, UnbindTotal: -1,
			RegFeature: feature, InviteCode: inviteCode, InviterID: inviterID, RegIP: c.clientIP,
			QQ: qq, Wechat: wechat, Phone: phone, Email: email,
		}
		if newUser.Channels < 1 {
			newUser.Channels = 1
		}
		if newUser.Features < 1 {
			newUser.Features = 1
		}
		if app.RegDuration > 0 {
			expire := time.Now().Add(time.Duration(app.RegDuration) * time.Minute)
			newUser.ExpireAt = &expire
		}
		if app.RegPoints > 0 {
			newUser.Points = app.RegPoints
		}
		if err := tx.Create(newUser).Error; err != nil {
			tx.Rollback()
			log.Printf("[WS注册失败-事务] 用户名: %s, 应用ID: %d, 错误: %v", username, app.ID, err)
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "注册失败", nil)
			return
		}
		if feature != "" && app.BindDevice == 1 {
			tx.Create(&models.AppUserDevice{AppUserID: newUser.ID, Feature: feature, Remark: "注册绑定"})
		}
		if err := tx.Commit().Error; err != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "注册失败", nil)
			return
		}
		if inviterID != nil {
			go ProcessRegisterRebate(app.UserID, newUser)
		}
		c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", map[string]interface{}{
			"user": newUser.Username, "invite_code": inviteCode,
		})
		return
	}

	// 非特征码限制模式
	newUser := &models.AppUser{
		AppID: app.ID, Username: username, Password: hashedPwd, Status: 1,
		Channels: app.RegChannels, Features: app.RegFeatures, UnbindDay: -1, UnbindWeek: -1, UnbindMonth: -1,
		UnbindQuarter: -1, UnbindHalfY: -1, UnbindYear: -1, UnbindTotal: -1,
		RegFeature: feature, InviteCode: inviteCode, InviterID: inviterID, RegIP: c.clientIP,
		QQ: qq, Wechat: wechat, Phone: phone, Email: email,
	}
	if newUser.Channels < 1 {
		newUser.Channels = 1
	}
	if newUser.Features < 1 {
		newUser.Features = 1
	}
	if app.RegDuration > 0 {
		expire := time.Now().Add(time.Duration(app.RegDuration) * time.Minute)
		newUser.ExpireAt = &expire
	}
	if app.RegPoints > 0 {
		newUser.Points = app.RegPoints
	}
	if err := database.DB.Create(newUser).Error; err != nil {
		log.Printf("[WS注册失败] 用户名: %s, 应用ID: %d, 错误: %v", username, app.ID, err)
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "注册失败", nil)
		return
	}
	if feature != "" && app.BindDevice == 1 {
		database.DB.Create(&models.AppUserDevice{AppUserID: newUser.ID, Feature: feature, Remark: "注册绑定"})
	}
	if inviterID != nil {
		go ProcessRegisterRebate(app.UserID, newUser)
	}
	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"user": newUser.Username, "invite_code": inviteCode,
	})
}

// ========== 公开操作：登录 ==========

func (c *WSConnection) handleLogin(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	username := wsGetString(data, "user")
	password := wsGetString(data, "password")
	feature := wsGetString(data, "feature")
	version := wsGetString(data, "version")
	clientID := wsGetString(data, "client_id")
	clientOS := wsGetString(data, "client_os")

	if username == "" || password == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "参数不完整", nil)
		return
	}

	// 黑名单检查
	if feature != "" {
		if blocked, reason := checkSDKBlacklist(app.ID, c.clientIP, feature); blocked {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, reason, nil)
			return
		}
	}

	// 防火墙：检查登录失败锁定
	fwCfg := middleware.GetFirewallConfig(app.ID)
	if fwCfg != nil {
		if locked, _ := middleware.CheckSDKLoginFail(app.ID, c.clientIP, fwCfg); locked {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "登录失败次数过多，请稍后再试", nil)
			return
		}
	}

	var user models.AppUser
	if err := database.DB.Where("app_id = ? AND username = ?", app.ID, username).First(&user).Error; err != nil {
		if fwCfg != nil {
			middleware.RecordSDKLoginFail(app.ID, c.clientIP, fwCfg)
		}
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "用户名或密码错误", nil)
		return
	}

	if !secureCheckPassword(password, user.Password) {
		if fwCfg != nil {
			middleware.RecordSDKLoginFail(app.ID, c.clientIP, fwCfg)
		}
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "用户名或密码错误", nil)
		return
	}

	// 登录成功，清除失败记录
	middleware.ClearSDKLoginFail(app.ID, c.clientIP)

	if user.Status == 2 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "账号已被封停", nil)
		return
	}
	if user.Status == 3 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "账号已被冻结", nil)
		return
	}

	// 检查到期时间（计时模式）
	if app.BillingMode == 2 {
		if user.ExpireAt == nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "账号未充值，请先充值", nil)
			return
		}
		if user.ExpireAt.Before(time.Now()) {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "账号已到期", nil)
			return
		}
	}

	// 检查点数（计点模式）
	if app.BillingMode == 3 && user.Points <= 0 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "点数不足，请先充值", nil)
		return
	}

	// 特征码绑定检查
	if app.BindDevice == 1 && feature != "" {
		var deviceCount int64
		database.DB.Model(&models.AppUserDevice{}).Where("app_user_id = ?", user.ID).Count(&deviceCount)

		if deviceCount > 0 {
			var device models.AppUserDevice
			if err := database.DB.Where("app_user_id = ? AND feature = ?", user.ID, feature).First(&device).Error; err != nil {
				if int(deviceCount) >= user.Features {
					c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "设备数量已达上限，请先解绑", nil)
					return
				}
				database.DB.Create(&models.AppUserDevice{
					AppUserID: user.ID, Feature: feature, Remark: "登录绑定",
				})
			}
		} else {
			database.DB.Create(&models.AppUserDevice{
				AppUserID: user.ID, Feature: feature, Remark: "首次登录绑定",
			})
		}
	}

	// 通道数检查
	{
		var onlineCount int64
		var whereClause string
		var whereArgs []interface{}
		if app.ChannelMode == 1 {
			// 单绑定通道：按特征码计算
			whereClause = "app_user_id = ? AND feature = ?"
			whereArgs = []interface{}{user.ID, feature}
		} else {
			// 账户总通道：按用户计算
			whereClause = "app_user_id = ?"
			whereArgs = []interface{}{user.ID}
		}
		database.DB.Model(&models.OnlineSession{}).Where(whereClause, whereArgs...).Count(&onlineCount)
		if int(onlineCount) >= user.Channels {
			if app.LoginKick == 1 {
				// 顶号模式：踢掉最早的会话
				var oldSessions []models.OnlineSession
				database.DB.Where(whereClause, whereArgs...).Order("login_at asc").Limit(int(onlineCount) - user.Channels + 1).Find(&oldSessions)
				for _, s := range oldSessions {
					wsConnMu.Lock()
					if oldConn, ok := wsConnections[s.Token]; ok {
						delete(wsConnections, s.Token)
						wsConnMu.Unlock()
						oldConn.wsEncryptedSend(app, "", "kicked", 0, "您的账号在其他设备登录，当前连接已断开", nil)
						go oldConn.close()
					} else {
						wsConnMu.Unlock()
					}
					database.DB.Delete(&s)
				}
			} else {
				c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "登录通道已满，请先退出其他设备", nil)
				return
			}
		}
	}

	token := secureToken()

	session := &models.OnlineSession{
		AppID: app.ID, AppUserID: user.ID, Token: token,
		Version: version, ClientID: clientID, ClientOS: clientOS,
		ClientIP: c.clientIP, Feature: feature,
		LoginAt: time.Now(), HeartbeatAt: time.Now(),
		ExpireAt: user.ExpireAt, Points: user.Points,
	}
	database.DB.Create(session)

	// 保存连接信息
	c.App = app
	c.Token = token
	c.AppUserID = user.ID
	c.AppID = app.ID
	c.Username = user.Username
	c.Feature = feature
	c.authed = true

	wsConnMu.Lock()
	wsConnections[token] = c
	wsConnMu.Unlock()

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"token": token, "user": user.Username,
		"expire_at": formatTime(user.ExpireAt), "points": user.Points,
		"invite_code": user.InviteCode, "heartbeat": app.Heartbeat,
	})
}

// ========== 认证操作：心跳 ==========

func (c *WSConnection) handleHeartbeat(req *WSRequest, session *models.OnlineSession) {
	var user models.AppUser
	database.DB.First(&user, session.AppUserID)

	// 检查用户状态
	if user.Status == 2 {
		database.DB.Where("token = ?", c.Token).Delete(&models.OnlineSession{})
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "账号已被封停", nil)
		c.close()
		return
	}
	if user.Status == 3 {
		database.DB.Where("token = ?", c.Token).Delete(&models.OnlineSession{})
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "账号已被冻结", nil)
		c.close()
		return
	}

	var app models.App
	database.DB.First(&app, session.AppID)

	if app.BillingMode == 2 {
		if user.ExpireAt == nil {
			c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "账号未充值，请先充值", nil)
			return
		}
		if user.ExpireAt.Before(time.Now()) {
			c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "账号已到期", nil)
			return
		}
	}

	if app.BillingMode == 3 && user.Points <= 0 {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "点数不足，请先充值", nil)
		return
	}

	database.DB.Model(session).Updates(map[string]interface{}{
		"heartbeat_at": time.Now(), "expire_at": user.ExpireAt, "points": user.Points,
	})

	c.wsEncryptedSend(c.App, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"expire_at": formatTime(user.ExpireAt), "points": user.Points,
	})
}

// ========== 认证操作：登出 ==========

func (c *WSConnection) handleLogout(req *WSRequest) {
	database.DB.Where("token = ?", c.Token).Delete(&models.OnlineSession{})

	wsConnMu.Lock()
	delete(wsConnections, c.Token)
	wsConnMu.Unlock()

	savedApp := c.App
	c.Token = ""
	c.authed = false
	c.App = nil
	c.wsEncryptedSend(savedApp, req.ReqID, req.Action, 0, "success", nil)
}

// ========== 认证操作：获取用户信息 ==========

func (c *WSConnection) handleGetUserInfo(req *WSRequest, session *models.OnlineSession) {
	var user models.AppUser
	database.DB.First(&user, session.AppUserID)

	c.wsEncryptedSend(c.App, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"user": user.Username, "status": user.Status,
		"avatar": user.Avatar,
		"expire_at": formatTime(user.ExpireAt), "points": user.Points,
		"is_paid": user.IsPaid, "is_tester": user.IsTester,
		"channels": user.Channels, "features": user.Features,
		"extra_data": user.ExtraData, "cloud_data": user.CloudData,
		"invite_code": user.InviteCode, "created_at": user.CreatedAt,
		"qq": user.QQ, "email": user.Email, "wechat": user.Wechat, "phone": user.Phone,
	})
}

// ========== 认证操作：修改密码 ==========

func (c *WSConnection) handleChangePassword(req *WSRequest) {
	data, err := c.wsResolveAuthData(req)
	if err != nil {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, err.Error(), nil)
		return
	}

	oldPassword := wsGetString(data, "old_password")
	newPassword := wsGetString(data, "new_password")

	if oldPassword == "" || newPassword == "" {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "参数不完整", nil)
		return
	}
	if len(newPassword) < 6 || len(newPassword) > 16 {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "密码长度需在6-16位之间", nil)
		return
	}
	if !alphanumRegex.MatchString(newPassword) {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "密码只能包含大小写字母和数字", nil)
		return
	}

	var user models.AppUser
	if err := database.DB.First(&user, c.AppUserID).Error; err != nil {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "用户不存在", nil)
		return
	}

	if !secureCheckPassword(oldPassword, user.Password) {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "原密码错误", nil)
		return
	}

	hashedPwd, err := secureHashPassword(newPassword)
	if err != nil {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "修改失败", nil)
		return
	}

	database.DB.Model(&user).Update("password", hashedPwd)
	c.wsEncryptedSend(c.App, req.ReqID, req.Action, 0, "success", nil)
}

// ========== 认证操作：在线充值 ==========

func (c *WSConnection) handleRecharge(req *WSRequest, session *models.OnlineSession) {
	data, err := c.wsResolveAuthData(req)
	if err != nil {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, err.Error(), nil)
		return
	}

	cardNo := wsGetString(data, "card_no")
	if cardNo == "" {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "请输入卡号", nil)
		return
	}

	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	var card models.Card
	if err := tx.Set("gorm:query_option", "FOR UPDATE").Preload("CardType").Where("card_no = ? AND app_id = ?", cardNo, session.AppID).First(&card).Error; err != nil {
		tx.Rollback()
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "卡号不存在", nil)
		return
	}

	if card.Status == 3 {
		tx.Rollback()
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "卡号已被禁用", nil)
		return
	}
	if card.UsedCount >= card.CardType.MaxUse {
		tx.Rollback()
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "卡号使用次数已达上限", nil)
		return
	}

	usedBy := make(map[string]int)
	if card.UsedBy != "" {
		json.Unmarshal([]byte(card.UsedBy), &usedBy)
	}
	userKey := strconv.Itoa(int(session.AppUserID))
	if usedBy[userKey] >= card.CardType.MaxUserUse {
		tx.Rollback()
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "您已达到该卡号使用上限", nil)
		return
	}

	var user models.AppUser
	tx.First(&user, session.AppUserID)

	updates := map[string]interface{}{}
	if card.CardType.Duration != 0 {
		var newExpire time.Time
		if card.CardType.Duration == -1 {
			newExpire = time.Date(2099, 12, 31, 23, 59, 59, 0, time.Local)
		} else {
			base := time.Now()
			if user.ExpireAt != nil && user.ExpireAt.After(base) {
				base = *user.ExpireAt
			}
			newExpire = base.Add(time.Duration(card.CardType.Duration) * time.Minute)
		}
		updates["expire_at"] = newExpire
		updates["is_paid"] = 1
	}
	if card.CardType.Points > 0 {
		updates["points"] = user.Points + card.CardType.Points
		updates["is_paid"] = 1
	}

	updates["channels"] = card.CardType.Channels
	updates["features"] = card.CardType.Features
	updates["unbind_day"] = card.CardType.UnbindDay
	updates["unbind_week"] = card.CardType.UnbindWeek
	updates["unbind_month"] = card.CardType.UnbindMonth
	updates["unbind_quarter"] = card.CardType.UnbindQuarter
	updates["unbind_half_y"] = card.CardType.UnbindHalfY
	updates["unbind_year"] = card.CardType.UnbindYear
	updates["unbind_total"] = card.CardType.UnbindTotal

	if err := tx.Model(&user).Updates(updates).Error; err != nil {
		tx.Rollback()
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "充值失败", nil)
		return
	}

	usedBy[userKey] = usedBy[userKey] + 1
	usedByJSON, _ := json.Marshal(usedBy)
	now := time.Now()
	cardUpdates := map[string]interface{}{
		"used_count": card.UsedCount + 1, "used_by": string(usedByJSON), "used_at": now,
	}
	cardUpdates["status"] = cardStatusAfterUse(card)
	if err := tx.Model(&card).Updates(cardUpdates).Error; err != nil {
		tx.Rollback()
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "充值失败", nil)
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "充值失败", nil)
		return
	}

	if card.CardType.RebatePoints > 0 {
		var rechargeApp models.App
		database.DB.First(&rechargeApp, session.AppID)
		go ProcessConsumeRebate(rechargeApp.UserID, &user, card.CardType.RebatePoints)
	}

	database.DB.First(&user, session.AppUserID)

	c.wsEncryptedSend(c.App, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"expire_at": formatTime(user.ExpireAt), "points": user.Points,
		"duration": card.CardType.Duration, "added_points": card.CardType.Points,
	})
}

// ========== 公开操作：离线充值 ==========

func (c *WSConnection) handleRechargeOffline(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	username := wsGetString(data, "user")
	password := wsGetString(data, "password")
	cardNo := wsGetString(data, "card_no")

	if username == "" || password == "" || cardNo == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "参数不完整", nil)
		return
	}

	// 防火墙：检查登录失败锁定
	fwCfg := middleware.GetFirewallConfig(app.ID)
	if fwCfg != nil {
		if locked, _ := middleware.CheckSDKLoginFail(app.ID, c.clientIP, fwCfg); locked {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "登录失败次数过多，请稍后再试", nil)
			return
		}
	}

	var user models.AppUser
	if err := database.DB.Where("app_id = ? AND username = ?", app.ID, username).First(&user).Error; err != nil {
		if fwCfg != nil {
			middleware.RecordSDKLoginFail(app.ID, c.clientIP, fwCfg)
		}
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "用户名或密码错误", nil)
		return
	}

	if !secureCheckPassword(password, user.Password) {
		if fwCfg != nil {
			middleware.RecordSDKLoginFail(app.ID, c.clientIP, fwCfg)
		}
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "用户名或密码错误", nil)
		return
	}

	middleware.ClearSDKLoginFail(app.ID, c.clientIP)

	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	var card models.Card
	if err := tx.Set("gorm:query_option", "FOR UPDATE").Preload("CardType").Where("card_no = ? AND app_id = ?", cardNo, app.ID).First(&card).Error; err != nil {
		tx.Rollback()
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "卡号不存在", nil)
		return
	}

	if card.Status == 3 {
		tx.Rollback()
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "卡号已被禁用", nil)
		return
	}
	if card.UsedCount >= card.CardType.MaxUse {
		tx.Rollback()
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "卡号使用次数已达上限", nil)
		return
	}

	usedBy := make(map[string]int)
	if card.UsedBy != "" {
		json.Unmarshal([]byte(card.UsedBy), &usedBy)
	}
	userKey := strconv.Itoa(int(user.ID))
	if usedBy[userKey] >= card.CardType.MaxUserUse {
		tx.Rollback()
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "您已达到该卡号使用上限", nil)
		return
	}

	now := time.Now()
	updates := map[string]interface{}{}

	if card.CardType.Duration != 0 {
		var newExpire time.Time
		if card.CardType.Duration == -1 {
			newExpire = time.Date(2099, 12, 31, 23, 59, 59, 0, time.Local)
		} else {
			base := now
			if user.ExpireAt != nil && user.ExpireAt.After(base) {
				base = *user.ExpireAt
			}
			newExpire = base.Add(time.Duration(card.CardType.Duration) * time.Minute)
		}
		updates["expire_at"] = newExpire
		updates["is_paid"] = 1
	}
	if card.CardType.Points > 0 {
		updates["points"] = user.Points + card.CardType.Points
		updates["is_paid"] = 1
	}

	updates["channels"] = card.CardType.Channels
	updates["features"] = card.CardType.Features
	updates["unbind_day"] = card.CardType.UnbindDay
	updates["unbind_week"] = card.CardType.UnbindWeek
	updates["unbind_month"] = card.CardType.UnbindMonth
	updates["unbind_quarter"] = card.CardType.UnbindQuarter
	updates["unbind_half_y"] = card.CardType.UnbindHalfY
	updates["unbind_year"] = card.CardType.UnbindYear
	updates["unbind_total"] = card.CardType.UnbindTotal

	if err := tx.Model(&user).Updates(updates).Error; err != nil {
		tx.Rollback()
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "充值失败", nil)
		return
	}

	usedBy[userKey] = usedBy[userKey] + 1
	usedByJSON, _ := json.Marshal(usedBy)
	cardUpdates := map[string]interface{}{
		"used_count": card.UsedCount + 1, "used_by": string(usedByJSON), "used_at": now,
	}
	cardUpdates["status"] = cardStatusAfterUse(card)
	if err := tx.Model(&card).Updates(cardUpdates).Error; err != nil {
		tx.Rollback()
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "充值失败", nil)
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "充值失败", nil)
		return
	}

	if card.CardType.RebatePoints > 0 {
		go ProcessConsumeRebate(app.UserID, &user, card.CardType.RebatePoints)
	}
	database.DB.First(&user, user.ID)

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"expire_at": formatTime(user.ExpireAt), "points": user.Points,
		"duration": card.CardType.Duration, "added_points": card.CardType.Points,
	})
}

// ========== 认证操作：扣点 ==========

func (c *WSConnection) handleDeductPoints(req *WSRequest, session *models.OnlineSession) {
	data, err := c.wsResolveAuthData(req)
	if err != nil {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, err.Error(), nil)
		return
	}

	points := wsGetInt(data, "points")
	if points <= 0 {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "扣除点数必须大于0", nil)
		return
	}

	result := database.DB.Model(&models.AppUser{}).
		Where("id = ? AND points >= ?", session.AppUserID, points).
		UpdateColumn("points", gorm.Expr("points - ?", points))

	if result.RowsAffected == 0 {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "点数不足", nil)
		return
	}

	var user models.AppUser
	database.DB.First(&user, session.AppUserID)

	reason := strings.TrimSpace(wsGetString(data, "reason"))
	detail := fmt.Sprintf("扣除点数[%d],剩余点数[%d]", points, user.Points)
	if reason != "" {
		detail += ",原因[" + reason + "]"
	}
	LogAppUserOperation(session.AppID, session.AppUserID, "deduct", detail, c.clientIP)

	c.wsEncryptedSend(c.App, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"points": user.Points, "deducted": points,
	})
}

// ========== 认证操作：扣时 ==========

func (c *WSConnection) handleDeductTime(req *WSRequest, session *models.OnlineSession) {
	data, err := c.wsResolveAuthData(req)
	if err != nil {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, err.Error(), nil)
		return
	}

	minutes := wsGetInt(data, "minutes")
	if minutes <= 0 {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "扣除时间必须大于0", nil)
		return
	}

	var user models.AppUser
	database.DB.First(&user, session.AppUserID)

	if user.ExpireAt == nil {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "用户无到期时间", nil)
		return
	}

	newExpire := user.ExpireAt.Add(-time.Duration(minutes) * time.Minute)
	now := time.Now()
	if newExpire.Before(now) || newExpire.Equal(now) {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "扣时后账号将到期", nil)
		return
	}

	result := database.DB.Model(&models.AppUser{}).
		Where("id = ? AND expire_at = ?", session.AppUserID, user.ExpireAt).
		Update("expire_at", newExpire)

	if result.RowsAffected == 0 {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "操作失败，请重试", nil)
		return
	}

	reason := strings.TrimSpace(wsGetString(data, "reason"))
	detail := fmt.Sprintf("扣除时长[%d分钟],到期时间[%s]", minutes, formatTime(&newExpire))
	if reason != "" {
		detail += ",原因[" + reason + "]"
	}
	LogAppUserOperation(session.AppID, session.AppUserID, "deduct", detail, c.clientIP)

	c.wsEncryptedSend(c.App, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"expire_at": formatTime(&newExpire), "deducted": minutes,
	})
}

// ========== 认证操作：积分商城 ==========

func (c *WSConnection) handleGetPointShopItems(req *WSRequest, session *models.OnlineSession) {
	if _, err := c.wsResolveAuthData(req); err != nil {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, err.Error(), nil)
		return
	}

	var appUser models.AppUser
	if err := database.DB.First(&appUser, session.AppUserID).Error; err != nil {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "用户不存在", nil)
		return
	}

	var items []models.PointShopItem
	database.DB.Preload("CardType").Where("app_id = ? AND status = 1 AND (stock = -1 OR stock > exchanged_count)", c.App.ID).Order("sort desc, id desc").Find(&items)
	result := make([]map[string]interface{}, 0, len(items))
	for _, item := range items {
		result = append(result, pointShopItemResponse(item))
	}

	c.wsEncryptedSend(c.App, req.ReqID, req.Action, 0, "success", map[string]interface{}{"points": appUser.RebatePoints, "list": result})
}

func (c *WSConnection) handleExchangePointShopItem(req *WSRequest, session *models.OnlineSession) {
	data, err := c.wsResolveAuthData(req)
	if err != nil {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, err.Error(), nil)
		return
	}
	itemID := uint(wsGetInt(data, "item_id"))
	if itemID == 0 {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 201, "缺少item_id参数", nil)
		return
	}

	var exchangeLog models.PointShopExchangeLog
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		var appUser models.AppUser
		if err := tx.Set("gorm:query_option", "FOR UPDATE").First(&appUser, session.AppUserID).Error; err != nil {
			return fmt.Errorf("用户不存在")
		}
		var item models.PointShopItem
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Preload("CardType").Where("id = ? AND app_id = ? AND status = 1", itemID, c.App.ID).First(&item).Error; err != nil {
			return fmt.Errorf("商品不存在或已下架")
		}
		if item.Stock >= 0 && item.ExchangedCount >= item.Stock {
			return fmt.Errorf("商品库存不足")
		}
		if appUser.RebatePoints < item.Cost {
			return fmt.Errorf("积分不足")
		}
		card, err := applyPointShopReward(tx, &appUser, &item)
		if err != nil {
			return err
		}
		if err := tx.Model(&models.AppUser{}).Where("id = ? AND rebate_points >= ?", appUser.ID, item.Cost).UpdateColumn("rebate_points", gorm.Expr("rebate_points - ?", item.Cost)).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.PointShopItem{}).Where("id = ?", item.ID).UpdateColumn("exchanged_count", gorm.Expr("exchanged_count + 1")).Error; err != nil {
			return err
		}
		var cardID *uint
		cardNo := ""
		if card != nil {
			cardID = &card.ID
			cardNo = card.CardNo
		}
		exchangeLog = models.PointShopExchangeLog{
			UserID: c.App.UserID, AppID: c.App.ID, AppUserID: appUser.ID, ItemID: item.ID, ItemName: item.Name,
			Cost: item.Cost, RewardType: item.RewardType, RewardValue: buildPointShopRewardValue(&item, cardNo), CardID: cardID, CardNo: cardNo, IP: c.clientIP,
		}
		return tx.Create(&exchangeLog).Error
	})
	if err != nil {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 203, err.Error(), nil)
		return
	}
	var appUser models.AppUser
	database.DB.First(&appUser, session.AppUserID)
	c.wsEncryptedSend(c.App, req.ReqID, req.Action, 0, "兑换成功", map[string]interface{}{"log": exchangeLog, "points": appUser.RebatePoints})
}

func (c *WSConnection) handleGetPointShopExchanges(req *WSRequest, session *models.OnlineSession) {
	if _, err := c.wsResolveAuthData(req); err != nil {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, err.Error(), nil)
		return
	}
	var logs []models.PointShopExchangeLog
	database.DB.Where("app_user_id = ?", session.AppUserID).Order("id desc").Limit(50).Find(&logs)
	c.wsEncryptedSend(c.App, req.ReqID, req.Action, 0, "success", logs)
}

// ========== 公开操作：获取版本 ==========

func (c *WSConnection) handleGetVersion(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	versionStr := wsGetString(data, "version")
	params := SDKCommonParams{
		Feature:  wsGetString(data, "feature"),
		ClientID: wsGetString(data, "client_id"),
		ClientOS: wsGetString(data, "client_os"),
	}

	var version models.AppVersion
	query := database.DB.Where("app_id = ? AND status = 1", app.ID)
	if versionStr != "" {
		query = query.Where("version = ?", versionStr)
	} else {
		query = query.Where("is_default = 1")
	}

	if err := query.First(&version).Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "版本不存在", nil)
		return
	}
	if !versionVisibleForClient(version, params) {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "版本不存在", nil)
		return
	}

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", versionResponse(version))
}

// ========== 公开操作：获取应用信息 ==========

func (c *WSConnection) handleGetAppInfo(req *WSRequest) {
	app, _, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	var versionInfo map[string]interface{}
	var defaultVersion models.AppVersion
	if err := database.DB.Where("app_id = ? AND is_default = 1", app.ID).First(&defaultVersion).Error; err == nil {
		versionInfo = map[string]interface{}{
			"version":      defaultVersion.Version,
			"download_url": defaultVersion.DownloadURL,
			"changelog":    defaultVersion.Changelog,
			"published_at": formatTime(defaultVersion.PublishedAt),
			"force_update": defaultVersion.ForceUpdate,
			"min_required": defaultVersion.MinRequired,
		}
	}
	var minVersion models.AppVersion
	var minVersionInfo map[string]interface{}
	if err := database.DB.Where("app_id = ? AND min_required = 1", app.ID).First(&minVersion).Error; err == nil {
		minVersionInfo = map[string]interface{}{
			"version":      minVersion.Version,
			"download_url": minVersion.DownloadURL,
			"changelog":    minVersion.Changelog,
			"published_at": formatTime(minVersion.PublishedAt),
		}
	}

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"app_name":        app.AppName,
		"description":     app.Description,
		"default_version": versionInfo,
		"min_version":     minVersionInfo,
		"custom_crypto":   sdkCustomCryptoPublicConfig(),
	})
}

// ========== 公开操作：获取版本列表 ==========

func (c *WSConnection) handleGetVersions(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	var versions []models.AppVersion
	database.DB.Where("app_id = ? AND status = 1", app.ID).Order("id desc").Find(&versions)

	params := SDKCommonParams{
		Feature:  wsGetString(data, "feature"),
		ClientID: wsGetString(data, "client_id"),
		ClientOS: wsGetString(data, "client_os"),
	}
	var result []gin.H
	for _, v := range versions {
		if versionVisibleForClient(v, params) {
			result = append(result, versionResponse(v))
		}
	}

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", result)
}

// ========== 公开操作：获取应用公告列表 ==========

func (c *WSConnection) handleGetAnnouncements(req *WSRequest) {
	app, _, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	var announcements []models.AppAnnouncement
	database.DB.Where("app_id = ? AND status = 1", app.ID).Order("sort desc, id desc").Find(&announcements)

	var result []map[string]interface{}
	for _, a := range announcements {
		result = append(result, map[string]interface{}{
			"id":         a.ID,
			"title":      a.Title,
			"content":    a.Content,
			"sort":       a.Sort,
			"created_at": a.CreatedAt,
		})
	}

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", result)
}

// ========== 公开操作：获取数据池列表 ==========

func (c *WSConnection) handleGetDataPools(req *WSRequest) {
	app, _, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	var pools []models.DataPool
	database.DB.Where("app_id = ?", app.ID).Order("sort asc, id asc").Find(&pools)

	var result []map[string]interface{}
	for _, p := range pools {
		result = append(result, map[string]interface{}{
			"id": p.ID, "name": p.Name, "code": p.Code,
		})
	}

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", result)
}

// ========== 公开操作：获取数据项 ==========

func (c *WSConnection) handleGetDataItem(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	poolCode := wsGetString(data, "pool_code")
	itemCode := wsGetString(data, "item_code")
	if poolCode == "" || itemCode == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "缺少pool_code或item_code", nil)
		return
	}

	var pool models.DataPool
	if err := database.DB.Where("app_id = ? AND code = ?", app.ID, poolCode).First(&pool).Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "数据池不存在", nil)
		return
	}

	var item models.DataItem
	if err := database.DB.Where("data_pool_id = ? AND code = ?", pool.ID, itemCode).First(&item).Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "数据项不存在", nil)
		return
	}

	if item.RequireLogin == 1 || item.RequirePaid == 1 {
		if !c.authed || c.Token == "" {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "该数据需要登录后访问", nil)
			return
		}
		var session models.OnlineSession
		if err := database.DB.Preload("AppUser").Where("token = ?", c.Token).First(&session).Error; err != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "会话不存在", nil)
			return
		}
		if item.RequirePaid == 1 {
			if session.AppUser == nil || session.AppUser.IsPaid != 1 {
				c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "该数据仅限付费用户访问", nil)
				return
			}
		}
	}

	if item.ExpireAt != nil && item.ExpireAt.Before(time.Now()) {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "数据已过期", nil)
		return
	}

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"name": item.Name, "code": item.Code, "content": item.Content,
	})
}

// ========== 公开操作：新增数据池 ==========

func (c *WSConnection) handleCreateDataPool(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	name := wsGetString(data, "name")
	code := wsGetString(data, "code")
	remark := wsGetString(data, "remark")
	if name == "" || code == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "缺少name或code参数", nil)
		return
	}

	var count int64
	database.DB.Model(&models.DataPool{}).Where("app_id = ? AND code = ?", app.ID, code).Count(&count)
	if count > 0 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "数据池编码已存在", nil)
		return
	}

	pool := models.DataPool{AppID: app.ID, Name: name, Code: code, RequireLogin: wsGetInt(data, "require_login"), Remark: remark}
	if err := database.DB.Create(&pool).Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "创建失败", nil)
		return
	}

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"id": pool.ID, "name": pool.Name, "code": pool.Code,
	})
}

// ========== 公开操作：新增数据项 ==========

func (c *WSConnection) handleCreateDataItem(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	poolCode := wsGetString(data, "pool_code")
	name := wsGetString(data, "name")
	code := wsGetString(data, "code")
	content := wsGetString(data, "content")
	if poolCode == "" || name == "" || code == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "缺少pool_code、name或code参数", nil)
		return
	}

	var pool models.DataPool
	if err := database.DB.Where("app_id = ? AND code = ?", app.ID, poolCode).First(&pool).Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "数据池不存在", nil)
		return
	}

	if pool.RequireLogin == 1 {
		if !c.authed || c.Token == "" {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "该数据池需要登录后操作", nil)
			return
		}
		var session models.OnlineSession
		if err := database.DB.Where("token = ?", c.Token).First(&session).Error; err != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "会话不存在", nil)
			return
		}
	}

	var count int64
	database.DB.Model(&models.DataItem{}).Where("data_pool_id = ? AND code = ?", pool.ID, code).Count(&count)
	if count > 0 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "数据编号已存在", nil)
		return
	}

	item := models.DataItem{DataPoolID: pool.ID, Name: name, Code: code, Content: content,
		RequireLogin: wsGetInt(data, "require_login"),
		RequirePaid:  wsGetInt(data, "require_paid"),
		AllowDelete:  wsGetInt(data, "allow_delete"),
		AllowModify:  wsGetInt(data, "allow_modify"),
		AllowExpire:  wsGetInt(data, "allow_expire"),
	}
	if err := database.DB.Create(&item).Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "创建失败", nil)
		return
	}

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"id": item.ID, "name": item.Name, "code": item.Code,
	})
}

// ========== 公开操作：删除数据项 ==========

func (c *WSConnection) handleDeleteDataItem(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	poolCode := wsGetString(data, "pool_code")
	itemCode := wsGetString(data, "item_code")
	if poolCode == "" || itemCode == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "缺少pool_code或item_code", nil)
		return
	}

	var pool models.DataPool
	if err := database.DB.Where("app_id = ? AND code = ?", app.ID, poolCode).First(&pool).Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "数据池不存在", nil)
		return
	}

	var item models.DataItem
	if err := database.DB.Where("data_pool_id = ? AND code = ?", pool.ID, itemCode).First(&item).Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "数据项不存在", nil)
		return
	}

	if item.AllowDelete != 1 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "该数据项不允许删除", nil)
		return
	}

	database.DB.Delete(&item)
	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", nil)
}

// ========== 公开操作：修改数据项 ==========

func (c *WSConnection) handleUpdateDataItem(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	poolCode := wsGetString(data, "pool_code")
	itemCode := wsGetString(data, "item_code")
	content := wsGetString(data, "content")
	if poolCode == "" || itemCode == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "缺少pool_code或item_code", nil)
		return
	}

	var pool models.DataPool
	if err := database.DB.Where("app_id = ? AND code = ?", app.ID, poolCode).First(&pool).Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "数据池不存在", nil)
		return
	}

	var item models.DataItem
	if err := database.DB.Where("data_pool_id = ? AND code = ?", pool.ID, itemCode).First(&item).Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "数据项不存在", nil)
		return
	}

	if item.AllowModify != 1 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "该数据项不允许修改", nil)
		return
	}

	if item.ExpireAt != nil && item.ExpireAt.Before(time.Now()) && item.AllowExpire != 1 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "数据已过期且不允许修改", nil)
		return
	}

	if item.ModifyCount != -1 && item.ModifiedCount >= item.ModifyCount {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "修改次数已用完", nil)
		return
	}

	database.DB.Model(&item).Updates(map[string]interface{}{
		"content":        content,
		"modified_count": item.ModifiedCount + 1,
	})

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"name": item.Name, "code": item.Code, "content": content,
		"modified_count": item.ModifiedCount + 1, "modify_count": item.ModifyCount,
	})
}

// ========== 公开操作：找回密码 ==========

func (c *WSConnection) handleForgotPassword(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	username := wsGetString(data, "user")
	email := wsGetString(data, "email")
	code := wsGetString(data, "code")
	newPassword := wsGetString(data, "new_password")

	if username == "" || email == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "参数不完整", nil)
		return
	}

	var appUser models.AppUser
	if err := database.DB.Where("app_id = ? AND username = ?", app.ID, username).First(&appUser).Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "用户不存在", nil)
		return
	}

	if appUser.Email == "" || !strings.EqualFold(appUser.Email, email) {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "邮箱与账号不匹配", nil)
		return
	}

	// 第一步：发送验证码
	if code == "" {
		var lastCode models.EmailCode
		database.DB.Where("email = ? AND type = 2 AND created_at > ?", email, time.Now().Add(-time.Minute)).First(&lastCode)
		if lastCode.ID > 0 {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "发送太频繁，请稍后再试", nil)
			return
		}

		// 同IP每小时最多发送10次验证码
		var ipSendCount int64
		database.DB.Model(&models.EmailCode{}).Where("ip = ? AND created_at > ?", c.clientIP, time.Now().Add(-time.Hour)).Count(&ipSendCount)
		if ipSendCount >= 10 {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "发送太频繁，请稍后再试", nil)
			return
		}

		emailConfig := getEmailConfigForUser(app.UserID)
		if emailConfig.ID == 0 || emailConfig.SMTPHost == "" {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "邮件服务未配置", nil)
			return
		}

		var siteConfig models.SiteConfig
		database.DB.First(&siteConfig)

		codeBytes := make([]byte, 3)
		rand.Read(codeBytes)
		codeNum := (int(codeBytes[0])<<16 | int(codeBytes[1])<<8 | int(codeBytes[2])) % 1000000
		verifyCode := fmt.Sprintf("%06d", codeNum)

		subject := "密码重置验证码"
		if siteConfig.SiteName != "" {
			subject = siteConfig.SiteName + " - " + subject
		}
		body := fmt.Sprintf(`<div style="padding:20px;font-family:sans-serif;">
<h2>密码重置验证码</h2>
<p>您好 <b>%s</b>，您正在重置密码。</p>
<p>验证码：<code style="font-size:18px;background:#f5f5f5;padding:4px 12px;border-radius:4px;">%s</code></p>
<p style="color:#999;font-size:13px;">验证码5分钟内有效。如非本人操作，请忽略此邮件。</p>
</div>`, appUser.Username, verifyCode)

		if err := sendEmail(emailConfig, email, subject, body); err != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "邮件发送失败", nil)
			return
		}

		database.DB.Create(&models.EmailCode{
			AppID: app.ID, Email: email, Code: verifyCode, Type: 2, Used: 0,
			IP: c.clientIP, ExpireAt: time.Now().Add(5 * time.Minute),
		})

		c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", map[string]interface{}{"step": "code_sent"})
		return
	}

	// 第二步：验证并重置密码
	if newPassword == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "缺少new_password", nil)
		return
	}
	if len(newPassword) < 6 || len(newPassword) > 16 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "密码长度需在6-16位之间", nil)
		return
	}
	if !alphanumRegex.MatchString(newPassword) {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "密码只能包含大小写字母和数字", nil)
		return
	}

	var emailCode models.EmailCode
	database.DB.Where("email = ? AND code = ? AND type = 2 AND used = 0 AND expire_at > ?",
		email, code, time.Now()).First(&emailCode)
	if emailCode.ID == 0 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "验证码错误或已过期", nil)
		return
	}

	hashedPwd, err := secureHashPassword(newPassword)
	if err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "重置失败", nil)
		return
	}

	database.DB.Model(&appUser).Update("password", hashedPwd)
	database.DB.Model(&emailCode).Update("used", 1)

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", map[string]interface{}{"step": "password_reset"})
}

// ========== 获取用户标识数据 ==========
func (c *WSConnection) handleGetData(req *WSRequest, session *models.OnlineSession) {
	data, err := c.wsResolveAuthData(req)
	if err != nil {
		c.sendError(req.ReqID, req.Action, 1, err.Error())
		return
	}

	key := wsGetString(data, "key")

	query := database.DB.Model(&models.AppUserData{}).Where("app_user_id = ?", session.AppUserID)
	if key != "" {
		query = query.Where("`key` = ?", key)
	}

	var dataList []models.AppUserData
	query.Find(&dataList)

	var result []map[string]interface{}
	for _, d := range dataList {
		result = append(result, map[string]interface{}{
			"key":       d.Key,
			"value":     d.Value,
			"expire_at": d.ExpireAt,
		})
	}

	c.wsEncryptedSend(c.App, req.ReqID, req.Action, 0, "success", result)
}

// ========== 写入用户标识数据 ==========
func (c *WSConnection) handleSetData(req *WSRequest, session *models.OnlineSession) {
	data, err := c.wsResolveAuthData(req)
	if err != nil {
		c.sendError(req.ReqID, req.Action, 1, err.Error())
		return
	}

	key := wsGetString(data, "key")
	value := wsGetString(data, "value")
	expireAtStr := wsGetString(data, "expire_at")

	if key == "" {
		c.wsEncryptedSend(c.App, req.ReqID, req.Action, 1, "缺少key参数", nil)
		return
	}

	var existing models.AppUserData
	dbErr := database.DB.Where("app_user_id = ? AND `key` = ?", session.AppUserID, key).First(&existing).Error

	var expireAt *time.Time
	if expireAtStr != "" {
		t, _ := time.Parse("2006-01-02 15:04:05", expireAtStr)
		expireAt = &t
	}

	if dbErr != nil {
		// 创建
		existing = models.AppUserData{
			AppUserID: session.AppUserID,
			Key:       key,
			Value:     value,
			ExpireAt:  expireAt,
		}
		database.DB.Create(&existing)
	} else {
		// 更新
		database.DB.Model(&existing).Updates(map[string]interface{}{
			"value":     value,
			"expire_at": expireAt,
		})
	}

	c.wsEncryptedSend(c.App, req.ReqID, req.Action, 0, "success", nil)
}

// ========== 获取设备列表 ==========
func (c *WSConnection) handleGetDevices(req *WSRequest) {
	app, appUser, err := wsResolveDeviceAuth(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	var devices []models.AppUserDevice
	database.DB.Where("app_user_id = ?", appUser.ID).Order("id asc").Find(&devices)

	var result []map[string]interface{}
	for _, d := range devices {
		result = append(result, map[string]interface{}{
			"id":         d.ID,
			"feature":    d.Feature,
			"remark":     d.Remark,
			"created_at": d.CreatedAt,
		})
	}

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", result)
}

	// ========== 解绑设备（按设备序列号） ==========
func (c *WSConnection) handleUnbindDevice(req *WSRequest) {
	app, appUser, data, err := wsResolveDeviceAuthData(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	deviceID, ok := wsGetUint(data, "device_id")
	if !ok || deviceID == 0 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "缺少device_id参数", nil)
		return
	}

	device, err := findAppUserDeviceByOrderedSerial(appUser.ID, deviceID)
	if err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "特征码不存在", nil)
		return
	}

	if err := wsCheckUnbindLimits(appUser); err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 210, err.Error(), nil)
		return
	}

	if err := database.DB.Delete(device).Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "解绑失败", nil)
		return
	}

	database.DB.Create(&models.AppUserUnbindLog{
		AppUserID: appUser.ID,
		DeviceID:  device.ID,
		Feature:   device.Feature,
	})

	LogAppUserOperation(app.ID, appUser.ID, "unbind", "解绑特征码["+device.Feature+"]", c.clientIP)
	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "解绑成功", nil)
}

func wsResolveDeviceAuth(req *WSRequest) (*models.App, *models.AppUser, error) {
	app, appUser, _, err := wsResolveDeviceAuthData(req)
	return app, appUser, err
}

func wsResolveDeviceAuthData(req *WSRequest) (*models.App, *models.AppUser, map[string]interface{}, error) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		return app, nil, nil, err
	}
	appUser, err := wsVerifyDeviceAuth(app, data)
	if err != nil {
		return app, nil, data, err
	}
	return app, appUser, data, nil
}

func wsVerifyDeviceAuth(app *models.App, data map[string]interface{}) (*models.AppUser, error) {
	cardNo := strings.TrimSpace(wsGetString(data, "card_no"))
	if cardNo != "" {
		var appUser models.AppUser
		if err := database.DB.Where("app_id = ? AND username = ? AND is_card_user = 1", app.ID, cardNo).First(&appUser).Error; err != nil {
			return nil, fmt.Errorf("卡号用户不存在，请先登录")
		}
		return &appUser, nil
	}

	username := strings.TrimSpace(wsGetString(data, "user"))
	password := wsGetString(data, "password")
	if username == "" || password == "" {
		return nil, fmt.Errorf("请提供user/password或card_no")
	}

	var appUser models.AppUser
	if err := database.DB.Where("app_id = ? AND username = ?", app.ID, username).First(&appUser).Error; err != nil {
		return nil, fmt.Errorf("用户名或密码错误")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(appUser.Password), []byte(password)); err != nil {
		return nil, fmt.Errorf("用户名或密码错误")
	}
	return &appUser, nil
}

// wsCheckUnbindLimits 检查解绑次数限制（所有周期）
func wsCheckUnbindLimits(appUser *models.AppUser) error {
	now := time.Now()

	// 日限制
	if appUser.UnbindDay >= 0 {
		var count int64
		dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		database.DB.Model(&models.AppUserUnbindLog{}).Where("app_user_id = ? AND created_at >= ?", appUser.ID, dayStart).Count(&count)
		if int(count) >= appUser.UnbindDay {
			return fmt.Errorf("今日解绑次数已达上限")
		}
	}

	// 周限制
	if appUser.UnbindWeek >= 0 {
		var count int64
		weekday := int(now.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		weekStart := time.Date(now.Year(), now.Month(), now.Day()-weekday+1, 0, 0, 0, 0, now.Location())
		database.DB.Model(&models.AppUserUnbindLog{}).Where("app_user_id = ? AND created_at >= ?", appUser.ID, weekStart).Count(&count)
		if int(count) >= appUser.UnbindWeek {
			return fmt.Errorf("本周解绑次数已达上限")
		}
	}

	// 月限制
	if appUser.UnbindMonth >= 0 {
		var count int64
		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		database.DB.Model(&models.AppUserUnbindLog{}).Where("app_user_id = ? AND created_at >= ?", appUser.ID, monthStart).Count(&count)
		if int(count) >= appUser.UnbindMonth {
			return fmt.Errorf("本月解绑次数已达上限")
		}
	}

	// 季度限制
	if appUser.UnbindQuarter >= 0 {
		var count int64
		currentMonth := int(now.Month())
		quarterStartMonth := ((currentMonth-1)/3)*3 + 1
		quarterStart := time.Date(now.Year(), time.Month(quarterStartMonth), 1, 0, 0, 0, 0, now.Location())
		database.DB.Model(&models.AppUserUnbindLog{}).Where("app_user_id = ? AND created_at >= ?", appUser.ID, quarterStart).Count(&count)
		if int(count) >= appUser.UnbindQuarter {
			return fmt.Errorf("本季度解绑次数已达上限")
		}
	}

	// 半年限制
	if appUser.UnbindHalfY >= 0 {
		var count int64
		halfYStart := now.AddDate(0, -6, 0)
		database.DB.Model(&models.AppUserUnbindLog{}).Where("app_user_id = ? AND created_at >= ?", appUser.ID, halfYStart).Count(&count)
		if int(count) >= appUser.UnbindHalfY {
			return fmt.Errorf("半年内解绑次数已达上限")
		}
	}

	// 年限制
	if appUser.UnbindYear >= 0 {
		var count int64
		yearStart := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
		database.DB.Model(&models.AppUserUnbindLog{}).Where("app_user_id = ? AND created_at >= ?", appUser.ID, yearStart).Count(&count)
		if int(count) >= appUser.UnbindYear {
			return fmt.Errorf("本年解绑次数已达上限")
		}
	}

	// 总限制
	if appUser.UnbindTotal >= 0 {
		var count int64
		database.DB.Model(&models.AppUserUnbindLog{}).Where("app_user_id = ?", appUser.ID).Count(&count)
		if int(count) >= appUser.UnbindTotal {
			return fmt.Errorf("解绑总次数已达上限")
		}
	}

	return nil
}

// ========== 获取云端数据 ==========
func (c *WSConnection) handleGetCloudData(req *WSRequest, session *models.OnlineSession) {
	_, err := c.wsResolveAuthData(req)
	if err != nil {
		c.sendError(req.ReqID, req.Action, 1, err.Error())
		return
	}

	var appUser models.AppUser
	database.DB.First(&appUser, session.AppUserID)

	c.wsEncryptedSend(c.App, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"cloud_data": appUser.CloudData,
	})
}

// ========== 设置云端数据 ==========
func (c *WSConnection) handleSetCloudData(req *WSRequest, session *models.OnlineSession) {
	data, err := c.wsResolveAuthData(req)
	if err != nil {
		c.sendError(req.ReqID, req.Action, 1, err.Error())
		return
	}

	cloudData := wsGetString(data, "cloud_data")

	database.DB.Model(&models.AppUser{}).Where("id = ?", session.AppUserID).Update("cloud_data", cloudData)

	c.wsEncryptedSend(c.App, req.ReqID, req.Action, 0, "success", nil)
}

func (c *WSConnection) handleGetExtraData(req *WSRequest, session *models.OnlineSession) {
	_, err := c.wsResolveAuthData(req)
	if err != nil {
		c.sendError(req.ReqID, req.Action, 1, err.Error())
		return
	}

	var appUser models.AppUser
	database.DB.First(&appUser, session.AppUserID)

	c.wsEncryptedSend(c.App, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"extra_data": appUser.ExtraData,
	})
}


// ========== 公开操作：卡号登录 ==========

func (c *WSConnection) handleCardLogin(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	cardNo := wsGetString(data, "card_no")
	feature := wsGetString(data, "feature")
	version := wsGetString(data, "version")
	clientID := wsGetString(data, "client_id")
	clientOS := wsGetString(data, "client_os")

	if cardNo == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "缺少card_no参数", nil)
		return
	}

	// 黑名单检查
	if blocked, reason := checkSDKBlacklist(app.ID, c.clientIP, feature); blocked {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, reason, nil)
		return
	}

	// 查找是否已有该卡号关联的用户
	var appUser models.AppUser
	userExists := database.DB.Where("app_id = ? AND username = ? AND is_card_user = 1", app.ID, cardNo).First(&appUser).Error == nil

	if userExists {
		// 非首次登录
		if appUser.Status == 2 {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "账号已被封停", nil)
			return
		}
		if appUser.Status == 3 {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "账号已被冻结", nil)
			return
		}
		if app.BillingMode == 2 {
			if appUser.ExpireAt == nil {
				c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "账号未充值，请先充值", nil)
				return
			}
			if appUser.ExpireAt.Before(time.Now()) {
				c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "账号已到期", nil)
				return
			}
		}
		if app.BillingMode == 3 && appUser.Points <= 0 {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "点数不足，请先充值", nil)
			return
		}
		// 特征码绑定检查
		if app.BindDevice == 1 && feature != "" {
			var deviceCount int64
			database.DB.Model(&models.AppUserDevice{}).Where("app_user_id = ?", appUser.ID).Count(&deviceCount)
			if deviceCount > 0 {
				var device models.AppUserDevice
				if err := database.DB.Where("app_user_id = ? AND feature = ?", appUser.ID, feature).First(&device).Error; err != nil {
					if int(deviceCount) >= appUser.Features {
						c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "设备数量已达上限，请先解绑", nil)
						return
					}
					database.DB.Create(&models.AppUserDevice{AppUserID: appUser.ID, Feature: feature, Remark: "卡号登录绑定"})
				}
			} else {
				database.DB.Create(&models.AppUserDevice{AppUserID: appUser.ID, Feature: feature, Remark: "首次卡号登录绑定"})
			}
		}
	} else {
		// 首次登录：查卡号仓库
		tx := database.DB.Begin()
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()

		var card models.Card
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Preload("CardType").Where("card_no = ? AND app_id = ?", cardNo, app.ID).First(&card).Error; err != nil {
			tx.Rollback()
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "卡号不存在", nil)
			return
		}
		if card.Status == 3 {
			tx.Rollback()
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "卡号已被禁用", nil)
			return
		}
		if card.CardType.Category != 2 {
			tx.Rollback()
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "该卡号不是登录卡", nil)
			return
		}
		if card.UsedCount >= card.CardType.MaxUse {
			tx.Rollback()
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "卡号已被使用", nil)
			return
		}

		// 检查用户数量限制
		var userCount int64
		database.DB.Model(&models.AppUser{}).Where("app_id IN (SELECT id FROM apps WHERE user_id = ?)", app.UserID).Count(&userCount)
		var appOwner models.User
		if err := database.DB.First(&appOwner, app.UserID).Error; err == nil {
			_, maxUsers, _, _ := getUserTotalQuota(&appOwner)
			if maxUsers >= 0 && int(userCount) >= maxUsers {
				tx.Rollback()
				c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "用户数量已达上限", nil)
				return
			}
		}

		inviteCode := generateInviteCode()
		appUser = models.AppUser{
			AppID: app.ID, Username: cardNo, Password: "", Status: 1, IsCardUser: 1,
			AgentID: card.AgentID, // 归属到制卡代理，否则代理端看不到该用户
			Channels: card.CardType.Channels, Features: card.CardType.Features,
			UnbindDay: card.CardType.UnbindDay, UnbindWeek: card.CardType.UnbindWeek,
			UnbindMonth: card.CardType.UnbindMonth, UnbindQuarter: card.CardType.UnbindQuarter,
			UnbindHalfY: card.CardType.UnbindHalfY, UnbindYear: card.CardType.UnbindYear,
			UnbindTotal: card.CardType.UnbindTotal,
			RegFeature:  feature, InviteCode: inviteCode, RegIP: c.clientIP,
		}
		if card.CardType.Duration != 0 {
			var newExpire time.Time
			if card.CardType.Duration == -1 {
				newExpire = time.Date(2099, 12, 31, 23, 59, 59, 0, time.Local)
			} else {
				newExpire = time.Now().Add(time.Duration(card.CardType.Duration) * time.Minute)
			}
			appUser.ExpireAt = &newExpire
			appUser.IsPaid = 1
		}
		if card.CardType.Points > 0 {
			appUser.Points = card.CardType.Points
			appUser.IsPaid = 1
		}

		if err := tx.Create(&appUser).Error; err != nil {
			tx.Rollback()
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "登录失败", nil)
			return
		}
		if feature != "" && app.BindDevice == 1 {
			tx.Create(&models.AppUserDevice{AppUserID: appUser.ID, Feature: feature, Remark: "卡号登录绑定"})
		}
		cardUpdates := map[string]interface{}{
			"used_count": card.UsedCount + 1, "used_at": time.Now(), "status": cardStatusAfterUse(card),
		}
		if err := tx.Model(&card).Updates(cardUpdates).Error; err != nil {
			tx.Rollback()
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "登录失败", nil)
			return
		}
		if err := tx.Commit().Error; err != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "登录失败", nil)
			return
		}

		go database.DB.Create(&models.CardUseLog{
			CardID: card.ID, AppID: app.ID, AppUserID: appUser.ID,
			Username: appUser.Username, Action: "login",
			IP: c.clientIP, Feature: feature, ClientID: clientID, ClientOS: clientOS,
		})
	}

	// 通道数检查
	{
		var onlineCount int64
		var whereClause string
		var whereArgs []interface{}
		if app.ChannelMode == 1 {
			whereClause = "app_user_id = ? AND feature = ?"
			whereArgs = []interface{}{appUser.ID, feature}
		} else {
			whereClause = "app_user_id = ?"
			whereArgs = []interface{}{appUser.ID}
		}
		database.DB.Model(&models.OnlineSession{}).Where(whereClause, whereArgs...).Count(&onlineCount)
		if int(onlineCount) >= appUser.Channels {
			if app.LoginKick == 1 {
				var oldSessions []models.OnlineSession
				database.DB.Where(whereClause, whereArgs...).Order("login_at asc").Limit(int(onlineCount) - appUser.Channels + 1).Find(&oldSessions)
				for _, s := range oldSessions {
					wsConnMu.Lock()
					if oldConn, ok := wsConnections[s.Token]; ok {
						delete(wsConnections, s.Token)
						wsConnMu.Unlock()
						oldConn.wsEncryptedSend(app, "", "kicked", 0, "您的账号在其他设备登录，当前连接已断开", nil)
						go oldConn.close()
					} else {
						wsConnMu.Unlock()
					}
					database.DB.Delete(&s)
				}
			} else {
				c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "登录通道已满，请先退出其他设备", nil)
				return
			}
		}
	}

	token := secureToken()
	session := &models.OnlineSession{
		AppID: app.ID, AppUserID: appUser.ID, Token: token,
		Version: version, ClientID: clientID, ClientOS: clientOS,
		ClientIP: c.clientIP, Feature: feature,
		LoginAt: time.Now(), HeartbeatAt: time.Now(),
		ExpireAt: appUser.ExpireAt, Points: appUser.Points,
	}
	database.DB.Create(session)

	c.App = app
	c.Token = token
	c.AppUserID = appUser.ID
	c.AppID = app.ID
	c.Username = appUser.Username
	c.Feature = feature
	c.authed = true

	wsConnMu.Lock()
	wsConnections[token] = c
	wsConnMu.Unlock()

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "登录成功", map[string]interface{}{
		"token": token, "user": appUser.Username,
		"expire_at": formatTime(appUser.ExpireAt), "points": appUser.Points,
		"invite_code": appUser.InviteCode, "heartbeat": app.Heartbeat,
	})
}

// ========== 公开操作：试用登录 ==========

func (c *WSConnection) handleTrial(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	feature := wsGetString(data, "feature")
	version := wsGetString(data, "version")
	clientID := wsGetString(data, "client_id")
	clientOS := wsGetString(data, "client_os")

	if feature == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "缺少feature参数", nil)
		return
	}

	if app.TrialDuration <= 0 && app.TrialPoints <= 0 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "该应用未开启试用功能", nil)
		return
	}

	// 黑名单检查
	if blocked, reason := checkSDKBlacklist(app.ID, c.clientIP, feature); blocked {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, reason, nil)
		return
	}

	// 检查试用次数
	if app.TrialLimit > 0 {
		var trialCount int64
		database.DB.Model(&models.TrialFeatureLog{}).Where("app_id = ? AND feature = ?", app.ID, feature).Count(&trialCount)
		if int(trialCount) >= app.TrialLimit {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "该设备试用次数已达上限", nil)
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
		AppID: app.ID, Username: trialUsername, Password: string(hashedPwd),
		Status: 1, IsTrial: 1, ExpireAt: expireAt, Points: app.TrialPoints,
		Channels: app.RegChannels, Features: app.RegFeatures,
		InviteCode: inviteCode, RegFeature: feature, RegIP: c.clientIP,
	}
	if err := database.DB.Create(appUser).Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "试用失败", nil)
		return
	}

	database.DB.Create(&models.TrialFeatureLog{
		AppID: app.ID, Feature: feature, AppUserID: appUser.ID,
	})

	if app.BindDevice == 1 {
		database.DB.Create(&models.AppUserDevice{
			AppUserID: appUser.ID, Feature: feature, Remark: "试用绑定",
		})
	}

	token := secureToken()
	session := &models.OnlineSession{
		AppID: app.ID, AppUserID: appUser.ID, Token: token,
		Version: version, ClientID: clientID, ClientOS: clientOS,
		ClientIP: c.clientIP, Feature: feature,
		LoginAt: now, HeartbeatAt: now,
		ExpireAt: appUser.ExpireAt, Points: appUser.Points,
	}
	database.DB.Create(session)

	c.App = app
	c.Token = token
	c.AppUserID = appUser.ID
	c.AppID = app.ID
	c.Username = appUser.Username
	c.Feature = feature
	c.authed = true

	wsConnMu.Lock()
	wsConnections[token] = c
	wsConnMu.Unlock()

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "试用成功", map[string]interface{}{
		"token": token, "user": appUser.Username,
		"expire_at": formatTime(appUser.ExpireAt), "points": appUser.Points,
	})
}

// ========== 公开操作：获取验证码 ==========

func (c *WSConnection) handleCaptcha(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	captchaType := wsGetString(data, "type")
	if captchaType == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "缺少type参数（login/register/recharge/changepwd）", nil)
		return
	}
	validTypes := map[string]bool{"login": true, "register": true, "recharge": true, "changepwd": true}
	if !validTypes[captchaType] {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "type参数无效", nil)
		return
	}

	driver := captchaDriver.ConvertFonts()
	cap := base64Captcha.NewCaptcha(driver, captchaStore)
	id, b64s, answer, err := cap.Generate()
	if err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "生成验证码失败", nil)
		return
	}

	database.DB.Create(&models.SDKCaptcha{
		CaptchaID: id, Type: captchaType, Answer: answer,
		ExpireAt: time.Now().Add(5 * time.Minute),
	})
	go database.DB.Where("expire_at < ?", time.Now()).Delete(&models.SDKCaptcha{})

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "success", map[string]interface{}{
		"captcha_id": id, "captcha_img": b64s,
	})
}

// ========== 公开操作：发送邮箱验证码 ==========

func (c *WSConnection) handleSendEmailCode(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	email := wsGetString(data, "email")
	codeType := wsGetInt(data, "type")
	if email == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "缺少email参数", nil)
		return
	}
	if codeType == 0 {
		codeType = 1
	}

	// 检查发送频率
	var lastCode models.EmailCode
	database.DB.Where("email = ? AND type = ? AND created_at > ?", email, codeType, time.Now().Add(-time.Minute)).First(&lastCode)
	if lastCode.ID > 0 {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "发送太频繁，请稍后再试", nil)
		return
	}

	// 获取邮箱配置
	var emailConfig models.EmailConfig
	if database.DB.Where("user_id = ?", app.UserID).First(&emailConfig).Error != nil {
		database.DB.Where("user_id = 0 OR user_id IS NULL").First(&emailConfig)
	}
	if emailConfig.ID == 0 || emailConfig.SMTPHost == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "邮件服务未配置", nil)
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
	if codeType == 2 {
		typeLabel = "密码重置"
	}

	subject := typeLabel + "验证码"
	if siteConfig.SiteName != "" {
		subject = siteConfig.SiteName + " - " + subject
	}

	var body string
	if emailConfig.CodeTemplate != "" {
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

	if err := sendEmail(emailConfig, email, subject, body); err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 1, "验证码发送失败", nil)
		return
	}

	database.DB.Create(&models.EmailCode{
		AppID: app.ID, Email: email, Code: code, Type: codeType,
		ExpireAt: time.Now().Add(5 * time.Minute),
	})

	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "验证码已发送", nil)
}

// ========== 公开操作：上报异常日志 ==========

func (c *WSConnection) handleReportError(req *WSRequest) {
	app, data, err := wsResolveApp(req)
	if err != nil {
		if app != nil {
			c.wsEncryptedSend(app, req.ReqID, req.Action, 1, err.Error(), nil)
		} else {
			c.sendError(req.ReqID, req.Action, 1, err.Error())
		}
		return
	}

	message := strings.TrimSpace(wsGetString(data, "message"))
	stack := strings.TrimSpace(wsGetString(data, "stack"))
	if message == "" && stack == "" {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 201, "缺少异常信息", nil)
		return
	}

	var appUserID *uint
	username := trimSDKString(wsGetString(data, "username"), 50)
	if c.authed && c.Token != "" {
		var session models.OnlineSession
		if err := database.DB.Preload("AppUser").Where("token = ? AND app_id = ?", c.Token, app.ID).First(&session).Error; err == nil {
			appUserID = &session.AppUserID
			if session.AppUser != nil {
				username = session.AppUser.Username
			}
		}
	}

	var contextJSON string
	if contextValue, ok := data["context"]; ok && contextValue != nil {
		if b, err := json.Marshal(contextValue); err == nil {
			contextJSON = string(b)
		}
	}
	var occurredAt *time.Time
	if occurredAtRaw := wsGetString(data, "occurred_at"); occurredAtRaw != "" {
		if t, err := parseTime(occurredAtRaw); err == nil {
			occurredAt = &t
		}
	}

	log := &models.ClientErrorLog{
		AppID:      app.ID,
		AppUserID:  appUserID,
		Username:   username,
		Severity:   validClientErrorSeverity(wsGetString(data, "severity")),
		ErrorType:  trimSDKString(wsGetString(data, "error_type"), 100),
		Message:    trimSDKString(message, 1000),
		Stack:      trimSDKString(stack, 20000),
		Context:    trimSDKString(contextJSON, 20000),
		Version:    trimSDKString(wsGetString(data, "version"), 50),
		ClientID:   trimSDKString(wsGetString(data, "client_id"), 100),
		ClientOS:   trimSDKString(wsGetString(data, "client_os"), 100),
		ClientIP:   c.clientIP,
		Feature:    trimSDKString(wsGetString(data, "feature"), 500),
		OccurredAt: occurredAt,
	}
	if err := database.DB.Create(log).Error; err != nil {
		c.wsEncryptedSend(app, req.ReqID, req.Action, 500, "保存异常日志失败", nil)
		return
	}
	c.wsEncryptedSend(app, req.ReqID, req.Action, 0, "上报成功", map[string]interface{}{"id": log.ID})
}

// ========== 管理接口：列出WS连接 ==========
func ListWSConnections(c *gin.Context) {
	wsConnMu.RLock()
	defer wsConnMu.RUnlock()

	var list []map[string]interface{}
	for token, conn := range wsConnections {
		item := map[string]interface{}{
			"token":       token,
			"app_id":      conn.AppID,
			"app_user_id": conn.AppUserID,
			"username":    conn.Username,
			"feature":     conn.Feature,
			"client_ip":   conn.clientIP,
			"authed":      conn.authed,
		}
		if conn.App != nil {
			item["app_name"] = conn.App.AppName
		}
		list = append(list, item)
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data": gin.H{
			"list":  list,
			"total": len(list),
		},
	})
}

func getWSConnectionMetrics() gin.H {
	wsConnMu.RLock()
	defer wsConnMu.RUnlock()

	byApp := make(map[uint]int)
	authed := 0
	for _, conn := range wsConnections {
		if conn.authed {
			authed++
		}
		if conn.AppID > 0 {
			byApp[conn.AppID]++
		}
	}

	return gin.H{
		"total":  len(wsConnections),
		"authed": authed,
		"public": len(wsConnections) - authed,
		"by_app": byApp,
	}
}

// ========== 管理接口：踢出WS连接 ==========
func KickWSConnection(c *gin.Context) {
	var req struct {
		Token string `json:"token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Token == "" {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "缺少token参数"})
		return
	}

	wsConnMu.RLock()
	conn, ok := wsConnections[req.Token]
	wsConnMu.RUnlock()

	if !ok {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "连接不存在"})
		return
	}

	conn.close()

	// 同时删除在线列表中相同Token的会话
	database.DB.Where("token = ?", req.Token).Delete(&models.OnlineSession{})

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已踢出"})
}
