package handlers

import (
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// 记录操作日志
func LogOperation(userID uint, action, module string, targetID uint, detail, ip, userAgent string) {
	log := models.OperationLog{
		UserID:    userID,
		Action:    action,
		Module:    module,
		TargetID:  targetID,
		Detail:    detail,
		IP:        ip,
		UserAgent: userAgent,
	}
	database.DB.Create(&log)
}

// 获取用户操作日志
func ListOperationLogs(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	action := c.Query("action")

	var list []models.OperationLog
	var total int64

	query := database.DB.Model(&models.OperationLog{}).Where("user_id = ?", user.ID)
	if action != "" {
		query = query.Where("action = ?", action)
	}

	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 管理员获取所有操作日志
func AdminListOperationLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	userID := c.Query("user_id")
	action := c.Query("action")
	module := c.Query("module")

	var list []models.OperationLog
	var total int64

	query := database.DB.Model(&models.OperationLog{}).Preload("User")
	if userID != "" {
		query = query.Where("user_id = ?", userID)
	}
	if action != "" {
		query = query.Where("action = ?", action)
	}
	if module != "" {
		query = query.Where("module = ?", module)
	}

	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}
