package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// 所有可用权限。新增开放 API 时先在这里登记权限，再在 openApiAuth 中传入对应权限码。
var validPermissions = map[string]string{
	"apps:list":      "查询应用列表",
	"apps:get":       "查询指定应用",
	"apps:create":    "新增应用",
	"apps:update":    "编辑应用",
	"cardtypes:list": "查询卡种列表",
	"cardtypes:get":  "查询指定卡种",
	"cardtypes:create": "新增卡种",
	"cardtypes:update": "编辑卡种",
	"cards:list":     "查询卡号列表",
	"cards:get":      "查询指定卡号",
	"cards:create":   "新增卡号",
	"cards:update":   "编辑卡号",
	"users:list":     "查询用户列表",
	"users:get":      "查询指定用户",
	"users:create":   "新增用户",
	"users:update":   "编辑用户",
}

func generateOpenApiKey() string {
	// 开放 API Key 只展示给作者使用，调用方通过 X-Api-Key 或 api_key 传入。
	b := make([]byte, 32)
	rand.Read(b)
	return "osk_" + hex.EncodeToString(b)
}

// ========== 作者端密钥管理 ==========
// 以下接口给作者后台管理自己的 Open API Key，不是第三方调用入口。

func ListOpenApiKeys(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var keys []models.OpenApiKey
	database.DB.Where("user_id = ?", user.ID).Order("id desc").Find(&keys)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": keys})
}

func GetOpenApiPermissions(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": validPermissions})
}

func CreateOpenApiKey(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		Name        string   `json:"name" binding:"required"`
		Permissions []string `json:"permissions" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 验证权限，防止前端传入未定义权限后绕过后续权限判断。
	for _, p := range req.Permissions {
		if _, ok := validPermissions[p]; !ok {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "无效的权限: " + p})
			return
		}
	}

	key := &models.OpenApiKey{
		UserID:      user.ID,
		Name:        req.Name,
		SecretKey:   generateOpenApiKey(),
		Permissions: strings.Join(req.Permissions, ","),
		Status:      1,
	}
	database.DB.Create(key)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": key})
}

func UpdateOpenApiKey(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var key models.OpenApiKey
	if err := database.DB.Where("id = ? AND user_id = ?", id, user.ID).First(&key).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "密钥不存在"})
		return
	}

	var req struct {
		Name        *string  `json:"name"`
		Permissions []string `json:"permissions"`
		Status      *int     `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Permissions != nil {
		for _, p := range req.Permissions {
			if _, ok := validPermissions[p]; !ok {
				c.JSON(http.StatusOK, gin.H{"code": 1, "message": "无效的权限: " + p})
				return
			}
		}
		updates["permissions"] = strings.Join(req.Permissions, ",")
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}

	database.DB.Model(&key).Updates(updates)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func DeleteOpenApiKey(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var key models.OpenApiKey
	if err := database.DB.Where("id = ? AND user_id = ?", id, user.ID).First(&key).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "密钥不存在"})
		return
	}
	database.DB.Delete(&key)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

func ResetOpenApiKey(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var key models.OpenApiKey
	if err := database.DB.Where("id = ? AND user_id = ?", id, user.ID).First(&key).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "密钥不存在"})
		return
	}

	newSecret := generateOpenApiKey()
	database.DB.Model(&key).Update("secret_key", newSecret)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"secret_key": newSecret}})
}

// ========== 开放API接口 ==========
// 第三方系统调用这些接口时，每个 handler 第一行都应调用 openApiAuth 做密钥和权限校验。

// 验证密钥并检查权限
func openApiAuth(c *gin.Context, permission string) (*models.OpenApiKey, *models.User, bool) {
	// 推荐使用 Header: X-Api-Key；query api_key 主要方便低代码工具或调试。
	secretKey := c.GetHeader("X-Api-Key")
	if secretKey == "" {
		secretKey = c.Query("api_key")
	}
	if secretKey == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "缺少API密钥"})
		return nil, nil, false
	}

	var key models.OpenApiKey
	if err := database.DB.Where("secret_key = ? AND status = 1", secretKey).First(&key).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "API密钥无效或已禁用"})
		return nil, nil, false
	}

	// 检查权限。Permissions 在数据库中以英文逗号拼接存储。
	perms := strings.Split(key.Permissions, ",")
	hasPermission := false
	for _, p := range perms {
		if p == permission {
			hasPermission = true
			break
		}
	}
	if !hasPermission {
		c.JSON(http.StatusForbidden, gin.H{"code": 403, "message": "无此接口权限"})
		return nil, nil, false
	}

	// 获取密钥所属作者，后续所有查询都必须限制在该作者名下。
	var user models.User
	if err := database.DB.First(&user, key.UserID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "用户不存在"})
		return nil, nil, false
	}

	// 更新最后使用时间，便于后台判断密钥是否仍在使用。
	now := time.Now()
	database.DB.Model(&key).Update("last_used_at", &now)

	return &key, &user, true
}

// ========== 辅助函数：通过app_code查找属于该用户的应用 ==========
func openApiFindApp(user *models.User, appCode string) (*models.App, error) {
	// 开放 API 尽量使用 app_code 定位应用，避免暴露作者后台内部自增 ID。
	var app models.App
	if err := database.DB.Where("app_code = ? AND user_id = ?", appCode, user.ID).First(&app).Error; err != nil {
		return nil, fmt.Errorf("应用不存在")
	}
	return &app, nil
}

const openApiMaxListPageSize = 100

// openApiListPagination 统一列表分页：page>=1，每页条数 1～openApiMaxListPageSize（默认 20）。
func openApiListPagination(c *gin.Context) (page, size int) {
	page, _ = strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ = strconv.Atoi(c.DefaultQuery("size", "20"))
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 20
	}
	if size > openApiMaxListPageSize {
		size = openApiMaxListPageSize
	}
	return page, size
}

// 查询应用列表
func OpenApiListApps(c *gin.Context) {
	// 列表接口统一返回 list + total，page/size 由 openApiListPagination 规范化。
	_, user, ok := openApiAuth(c, "apps:list")
	if !ok {
		return
	}

	page, size := openApiListPagination(c)

	var apps []models.App
	var total int64
	query := database.DB.Model(&models.App{}).Where("user_id = ?", user.ID)
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&apps)

	list := make([]gin.H, 0, len(apps))
	for _, a := range apps {
		list = append(list, gin.H{
			"id":           a.ID,
			"app_name":     a.AppName,
			"app_key":      a.AppKey,
			"app_code":     a.AppCode,
			"description":  a.Description,
			"login_mode":   a.LoginMode,
			"billing_mode": a.BillingMode,
			"status":       a.Status,
			"created_at":   a.CreatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 新增应用
func OpenApiCreateApp(c *gin.Context) {
	_, user, ok := openApiAuth(c, "apps:create")
	if !ok {
		return
	}

	var req struct {
		AppName        string `json:"app_name" binding:"required"`
		Description    string `json:"description"`
		LoginMode      int    `json:"login_mode"`
		BillingMode    int    `json:"billing_mode"`
		Heartbeat      int    `json:"heartbeat"`
		CryptoMode     string `json:"crypto_mode"`
		AppSecret      string `json:"app_secret"`
		SignAlgo       string `json:"sign_algo"`
		ServerSignAlgo string `json:"server_sign_algo"`
		BindDevice     int    `json:"bind_device"`
		ChannelMode    int    `json:"channel_mode"`
		LoginKick      int    `json:"login_kick"`
		RegMode        int    `json:"reg_mode"`
		RegLimit       int    `json:"reg_limit"`
		RegChannels    int    `json:"reg_channels"`
		RegFeatures    int    `json:"reg_features"`
		RegDuration    int    `json:"reg_duration"`
		RegPoints      int    `json:"reg_points"`
		TrialDuration  int    `json:"trial_duration"`
		TrialPoints    int    `json:"trial_points"`
		TrialLimit     int    `json:"trial_limit"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 检查应用数量限制（-1 表示无限制），与作者后台创建应用保持同一套配额规则。
	var appCount int64
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Count(&appCount)
	maxApps, _, _, _ := getUserTotalQuota(user)
	if maxApps >= 0 && int(appCount) >= maxApps {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "已达到应用数量上限"})
		return
	}

	// 默认值处理（与作者后台一致）。外部调用可只传必要字段，服务端补齐默认策略。
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

	app := &models.App{
		UserID:         user.ID,
		AppName:        req.AppName,
		AppKey:         generateKey(16),
		AppCode:        generateAppCode(),
		AppSecret:      func() string { if req.AppSecret != "" { return req.AppSecret }; return generateKey(16) }(),
		Description:    req.Description,
		LoginMode:      loginMode,
		BillingMode:    billingMode,
		Heartbeat:      heartbeat,
		CryptoMode:     cryptoMode,
		SignAlgo:       req.SignAlgo,
		ServerSignAlgo: req.ServerSignAlgo,
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

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"app_code": app.AppCode}})
}

// 查询指定应用（通过id）
func OpenApiGetApp(c *gin.Context) {
	_, user, ok := openApiAuth(c, "apps:get")
	if !ok {
		return
	}

	id := c.Param("id")
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", id, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "应用不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{
		"id":           app.ID,
		"app_name":     app.AppName,
		"app_key":      app.AppKey,
		"app_code":     app.AppCode,
		"description":  app.Description,
		"login_mode":   app.LoginMode,
		"billing_mode": app.BillingMode,
		"heartbeat":    app.Heartbeat,
		"bind_device":  app.BindDevice,
		"channel_mode": app.ChannelMode,
		"reg_mode":     app.RegMode,
		"status":       app.Status,
		"created_at":   app.CreatedAt,
	}})
}

// 编辑应用（通过id）
func OpenApiUpdateApp(c *gin.Context) {
	_, user, ok := openApiAuth(c, "apps:update")
	if !ok {
		return
	}

	id := c.Param("id")
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", id, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "应用不存在"})
		return
	}

	var req struct {
		AppName        string `json:"app_name"`
		Description    string `json:"description"`
		LoginMode      *int   `json:"login_mode"`
		BillingMode    *int   `json:"billing_mode"`
		Heartbeat      *int   `json:"heartbeat"`
		CryptoMode     string `json:"crypto_mode"`
		AppSecret      string `json:"app_secret"`
		SignAlgo       string `json:"sign_algo"`
		ServerSignAlgo string `json:"server_sign_algo"`
		BindDevice     *int   `json:"bind_device"`
		ChannelMode    *int   `json:"channel_mode"`
		LoginKick      *int   `json:"login_kick"`
		RegMode        *int   `json:"reg_mode"`
		RegLimit       *int   `json:"reg_limit"`
		RegChannels    *int   `json:"reg_channels"`
		RegFeatures    *int   `json:"reg_features"`
		RegDuration    *int   `json:"reg_duration"`
		RegPoints      *int   `json:"reg_points"`
		TrialDuration  *int   `json:"trial_duration"`
		TrialPoints    *int   `json:"trial_points"`
		TrialLimit     *int   `json:"trial_limit"`
		Maintenance    *int   `json:"maintenance"`
		Status         *int   `json:"status"`
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
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}

	if len(updates) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
		return
	}
	if err := database.DB.Model(&app).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 查询卡种列表
func OpenApiListCardTypes(c *gin.Context) {
	_, user, ok := openApiAuth(c, "cardtypes:list")
	if !ok {
		return
	}

	appCode := c.Query("app_code")
	if appCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "需要app_code参数"})
		return
	}
	page, size := openApiListPagination(c)

	app, err := openApiFindApp(user, appCode)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": []interface{}{}, "total": 0}})
		return
	}
	appIDs := []uint{app.ID}
	if len(appIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": []interface{}{}, "total": 0}})
		return
	}

	var cardTypes []models.CardType
	var total int64
	query := database.DB.Model(&models.CardType{}).Preload("App").Where("app_id IN ?", appIDs)
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&cardTypes)

	list := make([]gin.H, 0, len(cardTypes))
	for _, ct := range cardTypes {
		item := gin.H{
			"id":         ct.ID,
			"name":       ct.Name,
			"prefix":     ct.Prefix,
			"card_length": ct.CardLength,
			"duration":   ct.Duration,
			"points":     ct.Points,
			"category":   ct.Category,
			"max_use":    ct.MaxUse,
			"channels":    ct.Channels,
			"features":    ct.Features,
			"created_at":  ct.CreatedAt,
		}
		if ct.App != nil {
			item["app_code"] = ct.App.AppCode
			item["app_name"] = ct.App.AppName
		}
		list = append(list, item)
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 新增卡种
func OpenApiCreateCardType(c *gin.Context) {
	_, user, ok := openApiAuth(c, "cardtypes:create")
	if !ok {
		return
	}

	var req struct {
		AppCode       string  `json:"app_code" binding:"required"`
		Name          string  `json:"name" binding:"required"`
		Category      int     `json:"category"`
		Prefix        string  `json:"prefix"`
		Points        int     `json:"points"`
		RebatePoints  int     `json:"rebate_points"`
		Duration      int     `json:"duration"`
		GenRule       int     `json:"gen_rule"`
		MaxUse        int     `json:"max_use"`
		MaxUserUse    int     `json:"max_user_use"`
		Channels      int     `json:"channels"`
		Features      int     `json:"features"`
		UnbindDay     int     `json:"unbind_day"`
		UnbindWeek    int     `json:"unbind_week"`
		UnbindMonth   int     `json:"unbind_month"`
		UnbindHalfY   int     `json:"unbind_halfy"`
		UnbindYear    int     `json:"unbind_year"`
		UnbindTotal   int     `json:"unbind_total"`
		CardLength    int     `json:"card_length"`
		ExtraData     string  `json:"extra_data"`
		Remark        string  `json:"remark"`
		WithdrawPrice float64 `json:"withdraw_price"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	app, err := openApiFindApp(user, req.AppCode)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}

	// 检查卡种数量限制（用户名下所有应用的卡种总数，-1表示无限制）
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)
	var cardTypeCount int64
	if len(appIDs) > 0 {
		database.DB.Model(&models.CardType{}).Where("app_id IN ?", appIDs).Count(&cardTypeCount)
	}
	_, _, maxCardTypes, _ := getUserTotalQuota(user)
	if maxCardTypes >= 0 && int(cardTypeCount) >= maxCardTypes {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "已达到卡种数量上限"})
		return
	}

	cardType := &models.CardType{
		AppID:         app.ID,
		Name:          req.Name,
		Category:      getIntOrDefault(req.Category, 1),
		Prefix:        req.Prefix,
		Points:        req.Points,
		RebatePoints:  req.RebatePoints,
		Duration:      req.Duration,
		GenRule:       getIntOrDefault(req.GenRule, 1),
		MaxUse:        getIntOrDefault(req.MaxUse, 1),
		MaxUserUse:    getIntOrDefault(req.MaxUserUse, 1),
		Channels:      getIntOrDefault(req.Channels, 1),
		Features:      getIntOrDefault(req.Features, 1),
		UnbindDay:     getIntOrDefault(req.UnbindDay, -1),
		UnbindWeek:    getIntOrDefault(req.UnbindWeek, -1),
		UnbindMonth:   getIntOrDefault(req.UnbindMonth, -1),
		UnbindHalfY:   getIntOrDefault(req.UnbindHalfY, -1),
		UnbindYear:    getIntOrDefault(req.UnbindYear, -1),
		UnbindTotal:   getIntOrDefault(req.UnbindTotal, -1),
		CardLength:    getIntOrDefault(req.CardLength, 16),
		ExtraData:     req.ExtraData,
		Remark:        req.Remark,
		WithdrawPrice: req.WithdrawPrice,
	}
	if cardType.CardLength < 12 {
		cardType.CardLength = 12
	}

	if err := database.DB.Create(cardType).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "创建成功"})
}

// 查询指定卡种（通过app_code + name）
func OpenApiGetCardType(c *gin.Context) {
	_, user, ok := openApiAuth(c, "cardtypes:get")
	if !ok {
		return
	}

	appCode := c.Query("app_code")
	name := c.Query("name")
	if appCode == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "需要app_code和name参数"})
		return
	}

	app, err := openApiFindApp(user, appCode)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "应用不存在"})
		return
	}

	var ct models.CardType
	if err := database.DB.Where("app_id = ? AND name = ?", app.ID, name).First(&ct).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "卡种不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{
		"id":          ct.ID,
		"name":        ct.Name,
		"prefix":      ct.Prefix,
		"card_length": ct.CardLength,
		"duration":    ct.Duration,
		"points":      ct.Points,
		"rebate_points": ct.RebatePoints,
		"category":    ct.Category,
		"max_use":     ct.MaxUse,
		"channels":    ct.Channels,
		"features":    ct.Features,
		"created_at":  ct.CreatedAt,
		"app_code":    app.AppCode,
		"app_name":    app.AppName,
	}})
}

// 编辑卡种（通过id）
func OpenApiUpdateCardType(c *gin.Context) {
	_, user, ok := openApiAuth(c, "cardtypes:update")
	if !ok {
		return
	}

	id := c.Param("id")
	var ct models.CardType
	if err := database.DB.First(&ct, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "卡种不存在"})
		return
	}
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", ct.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Name          *string  `json:"name"`
		Category      *int     `json:"category"`
		Prefix        *string  `json:"prefix"`
		Points        *int     `json:"points"`
		RebatePoints  *int     `json:"rebate_points"`
		Duration      *int     `json:"duration"`
		GenRule       *int     `json:"gen_rule"`
		MaxUse        *int     `json:"max_use"`
		MaxUserUse    *int     `json:"max_user_use"`
		Channels      *int     `json:"channels"`
		Features      *int     `json:"features"`
		UnbindDay     *int     `json:"unbind_day"`
		UnbindWeek    *int     `json:"unbind_week"`
		UnbindMonth   *int     `json:"unbind_month"`
		UnbindHalfY   *int     `json:"unbind_halfy"`
		UnbindYear    *int     `json:"unbind_year"`
		UnbindTotal   *int     `json:"unbind_total"`
		CardLength    *int     `json:"card_length"`
		ExtraData     *string  `json:"extra_data"`
		Remark        *string  `json:"remark"`
		WithdrawPrice *float64 `json:"withdraw_price"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Category != nil {
		updates["category"] = *req.Category
	}
	if req.Prefix != nil {
		updates["prefix"] = *req.Prefix
	}
	if req.Points != nil {
		updates["points"] = *req.Points
	}
	if req.RebatePoints != nil {
		updates["rebate_points"] = *req.RebatePoints
	}
	if req.Duration != nil {
		updates["duration"] = *req.Duration
	}
	if req.GenRule != nil {
		updates["gen_rule"] = *req.GenRule
	}
	if req.MaxUse != nil {
		updates["max_use"] = *req.MaxUse
	}
	if req.MaxUserUse != nil {
		updates["max_user_use"] = *req.MaxUserUse
	}
	if req.Channels != nil {
		updates["channels"] = *req.Channels
	}
	if req.Features != nil {
		updates["features"] = *req.Features
	}
	if req.UnbindDay != nil {
		updates["unbind_day"] = *req.UnbindDay
	}
	if req.UnbindWeek != nil {
		updates["unbind_week"] = *req.UnbindWeek
	}
	if req.UnbindMonth != nil {
		updates["unbind_month"] = *req.UnbindMonth
	}
	if req.UnbindHalfY != nil {
		updates["unbind_half_y"] = *req.UnbindHalfY
	}
	if req.UnbindYear != nil {
		updates["unbind_year"] = *req.UnbindYear
	}
	if req.UnbindTotal != nil {
		updates["unbind_total"] = *req.UnbindTotal
	}
	if req.CardLength != nil {
		length := *req.CardLength
		if length < 12 {
			length = 12
		}
		updates["card_length"] = length
	}
	if req.ExtraData != nil {
		updates["extra_data"] = *req.ExtraData
	}
	if req.Remark != nil {
		updates["remark"] = *req.Remark
	}
	if req.WithdrawPrice != nil {
		updates["withdraw_price"] = *req.WithdrawPrice
	}

	if len(updates) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
		return
	}
	if err := database.DB.Model(&ct).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 查询卡号列表
func OpenApiListCards(c *gin.Context) {
	_, user, ok := openApiAuth(c, "cards:list")
	if !ok {
		return
	}

	appCode := c.Query("app_code")
	if appCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "需要app_code参数"})
		return
	}
	status := c.Query("status")
	keyword := c.Query("keyword")
	page, size := openApiListPagination(c)

	app, err := openApiFindApp(user, appCode)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": []interface{}{}, "total": 0}})
		return
	}
	appIDs := []uint{app.ID}
	if len(appIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": []interface{}{}, "total": 0}})
		return
	}

	var cards []models.Card
	var total int64
	query := database.DB.Model(&models.Card{}).Preload("CardType").Preload("CardType.App").Where("app_id IN ?", appIDs)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("card_no LIKE ?", kw)
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&cards)

	list := make([]gin.H, 0, len(cards))
	for _, card := range cards {
		item := gin.H{
			"id":         card.ID,
			"card_no":    card.CardNo,
			"status":     card.Status,
			"used_count": card.UsedCount,
			"batch_no":   card.BatchNo,
			"remark":     card.Remark,
			"used_at":    card.UsedAt,
			"created_at": card.CreatedAt,
		}
		if card.CardType != nil {
			item["card_type_name"] = card.CardType.Name
			if card.CardType.App != nil {
				item["app_code"] = card.CardType.App.AppCode
			}
		}
		list = append(list, item)
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 新增卡号（单个）
func OpenApiCreateCard(c *gin.Context) {
	_, user, ok := openApiAuth(c, "cards:create")
	if !ok {
		return
	}

	var req struct {
		AppCode      string `json:"app_code" binding:"required"`
		CardTypeName string `json:"card_type_name" binding:"required"`
		CardNo       string `json:"card_no" binding:"required"`
		BatchNo      string `json:"batch_no"`
		Status       int    `json:"status"`
		Remark       string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	app, err := openApiFindApp(user, req.AppCode)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}

	var ct models.CardType
	if err := database.DB.Where("app_id = ? AND name = ?", app.ID, req.CardTypeName).First(&ct).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "卡种不存在"})
		return
	}

	// 检查卡号数量限制（用户名下所有应用的卡号总数，-1表示无限制）
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)
	var cardCount int64
	if len(appIDs) > 0 {
		database.DB.Model(&models.Card{}).Where("app_id IN ?", appIDs).Count(&cardCount)
	}
	_, _, _, maxCards := getUserTotalQuota(user)
	if maxCards >= 0 && int(cardCount)+1 > maxCards {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": fmt.Sprintf("已达到卡号数量上限，当前%d张，最多%d张", cardCount, maxCards)})
		return
	}

	// 卡号唯一校验
	var existing int64
	database.DB.Model(&models.Card{}).Where("card_no = ?", req.CardNo).Count(&existing)
	if existing > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "卡号已存在"})
		return
	}

	batchNo := req.BatchNo
	if batchNo == "" {
		batchNo = "manual"
	}
	status := req.Status
	if status == 0 {
		status = 1
	}

	card := &models.Card{
		AppID:      app.ID,
		CardTypeID: ct.ID,
		CardNo:     req.CardNo,
		BatchNo:    batchNo,
		Status:     status,
		Remark:     req.Remark,
	}
	if err := database.DB.Create(card).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "创建成功"})
}

// 查询指定卡号（通过卡号字符串）
func OpenApiGetCard(c *gin.Context) {
	_, user, ok := openApiAuth(c, "cards:get")
	if !ok {
		return
	}

	appCode := c.Query("app_code")
	if appCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "需要app_code参数"})
		return
	}
	app, err := openApiFindApp(user, appCode)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "应用不存在"})
		return
	}

	cardNo := c.Param("card_no")
	var card models.Card
	if err := database.DB.Preload("CardType").Where("app_id = ? AND card_no = ?", app.ID, cardNo).First(&card).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "卡号不存在"})
		return
	}

	data := gin.H{
		"id":         card.ID,
		"card_no":    card.CardNo,
		"status":     card.Status,
		"used_count": card.UsedCount,
		"batch_no":   card.BatchNo,
		"remark":     card.Remark,
		"used_at":    card.UsedAt,
		"created_at": card.CreatedAt,
		"app_code":   app.AppCode,
	}
	if card.CardType != nil {
		data["card_type_name"] = card.CardType.Name
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

// 编辑卡号（通过id）
func OpenApiUpdateCard(c *gin.Context) {
	_, user, ok := openApiAuth(c, "cards:update")
	if !ok {
		return
	}

	id := c.Param("id")
	var card models.Card
	if err := database.DB.First(&card, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "卡号不存在"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", card.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Status  *int    `json:"status"`
		BatchNo *string `json:"batch_no"`
		Remark  *string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.BatchNo != nil {
		updates["batch_no"] = *req.BatchNo
	}
	if req.Remark != nil {
		updates["remark"] = *req.Remark
	}

	if len(updates) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
		return
	}
	if err := database.DB.Model(&card).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 查询用户列表
func OpenApiListUsers(c *gin.Context) {
	_, user, ok := openApiAuth(c, "users:list")
	if !ok {
		return
	}

	appCode := c.Query("app_code")
	if appCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "需要app_code参数"})
		return
	}
	keyword := c.Query("keyword")
	status := c.Query("status")
	page, size := openApiListPagination(c)

	app, err := openApiFindApp(user, appCode)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": []interface{}{}, "total": 0}})
		return
	}
	appIDs := []uint{app.ID}
	if len(appIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": []interface{}{}, "total": 0}})
		return
	}

	var appUsers []models.AppUser
	var total int64
	query := database.DB.Model(&models.AppUser{}).Preload("App").Where("app_id IN ?", appIDs)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("username LIKE ? OR qq LIKE ? OR phone LIKE ? OR email LIKE ?", kw, kw, kw, kw)
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&appUsers)

	list := make([]gin.H, 0, len(appUsers))
	for _, u := range appUsers {
		item := gin.H{
			"id":          u.ID,
			"username":    u.Username,
			"status":      u.Status,
			"is_paid":     u.IsPaid,
			"is_tester":   u.IsTester,
			"expire_at":   u.ExpireAt,
			"points":      u.Points,
			"channels":    u.Channels,
			"features":    u.Features,
			"qq":          u.QQ,
			"phone":       u.Phone,
			"email":       u.Email,
			"cloud_data":  u.CloudData,
			"created_at":  u.CreatedAt,
		}
		if u.App != nil {
			item["app_code"] = u.App.AppCode
			item["app_name"] = u.App.AppName
		}
		list = append(list, item)
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 查询指定用户（通过app_code + username）
func OpenApiGetUser(c *gin.Context) {
	_, user, ok := openApiAuth(c, "users:get")
	if !ok {
		return
	}

	appCode := c.Query("app_code")
	username := c.Query("username")
	if appCode == "" || username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "需要app_code和username参数"})
		return
	}

	app, err := openApiFindApp(user, appCode)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "应用不存在"})
		return
	}

	var appUser models.AppUser
	if err := database.DB.Where("app_id = ? AND username = ?", app.ID, username).First(&appUser).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{
		"id":            appUser.ID,
		"username":      appUser.Username,
		"status":        appUser.Status,
		"is_paid":       appUser.IsPaid,
		"is_tester":     appUser.IsTester,
		"is_card_user":  appUser.IsCardUser,
		"is_trial":      appUser.IsTrial,
		"expire_at":     appUser.ExpireAt,
		"points":        appUser.Points,
		"rebate_points": appUser.RebatePoints,
		"channels":      appUser.Channels,
		"features":      appUser.Features,
		"invite_code":   appUser.InviteCode,
		"invite_count":  appUser.InviteCount,
		"qq":            appUser.QQ,
		"wechat":        appUser.Wechat,
		"phone":         appUser.Phone,
		"email":         appUser.Email,
		"reg_ip":        appUser.RegIP,
		"created_at":    appUser.CreatedAt,
		"app_code":      app.AppCode,
		"app_name":      app.AppName,
	}})
}

// 新增用户（软件用户 / AppUser）
func OpenApiCreateUser(c *gin.Context) {
	_, user, ok := openApiAuth(c, "users:create")
	if !ok {
		return
	}

	var req struct {
		AppCode   string `json:"app_code" binding:"required"`
		Username  string `json:"username" binding:"required"`
		Password  string `json:"password" binding:"required"`
		Status    int    `json:"status"`
		IsPaid    int    `json:"is_paid"`
		IsTester  int    `json:"is_tester"`
		ExpireAt  string `json:"expire_at"`
		Points    int    `json:"points"`
		Channels  int    `json:"channels"`
		Features  int    `json:"features"`
		ExtraData string `json:"extra_data"`
		CloudData string `json:"cloud_data"`
		QQ        string `json:"qq"`
		Wechat    string `json:"wechat"`
		Phone     string `json:"phone"`
		Email     string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	app, err := openApiFindApp(user, req.AppCode)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "应用不存在或无权访问"})
		return
	}

	// 检查用户数量限制（-1表示无限制）
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)
	var userCount int64
	if len(appIDs) > 0 {
		database.DB.Model(&models.AppUser{}).Where("app_id IN ?", appIDs).Count(&userCount)
	}
	_, maxUsers, _, _ := getUserTotalQuota(user)
	if maxUsers >= 0 && int(userCount) >= maxUsers {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "已达到用户数量上限"})
		return
	}

	// 检查用户名是否已存在（同一应用下唯一）
	var count int64
	database.DB.Model(&models.AppUser{}).Where("app_id = ? AND username = ?", app.ID, req.Username).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "用户名已存在"})
		return
	}

	hashedPwd, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	var expireAt *time.Time
	if req.ExpireAt != "" {
		t, err := parseTime(req.ExpireAt)
		if err == nil {
			expireAt = &t
		}
	}

	appUser := &models.AppUser{
		AppID:     app.ID,
		Username:  req.Username,
		Password:  string(hashedPwd),
		Status:    getIntOrDefault(req.Status, 1),
		IsPaid:    req.IsPaid,
		IsTester:  req.IsTester,
		ExpireAt:  expireAt,
		Points:    req.Points,
		Channels:  getIntOrDefault(req.Channels, 1),
		Features:  getIntOrDefault(req.Features, 1),
		ExtraData: req.ExtraData,
		CloudData: req.CloudData,
		QQ:        req.QQ,
		Wechat:    req.Wechat,
		Phone:     req.Phone,
		Email:     req.Email,
	}

	if err := database.DB.Create(appUser).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "创建成功"})
}

// 编辑用户（通过id）
func OpenApiUpdateUser(c *gin.Context) {
	_, user, ok := openApiAuth(c, "users:update")
	if !ok {
		return
	}

	id := c.Param("id")
	var appUser models.AppUser
	if err := database.DB.First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appUser.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Username  string  `json:"username"`
		Password  string  `json:"password"`
		Status    *int    `json:"status"`
		IsPaid    *int    `json:"is_paid"`
		IsTester  *int    `json:"is_tester"`
		ExpireAt  *string `json:"expire_at"`
		Points    *int    `json:"points"`
		Channels  *int    `json:"channels"`
		Features  *int    `json:"features"`
		ExtraData *string `json:"extra_data"`
		CloudData *string `json:"cloud_data"`
		QQ        *string `json:"qq"`
		Wechat    *string `json:"wechat"`
		Phone     *string `json:"phone"`
		Email     *string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Username != "" && req.Username != appUser.Username {
		var count int64
		database.DB.Model(&models.AppUser{}).Where("app_id = ? AND username = ? AND id != ?", app.ID, req.Username, appUser.ID).Count(&count)
		if count > 0 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "用户名已存在"})
			return
		}
		updates["username"] = req.Username
	}
	if req.Password != "" {
		hashedPwd, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		updates["password"] = string(hashedPwd)
	}
	if req.Status != nil {
		handleFreezeStatusChange(&appUser, *req.Status, updates)
		updates["status"] = *req.Status
	}
	if req.IsPaid != nil {
		updates["is_paid"] = *req.IsPaid
	}
	if req.IsTester != nil {
		updates["is_tester"] = *req.IsTester
	}
	if req.ExpireAt != nil {
		if *req.ExpireAt == "" {
			updates["expire_at"] = nil
		} else {
			t, err := parseTime(*req.ExpireAt)
			if err == nil {
				updates["expire_at"] = t
			}
		}
	}
	if req.Points != nil {
		updates["points"] = *req.Points
	}
	if req.Channels != nil {
		updates["channels"] = *req.Channels
	}
	if req.Features != nil {
		updates["features"] = *req.Features
	}
	if req.ExtraData != nil {
		updates["extra_data"] = *req.ExtraData
	}
	if req.CloudData != nil {
		updates["cloud_data"] = *req.CloudData
	}
	if req.QQ != nil {
		updates["qq"] = *req.QQ
	}
	if req.Wechat != nil {
		updates["wechat"] = *req.Wechat
	}
	if req.Phone != nil {
		updates["phone"] = *req.Phone
	}
	if req.Email != nil {
		updates["email"] = *req.Email
	}

	if len(updates) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
		return
	}
	if err := database.DB.Model(&appUser).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}
