package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"jike-auth/cache"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type appCustomField struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type appWithStats struct {
	models.App
	UserCount         int64 `json:"user_count"`
	OnlineCount       int64 `json:"online_count"`
	OnlineClientCount int64 `json:"online_client_count"`
}

func normalizeAppCustomFields(fields []appCustomField) (string, error) {
	result := make(map[string]string)
	for _, field := range fields {
		key := strings.TrimSpace(field.Key)
		if key == "" && strings.TrimSpace(field.Value) == "" {
			continue
		}
		if key == "" {
			return "", fmt.Errorf("自定义字段名不能为空")
		}
		if len(key) > 100 {
			return "", fmt.Errorf("自定义字段名不能超过100个字符")
		}
		if _, exists := result[key]; exists {
			return "", fmt.Errorf("自定义字段名不能重复: %s", key)
		}
		result[key] = field.Value
	}
	if len(result) == 0 {
		return "", nil
	}
	data, err := json.Marshal(result)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// 计算用户有效套餐的额外配额
func getUserPackageQuota(userID uint) (extraApps, extraUsers, extraCardTypes, extraCards int) {
	var userPackages []models.UserPackage
	database.DB.Where("user_id = ? AND expire_at > ?", userID, time.Now()).Find(&userPackages)
	for _, up := range userPackages {
		extraApps += up.ExtraApps
		extraUsers += up.ExtraUsers
		extraCardTypes += up.ExtraCardTypes
		extraCards += up.ExtraCards
	}
	return
}

// 计算用户总配额（基础配额 + 套餐额外配额）
func getUserTotalQuota(user *models.User) (maxApps, maxUsers, maxCardTypes, maxCards int) {
	extraApps, extraUsers, extraCardTypes, extraCards := getUserPackageQuota(user.ID)

	maxApps = user.MaxApps
	maxUsers = user.MaxUsers
	maxCardTypes = user.MaxCardTypes
	maxCards = user.MaxCards

	// -1 表示无限制，不需要加额外配额
	if maxApps != -1 {
		maxApps += extraApps
	}
	if maxUsers != -1 {
		maxUsers += extraUsers
	}
	if maxCardTypes != -1 {
		maxCardTypes += extraCardTypes
	}
	if maxCards != -1 {
		maxCards += extraCards
	}
	return
}

func generateKey(length int) string {
	bytes := make([]byte, length)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func generateAppCode() string {
	// 生成12位：前4位是年月（YYMM），后8位是大写字母和数字组合
	// 格式：2601-AB123456（2026年1月）
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

	// 获取当前年份的后两位和月份
	now := time.Now()
	year := now.Year() % 100
	month := int(now.Month())
	yearMonthPrefix := fmt.Sprintf("%02d%02d", year, month)

	// 生成剩余8位随机字符
	bytes := make([]byte, 8)
	rand.Read(bytes)

	code := yearMonthPrefix
	for i := 0; i < 8; i++ {
		code += string(charset[int(bytes[i])%len(charset)])
	}

	// 格式化为 2601-AB123456
	return code[:4] + "-" + code[4:12]
}

// 用户APP管理
func ListUserApps(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var apps []models.App
	var total int64

	query := database.DB.Model(&models.App{}).Where("user_id = ?", user.ID)
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&apps)

	appStats := make([]appWithStats, 0, len(apps))
	for _, app := range apps {
		item := appWithStats{App: app}
		database.DB.Model(&models.AppUser{}).Where("app_id = ?", app.ID).Count(&item.UserCount)
		database.DB.Model(&models.OnlineSession{}).Where("app_id = ?", app.ID).Distinct("app_user_id").Count(&item.OnlineCount)
		database.DB.Model(&models.OnlineSession{}).Where("app_id = ?", app.ID).Count(&item.OnlineClientCount)
		appStats = append(appStats, item)
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"list":  appStats,
			"total": total,
		},
	})
}

func CreateUserApp(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		AppName        string           `json:"app_name" binding:"required"`
		Description    string           `json:"description"`
		LoginMode      int              `json:"login_mode"`
		BillingMode    int              `json:"billing_mode"`
		Heartbeat      int              `json:"heartbeat"`
		CryptoMode     string           `json:"crypto_mode"`
		AppSecret      string           `json:"app_secret"`
		SignAlgo       string           `json:"sign_algo"`
		ServerSignAlgo string           `json:"server_sign_algo"`
		CustomFields   []appCustomField `json:"custom_fields"`
		BindDevice     int              `json:"bind_device"`
		ChannelMode    int              `json:"channel_mode"`
		LoginKick      int              `json:"login_kick"`
		RegMode        int              `json:"reg_mode"`
		RegLimit       int              `json:"reg_limit"`
		RegChannels    int              `json:"reg_channels"`
		RegFeatures    int              `json:"reg_features"`
		RegDuration    int              `json:"reg_duration"`
		RegPoints      int              `json:"reg_points"`
		TrialDuration  int              `json:"trial_duration"`
		TrialPoints    int              `json:"trial_points"`
		TrialLimit     int              `json:"trial_limit"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 检查应用数量限制（-1表示无限制）
	var appCount int64
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Count(&appCount)
	maxApps, _, _, _ := getUserTotalQuota(user)
	if maxApps >= 0 && int(appCount) >= maxApps {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "已达到应用数量上限"})
		return
	}

	// 默认值处理
	loginMode := req.LoginMode
	if loginMode < 1 || loginMode > 3 {
		loginMode = 1
	}
	billingMode := req.BillingMode
	if billingMode < 1 || billingMode > 3 {
		billingMode = 1
	}
	heartbeat := req.Heartbeat
	if heartbeat < 10 {
		heartbeat = 60
	}
	cryptoMode := req.CryptoMode
	if cryptoMode == "" {
		cryptoMode = "aes-256-cbc"
	}
	channelMode := req.ChannelMode
	if channelMode < 1 || channelMode > 2 {
		channelMode = 1
	}
	regMode := req.RegMode
	if regMode < 1 || regMode > 4 {
		regMode = 1
	}
	regLimit := req.RegLimit
	if regLimit < 1 {
		regLimit = 1
	}
	customFields, err := normalizeAppCustomFields(req.CustomFields)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}

	app := &models.App{
		UserID:  user.ID,
		AppName: req.AppName,
		AppKey:  generateKey(16),
		AppCode: generateAppCode(),
		AppSecret: func() string {
			if req.AppSecret != "" {
				return req.AppSecret
			}
			return generateKey(16)
		}(),
		Description:    req.Description,
		LoginMode:      loginMode,
		BillingMode:    billingMode,
		Heartbeat:      heartbeat,
		CryptoMode:     cryptoMode,
		SignAlgo:       req.SignAlgo,
		ServerSignAlgo: req.ServerSignAlgo,
		CustomFields:   customFields,
		BindDevice:     req.BindDevice,
		ChannelMode:    channelMode,
		LoginKick:      req.LoginKick,
		RegMode:        regMode,
		RegLimit:       regLimit,
		RegChannels:    req.RegChannels,
		RegFeatures:    req.RegFeatures,
		RegDuration:    req.RegDuration,
		RegPoints:      req.RegPoints,
		TrialDuration:  req.TrialDuration,
		TrialPoints:    req.TrialPoints,
		TrialLimit:     req.TrialLimit,
		Status:         1,
	}

	if err := database.DB.Create(app).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": app})
}

func UpdateUserApp(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", id, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "APP不存在"})
		return
	}

	var req struct {
		AppName        string            `json:"app_name"`
		Description    string            `json:"description"`
		LoginMode      *int              `json:"login_mode"`
		BillingMode    *int              `json:"billing_mode"`
		Heartbeat      *int              `json:"heartbeat"`
		CryptoMode     string            `json:"crypto_mode"`
		AppSecret      string            `json:"app_secret"`
		SignAlgo       string            `json:"sign_algo"`
		ServerSignAlgo string            `json:"server_sign_algo"`
		CustomFields   *[]appCustomField `json:"custom_fields"`
		BindDevice     *int              `json:"bind_device"`
		ChannelMode    *int              `json:"channel_mode"`
		LoginKick      *int              `json:"login_kick"`
		RegMode        *int              `json:"reg_mode"`
		RegLimit       *int              `json:"reg_limit"`
		RegChannels    *int              `json:"reg_channels"`
		RegFeatures    *int              `json:"reg_features"`
		RegDuration    *int              `json:"reg_duration"`
		RegPoints      *int              `json:"reg_points"`
		TrialDuration  *int              `json:"trial_duration"`
		TrialPoints    *int              `json:"trial_points"`
		TrialLimit     *int              `json:"trial_limit"`
		SDKLogEnabled  *int              `json:"sdk_log_enabled"`
		Maintenance    *int              `json:"maintenance"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.AppName != "" {
		updates["app_name"] = req.AppName
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.LoginMode != nil && *req.LoginMode >= 1 && *req.LoginMode <= 3 {
		updates["login_mode"] = *req.LoginMode
	}
	if req.BillingMode != nil && *req.BillingMode >= 1 && *req.BillingMode <= 3 {
		updates["billing_mode"] = *req.BillingMode
	}
	if req.Heartbeat != nil && *req.Heartbeat >= 10 {
		updates["heartbeat"] = *req.Heartbeat
	}
	if req.CryptoMode != "" {
		updates["crypto_mode"] = req.CryptoMode
	}
	if req.AppSecret != "" {
		updates["app_secret"] = req.AppSecret
	}
	if req.SignAlgo != "" {
		updates["sign_algo"] = req.SignAlgo
	}
	if req.ServerSignAlgo != "" {
		updates["server_sign_algo"] = req.ServerSignAlgo
	}
	if req.CustomFields != nil {
		customFields, err := normalizeAppCustomFields(*req.CustomFields)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
			return
		}
		updates["custom_fields"] = customFields
	}
	if req.BindDevice != nil {
		updates["bind_device"] = *req.BindDevice
	}
	if req.ChannelMode != nil && *req.ChannelMode >= 1 && *req.ChannelMode <= 2 {
		updates["channel_mode"] = *req.ChannelMode
	}
	if req.LoginKick != nil {
		updates["login_kick"] = *req.LoginKick
	}
	if req.RegMode != nil && *req.RegMode >= 1 && *req.RegMode <= 4 {
		updates["reg_mode"] = *req.RegMode
	}
	if req.RegLimit != nil && *req.RegLimit >= 1 {
		updates["reg_limit"] = *req.RegLimit
	}
	if req.RegChannels != nil {
		updates["reg_channels"] = *req.RegChannels
	}
	if req.RegFeatures != nil {
		updates["reg_features"] = *req.RegFeatures
	}
	if req.RegDuration != nil {
		updates["reg_duration"] = *req.RegDuration
	}
	if req.RegPoints != nil {
		updates["reg_points"] = *req.RegPoints
	}
	if req.TrialDuration != nil {
		updates["trial_duration"] = *req.TrialDuration
	}
	if req.TrialPoints != nil {
		updates["trial_points"] = *req.TrialPoints
	}
	if req.TrialLimit != nil {
		updates["trial_limit"] = *req.TrialLimit
	}
	if req.SDKLogEnabled != nil {
		updates["sdk_log_enabled"] = *req.SDKLogEnabled
	}
	if req.Maintenance != nil {
		updates["maintenance"] = *req.Maintenance
		// 开启维护模式时踢掉所有在线会话
		if *req.Maintenance == 1 {
			database.DB.Where("app_id = ?", app.ID).Delete(&models.OnlineSession{})
		}
	}

	if err := database.DB.Model(&app).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}

	// 清除应用缓存
	if cache.Enabled {
		cache.Del("app:" + app.AppCode)
		cache.ClearSDKCache(app.ID, "appinfo")
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func DeleteUserApp(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", id, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "APP不存在"})
		return
	}

	// 级联删除关联数据
	deleteAppRelatedData(app.ID)

	// 删除应用
	database.DB.Delete(&app)

	// 清除应用缓存
	if cache.Enabled {
		cache.Del("app:" + app.AppCode)
		cache.ClearAllSDKCache(app.ID)
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 删除应用关联的所有数据
func deleteAppRelatedData(appID uint) {
	// 获取应用下所有用户ID
	var appUserIDs []uint
	database.DB.Model(&models.AppUser{}).Where("app_id = ?", appID).Pluck("id", &appUserIDs)

	if len(appUserIDs) > 0 {
		// 删除用户标识
		database.DB.Where("app_user_id IN ?", appUserIDs).Delete(&models.AppUserData{})
		// 删除用户特征码
		database.DB.Where("app_user_id IN ?", appUserIDs).Delete(&models.AppUserDevice{})
	}

	// 删除应用用户
	database.DB.Where("app_id = ?", appID).Delete(&models.AppUser{})
	// 删除卡号
	database.DB.Where("app_id = ?", appID).Delete(&models.Card{})
	// 删除卡种
	database.DB.Where("app_id = ?", appID).Delete(&models.CardType{})
	// 删除版本
	database.DB.Where("app_id = ?", appID).Delete(&models.AppVersion{})
	// 删除在线会话
	database.DB.Where("app_id = ?", appID).Delete(&models.OnlineSession{})
	// 删除SDK接口日志
	database.DB.Where("app_id = ?", appID).Delete(&models.SDKInterfaceLog{})
	// 删除代理
	database.DB.Where("app_id = ?", appID).Delete(&models.Agent{})
	// 删除数据池及数据项
	var dataPoolIDs []uint
	database.DB.Model(&models.DataPool{}).Where("app_id = ?", appID).Pluck("id", &dataPoolIDs)
	if len(dataPoolIDs) > 0 {
		database.DB.Where("data_pool_id IN ?", dataPoolIDs).Delete(&models.DataItem{})
	}
	database.DB.Where("app_id = ?", appID).Delete(&models.DataPool{})
	// 删除授权证书
	database.DB.Where("app_id = ?", appID).Delete(&models.License{})

}

func ResetUserAppSecret(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", id, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "APP不存在"})
		return
	}

	newSecret := generateKey(16)
	if err := database.DB.Model(&app).Update("app_secret", newSecret).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "重置失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"app_secret": newSecret}})
}

// 管理员APP管理
func AdminListApps(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	keyword := c.Query("keyword")
	userID := c.Query("user_id")

	var apps []models.App
	var total int64

	query := database.DB.Model(&models.App{}).Preload("User")
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("app_name LIKE ? OR app_key LIKE ?", kw, kw)
	}
	if userID != "" {
		query = query.Where("user_id = ?", userID)
	}

	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&apps)

	appStats := make([]appWithStats, 0, len(apps))
	for _, app := range apps {
		item := appWithStats{App: app}
		database.DB.Model(&models.AppUser{}).Where("app_id = ?", app.ID).Count(&item.UserCount)
		database.DB.Model(&models.OnlineSession{}).Where("app_id = ?", app.ID).Distinct("app_user_id").Count(&item.OnlineCount)
		database.DB.Model(&models.OnlineSession{}).Where("app_id = ?", app.ID).Count(&item.OnlineClientCount)
		appStats = append(appStats, item)
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"list":  appStats,
			"total": total,
		},
	})
}

func AdminResetAppSecret(c *gin.Context) {
	id := c.Param("id")

	var app models.App
	if err := database.DB.First(&app, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "APP不存在"})
		return
	}

	newSecret := generateKey(16)
	if err := database.DB.Model(&app).Update("app_secret", newSecret).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "重置失败"})
		return
	}
	if cache.Enabled {
		cache.Del("app:" + app.AppCode)
		cache.Del(fmt.Sprintf("fw:config:%d", app.ID))
		cache.ClearAllSDKCache(app.ID)
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"app_secret": newSecret}})
}

func AdminUpdateApp(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		AppName        string            `json:"app_name"`
		Description    string            `json:"description"`
		LoginMode      *int              `json:"login_mode"`
		BillingMode    *int              `json:"billing_mode"`
		Heartbeat      *int              `json:"heartbeat"`
		CryptoMode     string            `json:"crypto_mode"`
		AppSecret      string            `json:"app_secret"`
		SignAlgo       string            `json:"sign_algo"`
		ServerSignAlgo string            `json:"server_sign_algo"`
		CustomFields   *[]appCustomField `json:"custom_fields"`
		BindDevice     *int              `json:"bind_device"`
		ChannelMode    *int              `json:"channel_mode"`
		LoginKick      *int              `json:"login_kick"`
		RegMode        *int              `json:"reg_mode"`
		RegLimit       *int              `json:"reg_limit"`
		RegChannels    *int              `json:"reg_channels"`
		RegFeatures    *int              `json:"reg_features"`
		RegDuration    *int              `json:"reg_duration"`
		RegPoints      *int              `json:"reg_points"`
		TrialDuration  *int              `json:"trial_duration"`
		TrialPoints    *int              `json:"trial_points"`
		TrialLimit     *int              `json:"trial_limit"`
		Maintenance    *int              `json:"maintenance"`
		SDKLogEnabled  *int              `json:"sdk_log_enabled"`
		Status         *int              `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.AppName != "" {
		updates["app_name"] = req.AppName
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.LoginMode != nil && *req.LoginMode >= 1 && *req.LoginMode <= 3 {
		updates["login_mode"] = *req.LoginMode
	}
	if req.BillingMode != nil && *req.BillingMode >= 1 && *req.BillingMode <= 3 {
		updates["billing_mode"] = *req.BillingMode
	}
	if req.Heartbeat != nil && *req.Heartbeat >= 10 {
		updates["heartbeat"] = *req.Heartbeat
	}
	if req.CryptoMode != "" {
		updates["crypto_mode"] = req.CryptoMode
	}
	if req.AppSecret != "" {
		updates["app_secret"] = req.AppSecret
	}
	if req.SignAlgo != "" {
		updates["sign_algo"] = req.SignAlgo
	}
	if req.ServerSignAlgo != "" {
		updates["server_sign_algo"] = req.ServerSignAlgo
	}
	if req.CustomFields != nil {
		customFields, err := normalizeAppCustomFields(*req.CustomFields)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
			return
		}
		updates["custom_fields"] = customFields
	}
	if req.BindDevice != nil {
		updates["bind_device"] = *req.BindDevice
	}
	if req.ChannelMode != nil && *req.ChannelMode >= 1 && *req.ChannelMode <= 2 {
		updates["channel_mode"] = *req.ChannelMode
	}
	if req.LoginKick != nil {
		updates["login_kick"] = *req.LoginKick
	}
	if req.RegMode != nil && *req.RegMode >= 1 && *req.RegMode <= 4 {
		updates["reg_mode"] = *req.RegMode
	}
	if req.RegLimit != nil && *req.RegLimit >= 1 {
		updates["reg_limit"] = *req.RegLimit
	}
	if req.RegChannels != nil {
		updates["reg_channels"] = *req.RegChannels
	}
	if req.RegFeatures != nil {
		updates["reg_features"] = *req.RegFeatures
	}
	if req.RegDuration != nil {
		updates["reg_duration"] = *req.RegDuration
	}
	if req.RegPoints != nil {
		updates["reg_points"] = *req.RegPoints
	}
	if req.TrialDuration != nil {
		updates["trial_duration"] = *req.TrialDuration
	}
	if req.TrialPoints != nil {
		updates["trial_points"] = *req.TrialPoints
	}
	if req.TrialLimit != nil {
		updates["trial_limit"] = *req.TrialLimit
	}
	if req.Maintenance != nil {
		updates["maintenance"] = *req.Maintenance
		if *req.Maintenance == 1 {
			appIDUint, _ := strconv.ParseUint(id, 10, 32)
			database.DB.Where("app_id = ?", uint(appIDUint)).Delete(&models.OnlineSession{})
		}
	}
	if req.SDKLogEnabled != nil {
		updates["sdk_log_enabled"] = *req.SDKLogEnabled
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}

	if err := database.DB.Model(&models.App{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}

	// 清除应用缓存
	if cache.Enabled {
		var updatedApp models.App
		if database.DB.First(&updatedApp, id).Error == nil {
			cache.Del("app:" + updatedApp.AppCode)
			cache.Del(fmt.Sprintf("fw:config:%d", updatedApp.ID))
			cache.ClearSDKCache(updatedApp.ID, "appinfo")
		}
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func AdminDeleteApp(c *gin.Context) {
	id := c.Param("id")

	appID, _ := strconv.ParseUint(id, 10, 32)

	// 清除缓存（删除前获取 AppCode）
	if cache.Enabled {
		var app models.App
		if database.DB.First(&app, id).Error == nil {
			cache.Del("app:" + app.AppCode)
			cache.Del(fmt.Sprintf("fw:config:%d", app.ID))
			cache.ClearAllSDKCache(app.ID)
		}
	}

	// 级联删除关联数据
	deleteAppRelatedData(uint(appID))

	if err := database.DB.Delete(&models.App{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}
