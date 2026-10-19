package handlers

import (
	"jike-auth/cache"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

func normalizeEnabled(v int) int {
	if v == 1 {
		return 1
	}
	return 0
}

// 用户版本列表
func ListAppVersions(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appID := c.Query("app_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var list []models.AppVersion
	var total int64
	query := database.DB.Model(&models.AppVersion{}).Preload("App")

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
			c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": []models.AppVersion{}, "total": 0}})
			return
		}
		query = query.Where("app_id IN ?", appIDs)
	}

	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 获取版本详情
func GetAppVersion(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var version models.AppVersion
	if err := database.DB.First(&version, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "版本不存在"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", version.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": version})
}

// 创建版本
func CreateAppVersion(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		AppID       uint   `json:"app_id" binding:"required"`
		Version     string `json:"version" binding:"required"`
		CheckMD5    int    `json:"check_md5"`
		MD5Value    string `json:"md5_value"`
		IsBeta      int    `json:"is_beta"`
		IsDefault   int    `json:"is_default"`
		MinRequired int    `json:"min_required"`
		ForceUpdate int    `json:"force_update"`
		GrayEnabled int    `json:"gray_enabled"`
		GrayFeatures string `json:"gray_features"`
		Status      *int   `json:"status"`
		DownloadURL string `json:"download_url"`
		Changelog   string `json:"changelog"`
		PublishedAt string `json:"published_at"`
		Remark      string `json:"remark"`
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

	status := 1
	if req.Status != nil {
		status = *req.Status
	}

	version := &models.AppVersion{
		AppID:       req.AppID,
		Version:     req.Version,
		CheckMD5:    req.CheckMD5,
		MD5Value:    req.MD5Value,
		IsBeta:      req.IsBeta,
		IsDefault:   req.IsDefault,
		MinRequired: req.MinRequired,
		ForceUpdate: req.ForceUpdate,
		GrayEnabled:  normalizeEnabled(req.GrayEnabled),
		GrayFeatures: req.GrayFeatures,
		Status:      status,
		DownloadURL: req.DownloadURL,
		Changelog:   req.Changelog,
		Remark:      req.Remark,
	}

	if req.PublishedAt != "" {
		if t, err := time.Parse(time.RFC3339, req.PublishedAt); err == nil {
			version.PublishedAt = &t
		}
	}

	// 如果设为默认版本，取消其他默认版本
	if req.IsDefault == 1 {
		database.DB.Model(&models.AppVersion{}).Where("app_id = ? AND is_default = 1", req.AppID).Update("is_default", 0)
	}
	if req.MinRequired == 1 {
		database.DB.Model(&models.AppVersion{}).Where("app_id = ? AND min_required = 1", req.AppID).Update("min_required", 0)
	}

	if err := database.DB.Create(version).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	cache.ClearSDKCache(req.AppID, "versions", "appinfo")
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": version})
}

// 更新版本
func UpdateAppVersion(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var version models.AppVersion
	if err := database.DB.First(&version, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "版本不存在"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", version.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Version     *string `json:"version"`
		Status      *int    `json:"status"`
		CheckMD5    *int    `json:"check_md5"`
		MD5Value    *string `json:"md5_value"`
		IsBeta      *int    `json:"is_beta"`
		IsDefault   *int    `json:"is_default"`
		MinRequired *int    `json:"min_required"`
		ForceUpdate *int    `json:"force_update"`
		GrayEnabled *int    `json:"gray_enabled"`
		GrayFeatures *string `json:"gray_features"`
		DownloadURL *string `json:"download_url"`
		Changelog   *string `json:"changelog"`
		PublishedAt *string `json:"published_at"`
		Remark      *string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Version != nil {
		updates["version"] = *req.Version
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.CheckMD5 != nil {
		updates["check_md5"] = *req.CheckMD5
	}
	if req.MD5Value != nil {
		updates["md5_value"] = *req.MD5Value
	}
	if req.IsBeta != nil {
		updates["is_beta"] = *req.IsBeta
	}
	if req.IsDefault != nil {
		if *req.IsDefault == 1 {
			database.DB.Model(&models.AppVersion{}).Where("app_id = ? AND is_default = 1 AND id != ?", version.AppID, version.ID).Update("is_default", 0)
		}
		updates["is_default"] = *req.IsDefault
	}
	if req.MinRequired != nil {
		if *req.MinRequired == 1 {
			database.DB.Model(&models.AppVersion{}).Where("app_id = ? AND min_required = 1 AND id != ?", version.AppID, version.ID).Update("min_required", 0)
		}
		updates["min_required"] = *req.MinRequired
	}
	if req.ForceUpdate != nil {
		updates["force_update"] = *req.ForceUpdate
	}
	if req.GrayEnabled != nil {
		updates["gray_enabled"] = normalizeEnabled(*req.GrayEnabled)
	}
	if req.GrayFeatures != nil {
		updates["gray_features"] = *req.GrayFeatures
	}
	if req.DownloadURL != nil {
		updates["download_url"] = *req.DownloadURL
	}
	if req.Changelog != nil {
		updates["changelog"] = *req.Changelog
	}
	if req.PublishedAt != nil {
		if *req.PublishedAt == "" {
			updates["published_at"] = nil
		} else if t, err := time.Parse(time.RFC3339, *req.PublishedAt); err == nil {
			updates["published_at"] = &t
		}
	}
	if req.Remark != nil {
		updates["remark"] = *req.Remark
	}

	if err := database.DB.Model(&version).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}

	cache.ClearSDKCache(version.AppID, "versions", "appinfo")
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 删除版本
func DeleteAppVersion(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var version models.AppVersion
	if err := database.DB.First(&version, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "版本不存在"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", version.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	if err := database.DB.Delete(&version).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}

	cache.ClearSDKCache(version.AppID, "versions", "appinfo")
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 管理员版本列表
func AdminListAppVersions(c *gin.Context) {
	appID := c.Query("app_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var list []models.AppVersion
	var total int64
	query := database.DB.Model(&models.AppVersion{}).Preload("App")
	if appID != "" {
		query = query.Where("app_id = ?", appID)
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 管理员获取版本详情
func AdminGetAppVersion(c *gin.Context) {
	id := c.Param("id")
	var version models.AppVersion
	if err := database.DB.Preload("App").First(&version, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "版本不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": version})
}

// 管理员更新版本
func AdminUpdateAppVersion(c *gin.Context) {
	id := c.Param("id")

	var version models.AppVersion
	if err := database.DB.First(&version, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "版本不存在"})
		return
	}

	var req struct {
		Version     *string `json:"version"`
		Status      *int    `json:"status"`
		CheckMD5    *int    `json:"check_md5"`
		MD5Value    *string `json:"md5_value"`
		IsBeta      *int    `json:"is_beta"`
		IsDefault   *int    `json:"is_default"`
		MinRequired *int    `json:"min_required"`
		ForceUpdate *int    `json:"force_update"`
		GrayEnabled *int    `json:"gray_enabled"`
		GrayFeatures *string `json:"gray_features"`
		DownloadURL *string `json:"download_url"`
		Changelog   *string `json:"changelog"`
		PublishedAt *string `json:"published_at"`
		Remark      *string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Version != nil {
		updates["version"] = *req.Version
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.CheckMD5 != nil {
		updates["check_md5"] = *req.CheckMD5
	}
	if req.MD5Value != nil {
		updates["md5_value"] = *req.MD5Value
	}
	if req.IsBeta != nil {
		updates["is_beta"] = *req.IsBeta
	}
	if req.IsDefault != nil {
		if *req.IsDefault == 1 {
			database.DB.Model(&models.AppVersion{}).Where("app_id = ? AND is_default = 1 AND id != ?", version.AppID, version.ID).Update("is_default", 0)
		}
		updates["is_default"] = *req.IsDefault
	}
	if req.MinRequired != nil {
		if *req.MinRequired == 1 {
			database.DB.Model(&models.AppVersion{}).Where("app_id = ? AND min_required = 1 AND id != ?", version.AppID, version.ID).Update("min_required", 0)
		}
		updates["min_required"] = *req.MinRequired
	}
	if req.ForceUpdate != nil {
		updates["force_update"] = *req.ForceUpdate
	}
	if req.GrayEnabled != nil {
		updates["gray_enabled"] = normalizeEnabled(*req.GrayEnabled)
	}
	if req.GrayFeatures != nil {
		updates["gray_features"] = *req.GrayFeatures
	}
	if req.DownloadURL != nil {
		updates["download_url"] = *req.DownloadURL
	}
	if req.Changelog != nil {
		updates["changelog"] = *req.Changelog
	}
	if req.PublishedAt != nil {
		if *req.PublishedAt == "" {
			updates["published_at"] = nil
		} else if t, err := time.Parse(time.RFC3339, *req.PublishedAt); err == nil {
			updates["published_at"] = &t
		}
	}
	if req.Remark != nil {
		updates["remark"] = *req.Remark
	}

	if err := database.DB.Model(&version).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}

	cache.ClearSDKCache(version.AppID, "versions", "appinfo")
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 管理员删除版本
func AdminDeleteAppVersion(c *gin.Context) {
	id := c.Param("id")
	// 先查出 appID 用于清缓存
	var ver models.AppVersion
	database.DB.First(&ver, id)
	if err := database.DB.Delete(&models.AppVersion{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}
	if ver.ID > 0 {
		cache.ClearSDKCache(ver.AppID, "versions", "appinfo")
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}
