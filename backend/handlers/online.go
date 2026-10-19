package handlers

import (
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// 用户在线列表
func ListOnlineSessions(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appID := c.Query("app_id")
	appUserID := c.Query("app_user_id")
	keyword := c.Query("keyword")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var list []models.OnlineSession
	var total int64
	query := database.DB.Model(&models.OnlineSession{}).Preload("AppUser").Preload("App")

	if appID != "" {
		// 验证APP归属
		var app models.App
		if err := database.DB.Where("id = ? AND user_id = ?", appID, user.ID).First(&app).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
			return
		}
		query = query.Where("online_sessions.app_id = ?", appID)
	} else {
		// 获取用户所有APP的ID
		var appIDs []uint
		database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)
		if len(appIDs) == 0 {
			c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": []models.OnlineSession{}, "total": 0}})
			return
		}
		query = query.Where("online_sessions.app_id IN ?", appIDs)
	}

	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Joins("LEFT JOIN app_users ON app_users.id = online_sessions.app_user_id").
			Where("app_users.username LIKE ? OR online_sessions.client_ip LIKE ? OR online_sessions.token LIKE ?",
				kw, kw, kw)
	}
	if appUserID != "" {
		query = query.Where("online_sessions.app_user_id = ?", appUserID)
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("heartbeat_at desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 踢下线
func KickOnlineSession(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var session models.OnlineSession
	if err := database.DB.First(&session, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "会话不存在"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", session.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	if err := database.DB.Delete(&session).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "操作失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已踢下线"})
}

// 批量踢下线
func KickOnlineSessionsByUser(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		AppID     uint `json:"app_id" binding:"required"`
		AppUserID uint `json:"app_user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", req.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}

	result := database.DB.Where("app_id = ? AND app_user_id = ?", req.AppID, req.AppUserID).Delete(&models.OnlineSession{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "操作失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已踢下线", "data": gin.H{"count": result.RowsAffected}})
}

// 获取在线统计
func GetOnlineStats(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appID := c.Query("app_id")

	var total int64
	query := database.DB.Model(&models.OnlineSession{})

	if appID != "" {
		// 验证APP归属
		var app models.App
		if err := database.DB.Where("id = ? AND user_id = ?", appID, user.ID).First(&app).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
			return
		}
		query = query.Where("app_id = ?", appID)
	} else {
		// 获取用户所有APP的ID
		var appIDs []uint
		database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)
		if len(appIDs) == 0 {
			c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"online_count": 0}})
			return
		}
		query = query.Where("app_id IN ?", appIDs)
	}

	query.Count(&total)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"online_count": total}})
}

// 管理员在线列表
func AdminListOnlineSessions(c *gin.Context) {
	appID := c.Query("app_id")
	appUserID := c.Query("app_user_id")
	keyword := c.Query("keyword")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var list []models.OnlineSession
	var total int64
	query := database.DB.Model(&models.OnlineSession{}).Preload("AppUser").Preload("App")
	if appID != "" {
		query = query.Where("app_id = ?", appID)
	}
	if appUserID != "" {
		query = query.Where("app_user_id = ?", appUserID)
	}
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Joins("LEFT JOIN app_users ON app_users.id = online_sessions.app_user_id").
			Where("app_users.username LIKE ? OR online_sessions.client_ip LIKE ? OR online_sessions.token LIKE ?",
				kw, kw, kw)
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("heartbeat_at desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 管理员踢下线
func AdminKickOnlineSession(c *gin.Context) {
	id := c.Param("id")
	if err := database.DB.Delete(&models.OnlineSession{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "操作失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已踢下线"})
}

// 管理员批量踢下线
func AdminKickOnlineSessionsByApp(c *gin.Context) {
	var req struct {
		AppID uint `json:"app_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	result := database.DB.Where("app_id = ?", req.AppID).Delete(&models.OnlineSession{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "操作失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已踢下线", "data": gin.H{"count": result.RowsAffected}})
}

// 管理员按用户踢下线
func AdminKickOnlineSessionsByUser(c *gin.Context) {
	var req struct {
		AppUserID uint `json:"app_user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	result := database.DB.Where("app_user_id = ?", req.AppUserID).Delete(&models.OnlineSession{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "操作失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已踢下线", "data": gin.H{"count": result.RowsAffected}})
}

// 获取最近7天在线统计
func GetOnlineChart(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appIDs, ok := getAuthorAppIDs(user.ID, c.Query("app_id"))
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}

	type DayStat struct {
		Date          string `json:"date"`
		LoginUsers    int64  `json:"login_users"`    // 登录用户数（当天有登录的用户）
		OnlineUsers   int64  `json:"online_users"`   // 在线用户数（当天在线，去重）
		OnlineDevices int64  `json:"online_devices"` // 在线设备数（当天在线）
	}

	result := make([]DayStat, 7)
	now := time.Now()

	for i := 6; i >= 0; i-- {
		day := now.AddDate(0, 0, -i)
		dayStart := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
		dayEnd := dayStart.AddDate(0, 0, 1)
		dateStr := dayStart.Format("01-02")

		stat := DayStat{Date: dateStr}

		if len(appIDs) > 0 {
			// 登录用户：当天有登录记录的用户数（包含已下线的，所以用 Unscoped）
			database.DB.Unscoped().Model(&models.OnlineSession{}).
				Where("app_id IN ? AND login_at >= ? AND login_at < ?", appIDs, dayStart, dayEnd).
				Distinct("app_user_id").
				Count(&stat.LoginUsers)

			// 在线用户：当天在线的用户（包含已下线的）
			database.DB.Unscoped().Model(&models.OnlineSession{}).
				Where("app_id IN ? AND login_at < ? AND heartbeat_at >= ?", appIDs, dayEnd, dayStart).
				Distinct("app_user_id").
				Count(&stat.OnlineUsers)

			// 在线设备：当天在线的设备数（包含已下线的）
			database.DB.Unscoped().Model(&models.OnlineSession{}).
				Where("app_id IN ? AND login_at < ? AND heartbeat_at >= ?", appIDs, dayEnd, dayStart).
				Count(&stat.OnlineDevices)
		}

		result[6-i] = stat
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": result})
}
