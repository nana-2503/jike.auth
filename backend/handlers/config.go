package handlers

import (
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"jike-auth/cache"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"net/smtp"
	neturl "net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func GetSiteConfig(c *gin.Context) {
	if cache.Enabled {
		var data gin.H
		if cache.GetJSON("config:site", &data) {
			c.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
			return
		}
	}

	var siteConfig models.SiteConfig
	database.DB.First(&siteConfig)

	data := gin.H{
		"site_name":      siteConfig.SiteName,
		"site_subtitle":  siteConfig.SiteSubtitle,
		"site_logo":      siteConfig.SiteLogo,
		"site_logo_dark": siteConfig.SiteLogoDark,
		"site_favicon":   siteConfig.SiteFavicon,
		"service_qq":     siteConfig.ServiceQQ,
	}
	if cache.Enabled {
		cache.SetJSON("config:site", data, 300*time.Second)
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

func GetAnnouncements(c *gin.Context) {
	if cache.Enabled {
		var result []gin.H
		if cache.GetJSON("config:announcements", &result) {
			c.JSON(http.StatusOK, gin.H{"code": 0, "data": result})
			return
		}
	}

	var announcements []models.Announcement
	database.DB.Where("status = ?", 1).Order("sort desc, id desc").Find(&announcements)

	result := make([]gin.H, 0)
	for _, a := range announcements {
		result = append(result, gin.H{
			"id":      a.ID,
			"title":   a.Title,
			"content": a.Content,
			"color":   a.Color,
			"popup":   a.Popup,
		})
	}

	if cache.Enabled {
		cache.SetJSON("config:announcements", result, 60*time.Second)
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": result})
}

// ========== 邮箱配置 ==========

func GetEmailConfig(c *gin.Context) {
	userID := c.GetUint("userID")
	config := getEmailConfigForUser(userID)

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": emailConfigPayload(config),
	})
}

func AdminGetEmailConfig(c *gin.Context) {
	config := getGlobalEmailConfig()

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": emailConfigPayload(config),
	})
}

func UpdateEmailConfig(c *gin.Context) {
	userID := c.GetUint("userID")
	updateEmailConfig(c, userID)
}

func AdminUpdateEmailConfig(c *gin.Context) {
	updateEmailConfig(c, 0)
}

func updateEmailConfig(c *gin.Context, userID uint) {
	var req struct {
		SMTPHost     string `json:"smtp_host"`
		SMTPPort     int    `json:"smtp_port"`
		SMTPUser     string `json:"smtp_user"`
		SMTPPass     string `json:"smtp_pass"`
		SMTPSSL      int    `json:"smtp_ssl"`
		FromName     string `json:"from_name"`
		CodeTemplate string `json:"code_template"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var config models.EmailConfig
	if userID == 0 {
		database.DB.Where("user_id = 0 OR user_id IS NULL").First(&config)
	} else {
		database.DB.Where("user_id = ?", userID).First(&config)
	}

	if config.ID == 0 {
		config = models.EmailConfig{
			UserID:       userID,
			SMTPHost:     req.SMTPHost,
			SMTPPort:     req.SMTPPort,
			SMTPUser:     req.SMTPUser,
			SMTPPass:     req.SMTPPass,
			SMTPSSL:      req.SMTPSSL,
			FromName:     req.FromName,
			CodeTemplate: req.CodeTemplate,
		}
		database.DB.Create(&config)
	} else {
		database.DB.Model(&config).Updates(map[string]interface{}{
			"user_id":       userID,
			"smtp_host":     req.SMTPHost,
			"smtp_port":     req.SMTPPort,
			"smtp_user":     req.SMTPUser,
			"smtp_pass":     req.SMTPPass,
			"smtp_ssl":      req.SMTPSSL,
			"from_name":     req.FromName,
			"code_template": req.CodeTemplate,
		})
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "保存成功"})
}

func getEmailConfigForUser(userID uint) models.EmailConfig {
	var config models.EmailConfig
	if userID > 0 && database.DB.Where("user_id = ?", userID).First(&config).Error == nil {
		return config
	}
	return getGlobalEmailConfig()
}

func getGlobalEmailConfig() models.EmailConfig {
	var config models.EmailConfig
	database.DB.Where("user_id = 0 OR user_id IS NULL").First(&config)
	return config
}

func emailConfigPayload(config models.EmailConfig) gin.H {
	return gin.H{
		"smtp_host":     config.SMTPHost,
		"smtp_port":     config.SMTPPort,
		"smtp_user":     config.SMTPUser,
		"smtp_pass":     config.SMTPPass,
		"smtp_ssl":      config.SMTPSSL,
		"from_name":     config.FromName,
		"code_template": config.CodeTemplate,
	}
}

// ========== 注册登录配置 ==========

func GetRegisterConfig(c *gin.Context) {
	var config models.RegisterConfig
	database.DB.First(&config)

	// 默认值 -1表示无限制
	if config.ID == 0 {
		config.MaxApps = -1
		config.MaxUsers = -1
		config.MaxCardTypes = -1
		config.MaxCards = -1
		config.RegisterEnabled = 1
		config.RegRateLimit = 5
	} else if config.RegisterEnabled != 0 {
		config.RegisterEnabled = 1
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"max_apps":           config.MaxApps,
			"max_users":          config.MaxUsers,
			"max_card_types":     config.MaxCardTypes,
			"max_cards":          config.MaxCards,
			"register_enabled":   config.RegisterEnabled,
			"require_email_code": config.RequireEmailCode,
			"require_captcha":    config.RequireCaptcha,
			"reg_rate_limit":     config.RegRateLimit,
			"reg_ip_max_total":   config.RegIPMaxTotal,
		},
	})
}

func UpdateRegisterConfig(c *gin.Context) {
	var req struct {
		MaxApps          int  `json:"max_apps"`
		MaxUsers         int  `json:"max_users"`
		MaxCardTypes     int  `json:"max_card_types"`
		MaxCards         int  `json:"max_cards"`
		RegisterEnabled  *int `json:"register_enabled"`
		RequireEmailCode int  `json:"require_email_code"`
		RequireCaptcha   int  `json:"require_captcha"`
		RegRateLimit     int  `json:"reg_rate_limit"`
		RegIPMaxTotal    int  `json:"reg_ip_max_total"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var config models.RegisterConfig
	database.DB.First(&config)
	registerEnabled := 1
	if req.RegisterEnabled != nil && *req.RegisterEnabled == 0 {
		registerEnabled = 0
	}

	if config.ID == 0 {
		config = models.RegisterConfig{
			MaxApps:          req.MaxApps,
			MaxUsers:         req.MaxUsers,
			MaxCardTypes:     req.MaxCardTypes,
			MaxCards:         req.MaxCards,
			RegisterEnabled:  registerEnabled,
			RequireEmailCode: req.RequireEmailCode,
			RequireCaptcha:   req.RequireCaptcha,
			RegRateLimit:     req.RegRateLimit,
			RegIPMaxTotal:    req.RegIPMaxTotal,
		}
		database.DB.Create(&config)
	} else {
		database.DB.Model(&config).Updates(map[string]interface{}{
			"max_apps":           req.MaxApps,
			"max_users":          req.MaxUsers,
			"max_card_types":     req.MaxCardTypes,
			"max_cards":          req.MaxCards,
			"register_enabled":   registerEnabled,
			"require_email_code": req.RequireEmailCode,
			"require_captcha":    req.RequireCaptcha,
			"reg_rate_limit":     req.RegRateLimit,
			"reg_ip_max_total":   req.RegIPMaxTotal,
		})
	}

	if cache.Enabled {
		cache.Del("config:register")
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "保存成功"})
}

// 公开接口：获取注册配置（用于前端判断是否需要验证码）
func GetPublicRegisterConfig(c *gin.Context) {
	if cache.Enabled {
		var data gin.H
		if cache.GetJSON("config:register", &data) {
			c.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
			return
		}
	}

	var config models.RegisterConfig
	database.DB.First(&config)
	registerEnabled := 1
	if config.ID > 0 && config.RegisterEnabled == 0 {
		registerEnabled = 0
	}

	data := gin.H{
		"register_enabled":   registerEnabled,
		"require_email_code": config.RequireEmailCode,
		"require_captcha":    config.RequireCaptcha,
	}
	if cache.Enabled {
		cache.SetJSON("config:register", data, 300*time.Second)
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

func getRegisterConfig() models.RegisterConfig {
	var config models.RegisterConfig
	database.DB.First(&config)
	if config.ID == 0 {
		config.MaxApps = -1
		config.MaxUsers = -1
		config.MaxCardTypes = -1
		config.MaxCards = -1
		config.RegisterEnabled = 1
		config.RegRateLimit = 5
	} else if config.RegisterEnabled != 0 {
		config.RegisterEnabled = 1
	}
	return config
}

func isRegisterEnabled() bool {
	return getRegisterConfig().RegisterEnabled != 0
}

// ========== SDK 通讯加解密配置 ==========

func AdminGetSDKCryptoConfig(c *gin.Context) {
	var config models.SDKCryptoConfig
	database.DB.First(&config)
	if config.ID == 0 {
		config.Type = "pipeline"
		config.Config = defaultSDKCryptoPipelineConfig()
		config.EncryptScript = defaultSDKCryptoEncryptScript()
		config.DecryptScript = defaultSDKCryptoDecryptScript()
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": config})
}

func AdminSaveSDKCryptoConfig(c *gin.Context) {
	var req struct {
		Enabled       int    `json:"enabled"`
		Type          string `json:"type"`
		Config        string `json:"config"`
		EncryptScript string `json:"encrypt_script"`
		DecryptScript string `json:"decrypt_script"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	if req.Type != "js" {
		req.Type = "pipeline"
	}
	if req.Type == "pipeline" && strings.TrimSpace(req.Config) != "" {
		var tmp customCryptoConfig
		if err := json.Unmarshal([]byte(req.Config), &tmp); err != nil {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "步骤组合 JSON 格式错误"})
			return
		}
	}

	var config models.SDKCryptoConfig
	database.DB.First(&config)
	if config.ID == 0 {
		config = models.SDKCryptoConfig{Enabled: req.Enabled, Type: req.Type, Config: req.Config, EncryptScript: req.EncryptScript, DecryptScript: req.DecryptScript}
		database.DB.Create(&config)
	} else {
		database.DB.Model(&config).Updates(map[string]interface{}{
			"enabled":        req.Enabled,
			"type":           req.Type,
			"config":         req.Config,
			"encrypt_script": req.EncryptScript,
			"decrypt_script": req.DecryptScript,
		})
	}
	if cache.Enabled {
		cache.Del("config:sdk_crypto")
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "保存成功"})
}

func defaultSDKCryptoPipelineConfig() string {
	return "{\n  \"encrypt\": [\n    { \"op\": \"aes-256-cbc-encrypt\", \"key\": \"app_secret\" }\n  ],\n  \"decrypt\": [\n    { \"op\": \"aes-256-cbc-decrypt\", \"key\": \"app_secret\" }\n  ]\n}"
}

func defaultSDKCryptoEncryptScript() string {
	return "function encrypt(input, ctx) {\n  return aesCbcEncrypt(input, ctx.app_secret);\n}"
}

func defaultSDKCryptoDecryptScript() string {
	return "function decrypt(input, ctx) {\n  return aesCbcDecrypt(input, ctx.app_secret);\n}"
}

// 测试发送邮件
func TestSendEmail(c *gin.Context) {
	userID := c.GetUint("userID")
	testSendEmail(c, getEmailConfigForUser(userID))
}

func AdminTestSendEmail(c *gin.Context) {
	testSendEmail(c, getGlobalEmailConfig())
}

func testSendEmail(c *gin.Context, emailConfig models.EmailConfig) {
	var req struct {
		ToEmail string `json:"to_email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "请输入有效的邮箱地址"})
		return
	}
	if emailConfig.ID == 0 || emailConfig.SMTPHost == "" {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请先配置SMTP服务器"})
		return
	}

	// 获取站点配置
	var siteConfig models.SiteConfig
	database.DB.First(&siteConfig)

	// 生成测试验证码
	testCode := "888888"

	// 获取请求的域名
	scheme := "http"
	if c.Request.TLS != nil {
		scheme = "https"
	}
	baseURL := scheme + "://" + c.Request.Host

	// 替换模板变量
	template := emailConfig.CodeTemplate
	if template == "" {
		template = "<p>您的验证码是：<b>{验证码}</b></p>"
	}
	template = replaceTemplateVars(template, siteConfig, testCode, baseURL)

	// 发送邮件
	err := sendEmail(emailConfig, req.ToEmail, siteConfig.SiteName+" - 测试邮件", template)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "发送失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "发送成功"})
}

// ========== 邮箱验证码记录 ==========

func ListEmailCodes(c *gin.Context) {
	userID := c.GetUint("userID")

	// 获取用户的所有应用ID
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", userID).Pluck("id", &appIDs)
	if len(appIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": []any{}, "total": 0}})
		return
	}

	page := 1
	size := 20
	if p, err := strconv.Atoi(c.Query("page")); err == nil && p > 0 {
		page = p
	}
	if s, err := strconv.Atoi(c.Query("size")); err == nil && s > 0 && s <= 100 {
		size = s
	}

	query := database.DB.Model(&models.EmailCode{}).Where("app_id IN ?", appIDs)

	// 按应用筛选
	if appID, err := strconv.Atoi(c.Query("app_id")); err == nil && appID > 0 {
		query = query.Where("app_id = ?", appID)
	}
	// 按类型筛选
	if t, err := strconv.Atoi(c.Query("type")); err == nil && t > 0 {
		query = query.Where("type = ?", t)
	}
	// 按邮箱搜索
	if email := c.Query("email"); email != "" {
		query = query.Where("email LIKE ?", "%"+database.EscapeLike(email)+"%")
	}

	var total int64
	query.Count(&total)

	var codes []models.EmailCode
	query.Preload("App", func(db *gorm.DB) *gorm.DB {
		return db.Select("id, app_name")
	}).Order("created_at DESC").Offset((page - 1) * size).Limit(size).Find(&codes)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": codes, "total": total}})
}

// 替换模板变量
func replaceTemplateVars(template string, siteConfig models.SiteConfig, code string, baseURL string) string {
	// 处理logo路径，如果是相对路径则加上baseURL
	logoURL := siteConfig.SiteLogo
	if logoURL != "" && !strings.HasPrefix(logoURL, "http") {
		logoURL = baseURL + logoURL
	}

	replacer := map[string]string{
		"{客服QQ}":   siteConfig.ServiceQQ,
		"{网站名称}":   siteConfig.SiteName,
		"{网站logo}": logoURL,
		"{当前时间}":   time.Now().Format("2006-01-02 15:04:05"),
		"{验证码}":    code,
	}
	for k, v := range replacer {
		template = strings.Replace(template, k, v, -1)
	}
	return template
}

// 发送邮件
func sendEmail(config models.EmailConfig, to, subject, body string) error {
	from := config.SMTPUser
	if config.FromName != "" {
		from = config.FromName + " <" + config.SMTPUser + ">"
	}

	// 构建邮件头，使用base64编码处理中文
	headers := make(map[string]string)
	headers["From"] = from
	headers["To"] = to
	headers["Subject"] = "=?UTF-8?B?" + base64.StdEncoding.EncodeToString([]byte(subject)) + "?="
	headers["MIME-Version"] = "1.0"
	headers["Content-Type"] = "text/html; charset=UTF-8"
	headers["Content-Transfer-Encoding"] = "base64"

	var msg strings.Builder
	for k, v := range headers {
		msg.WriteString(k + ": " + v + "\r\n")
	}
	msg.WriteString("\r\n")
	msg.WriteString(base64.StdEncoding.EncodeToString([]byte(body)))

	msgBytes := []byte(msg.String())
	addr := fmt.Sprintf("%s:%d", config.SMTPHost, config.SMTPPort)
	auth := smtp.PlainAuth("", config.SMTPUser, config.SMTPPass, config.SMTPHost)

	if config.SMTPSSL == 1 {
		// SSL连接
		tlsConfig := &tls.Config{
			InsecureSkipVerify: true,
			ServerName:         config.SMTPHost,
		}
		conn, err := tls.Dial("tcp", addr, tlsConfig)
		if err != nil {
			return err
		}
		defer conn.Close()

		client, err := smtp.NewClient(conn, config.SMTPHost)
		if err != nil {
			return err
		}

		if err = client.Auth(auth); err != nil {
			return err
		}
		if err = client.Mail(config.SMTPUser); err != nil {
			return err
		}
		if err = client.Rcpt(to); err != nil {
			return err
		}
		w, err := client.Data()
		if err != nil {
			return err
		}
		_, err = w.Write(msgBytes)
		if err != nil {
			return err
		}
		err = w.Close()
		if err != nil {
			return err
		}
		client.Quit()
		return nil
	} else {
		// 非SSL连接
		return smtp.SendMail(addr, auth, config.SMTPUser, []string{to}, msgBytes)
	}
}

// ========== TG通知配置 ==========

func GetTelegramConfig(c *gin.Context) {
	var config models.TelegramConfig
	database.DB.First(&config)

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"bot_token":       config.BotToken,
			"chat_id":         config.ChatID,
			"proxy_url":       config.ProxyURL,
			"notify_register": config.NotifyRegister,
			"notify_package":  config.NotifyPackage,
		},
	})
}

func UpdateTelegramConfig(c *gin.Context) {
	var req struct {
		BotToken       string `json:"bot_token"`
		ChatID         string `json:"chat_id"`
		ProxyURL       string `json:"proxy_url"`
		NotifyRegister int    `json:"notify_register"`
		NotifyPackage  int    `json:"notify_package"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var config models.TelegramConfig
	database.DB.First(&config)

	if config.ID == 0 {
		config = models.TelegramConfig{
			BotToken:       req.BotToken,
			ChatID:         req.ChatID,
			ProxyURL:       req.ProxyURL,
			NotifyRegister: req.NotifyRegister,
			NotifyPackage:  req.NotifyPackage,
		}
		database.DB.Create(&config)
	} else {
		database.DB.Model(&config).Updates(map[string]interface{}{
			"bot_token":       req.BotToken,
			"chat_id":         req.ChatID,
			"proxy_url":       req.ProxyURL,
			"notify_register": req.NotifyRegister,
			"notify_package":  req.NotifyPackage,
		})
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "保存成功"})
}

// 测试TG通知
func TestTelegramNotify(c *gin.Context) {
	var config models.TelegramConfig
	database.DB.First(&config)

	if config.BotToken == "" || config.ChatID == "" {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请先配置Bot Token和Chat ID"})
		return
	}

	err := SendTelegramMessage(config.BotToken, config.ChatID, config.ProxyURL, "🔔 测试通知\n\n这是一条测试消息，如果您收到此消息，说明TG通知配置正确。")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "发送失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "发送成功"})
}

// 发送TG消息
func SendTelegramMessage(botToken, chatID, proxyURL, message string) error {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken)

	payload := fmt.Sprintf(`{"chat_id":"%s","text":"%s","parse_mode":"HTML"}`, chatID, strings.ReplaceAll(message, `"`, `\"`))

	req, err := http.NewRequest("POST", apiURL, strings.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	var client *http.Client
	if proxyURL != "" {
		// 使用代理
		proxyURLParsed, err := parseProxyURL(proxyURL)
		if err != nil {
			return fmt.Errorf("代理地址格式错误: %v", err)
		}
		transport := &http.Transport{
			Proxy: http.ProxyURL(proxyURLParsed),
		}
		client = &http.Client{Timeout: 15 * time.Second, Transport: transport}
	} else {
		client = &http.Client{Timeout: 10 * time.Second}
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("TG API返回错误状态码: %d", resp.StatusCode)
	}

	return nil
}

// 解析代理URL
func parseProxyURL(proxyURL string) (*neturl.URL, error) {
	// 支持 http://host:port 或 socks5://host:port 格式
	if !strings.HasPrefix(proxyURL, "http://") && !strings.HasPrefix(proxyURL, "https://") && !strings.HasPrefix(proxyURL, "socks5://") {
		proxyURL = "http://" + proxyURL
	}
	return neturl.Parse(proxyURL)
}

// 发送注册通知
func NotifyRegister(username, email string) {
	var config models.TelegramConfig
	database.DB.First(&config)

	if config.NotifyRegister != 1 || config.BotToken == "" || config.ChatID == "" {
		return
	}

	message := fmt.Sprintf("👤 新用户注册\n\n用户名: %s\n邮箱: %s\n时间: %s",
		username, email, time.Now().Format("2006-01-02 15:04:05"))

	go SendTelegramMessage(config.BotToken, config.ChatID, config.ProxyURL, message)
}

// 发送套餐开通通知
func NotifyPackagePurchase(username string, packageName string, price float64) {
	var config models.TelegramConfig
	database.DB.First(&config)

	if config.NotifyPackage != 1 || config.BotToken == "" || config.ChatID == "" {
		return
	}

	message := fmt.Sprintf("💰 套餐开通\n\n用户: %s\n套餐: %s\n金额: %.2f\n时间: %s",
		username, packageName, price, time.Now().Format("2006-01-02 15:04:05"))

	go SendTelegramMessage(config.BotToken, config.ChatID, config.ProxyURL, message)
}

// ========== 安全配置 ==========

func GetSecurityConfig(c *gin.Context) {
	var config models.SecurityConfig
	database.DB.First(&config)

	if config.ID == 0 {
		config = models.SecurityConfig{
			EnableCaptcha:     1,
			CaptchaAfterFails: 3,
			MaxLoginFails:     5,
			LockDuration:      30,
			PrimaryColor:      "",
			PageAnimation:     "blur-in",
		}
	}

	// 如果 PageAnimation 为空，设置默认值
	if config.PageAnimation == "" {
		config.PageAnimation = "blur-in"
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"enable_captcha":      config.EnableCaptcha,
			"captcha_after_fails": config.CaptchaAfterFails,
			"max_login_fails":     config.MaxLoginFails,
			"lock_duration":       config.LockDuration,
			"primary_color":       config.PrimaryColor,
			"page_animation":      config.PageAnimation,
		},
	})
}

func UpdateSecurityConfig(c *gin.Context) {
	var req struct {
		EnableCaptcha     int    `json:"enable_captcha"`
		CaptchaAfterFails int    `json:"captcha_after_fails"`
		MaxLoginFails     int    `json:"max_login_fails"`
		LockDuration      int    `json:"lock_duration"`
		PrimaryColor      string `json:"primary_color"`
		PageAnimation     string `json:"page_animation"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var config models.SecurityConfig
	database.DB.First(&config)

	if config.ID == 0 {
		config = models.SecurityConfig{
			EnableCaptcha:     req.EnableCaptcha,
			CaptchaAfterFails: req.CaptchaAfterFails,
			MaxLoginFails:     req.MaxLoginFails,
			LockDuration:      req.LockDuration,
			PrimaryColor:      req.PrimaryColor,
			PageAnimation:     req.PageAnimation,
		}
		database.DB.Create(&config)
	} else {
		database.DB.Model(&config).Updates(map[string]interface{}{
			"enable_captcha":      req.EnableCaptcha,
			"captcha_after_fails": req.CaptchaAfterFails,
			"max_login_fails":     req.MaxLoginFails,
			"lock_duration":       req.LockDuration,
			"primary_color":       req.PrimaryColor,
			"page_animation":      req.PageAnimation,
		})
	}

	if cache.Enabled {
		cache.Del("config:security")
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "保存成功"})
}

// 公开接口：获取安全配置（用于前端获取主题色等）
func GetPublicSecurityConfig(c *gin.Context) {
	if cache.Enabled {
		var data gin.H
		if cache.GetJSON("config:security", &data) {
			c.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
			return
		}
	}

	var config models.SecurityConfig
	database.DB.First(&config)

	if config.PageAnimation == "" {
		config.PageAnimation = "blur-in"
	}

	data := gin.H{
		"primary_color":  config.PrimaryColor,
		"page_animation": config.PageAnimation,
	}
	if cache.Enabled {
		cache.SetJSON("config:security", data, 300*time.Second)
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}
