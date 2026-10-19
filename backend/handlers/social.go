package handlers

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"jike-auth/config"
	"jike-auth/database"
	"jike-auth/middleware"
	"jike-auth/models"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// 社交绑定临时缓存
var socialBindCache = struct {
	sync.RWMutex
	data map[string]map[string]string
}{data: make(map[string]map[string]string)}

func getSocialLoginConfig() *models.SocialLoginConfig {
	var cfg models.SocialLoginConfig
	database.DB.First(&cfg)
	if cfg.ID == 0 || cfg.Enable != 1 || cfg.AppID == "" || cfg.AppKey == "" || cfg.LoginURL == "" {
		return nil
	}
	return &cfg
}

// GetSocialLoginStatus 获取社交登录是否启用（公开接口）
func GetSocialLoginStatus(c *gin.Context) {
	cfg := getSocialLoginConfig()
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"enabled": cfg != nil}})
}

// GetSocialLoginURL 获取社交登录跳转URL
func GetSocialLoginURL(c *gin.Context) {
	socialType := c.Query("type")
	if socialType == "" {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "缺少type参数"})
		return
	}

	cfg := getSocialLoginConfig()
	if cfg == nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "社交登录未配置"})
		return
	}

	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	callback := fmt.Sprintf("%s://%s/api/auth/social/callback", scheme, c.Request.Host)

	// 如果用户已登录，在回调URL中带上token用于绑定
	authToken := c.GetHeader("Authorization")
	if authToken != "" {
		authToken = strings.TrimPrefix(authToken, "Bearer ")
	}
	if authToken == "" {
		authToken = c.Query("token")
	}
	if authToken != "" {
		callback += "?auth_token=" + url.QueryEscape(authToken)
	}

	reqURL := fmt.Sprintf("%s?act=login&appid=%s&appkey=%s&type=%s&redirect_uri=%s",
		cfg.LoginURL, cfg.AppID, cfg.AppKey, socialType, url.QueryEscape(callback))

	resp, err := (&http.Client{Timeout: 30 * time.Second}).Get(reqURL)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请求登录接口失败"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	if json.Unmarshal(body, &result) != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "解析响应失败"})
		return
	}

	if code, ok := result["code"].(float64); ok && code != 0 {
		msg, _ := result["msg"].(string)
		if msg == "" {
			msg = "获取登录链接失败"
		}
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": msg})
		return
	}

	loginURL, _ := result["url"].(string)
	if loginURL == "" {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "获取登录链接失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"url": loginURL}})
}

// SocialCallback 社交登录回调
func SocialCallback(c *gin.Context) {
	code := c.Query("code")
	socialType := c.Query("type")

	if code == "" || socialType == "" {
		c.Redirect(http.StatusFound, "/login?error=参数错误")
		return
	}

	cfg := getSocialLoginConfig()
	if cfg == nil {
		c.Redirect(http.StatusFound, "/login?error="+url.QueryEscape("社交登录未配置"))
		return
	}

	// 获取用户信息
	infoURL := fmt.Sprintf("%s?act=callback&appid=%s&appkey=%s&type=%s&code=%s",
		cfg.LoginURL, cfg.AppID, cfg.AppKey, socialType, code)

	resp, err := (&http.Client{Timeout: 30 * time.Second}).Get(infoURL)
	if err != nil {
		c.Redirect(http.StatusFound, "/login?error="+url.QueryEscape("获取用户信息失败"))
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	if json.Unmarshal(body, &result) != nil {
		c.Redirect(http.StatusFound, "/login?error="+url.QueryEscape("解析响应失败"))
		return
	}

	if codeVal, ok := result["code"].(float64); ok && codeVal != 0 {
		msg, _ := result["msg"].(string)
		if msg == "" {
			msg = "获取用户信息失败"
		}
		c.Redirect(http.StatusFound, "/login?error="+url.QueryEscape(msg))
		return
	}

	socialUID := socialGetString(result, "social_uid")
	if socialUID == "" {
		c.Redirect(http.StatusFound, "/login?error="+url.QueryEscape("获取用户信息失败"))
		return
	}

	// 如果带了 auth_token，说明是已登录用户在个人中心绑定
	authToken := c.Query("auth_token")
	if authToken != "" {
		// 解析 JWT 获取用户ID
		userID := socialParseToken(authToken)
		if userID == 0 {
			c.Redirect(http.StatusFound, "/profile?error="+url.QueryEscape("登录已过期，请重新登录"))
			return
		}
		// 检查是否已被其他用户绑定
		var existCount int64
		database.DB.Model(&models.SocialAccount{}).Where("type = ? AND social_uid = ?", socialType, socialUID).Count(&existCount)
		if existCount > 0 {
			c.Redirect(http.StatusFound, "/profile?error="+url.QueryEscape("该社交账号已绑定其他用户"))
			return
		}
		// 检查用户是否已绑定同类型
		var userBindCount int64
		database.DB.Model(&models.SocialAccount{}).Where("user_id = ? AND type = ?", userID, socialType).Count(&userBindCount)
		if userBindCount > 0 {
			c.Redirect(http.StatusFound, "/profile?error="+url.QueryEscape("您已绑定过该类型的社交账号"))
			return
		}
		// 直接绑定
		database.DB.Create(&models.SocialAccount{
			UserID: userID, Type: socialType, SocialUID: socialUID,
			Nickname: socialGetString(result, "nickname"), Avatar: socialGetString(result, "faceimg"),
		})
		c.Redirect(http.StatusFound, "/profile?success="+url.QueryEscape("绑定成功"))
		return
	}

	// 查找是否已绑定
	var socialAccount models.SocialAccount
	if database.DB.Where("type = ? AND social_uid = ?", socialType, socialUID).First(&socialAccount).Error == nil {
		// 已绑定，直接登录
		var user models.User
		if database.DB.First(&user, socialAccount.UserID).Error != nil {
			c.Redirect(http.StatusFound, "/login?error="+url.QueryEscape("用户不存在"))
			return
		}
		if user.Status != 1 {
			c.Redirect(http.StatusFound, "/login?error="+url.QueryEscape("账号已禁用"))
			return
		}
		token := socialGenerateToken(user.ID, user.Username, user.TokenVersion, user.CreatedAt)
		c.Redirect(http.StatusFound, fmt.Sprintf("/login?token=%s", token))
		return
	}

	// 未绑定，生成临时凭证
	bindToken := socialMD5(fmt.Sprintf("%d%d", time.Now().UnixNano(), time.Now().Unix()))
	socialBindCache.Lock()
	socialBindCache.data[bindToken] = map[string]string{
		"type":       socialType,
		"social_uid": socialUID,
		"nickname":   socialGetString(result, "nickname"),
		"avatar":     socialGetString(result, "faceimg"),
	}
	socialBindCache.Unlock()

	// 10分钟后清理
	go func() {
		time.Sleep(10 * time.Minute)
		socialBindCache.Lock()
		delete(socialBindCache.data, bindToken)
		socialBindCache.Unlock()
	}()

	c.Redirect(http.StatusFound, fmt.Sprintf("/bind-social?token=%s&type=%s&nickname=%s",
		bindToken, socialType, url.QueryEscape(socialGetString(result, "nickname"))))
}

// BindSocialAccount 绑定社交账号到已有账户
func BindSocialAccount(c *gin.Context) {
	var req struct {
		BindToken string `json:"bind_token" binding:"required"`
		Username  string `json:"username" binding:"required"`
		Password  string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	socialBindCache.RLock()
	bindData, ok := socialBindCache.data[req.BindToken]
	socialBindCache.RUnlock()
	if !ok {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "绑定凭证已过期"})
		return
	}

	var user models.User
	if database.DB.Where("username = ? OR email = ?", req.Username, req.Username).First(&user).Error != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户不存在"})
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)) != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "密码错误"})
		return
	}
	if user.Status != 1 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "账号已禁用"})
		return
	}

	var existCount int64
	database.DB.Model(&models.SocialAccount{}).Where("type = ? AND social_uid = ?", bindData["type"], bindData["social_uid"]).Count(&existCount)
	if existCount > 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "该社交账号已绑定其他用户"})
		return
	}

	database.DB.Create(&models.SocialAccount{
		UserID: user.ID, Type: bindData["type"], SocialUID: bindData["social_uid"],
		Nickname: bindData["nickname"], Avatar: bindData["avatar"],
	})

	socialBindCache.Lock()
	delete(socialBindCache.data, req.BindToken)
	socialBindCache.Unlock()

	token := socialGenerateToken(user.ID, user.Username, user.TokenVersion, user.CreatedAt)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"token": token}})
}

// RegisterAndBindSocial 注册新账号并绑定社交账号
func RegisterAndBindSocial(c *gin.Context) {
	var req struct {
		BindToken string `json:"bind_token" binding:"required"`
		Username  string `json:"username" binding:"required"`
		Email     string `json:"email" binding:"required"`
		Password  string `json:"password" binding:"required"`
		EmailCode string `json:"email_code"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 检查是否允许注册及是否需要邮箱验证码
	regConfig := getRegisterConfig()
	if regConfig.RegisterEnabled == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "当前已关闭注册"})
		return
	}
	if regConfig.RequireEmailCode == 1 {
		if req.EmailCode == "" {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请输入邮箱验证码"})
			return
		}
		var emailCode models.EmailCode
		if database.DB.Where("email = ? AND code = ? AND type = 1 AND used = 0 AND expire_at > ?",
			req.Email, req.EmailCode, time.Now()).First(&emailCode).Error != nil {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "邮箱验证码错误或已过期"})
			return
		}
		database.DB.Model(&emailCode).Update("used", 1)
	}

	socialBindCache.RLock()
	bindData, ok := socialBindCache.data[req.BindToken]
	socialBindCache.RUnlock()
	if !ok {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "绑定凭证已过期"})
		return
	}

	var count int64
	database.DB.Model(&models.User{}).Where("username = ? OR email = ?", req.Username, req.Email).Count(&count)
	if count > 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户名或邮箱已存在"})
		return
	}

	hashedPwd, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	user := models.User{
		Username: req.Username, Email: req.Email, Password: string(hashedPwd),
		Nickname: bindData["nickname"], Avatar: bindData["avatar"], Role: 0, Status: 1,
	}
	if database.DB.Create(&user).Error != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "注册失败"})
		return
	}

	database.DB.Create(&models.SocialAccount{
		UserID: user.ID, Type: bindData["type"], SocialUID: bindData["social_uid"],
		Nickname: bindData["nickname"], Avatar: bindData["avatar"],
	})

	socialBindCache.Lock()
	delete(socialBindCache.data, req.BindToken)
	socialBindCache.Unlock()

	token := socialGenerateToken(user.ID, user.Username, user.TokenVersion, user.CreatedAt)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"token": token}})
}

// GetUserSocialAccounts 获取用户绑定的社交账号
func GetUserSocialAccounts(c *gin.Context) {
	userID := c.GetUint("userID")
	var accounts []models.SocialAccount
	database.DB.Where("user_id = ?", userID).Find(&accounts)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": accounts})
}

// UnbindSocialAccount 解绑社交账号
func UnbindSocialAccount(c *gin.Context) {
	userID := c.GetUint("userID")
	socialType := c.Param("type")
	result := database.DB.Where("user_id = ? AND type = ?", userID, socialType).Delete(&models.SocialAccount{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "未绑定该社交账号"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "解绑成功"})
}

// AdminGetSocialLoginConfig 管理员获取社交登录配置
func AdminGetSocialLoginConfig(c *gin.Context) {
	var cfg models.SocialLoginConfig
	database.DB.First(&cfg)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": cfg})
}

// AdminSaveSocialLoginConfig 管理员保存社交登录配置
func AdminSaveSocialLoginConfig(c *gin.Context) {
	var req models.SocialLoginConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	var existing models.SocialLoginConfig
	database.DB.First(&existing)
	if existing.ID > 0 {
		req.ID = existing.ID
	}
	database.DB.Save(&req)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "保存成功"})
}

// 工具函数
func socialGetString(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		switch val := v.(type) {
		case string:
			return val
		case float64:
			return fmt.Sprintf("%.0f", val)
		}
	}
	return ""
}

func socialMD5(s string) string {
	h := md5.New()
	h.Write([]byte(s))
	return hex.EncodeToString(h.Sum(nil))
}

func socialGenerateToken(userID uint, username string, tokenVersion uint, createdAt time.Time) string {
	claims := &middleware.Claims{
		UserID:       userID,
		Username:     username,
		TokenVersion: tokenVersion,
		CreatedAt:    createdAt.Format("2006-01-02T15:04:05Z"),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(config.Cfg.JWT.Expire)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(config.Cfg.JWT.Secret))
	if err != nil {
		log.Printf("生成token失败: %v", err)
		return ""
	}
	return tokenString
}

func socialParseToken(tokenString string) uint {
	token, err := jwt.ParseWithClaims(tokenString, &middleware.Claims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(config.Cfg.JWT.Secret), nil
	})
	if err != nil {
		return 0
	}
	if claims, ok := token.Claims.(*middleware.Claims); ok && token.Valid {
		return claims.UserID
	}
	return 0
}
