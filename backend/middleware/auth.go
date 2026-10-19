package middleware

import (
	"jike-auth/config"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func SetupRequiredMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		// 安装向导接口必须在数据库未连接时也能访问，所以这里直接放行。
		if path == "/api/setup/status" || path == "/api/setup/test-database" || path == "/api/setup/test-redis" || path == "/api/setup/init" || path == "/api/setup/admin" {
			c.Next()
			return
		}

		if config.Cfg == nil || config.Cfg.Initialized != 1 || database.DB == nil {
			// 前端拦截到 need_setup 后会跳转 /setup。
			c.JSON(http.StatusServiceUnavailable, gin.H{"code": 503, "message": "请先完成系统初始化", "need_setup": true})
			c.Abort()
			return
		}

		var count int64
		database.DB.Model(&models.User{}).Where("role = ?", 1).Count(&count)
		if count == 0 {
			c.JSON(http.StatusServiceUnavailable, gin.H{"code": 503, "message": "请先完成管理员初始化", "need_setup": true})
			c.Abort()
			return
		}

		c.Next()
	}
}

type Claims struct {
	UserID       uint   `json:"user_id"`
	Username     string `json:"username"` // 用户名，防止串号
	TokenVersion uint   `json:"token_version"`
	CreatedAt    string `json:"created_at"` // 用户创建时间，防止ID复用后串号
	jwt.RegisteredClaims
}

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "未登录"})
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return []byte(config.Cfg.JWT.Secret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "登录已过期"})
			c.Abort()
			return
		}

		var user models.User
		if err := database.DB.First(&user, claims.UserID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "用户不存在"})
			c.Abort()
			return
		}

		// 检查Token版本（密码修改后旧Token失效）
		if user.TokenVersion != claims.TokenVersion {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "登录已失效，请重新登录"})
			c.Abort()
			return
		}

		// 检查用户创建时间和用户名（防止ID复用后串号）
		// 任一字段为空或不匹配都拒绝，强制重新登录
		if claims.CreatedAt == "" || claims.Username == "" ||
			claims.CreatedAt != user.CreatedAt.Format("2006-01-02T15:04:05Z") ||
			claims.Username != user.Username {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "登录已失效，请重新登录"})
			c.Abort()
			return
		}

		if user.Status == 0 {
			c.JSON(http.StatusForbidden, gin.H{"code": 403, "message": "账号已被禁用"})
			c.Abort()
			return
		}

		// 后续 handler 通过 c.Get("user") 或 c.GetUint("userID") 获取当前作者账号。
		c.Set("user", &user)
		c.Set("userID", user.ID)
		c.Next()
	}
}

func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "未登录"})
			c.Abort()
			return
		}

		u := user.(*models.User)
		if u.Role != 1 {
			c.JSON(http.StatusForbidden, gin.H{"code": 403, "message": "无权限"})
			c.Abort()
			return
		}

		c.Next()
	}
}

type AgentClaims struct {
	AgentID uint `json:"agent_id"`
	AppID   uint `json:"app_id"`
	jwt.RegisteredClaims
}

func AgentAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "未登录"})
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		claims := &AgentClaims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return []byte(config.Cfg.JWT.Secret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "登录已过期"})
			c.Abort()
			return
		}

		var agent models.Agent
		if err := database.DB.First(&agent, claims.AgentID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "代理不存在"})
			c.Abort()
			return
		}

		if agent.Status != 1 {
			c.JSON(http.StatusForbidden, gin.H{"code": 403, "message": "账号已被禁用"})
			c.Abort()
			return
		}

		// 代理中心接口使用独立上下文，避免和作者后台的 user/userID 混用。
		c.Set("agent", &agent)
		c.Set("agentID", agent.ID)
		c.Set("appID", agent.AppID)
		c.Next()
	}
}
