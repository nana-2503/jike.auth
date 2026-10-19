package handlers

import (
	"crypto/rand"
	"fmt"
	"image/color"
	"jike-auth/cache"
	"jike-auth/config"
	"jike-auth/database"
	"jike-auth/middleware"
	"jike-auth/models"
	"math/big"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/mojocn/base64Captcha"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// 验证码存储
var captchaStore = base64Captcha.DefaultMemStore

// 用户名/密码只允许大小写字母和数字
var alphanumRegex = regexp.MustCompile(`^[a-zA-Z0-9]+$`)

// 验证码驱动
var captchaDriver = &base64Captcha.DriverString{
	Height:          60,
	Width:           200,
	NoiseCount:      0,
	ShowLineOptions: base64Captcha.OptionShowHollowLine,
	Length:          4,
	Source:          "1234567890abcdefghijklmnopqrstuvwxyz",
	BgColor:         &color.RGBA{R: 240, G: 240, B: 246, A: 255},
	Fonts:           []string{"wqy-microhei.ttc"},
}

// 登录失败计数缓存
var loginFailCache = struct {
	sync.RWMutex
	data map[string]int
}{data: make(map[string]int)}

type RegisterRequest struct {
	Username  string `json:"username"`
	Email     string `json:"email"`
	Password  string `json:"password"`
	EmailCode string `json:"email_code"`
	CaptchaID string `json:"captcha_id"`
	Captcha   string `json:"captcha"`
}

type SetupAdminRequest struct {
	Username string `json:"username" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
	Nickname string `json:"nickname"`
}

type SetupInitializeRequest struct {
	Database struct {
		Type     string `json:"type" binding:"required"`
		Host     string `json:"host" binding:"required"`
		Port     int    `json:"port" binding:"required"`
		User     string `json:"user" binding:"required"`
		Password string `json:"password"`
		DBName   string `json:"dbname" binding:"required"`
		SSLMode  string `json:"sslmode"`
	} `json:"database" binding:"required"`
	Redis struct {
		Enable   bool   `json:"enable"`
		Host     string `json:"host"`
		Port     int    `json:"port"`
		Password string `json:"password"`
		DB       int    `json:"db"`
	} `json:"redis"`
	Admin *SetupAdminRequest `json:"admin"`
}

type SetupDatabaseTestRequest struct {
	Type     string `json:"type" binding:"required"`
	Host     string `json:"host" binding:"required"`
	Port     int    `json:"port" binding:"required"`
	User     string `json:"user" binding:"required"`
	Password string `json:"password"`
	DBName   string `json:"dbname" binding:"required"`
	SSLMode  string `json:"sslmode"`
}

type SetupRedisTestRequest struct {
	Enable   bool   `json:"enable"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Password string `json:"password"`
	DB       int    `json:"db"`
}

func hasAdminUser() bool {
	if database.DB == nil {
		return false
	}
	var count int64
	database.DB.Model(&models.User{}).Where("role = ?", 1).Count(&count)
	return count > 0
}

func setupDatabaseHasAdmin(dbConfig config.DatabaseConfig) (bool, error) {
	db, err := database.Open(dbConfig, &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		return false, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return false, err
	}
	defer sqlDB.Close()

	if !db.Migrator().HasTable(&models.User{}) {
		return false, nil
	}

	var count int64
	if err := db.Model(&models.User{}).Where("role = ?", 1).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func GetSetupStatus(c *gin.Context) {
	initialized := config.Cfg != nil && config.Cfg.Initialized == 1
	hasAdmin := hasAdminUser()
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{
		"need_setup":  !initialized || !hasAdmin,
		"initialized": initialized,
		"has_admin":   hasAdmin,
	}})
}

func SetupTestDatabase(c *gin.Context) {
	if config.Cfg != nil && config.Cfg.Initialized == 1 && hasAdminUser() {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "系统已初始化"})
		return
	}

	var req SetupDatabaseTestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	dbConfig, err := buildSetupDatabaseConfig(req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}

	if err := database.TestConnection(dbConfig); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "数据库链接失败"})
		return
	}

	hasAdmin, err := setupDatabaseHasAdmin(dbConfig)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "管理员状态检查失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "数据库链接正常", "data": gin.H{"has_admin": hasAdmin}})
}

func SetupTestRedis(c *gin.Context) {
	if config.Cfg != nil && config.Cfg.Initialized == 1 && hasAdminUser() {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "系统已初始化"})
		return
	}

	var req SetupRedisTestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	redisConfig := buildSetupRedisConfig(req)
	if err := cache.TestConnection(redisConfig); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "Redis 链接失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "Redis 链接正常"})
}

func SetupInitialize(c *gin.Context) {
	if config.Cfg != nil && config.Cfg.Initialized == 1 && hasAdminUser() {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "系统已初始化"})
		return
	}

	var req SetupInitializeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	dbConfig, err := buildSetupDatabaseConfig(SetupDatabaseTestRequest(req.Database))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}

	config.Cfg.Database = dbConfig
	config.Cfg.Redis = buildSetupRedisConfig(SetupRedisTestRequest(req.Redis))
	config.Cfg.Initialized = 1
	if err := config.EnsureJWTSecret(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": err.Error()})
		return
	}

	if err := database.Init(); err != nil {
		config.Cfg.Initialized = 0
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "数据库连接或迁移失败: " + err.Error()})
		return
	}

	if err := cache.Init(); err != nil {
		config.Cfg.Initialized = 0
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}

	if !hasAdminUser() {
		if req.Admin == nil {
			config.Cfg.Initialized = 0
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请填写管理员信息"})
			return
		}
		if err := validateSetupAdmin(*req.Admin); err != nil {
			config.Cfg.Initialized = 0
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
			return
		}
		if err := createSetupAdmin(*req.Admin); err != nil {
			config.Cfg.Initialized = 0
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
			return
		}
	}

	if err := config.Save("config.yaml"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": err.Error()})
		return
	}

	StartBackgroundTaskSchedulers()

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "初始化完成"})
}

func buildSetupDatabaseConfig(req SetupDatabaseTestRequest) (config.DatabaseConfig, error) {
	dbType := strings.ToLower(strings.TrimSpace(req.Type))
	if dbType != "mysql" && dbType != "mariadb" && dbType != "postgres" {
		return config.DatabaseConfig{}, fmt.Errorf("数据库类型仅支持 mysql、mariadb 或 postgres")
	}
	if req.Port <= 0 {
		return config.DatabaseConfig{}, fmt.Errorf("数据库端口无效")
	}

	dbConfig := config.DatabaseConfig{Type: dbType}
	if dbType == "postgres" {
		dbConfig.Postgres.Host = strings.TrimSpace(req.Host)
		dbConfig.Postgres.Port = req.Port
		dbConfig.Postgres.User = strings.TrimSpace(req.User)
		dbConfig.Postgres.Password = req.Password
		dbConfig.Postgres.DBName = strings.TrimSpace(req.DBName)
		dbConfig.Postgres.SSLMode = strings.TrimSpace(req.SSLMode)
		if dbConfig.Postgres.SSLMode == "" {
			dbConfig.Postgres.SSLMode = "disable"
		}
	} else {
		dbConfig.MySQL.Host = strings.TrimSpace(req.Host)
		dbConfig.MySQL.Port = req.Port
		dbConfig.MySQL.User = strings.TrimSpace(req.User)
		dbConfig.MySQL.Password = req.Password
		dbConfig.MySQL.DBName = strings.TrimSpace(req.DBName)
	}

	return dbConfig, nil
}

func buildSetupRedisConfig(req SetupRedisTestRequest) config.RedisConfig {
	redisConfig := config.RedisConfig{
		Enable:   req.Enable,
		Host:     strings.TrimSpace(req.Host),
		Port:     req.Port,
		Password: req.Password,
		DB:       req.DB,
	}
	if redisConfig.Host == "" {
		redisConfig.Host = "127.0.0.1"
	}
	if redisConfig.Port <= 0 {
		redisConfig.Port = 6379
	}
	if redisConfig.DB < 0 {
		redisConfig.DB = 0
	}
	return redisConfig
}

func SetupAdmin(c *gin.Context) {
	if config.Cfg == nil || config.Cfg.Initialized != 1 || database.DB == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": 503, "message": "请先完成系统初始化", "need_setup": true})
		return
	}
	if hasAdminUser() {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "管理员已配置"})
		return
	}

	var req SetupAdminRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	if err := validateSetupAdmin(req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}

	if err := createSetupAdmin(req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "管理员配置完成"})
}

func validateSetupAdmin(req SetupAdminRequest) error {
	if len(req.Username) < 5 || len(req.Username) > 14 {
		return fmt.Errorf("用户名长度为5-14个字符")
	}
	if !alphanumRegex.MatchString(req.Username) {
		return fmt.Errorf("用户名只能包含大小写字母和数字")
	}
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		return fmt.Errorf("请输入有效的邮箱地址")
	}
	if len(req.Password) < 8 || len(req.Password) > 64 {
		return fmt.Errorf("密码长度为8-64个字符")
	}
	return nil
}

func createSetupAdmin(req SetupAdminRequest) error {
	if hasAdminUser() {
		return fmt.Errorf("管理员已配置")
	}
	if req.Nickname == "" {
		req.Nickname = req.Username
	}

	hashedPwd, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("服务器错误")
	}

	now := time.Now()
	if err := database.DB.Exec(
		`INSERT INTO users (
			username, email, password, nickname, role, status,
			max_apps, max_users, max_card_types, max_cards, activity_code,
			created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		strings.TrimSpace(req.Username),
		strings.TrimSpace(req.Email),
		string(hashedPwd),
		strings.TrimSpace(req.Nickname),
		1,
		1,
		-1,
		-1,
		-1,
		-1,
		generateActivityCode(),
		now,
		now,
	).Error; err != nil {
		return fmt.Errorf("创建管理员失败，请检查用户名或邮箱是否已存在")
	}

	return nil
}

type LoginRequest struct {
	Username  string `json:"username" binding:"required"`
	Password  string `json:"password" binding:"required"`
	CaptchaID string `json:"captcha_id"`
	Captcha   string `json:"captcha"`
}

func Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误: " + err.Error()})
		return
	}

	// 手动校验参数
	if len(req.Username) < 5 || len(req.Username) > 14 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户名长度为5-14个字符"})
		return
	}
	if !alphanumRegex.MatchString(req.Username) {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户名只能包含大小写字母和数字"})
		return
	}
	if len(req.Password) < 6 || len(req.Password) > 16 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "密码长度为6-16个字符"})
		return
	}
	if !alphanumRegex.MatchString(req.Password) {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "密码只能包含大小写字母和数字"})
		return
	}
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请输入有效的邮箱地址"})
		return
	}

	// 获取注册配置，检查是否允许注册及是否需要验证码
	regConfig := getRegisterConfig()
	if regConfig.RegisterEnabled == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "当前已关闭注册"})
		return
	}

	// 同IP注册频率限制
	clientIP := c.ClientIP()
	rateLimit := regConfig.RegRateLimit
	if rateLimit > 0 {
		var ipRegCount int64
		database.DB.Model(&models.OperationLog{}).Where("action = 'register' AND ip = ? AND created_at > ?",
			clientIP, time.Now().Add(-time.Hour)).Count(&ipRegCount)
		if int(ipRegCount) >= rateLimit {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "注册过于频繁，请稍后再试"})
			return
		}
	}

	// 同IP总注册次数限制
	if regConfig.RegIPMaxTotal > 0 {
		var ipTotalCount int64
		database.DB.Model(&models.OperationLog{}).Where("action = 'register' AND ip = ?", clientIP).Count(&ipTotalCount)
		if int(ipTotalCount) >= regConfig.RegIPMaxTotal {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "该IP注册次数已达上限"})
			return
		}
	}

	// 图形验证码检查
	if regConfig.RequireCaptcha == 1 {
		if req.CaptchaID == "" || req.Captcha == "" {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请输入图形验证码", "need_captcha": true})
			return
		}
		if !captchaStore.Verify(req.CaptchaID, req.Captcha, true) {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "图形验证码错误", "need_captcha": true})
			return
		}
	}

	if regConfig.RequireEmailCode == 1 {
		if req.EmailCode == "" {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请输入邮箱验证码"})
			return
		}
		// 验证邮箱验证码
		var emailCode models.EmailCode
		database.DB.Where("email = ? AND code = ? AND type = 1 AND used = 0 AND expire_at > ?",
			req.Email, req.EmailCode, time.Now()).First(&emailCode)
		if emailCode.ID == 0 {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "验证码错误或已过期"})
			return
		}
		// 标记验证码已使用
		database.DB.Model(&emailCode).Update("used", 1)
	}

	// 检查用户名是否存在
	var count int64
	database.DB.Model(&models.User{}).Where("username = ?", req.Username).Count(&count)
	if count > 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户名已存在"})
		return
	}

	// 检查邮箱是否存在
	database.DB.Model(&models.User{}).Where("email = ?", req.Email).Count(&count)
	if count > 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "邮箱已被注册"})
		return
	}

	// 加密密码
	hashedPwd, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "服务器错误"})
		return
	}

	// 使用已获取的注册配置设置配额
	maxApps := -1
	maxUsers := -1
	maxCardTypes := -1
	maxCards := -1
	if regConfig.ID > 0 {
		maxApps = regConfig.MaxApps
		maxUsers = regConfig.MaxUsers
		maxCardTypes = regConfig.MaxCardTypes
		maxCards = regConfig.MaxCards
	}

	user := &models.User{
		Username:     req.Username,
		Email:        req.Email,
		Password:     string(hashedPwd),
		Nickname:     req.Username,
		Role:         0,
		Status:       1,
		MaxApps:      maxApps,
		MaxUsers:     maxUsers,
		MaxCardTypes: maxCardTypes,
		MaxCards:     maxCards,
		ActivityCode: generateActivityCode(),
	}

	if err := database.DB.Create(user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "注册失败"})
		return
	}

	// 发送TG注册通知
	NotifyRegister(req.Username, req.Email)

	// 记录注册日志（用于频率限制统计）
	go LogOperation(user.ID, "register", "user", user.ID, "用户注册", c.ClientIP(), c.Request.UserAgent())

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "注册成功"})
}

func Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	clientIP := c.ClientIP()

	// 获取安全配置
	var secConfig models.SecurityConfig
	database.DB.First(&secConfig)
	if secConfig.ID == 0 {
		secConfig = models.SecurityConfig{
			EnableCaptcha:     1,
			CaptchaAfterFails: 3,
			MaxLoginFails:     5,
			LockDuration:      30,
		}
	}

	// 检查是否被锁定
	var recentFails int64
	lockTime := time.Now().Add(-time.Duration(secConfig.LockDuration) * time.Minute)
	database.DB.Model(&models.LoginFailure{}).Where("ip = ? AND created_at > ?", clientIP, lockTime).Count(&recentFails)

	if int(recentFails) >= secConfig.MaxLoginFails {
		c.JSON(http.StatusOK, gin.H{
			"code":    1,
			"message": fmt.Sprintf("登录失败次数过多，请%d分钟后再试", secConfig.LockDuration),
			"locked":  true,
		})
		return
	}

	// 检查是否需要验证码
	needCaptcha := secConfig.EnableCaptcha == 1 && int(recentFails) >= secConfig.CaptchaAfterFails
	if needCaptcha {
		if req.CaptchaID == "" || req.Captcha == "" {
			c.JSON(http.StatusOK, gin.H{
				"code":         1,
				"message":      "请输入验证码",
				"need_captcha": true,
			})
			return
		}
		if !captchaStore.Verify(req.CaptchaID, req.Captcha, true) {
			c.JSON(http.StatusOK, gin.H{
				"code":         1,
				"message":      "验证码错误",
				"need_captcha": true,
			})
			return
		}
	}

	var user models.User
	// 支持用户名或邮箱登录
	if err := database.DB.Where("username = ? OR email = ?", req.Username, req.Username).First(&user).Error; err != nil {
		// 记录失败
		recordLoginFailure(clientIP, req.Username)
		newFailCount := recentFails + 1
		c.JSON(http.StatusOK, gin.H{
			"code":         1,
			"message":      "用户名或密码错误",
			"need_captcha": secConfig.EnableCaptcha == 1 && int(newFailCount) >= secConfig.CaptchaAfterFails,
		})
		return
	}

	if user.Status == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "账号已被禁用"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		// 记录失败
		recordLoginFailure(clientIP, req.Username)
		newFailCount := recentFails + 1
		c.JSON(http.StatusOK, gin.H{
			"code":         1,
			"message":      "用户名或密码错误",
			"need_captcha": secConfig.EnableCaptcha == 1 && int(newFailCount) >= secConfig.CaptchaAfterFails,
		})
		return
	}

	// 登录成功，清除该IP的失败记录
	database.DB.Where("ip = ?", clientIP).Delete(&models.LoginFailure{})

	// 生成 JWT
	claims := &middleware.Claims{
		UserID:       user.ID,
		Username:     user.Username,
		TokenVersion: user.TokenVersion,
		CreatedAt:    user.CreatedAt.Format("2006-01-02T15:04:05Z"),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(config.Cfg.JWT.Expire)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(config.Cfg.JWT.Secret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "服务器错误"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"token": tokenString,
			"user":  user,
		},
	})

	// 记录登录日志
	go LogOperation(user.ID, "login", "user", user.ID, "用户登录", c.ClientIP(), c.Request.UserAgent())
}

// 记录登录失败
func recordLoginFailure(ip, username string) {
	failure := models.LoginFailure{
		IP:       ip,
		Username: username,
	}
	database.DB.Create(&failure)
}

// 生成验证码
func GenerateCaptcha(c *gin.Context) {
	driver := captchaDriver.ConvertFonts()
	captcha := base64Captcha.NewCaptcha(driver, captchaStore)
	id, b64s, _, err := captcha.Generate()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "生成验证码失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"captcha_id":  id,
			"captcha_img": b64s,
		},
	})
}

// 获取登录状态（是否需要验证码）
func GetLoginStatus(c *gin.Context) {
	clientIP := c.ClientIP()

	var secConfig models.SecurityConfig
	database.DB.First(&secConfig)
	if secConfig.ID == 0 {
		secConfig = models.SecurityConfig{
			EnableCaptcha:     1,
			CaptchaAfterFails: 3,
			MaxLoginFails:     5,
			LockDuration:      30,
		}
	}

	var recentFails int64
	lockTime := time.Now().Add(-time.Duration(secConfig.LockDuration) * time.Minute)
	database.DB.Model(&models.LoginFailure{}).Where("ip = ? AND created_at > ?", clientIP, lockTime).Count(&recentFails)

	needCaptcha := secConfig.EnableCaptcha == 1 && int(recentFails) >= secConfig.CaptchaAfterFails
	locked := int(recentFails) >= secConfig.MaxLoginFails

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"need_captcha": needCaptcha,
			"locked":       locked,
			"fail_count":   recentFails,
		},
	})
}

// 发送注册验证码
func SendRegisterCode(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "请输入有效的邮箱地址"})
		return
	}

	// 检查邮箱是否已注册
	var count int64
	database.DB.Model(&models.User{}).Where("email = ?", req.Email).Count(&count)
	if count > 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "该邮箱已被注册"})
		return
	}

	// 检查发送频率（1分钟内只能发送一次）
	var lastCode models.EmailCode
	database.DB.Where("email = ? AND type = 1 AND created_at > ?", req.Email, time.Now().Add(-time.Minute)).First(&lastCode)
	if lastCode.ID > 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "发送太频繁，请稍后再试"})
		return
	}

	// 同IP每小时最多发送10次验证码
	clientIP := c.ClientIP()
	var ipSendCount int64
	database.DB.Model(&models.EmailCode{}).Where("ip = ? AND created_at > ?", clientIP, time.Now().Add(-time.Hour)).Count(&ipSendCount)
	if ipSendCount >= 10 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "发送太频繁，请稍后再试"})
		return
	}

	// 获取邮箱配置
	emailConfig := getGlobalEmailConfig()
	if emailConfig.ID == 0 || emailConfig.SMTPHost == "" {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "邮箱服务未配置"})
		return
	}

	// 获取站点配置
	var siteConfig models.SiteConfig
	database.DB.First(&siteConfig)

	// 生成6位验证码（使用crypto/rand）
	n, _ := rand.Int(rand.Reader, big.NewInt(1000000))
	code := fmt.Sprintf("%06d", n.Int64())

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
	template = replaceTemplateVars(template, siteConfig, code, baseURL)

	// 发送邮件
	err := sendEmail(emailConfig, req.Email, siteConfig.SiteName+" - 注册验证码", template)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "发送失败: " + err.Error()})
		return
	}

	// 保存验证码
	emailCode := models.EmailCode{
		Email:    req.Email,
		Code:     code,
		Type:     1, // 注册
		Used:     0,
		IP:       clientIP,
		ExpireAt: time.Now().Add(5 * time.Minute),
	}
	database.DB.Create(&emailCode)

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "验证码已发送"})
}

// 发送找回密码验证码
func SendResetCode(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "请输入有效的邮箱地址"})
		return
	}

	// 检查邮箱是否存在
	var user models.User
	if err := database.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "该邮箱未注册"})
		return
	}

	// 检查发送频率（1分钟内只能发送一次）
	var lastCode models.EmailCode
	database.DB.Where("email = ? AND type = 2 AND created_at > ?", req.Email, time.Now().Add(-time.Minute)).First(&lastCode)
	if lastCode.ID > 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "发送太频繁，请稍后再试"})
		return
	}

	// 同IP每小时最多发送10次验证码
	clientIP := c.ClientIP()
	var ipSendCount int64
	database.DB.Model(&models.EmailCode{}).Where("ip = ? AND created_at > ?", clientIP, time.Now().Add(-time.Hour)).Count(&ipSendCount)
	if ipSendCount >= 10 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "发送太频繁，请稍后再试"})
		return
	}

	// 获取邮箱配置
	emailConfig := getGlobalEmailConfig()
	if emailConfig.ID == 0 || emailConfig.SMTPHost == "" {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "邮箱服务未配置"})
		return
	}

	// 获取站点配置
	var siteConfig models.SiteConfig
	database.DB.First(&siteConfig)

	// 生成6位验证码（使用crypto/rand）
	n, _ := rand.Int(rand.Reader, big.NewInt(1000000))
	code := fmt.Sprintf("%06d", n.Int64())

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
	template = replaceTemplateVars(template, siteConfig, code, baseURL)

	// 发送邮件
	err := sendEmail(emailConfig, req.Email, siteConfig.SiteName+" - 找回密码验证码", template)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "发送失败: " + err.Error()})
		return
	}

	// 保存验证码
	emailCode := models.EmailCode{
		Email:    req.Email,
		Code:     code,
		Type:     2, // 找回密码
		Used:     0,
		IP:       clientIP,
		ExpireAt: time.Now().Add(5 * time.Minute),
	}
	database.DB.Create(&emailCode)

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "验证码已发送"})
}

// 生成活动频道码
func generateActivityCode() string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 8)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}
	return string(b)
}

// 重置密码
func ResetPassword(c *gin.Context) {
	var req struct {
		Email       string `json:"email" binding:"required,email"`
		Code        string `json:"code" binding:"required"`
		NewPassword string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	if len(req.NewPassword) < 6 || len(req.NewPassword) > 16 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "密码长度为6-16个字符"})
		return
	}
	if !alphanumRegex.MatchString(req.NewPassword) {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "密码只能包含大小写字母和数字"})
		return
	}

	// 验证邮箱验证码
	var emailCode models.EmailCode
	database.DB.Where("email = ? AND code = ? AND type = 2 AND used = 0 AND expire_at > ?",
		req.Email, req.Code, time.Now()).First(&emailCode)
	if emailCode.ID == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "验证码错误或已过期"})
		return
	}

	// 查找用户
	var user models.User
	if err := database.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 加密新密码
	hashedPwd, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "密码加密失败"})
		return
	}

	// 更新密码并递增Token版本
	database.DB.Model(&user).Updates(map[string]interface{}{
		"password":      string(hashedPwd),
		"token_version": gorm.Expr("token_version + 1"),
	})

	// 标记验证码已使用
	database.DB.Model(&emailCode).Update("used", 1)

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "密码重置成功"})
}
