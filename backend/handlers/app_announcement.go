package handlers

import (
	"jike-auth/cache"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func ListAppAnnouncements(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appID := c.Query("app_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var list []models.AppAnnouncement
	var total int64
	query := database.DB.Model(&models.AppAnnouncement{}).Where("app_id = ?", appID)
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("sort desc, id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

func CreateAppAnnouncement(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		AppID   uint   `json:"app_id" binding:"required"`
		Title   string `json:"title" binding:"required"`
		Content string `json:"content"`
		Status  int    `json:"status"`
		Sort    int    `json:"sort"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", req.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	ann := &models.AppAnnouncement{
		AppID:   req.AppID,
		Title:   req.Title,
		Content: req.Content,
		Status:  req.Status,
		Sort:    req.Sort,
	}
	if ann.Status == 0 {
		ann.Status = 1
	}

	if err := database.DB.Create(ann).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}
	cache.ClearSDKCache(req.AppID, "announcements")
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": ann})
}

func UpdateAppAnnouncement(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var ann models.AppAnnouncement
	if err := database.DB.First(&ann, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "公告不存在"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", ann.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Title   *string `json:"title"`
		Content *string `json:"content"`
		Status  *int    `json:"status"`
		Sort    *int    `json:"sort"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Title != nil { updates["title"] = *req.Title }
	if req.Content != nil { updates["content"] = *req.Content }
	if req.Status != nil { updates["status"] = *req.Status }
	if req.Sort != nil { updates["sort"] = *req.Sort }

	database.DB.Model(&ann).Updates(updates)
	cache.ClearSDKCache(ann.AppID, "announcements")
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func DeleteAppAnnouncement(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var ann models.AppAnnouncement
	if err := database.DB.First(&ann, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "公告不存在"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", ann.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	database.DB.Delete(&ann)
	cache.ClearSDKCache(ann.AppID, "announcements")
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

func AdminListAppAnnouncements(c *gin.Context) {
	appID := c.Query("app_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var list []models.AppAnnouncement
	var total int64
	query := database.DB.Model(&models.AppAnnouncement{}).Where("app_id = ?", appID)
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("sort desc, id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

func AdminCreateAppAnnouncement(c *gin.Context) {
	var req struct {
		AppID   uint   `json:"app_id" binding:"required"`
		Title   string `json:"title" binding:"required"`
		Content string `json:"content"`
		Status  int    `json:"status"`
		Sort    int    `json:"sort"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	var app models.App
	if err := database.DB.First(&app, req.AppID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "应用不存在"})
		return
	}

	ann := &models.AppAnnouncement{AppID: req.AppID, Title: req.Title, Content: req.Content, Status: req.Status, Sort: req.Sort}
	if ann.Status == 0 {
		ann.Status = 1
	}
	if err := database.DB.Create(ann).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}
	cache.ClearSDKCache(req.AppID, "announcements")
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": ann})
}

func AdminUpdateAppAnnouncement(c *gin.Context) {
	id := c.Param("id")
	var ann models.AppAnnouncement
	if err := database.DB.First(&ann, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "公告不存在"})
		return
	}
	var req struct {
		Title   *string `json:"title"`
		Content *string `json:"content"`
		Status  *int    `json:"status"`
		Sort    *int    `json:"sort"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	updates := make(map[string]interface{})
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Content != nil {
		updates["content"] = *req.Content
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.Sort != nil {
		updates["sort"] = *req.Sort
	}
	database.DB.Model(&ann).Updates(updates)
	cache.ClearSDKCache(ann.AppID, "announcements")
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func AdminDeleteAppAnnouncement(c *gin.Context) {
	id := c.Param("id")
	var ann models.AppAnnouncement
	if err := database.DB.First(&ann, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "公告不存在"})
		return
	}
	database.DB.Delete(&ann)
	cache.ClearSDKCache(ann.AppID, "announcements")
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}
