package handlers

import (
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// ListClientErrorLogs 获取当前作者应用的客户端异常/崩溃日志。
func ListClientErrorLogs(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	appID, _ := strconv.Atoi(c.Query("app_id"))
	severity := c.Query("severity")
	keyword := strings.TrimSpace(c.Query("keyword"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}

	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)
	if len(appIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": []models.ClientErrorLog{}, "total": 0}})
		return
	}

	query := database.DB.Model(&models.ClientErrorLog{}).Preload("App").Preload("AppUser").Where("app_id IN ?", appIDs)
	if appID > 0 {
		query = query.Where("app_id = ?", appID)
	}
	if severity != "" {
		query = query.Where("severity = ?", severity)
	}
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("username LIKE ? OR message LIKE ? OR error_type LIKE ? OR client_id LIKE ? OR client_ip LIKE ?", kw, kw, kw, kw, kw)
	}

	var list []models.ClientErrorLog
	var total int64
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// DeleteClientErrorLog 删除单条客户端异常日志。
func DeleteClientErrorLog(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id, _ := strconv.Atoi(c.Param("id"))
	if id == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	result := database.DB.Where("id = ? AND app_id IN (SELECT id FROM apps WHERE user_id = ?)", id, user.ID).Delete(&models.ClientErrorLog{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "日志不存在或无权限"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// ClearClientErrorLogs 清空当前作者指定范围内的客户端异常日志。
func ClearClientErrorLogs(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appID, _ := strconv.Atoi(c.Query("app_id"))

	query := database.DB.Where("app_id IN (SELECT id FROM apps WHERE user_id = ?)", user.ID)
	if appID > 0 {
		query = query.Where("app_id = ?", appID)
	}
	query.Delete(&models.ClientErrorLog{})
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "清空成功"})
}
