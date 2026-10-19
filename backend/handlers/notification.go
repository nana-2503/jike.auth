package handlers

import (
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

func createUserNotification(userID uint, typ, level, title, content, refType string, refID uint) {
	if userID == 0 || title == "" {
		return
	}
	var existing int64
	database.DB.Model(&models.UserNotification{}).
		Where("user_id = ? AND type = ? AND ref_type = ? AND ref_id = ? AND read_at IS NULL", userID, typ, refType, refID).
		Count(&existing)
	if existing > 0 {
		return
	}
	n := models.UserNotification{
		UserID: userID,
		Type: typ,
		Level: level,
		Title: title,
		Content: content,
		RefType: refType,
		RefID: refID,
	}
	database.DB.Create(&n)
}

func ListNotifications(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}
	read := c.Query("read")

	var list []models.UserNotification
	var total int64
	query := database.DB.Model(&models.UserNotification{}).Where("user_id = ?", user.ID)
	if read == "0" {
		query = query.Where("read_at IS NULL")
	} else if read == "1" {
		query = query.Where("read_at IS NOT NULL")
	}
	query.Count(&total)
	query.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&list)

	var unread int64
	database.DB.Model(&models.UserNotification{}).Where("user_id = ? AND read_at IS NULL", user.ID).Count(&unread)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total, "unread": unread}})
}

func MarkNotificationRead(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")
	now := time.Now()
	res := database.DB.Model(&models.UserNotification{}).Where("id = ? AND user_id = ?", id, user.ID).Update("read_at", &now)
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "操作失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已读"})
}

func MarkAllNotificationsRead(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	now := time.Now()
	if err := database.DB.Model(&models.UserNotification{}).Where("user_id = ? AND read_at IS NULL", user.ID).Update("read_at", &now).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "操作失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已全部标记已读"})
}

func DeleteNotification(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")
	if err := database.DB.Where("id = ? AND user_id = ?", id, user.ID).Delete(&models.UserNotification{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

func ClearNotifications(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	result := database.DB.Where("user_id = ?", user.ID).Delete(&models.UserNotification{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "清理失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "清理成功", "data": gin.H{"count": result.RowsAffected}})
}
