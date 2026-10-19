package handlers

import (
	"errors"
	"fmt"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

const appUserAvatarBaseDir = "uploads/app-user-avatars"

func appUserAvatarExt(contentType string) (string, bool) {
	switch contentType {
	case "image/jpeg":
		return ".jpg", true
	case "image/png":
		return ".png", true
	case "image/gif":
		return ".gif", true
	case "image/webp":
		return ".webp", true
	default:
		return "", false
	}
}

func saveAppUserAvatar(c *gin.Context, appUser *models.AppUser) (string, error) {
	file, err := c.FormFile("file")
	if err != nil {
		return "", fmt.Errorf("请选择文件")
	}
	if file.Size > 2*1024*1024 {
		return "", fmt.Errorf("文件大小不能超过2MB")
	}
	ext, ok := appUserAvatarExt(file.Header.Get("Content-Type"))
	if !ok {
		return "", fmt.Errorf("只支持 JPG/PNG/GIF/WebP 格式")
	}

	dir := filepath.Join(appUserAvatarBaseDir, strconv.Itoa(int(appUser.AppID)), strconv.Itoa(int(appUser.ID)))
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("创建目录失败")
	}
	for _, oldExt := range []string{".jpg", ".png", ".gif", ".webp"} {
		_ = os.Remove(filepath.Join(dir, "avatar"+oldExt))
	}
	savePath := filepath.Join(dir, "avatar"+ext)
	if err := c.SaveUploadedFile(file, savePath); err != nil {
		return "", fmt.Errorf("保存失败")
	}
	return "/" + filepath.ToSlash(savePath), nil
}

// 用户软件用户管理 - 列表（按应用筛选）
func ListAppUsers(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	keyword := c.Query("keyword")
	appID := c.Query("app_id")
	filter := c.Query("filter") // 逗号分隔: paid,expired,unexpired

	var appUsers []models.AppUser
	var total int64

	// 获取用户的所有应用ID
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)

	if len(appIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": []models.AppUser{}, "total": 0}})
		return
	}

	query := database.DB.Model(&models.AppUser{}).Where("app_id IN ?", appIDs)

	if appID != "" {
		query = query.Where("app_id = ?", appID)
	}
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("username LIKE ? OR qq LIKE ? OR phone LIKE ? OR email LIKE ?",
			kw, kw, kw, kw)
	}

	// 多选过滤
	if filter != "" {
		filters := strings.Split(filter, ",")
		var conditions []string
		var args []interface{}
		for _, f := range filters {
			switch strings.TrimSpace(f) {
			case "paid":
				conditions = append(conditions, "is_paid = 1")
			case "free":
				conditions = append(conditions, "is_paid = 0")
			case "tester":
				conditions = append(conditions, "is_tester = 1")
			case "expired":
				conditions = append(conditions, "(expire_at IS NULL OR expire_at < ?)")
				args = append(args, time.Now())
			case "unexpired":
				conditions = append(conditions, "(expire_at IS NOT NULL AND expire_at >= ?)")
				args = append(args, time.Now())
			case "unlimited":
				conditions = append(conditions, "(expire_at IS NOT NULL AND expire_at >= '2099-01-01')")
			case "trial":
				conditions = append(conditions, "is_trial = 1")
			}
		}
		if len(conditions) > 0 {
			query = query.Where("("+strings.Join(conditions, " OR ")+")", args...)
		}
	}

	query.Count(&total)
	query.Preload("App").Offset((page - 1) * size).Limit(size).Order("id desc").Find(&appUsers)

	// 批量查询在线数量
	onlineMap := make(map[uint]int64)
	if len(appUsers) > 0 {
		var userIDs []uint
		for _, u := range appUsers {
			userIDs = append(userIDs, u.ID)
		}
		type OnlineCount struct {
			AppUserID uint  `json:"app_user_id"`
			Count     int64 `json:"count"`
		}
		var counts []OnlineCount
		database.DB.Model(&models.OnlineSession{}).
			Select("app_user_id, count(*) as count").
			Where("app_user_id IN ?", userIDs).
			Group("app_user_id").
			Find(&counts)
		for _, c := range counts {
			onlineMap[c.AppUserID] = c.Count
		}
	}

	type UserWithOnline struct {
		models.AppUser
		OnlineCount int64 `json:"online_count"`
	}
	result := make([]UserWithOnline, len(appUsers))
	for i, u := range appUsers {
		result[i] = UserWithOnline{AppUser: u, OnlineCount: onlineMap[u.ID]}
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{"list": result, "total": total},
	})
}

// 获取单个用户详情
func GetAppUser(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var appUser models.AppUser
	if err := database.DB.Preload("App").First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 检查应用是否属于当前用户
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appUser.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": appUser})
}

type riskReason struct {
	Type    string `json:"type"`
	Message string `json:"message"`
	Score   int    `json:"score"`
}

type riskUserItem struct {
	models.AppUser
	RiskScore  int          `json:"risk_score"`
	RiskLevel  string       `json:"risk_level"`
	Reasons    []riskReason `json:"reasons"`
	OnlineCount int64        `json:"online_count"`
	DeviceCount int64        `json:"device_count"`
	RecentIPCount int64      `json:"recent_ip_count"`
	Login1hCount int64       `json:"login_1h_count"`
	Unbind24hCount int64     `json:"unbind_24h_count"`
}

func riskLevel(score int) string {
	if score >= 80 {
		return "high"
	}
	if score >= 50 {
		return "medium"
	}
	if score >= 20 {
		return "low"
	}
	return "normal"
}

func calculateAppUserRisk(appUser models.AppUser) riskUserItem {
	now := time.Now()
	item := riskUserItem{AppUser: appUser}

	database.DB.Model(&models.OnlineSession{}).Where("app_user_id = ?", appUser.ID).Count(&item.OnlineCount)
	database.DB.Model(&models.AppUserDevice{}).Where("app_user_id = ?", appUser.ID).Count(&item.DeviceCount)
	database.DB.Model(&models.AppUserLog{}).
		Where("app_user_id = ? AND action = ? AND ip <> '' AND created_at >= ?", appUser.ID, "login", now.AddDate(0, 0, -7)).
		Distinct("ip").Count(&item.RecentIPCount)
	database.DB.Model(&models.AppUserLog{}).
		Where("app_user_id = ? AND action = ? AND created_at >= ?", appUser.ID, "login", now.Add(-time.Hour)).
		Count(&item.Login1hCount)
	database.DB.Model(&models.AppUserLog{}).
		Where("app_user_id = ? AND action = ? AND created_at >= ?", appUser.ID, "unbind", now.AddDate(0, 0, -1)).
		Count(&item.Unbind24hCount)

	addReason := func(reasonType, message string, score int) {
		item.RiskScore += score
		item.Reasons = append(item.Reasons, riskReason{Type: reasonType, Message: message, Score: score})
	}

	if item.RecentIPCount >= 10 {
		addReason("multi_ip", fmt.Sprintf("近7天出现 %d 个登录IP", item.RecentIPCount), 45)
	} else if item.RecentIPCount >= 5 {
		addReason("multi_ip", fmt.Sprintf("近7天出现 %d 个登录IP", item.RecentIPCount), 25)
	}

	featureLimit := int64(appUser.Features)
	if featureLimit < 1 {
		featureLimit = 1
	}
	if item.DeviceCount > featureLimit*2 {
		addReason("multi_device", fmt.Sprintf("绑定设备 %d 个，超过特征数限制 %d 的2倍", item.DeviceCount, featureLimit), 50)
	} else if item.DeviceCount > featureLimit {
		addReason("multi_device", fmt.Sprintf("绑定设备 %d 个，超过特征数限制 %d", item.DeviceCount, featureLimit), 30)
	}

	channelLimit := int64(appUser.Channels)
	if channelLimit < 1 {
		channelLimit = 1
	}
	if item.OnlineCount > channelLimit*2 {
		addReason("online_over_limit", fmt.Sprintf("在线会话 %d 个，超过通道数 %d 的2倍", item.OnlineCount, channelLimit), 45)
	} else if item.OnlineCount > channelLimit {
		addReason("online_over_limit", fmt.Sprintf("在线会话 %d 个，超过通道数 %d", item.OnlineCount, channelLimit), 25)
	}

	if item.Login1hCount >= 30 {
		addReason("frequent_login", fmt.Sprintf("最近1小时登录 %d 次", item.Login1hCount), 45)
	} else if item.Login1hCount >= 10 {
		addReason("frequent_login", fmt.Sprintf("最近1小时登录 %d 次", item.Login1hCount), 25)
	}

	if item.Unbind24hCount >= 8 {
		addReason("frequent_unbind", fmt.Sprintf("最近24小时解绑 %d 次", item.Unbind24hCount), 50)
	} else if item.Unbind24hCount >= 3 {
		addReason("frequent_unbind", fmt.Sprintf("最近24小时解绑 %d 次", item.Unbind24hCount), 30)
	}

	var blacklistHits int64
	database.DB.Model(&models.Blacklist{}).
		Where("app_id = ? AND type = 2 AND value IN (SELECT feature FROM app_user_devices WHERE app_user_id = ?) AND deleted_at IS NULL", appUser.AppID, appUser.ID).
		Count(&blacklistHits)
	if blacklistHits > 0 {
		addReason("blacklist_feature", "绑定特征码命中黑名单", 80)
	}

	item.RiskLevel = riskLevel(item.RiskScore)
	return item
}

func listRiskAppUsers(c *gin.Context, appIDs []uint) {
	level := c.Query("level")
	keyword := c.Query("keyword")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "12"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 12
	}

	query := database.DB.Model(&models.AppUser{}).Preload("App")
	if len(appIDs) > 0 {
		query = query.Where("app_id IN ?", appIDs)
	}
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("username LIKE ? OR qq LIKE ? OR phone LIKE ? OR email LIKE ?", kw, kw, kw, kw)
	}

	var users []models.AppUser
	query.Limit(500).Order("id desc").Find(&users)

	items := make([]riskUserItem, 0, len(users))
	for _, user := range users {
		item := calculateAppUserRisk(user)
		if item.RiskLevel == "normal" {
			continue
		}
		if level != "" && item.RiskLevel != level {
			continue
		}
		items = append(items, item)
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].RiskScore == items[j].RiskScore {
			return items[i].ID > items[j].ID
		}
		return items[i].RiskScore > items[j].RiskScore
	})

	total := len(items)
	start := (page - 1) * size
	if start > total {
		start = total
	}
	end := start + size
	if end > total {
		end = total
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": items[start:end], "total": total}})
}

func ListRiskAppUsers(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)
	if len(appIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": []riskUserItem{}, "total": 0}})
		return
	}
	listRiskAppUsers(c, appIDs)
}

func getAuthorRiskAppUser(c *gin.Context) (*models.AppUser, bool) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")
	var appUser models.AppUser
	if err := database.DB.Preload("App").First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户不存在"})
		return nil, false
	}
	if appUser.App == nil || appUser.App.UserID != user.ID {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "无权限"})
		return nil, false
	}
	return &appUser, true
}

func getAdminRiskAppUser(c *gin.Context) (*models.AppUser, bool) {
	id := c.Param("id")
	var appUser models.AppUser
	if err := database.DB.Preload("App").First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户不存在"})
		return nil, false
	}
	return &appUser, true
}

func disposeRiskAppUser(c *gin.Context, appUser *models.AppUser, action string) {
	now := time.Now()
	result := gin.H{}

	switch action {
	case "unbind_devices":
		r := database.DB.Where("app_user_id = ?", appUser.ID).Delete(&models.AppUserDevice{})
		result["devices"] = r.RowsAffected
	case "blacklist_ips":
		var ips []string
		database.DB.Model(&models.AppUserLog{}).
			Where("app_user_id = ? AND action = ? AND ip <> '' AND created_at >= ?", appUser.ID, "login", now.AddDate(0, 0, -7)).
			Distinct("ip").Limit(20).Pluck("ip", &ips)
		created := int64(0)
		for _, ip := range ips {
			var count int64
			database.DB.Model(&models.Blacklist{}).Where("app_id = ? AND type = ? AND value = ?", appUser.AppID, 1, ip).Count(&count)
			if count == 0 {
				database.DB.Create(&models.Blacklist{UserID: appUser.App.UserID, AppID: appUser.AppID, Type: 1, Value: ip, Remark: "风险用户处置自动拉黑"})
				created++
			}
		}
		result["ips"] = created
	case "blacklist_features":
		var devices []models.AppUserDevice
		database.DB.Where("app_user_id = ?", appUser.ID).Find(&devices)
		created := int64(0)
		for _, device := range devices {
			var count int64
			database.DB.Model(&models.Blacklist{}).Where("app_id = ? AND type = ? AND value = ?", appUser.AppID, 2, device.Feature).Count(&count)
			if count == 0 {
				database.DB.Create(&models.Blacklist{UserID: appUser.App.UserID, AppID: appUser.AppID, Type: 2, Value: device.Feature, Remark: "风险用户处置自动拉黑"})
				created++
			}
		}
		result["features"] = created
	case "full":
		sessions := database.DB.Where("app_user_id = ?", appUser.ID).Delete(&models.OnlineSession{})
		database.DB.Model(&models.AppUser{}).Where("id = ?", appUser.ID).Updates(map[string]interface{}{"status": 3, "frozen_at": now})
		var ips []string
		database.DB.Model(&models.AppUserLog{}).
			Where("app_user_id = ? AND action = ? AND ip <> '' AND created_at >= ?", appUser.ID, "login", now.AddDate(0, 0, -7)).
			Distinct("ip").Limit(20).Pluck("ip", &ips)
		createdIPs := int64(0)
		for _, ip := range ips {
			var count int64
			database.DB.Model(&models.Blacklist{}).Where("app_id = ? AND type = ? AND value = ?", appUser.AppID, 1, ip).Count(&count)
			if count == 0 {
				database.DB.Create(&models.Blacklist{UserID: appUser.App.UserID, AppID: appUser.AppID, Type: 1, Value: ip, Remark: "风险用户一键处置自动拉黑"})
				createdIPs++
			}
		}
		var devices []models.AppUserDevice
		database.DB.Where("app_user_id = ?", appUser.ID).Find(&devices)
		createdFeatures := int64(0)
		for _, device := range devices {
			var count int64
			database.DB.Model(&models.Blacklist{}).Where("app_id = ? AND type = ? AND value = ?", appUser.AppID, 2, device.Feature).Count(&count)
			if count == 0 {
				database.DB.Create(&models.Blacklist{UserID: appUser.App.UserID, AppID: appUser.AppID, Type: 2, Value: device.Feature, Remark: "风险用户一键处置自动拉黑"})
				createdFeatures++
			}
		}
		unbind := database.DB.Where("app_user_id = ?", appUser.ID).Delete(&models.AppUserDevice{})
		result["sessions"] = sessions.RowsAffected
		result["ips"] = createdIPs
		result["features"] = createdFeatures
		result["devices"] = unbind.RowsAffected
	default:
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "不支持的处置动作"})
		return
	}

	LogAppUserOperation(appUser.AppID, appUser.ID, "risk_dispose", "执行风险处置["+action+"]", c.ClientIP())
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "处置完成", "data": result})
}

func DisposeRiskAppUser(c *gin.Context) {
	appUser, ok := getAuthorRiskAppUser(c)
	if !ok {
		return
	}
	var req struct {
		Action string `json:"action" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	disposeRiskAppUser(c, appUser, req.Action)
}

func buildAppUserProfile(appUser models.AppUser) gin.H {
	var onlineSessions []models.OnlineSession
	database.DB.Where("app_user_id = ?", appUser.ID).Order("heartbeat_at desc").Limit(20).Find(&onlineSessions)

	var devices []models.AppUserDevice
	database.DB.Where("app_user_id = ?", appUser.ID).Order("id desc").Limit(20).Find(&devices)

	var logs []models.AppUserLog
	database.DB.Where("app_user_id = ?", appUser.ID).Order("id desc").Limit(30).Find(&logs)

	var lastLogin models.AppUserLog
	lastLoginResult := database.DB.Where("app_user_id = ? AND action = ?", appUser.ID, "login").Order("id desc").First(&lastLogin)

	var loginCount int64
	database.DB.Model(&models.AppUserLog{}).Where("app_user_id = ? AND action = ?", appUser.ID, "login").Count(&loginCount)

	var rechargeCount int64
	database.DB.Model(&models.AppUserLog{}).Where("app_user_id = ? AND action = ?", appUser.ID, "recharge").Count(&rechargeCount)

	var cardUseCount int64
	database.DB.Model(&models.CardUseLog{}).Where("app_user_id = ?", appUser.ID).Count(&cardUseCount)

	var deviceCount int64
	database.DB.Model(&models.AppUserDevice{}).Where("app_user_id = ?", appUser.ID).Count(&deviceCount)

	var onlineCount int64
	database.DB.Model(&models.OnlineSession{}).Where("app_user_id = ?", appUser.ID).Count(&onlineCount)

	var loginIPs []string
	database.DB.Model(&models.AppUserLog{}).
		Where("app_user_id = ? AND action = ? AND ip <> ''", appUser.ID, "login").
		Distinct("ip").Limit(20).Pluck("ip", &loginIPs)

	lastLoginData := interface{}(nil)
	if lastLoginResult.Error == nil {
		lastLoginData = lastLogin
	}

	return gin.H{
		"user":            appUser,
		"summary":         gin.H{"online_count": onlineCount, "device_count": deviceCount, "login_count": loginCount, "recharge_count": rechargeCount, "card_use_count": cardUseCount},
		"last_login":      lastLoginData,
		"recent_ips":      loginIPs,
		"online_sessions": onlineSessions,
		"devices":         devices,
		"recent_logs":     logs,
	}
}

func GetAppUserProfile(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var appUser models.AppUser
	if err := database.DB.Preload("App").First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}
	if appUser.App == nil || appUser.App.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": buildAppUserProfile(appUser)})
}

// 创建用户
func CreateAppUser(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		AppID         uint   `json:"app_id" binding:"required"`
		Username      string `json:"username" binding:"required"`
		Password      string `json:"password" binding:"required"`
		Status        int    `json:"status"`
		IsPaid        int    `json:"is_paid"`
		IsTester      int    `json:"is_tester"`
		ExpireAt      string `json:"expire_at"`
		Points        int    `json:"points"`
		Channels      int    `json:"channels"`
		Features      int    `json:"features"`
		UnbindDay     int    `json:"unbind_day"`
		UnbindWeek    int    `json:"unbind_week"`
		UnbindMonth   int    `json:"unbind_month"`
		UnbindQuarter int    `json:"unbind_quarter"`
		UnbindHalfY   int    `json:"unbind_halfy"`
		UnbindYear    int    `json:"unbind_year"`
		UnbindTotal   int    `json:"unbind_total"`
		ExtraData     string `json:"extra_data"`
		CloudData     string `json:"cloud_data"`
		QQ            string `json:"qq"`
		Wechat        string `json:"wechat"`
		Phone         string `json:"phone"`
		Email         string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 检查应用是否属于当前用户
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", req.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "应用不存在或无权访问"})
		return
	}

	// 检查用户数量限制
	var userCount int64
	database.DB.Model(&models.AppUser{}).Where("app_id IN (SELECT id FROM apps WHERE user_id = ?)", user.ID).Count(&userCount)
	_, maxUsers, _, _ := getUserTotalQuota(user)
	if maxUsers >= 0 && int(userCount) >= maxUsers {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "已达到用户数量上限"})
		return
	}

	// 检查用户名是否已存在（同一应用下唯一）
	var count int64
	database.DB.Model(&models.AppUser{}).Where("app_id = ? AND username = ?", req.AppID, req.Username).Count(&count)
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
		AppID:         req.AppID,
		Username:      req.Username,
		Password:      string(hashedPwd),
		Status:        getIntOrDefault(req.Status, 1),
		IsPaid:        req.IsPaid,
		IsTester:      req.IsTester,
		ExpireAt:      expireAt,
		Points:        req.Points,
		Channels:      getIntOrDefault(req.Channels, 1),
		Features:      getIntOrDefault(req.Features, 1),
		UnbindDay:     req.UnbindDay,
		UnbindWeek:    req.UnbindWeek,
		UnbindMonth:   req.UnbindMonth,
		UnbindQuarter: req.UnbindQuarter,
		UnbindHalfY:   req.UnbindHalfY,
		UnbindYear:    req.UnbindYear,
		UnbindTotal:   req.UnbindTotal,
		ExtraData:     req.ExtraData,
		CloudData:     req.CloudData,
		QQ:            req.QQ,
		Wechat:        req.Wechat,
		Phone:         req.Phone,
		Email:         req.Email,
	}

	if err := database.DB.Create(appUser).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": appUser})
}

// 更新用户
func UpdateAppUser(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var appUser models.AppUser
	if err := database.DB.First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 检查应用是否属于当前用户
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appUser.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Username    string  `json:"username"`
		Password    string  `json:"password"`
		Status      *int    `json:"status"`
		IsPaid      *int    `json:"is_paid"`
		IsTester    *int    `json:"is_tester"`
		ExpireAt    *string `json:"expire_at"`
		Points      *int    `json:"points"`
		Channels    *int    `json:"channels"`
		Features    *int    `json:"features"`
		UnbindDay     *int    `json:"unbind_day"`
		UnbindWeek    *int    `json:"unbind_week"`
		UnbindMonth   *int    `json:"unbind_month"`
		UnbindQuarter *int    `json:"unbind_quarter"`
		UnbindHalfY   *int    `json:"unbind_halfy"`
		UnbindYear    *int    `json:"unbind_year"`
		UnbindTotal   *int    `json:"unbind_total"`
		ExtraData   *string `json:"extra_data"`
		CloudData   *string `json:"cloud_data"`
		QQ          *string `json:"qq"`
		Wechat      *string `json:"wechat"`
		Phone       *string `json:"phone"`
		Email       *string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Username != "" && req.Username != appUser.Username {
		var count int64
		database.DB.Model(&models.AppUser{}).Where("app_id = ? AND username = ? AND id != ?", appUser.AppID, req.Username, id).Count(&count)
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
				if appUser.ExpireAt == nil || !appUser.ExpireAt.Equal(t) {
					updates["last_recharge_at"] = time.Now()
				}
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
	if req.UnbindDay != nil {
		updates["unbind_day"] = *req.UnbindDay
	}
	if req.UnbindWeek != nil {
		updates["unbind_week"] = *req.UnbindWeek
	}
	if req.UnbindMonth != nil {
		updates["unbind_month"] = *req.UnbindMonth
	}
	if req.UnbindQuarter != nil {
		updates["unbind_quarter"] = *req.UnbindQuarter
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

func UploadAppUserAvatar(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
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

	avatarURL, err := saveAppUserAvatar(c, &appUser)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	if err := database.DB.Model(&appUser).Update("avatar", avatarURL).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新头像失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "上传成功", "data": gin.H{"avatar": avatarURL}})
}

// 删除用户
func DeleteAppUser(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var appUser models.AppUser
	if err := database.DB.First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 检查应用是否属于当前用户
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appUser.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	// 删除关联数据
	database.DB.Where("app_user_id = ?", appUser.ID).Delete(&models.AppUserData{})
	database.DB.Where("app_user_id = ?", appUser.ID).Delete(&models.AppUserDevice{})
	database.DB.Where("app_user_id = ?", appUser.ID).Delete(&models.OnlineSession{})

	if err := database.DB.Delete(&appUser).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 重置推广码
func ResetAppUserInviteCode(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var appUser models.AppUser
	if err := database.DB.First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 检查应用是否属于当前用户
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appUser.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	// 生成新的推广码
	newCode := generateInviteCode()
	if err := database.DB.Model(&appUser).Update("invite_code", newCode).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "重置失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"invite_code": newCode}})
}

// ========== 用户标识数据管理 ==========

func ListAppUserData(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appUserID := c.Param("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var appUser models.AppUser
	if err := database.DB.First(&appUser, appUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 检查应用是否属于当前用户
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appUser.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var dataList []models.AppUserData
	var total int64
	query := database.DB.Model(&models.AppUserData{}).Where("app_user_id = ?", appUserID)
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&dataList)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": dataList, "total": total}})
}

func CreateAppUserData(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appUserID := c.Param("id")

	var appUser models.AppUser
	if err := database.DB.First(&appUser, appUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 检查应用是否属于当前用户
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appUser.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Key      string `json:"key" binding:"required"`
		Value    string `json:"value"`
		Remark   string `json:"remark"`
		ExpireAt string `json:"expire_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	data := &models.AppUserData{
		AppUserID: appUser.ID,
		Key:       req.Key,
		Value:     req.Value,
		Remark:    req.Remark,
	}

	if req.ExpireAt != "" {
		t, err := parseTime(req.ExpireAt)
		if err == nil {
			data.ExpireAt = &t
		}
	}

	if err := database.DB.Create(data).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

func UpdateAppUserData(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appUserID := c.Param("id")
	dataID := c.Param("dataId")

	var appUser models.AppUser
	if err := database.DB.First(&appUser, appUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 检查应用是否属于当前用户
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appUser.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Key      string  `json:"key"`
		Value    string  `json:"value"`
		Remark   string  `json:"remark"`
		ExpireAt *string `json:"expire_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Key != "" {
		updates["key"] = req.Key
	}
	updates["value"] = req.Value
	updates["remark"] = req.Remark
	if req.ExpireAt != nil {
		if *req.ExpireAt == "" {
			updates["expire_at"] = nil
		} else {
			t, err := parseTime(*req.ExpireAt)
			if err == nil {
				updates["expire_at"] = t
				if appUser.ExpireAt == nil || !appUser.ExpireAt.Equal(t) {
					updates["last_recharge_at"] = time.Now()
				}
			}
		}
	}

	result := database.DB.Model(&models.AppUserData{}).Where("id = ? AND app_user_id = ?", dataID, appUserID).Updates(updates)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "标识不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func DeleteAppUserData(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appUserID := c.Param("id")
	dataID := c.Param("dataId")

	var appUser models.AppUser
	if err := database.DB.First(&appUser, appUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 检查应用是否属于当前用户
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appUser.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	result := database.DB.Where("id = ? AND app_user_id = ?", dataID, appUserID).Delete(&models.AppUserData{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "标识不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// ========== 用户特征码管理 ==========

func ListAppUserDevices(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appUserID := c.Param("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var appUser models.AppUser
	if err := database.DB.First(&appUser, appUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 检查应用是否属于当前用户
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appUser.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var devices []models.AppUserDevice
	var total int64
	query := database.DB.Model(&models.AppUserDevice{}).Where("app_user_id = ?", appUserID)
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&devices)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": devices, "total": total, "features": appUser.Features}})
}

func DeleteAppUserDevice(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appUserID := c.Param("id")
	deviceID := c.Param("deviceId")

	var appUser models.AppUser
	if err := database.DB.First(&appUser, appUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 检查应用是否属于当前用户
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appUser.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	result := database.DB.Where("id = ? AND app_user_id = ?", deviceID, appUserID).Delete(&models.AppUserDevice{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "特征码不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "解绑成功"})
}

// ========== 批量操作 ==========

func BatchUpdateAppUserStatus(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		IDs    []uint `json:"ids" binding:"required"`
		Status int    `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	if len(req.IDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请选择要操作的用户"})
		return
	}

	// 获取用户的所有应用ID
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)

	result := database.DB.Model(&models.AppUser{}).Where("id IN ? AND app_id IN ?", req.IDs, appIDs).Update("status", req.Status)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功", "data": gin.H{"count": result.RowsAffected}})
}

func BatchDeleteAppUsers(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		IDs []uint `json:"ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	if len(req.IDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请选择要删除的用户"})
		return
	}

	// 获取用户的所有应用ID
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)

	// 删除关联数据
	database.DB.Where("app_user_id IN ?", req.IDs).Delete(&models.AppUserData{})
	database.DB.Where("app_user_id IN ?", req.IDs).Delete(&models.AppUserDevice{})
	database.DB.Where("app_user_id IN ?", req.IDs).Delete(&models.OnlineSession{})

	result := database.DB.Where("id IN ? AND app_id IN ?", req.IDs, appIDs).Delete(&models.AppUser{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功", "data": gin.H{"count": result.RowsAffected}})
}

// ========== 管理员接口 ==========

func AdminListAppUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	keyword := c.Query("keyword")
	appID := c.Query("app_id")
	filter := c.Query("filter")

	var appUsers []models.AppUser
	var total int64

	query := database.DB.Model(&models.AppUser{}).Preload("App").Preload("App.User")
	if appID != "" {
		query = query.Where("app_id = ?", appID)
	}
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("username LIKE ? OR qq LIKE ? OR phone LIKE ? OR email LIKE ?",
			kw, kw, kw, kw)
	}
	if filter != "" {
		filters := strings.Split(filter, ",")
		var conditions []string
		var args []interface{}
		for _, f := range filters {
			switch strings.TrimSpace(f) {
			case "paid":
				conditions = append(conditions, "is_paid = 1")
			case "free":
				conditions = append(conditions, "is_paid = 0")
			case "tester":
				conditions = append(conditions, "is_tester = 1")
			case "expired":
				conditions = append(conditions, "(expire_at IS NULL OR expire_at < ?)")
				args = append(args, time.Now())
			case "unexpired":
				conditions = append(conditions, "(expire_at IS NOT NULL AND expire_at >= ?)")
				args = append(args, time.Now())
			case "unlimited":
				conditions = append(conditions, "(expire_at IS NOT NULL AND expire_at >= '2099-01-01')")
			case "trial":
				conditions = append(conditions, "is_trial = 1")
			}
		}
		if len(conditions) > 0 {
			query = query.Where("("+strings.Join(conditions, " OR ")+")", args...)
		}
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&appUsers)

	// 批量查询在线数量
	onlineMap := make(map[uint]int64)
	if len(appUsers) > 0 {
		var userIDs []uint
		for _, u := range appUsers {
			userIDs = append(userIDs, u.ID)
		}
		type OnlineCount struct {
			AppUserID uint  `json:"app_user_id"`
			Count     int64 `json:"count"`
		}
		var counts []OnlineCount
		database.DB.Model(&models.OnlineSession{}).
			Select("app_user_id, count(*) as count").
			Where("app_user_id IN ?", userIDs).
			Group("app_user_id").
			Find(&counts)
		for _, oc := range counts {
			onlineMap[oc.AppUserID] = oc.Count
		}
	}

	type UserWithOnline struct {
		models.AppUser
		OnlineCount int64 `json:"online_count"`
	}
	result := make([]UserWithOnline, len(appUsers))
	for i, u := range appUsers {
		result[i] = UserWithOnline{AppUser: u, OnlineCount: onlineMap[u.ID]}
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{"list": result, "total": total},
	})
}

func AdminGetAppUser(c *gin.Context) {
	id := c.Param("id")
	var appUser models.AppUser
	if err := database.DB.Preload("App").Preload("App.User").First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": appUser})
}

func AdminCreateAppUser(c *gin.Context) {
	var req struct {
		AppID         uint   `json:"app_id" binding:"required"`
		Username      string `json:"username" binding:"required"`
		Password      string `json:"password" binding:"required"`
		Status        int    `json:"status"`
		IsPaid        int    `json:"is_paid"`
		IsTester      int    `json:"is_tester"`
		ExpireAt      string `json:"expire_at"`
		Points        int    `json:"points"`
		Channels      int    `json:"channels"`
		Features      int    `json:"features"`
		UnbindDay     int    `json:"unbind_day"`
		UnbindWeek    int    `json:"unbind_week"`
		UnbindMonth   int    `json:"unbind_month"`
		UnbindQuarter int    `json:"unbind_quarter"`
		UnbindHalfY   int    `json:"unbind_halfy"`
		UnbindYear    int    `json:"unbind_year"`
		UnbindTotal   int    `json:"unbind_total"`
		ExtraData     string `json:"extra_data"`
		CloudData     string `json:"cloud_data"`
		QQ            string `json:"qq"`
		Wechat        string `json:"wechat"`
		Phone         string `json:"phone"`
		Email         string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	var app models.App
	if err := database.DB.First(&app, req.AppID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "应用不存在"})
		return
	}
	var count int64
	database.DB.Model(&models.AppUser{}).Where("app_id = ? AND username = ?", req.AppID, req.Username).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "用户名已存在"})
		return
	}
	hashedPwd, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	var expireAt *time.Time
	if req.ExpireAt != "" {
		if t, err := parseTime(req.ExpireAt); err == nil {
			expireAt = &t
		}
	}
	appUser := &models.AppUser{
		AppID: req.AppID, Username: req.Username, Password: string(hashedPwd), Status: getIntOrDefault(req.Status, 1),
		IsPaid: req.IsPaid, IsTester: req.IsTester, ExpireAt: expireAt, Points: req.Points,
		Channels: getIntOrDefault(req.Channels, 1), Features: getIntOrDefault(req.Features, 1),
		UnbindDay: req.UnbindDay, UnbindWeek: req.UnbindWeek, UnbindMonth: req.UnbindMonth, UnbindQuarter: req.UnbindQuarter,
		UnbindHalfY: req.UnbindHalfY, UnbindYear: req.UnbindYear, UnbindTotal: req.UnbindTotal,
		ExtraData: req.ExtraData, CloudData: req.CloudData, QQ: req.QQ, Wechat: req.Wechat, Phone: req.Phone, Email: req.Email,
	}
	if err := database.DB.Create(appUser).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": appUser})
}

func AdminResetAppUserInviteCode(c *gin.Context) {
	id := c.Param("id")
	var appUser models.AppUser
	if err := database.DB.First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}
	newCode := generateInviteCode()
	if err := database.DB.Model(&appUser).Update("invite_code", newCode).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "重置失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"invite_code": newCode}})
}

func AdminBatchUpdateAppUserStatus(c *gin.Context) {
	var req struct {
		IDs    []uint `json:"ids" binding:"required"`
		Status int    `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	if len(req.IDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请选择要操作的用户"})
		return
	}
	result := database.DB.Model(&models.AppUser{}).Where("id IN ?", req.IDs).Update("status", req.Status)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功", "data": gin.H{"count": result.RowsAffected}})
}

func AdminBatchDeleteAppUsers(c *gin.Context) {
	var req struct { IDs []uint `json:"ids" binding:"required"` }
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	if len(req.IDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请选择要删除的用户"})
		return
	}
	database.DB.Where("app_user_id IN ?", req.IDs).Delete(&models.AppUserData{})
	database.DB.Where("app_user_id IN ?", req.IDs).Delete(&models.AppUserDevice{})
	database.DB.Where("app_user_id IN ?", req.IDs).Delete(&models.OnlineSession{})
	result := database.DB.Where("id IN ?", req.IDs).Delete(&models.AppUser{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功", "data": gin.H{"count": result.RowsAffected}})
}

func AdminGetAppUserProfile(c *gin.Context) {
	id := c.Param("id")
	var appUser models.AppUser
	if err := database.DB.Preload("App").Preload("App.User").First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": buildAppUserProfile(appUser)})
}

func AdminListRiskAppUsers(c *gin.Context) {
	listRiskAppUsers(c, nil)
}

func AdminDisposeRiskAppUser(c *gin.Context) {
	appUser, ok := getAdminRiskAppUser(c)
	if !ok {
		return
	}
	var req struct {
		Action string `json:"action" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	disposeRiskAppUser(c, appUser, req.Action)
}

func AdminUpdateAppUser(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Username      string  `json:"username"`
		Password      string  `json:"password"`
		Status        *int    `json:"status"`
		IsPaid        *int    `json:"is_paid"`
		IsTester      *int    `json:"is_tester"`
		ExpireAt      *string `json:"expire_at"`
		Points        *int    `json:"points"`
		Channels      *int    `json:"channels"`
		Features      *int    `json:"features"`
		UnbindDay     *int    `json:"unbind_day"`
		UnbindWeek    *int    `json:"unbind_week"`
		UnbindMonth   *int    `json:"unbind_month"`
		UnbindQuarter *int    `json:"unbind_quarter"`
		UnbindHalfY   *int    `json:"unbind_halfy"`
		UnbindYear    *int    `json:"unbind_year"`
		UnbindTotal   *int    `json:"unbind_total"`
		ExtraData   *string `json:"extra_data"`
		CloudData   *string `json:"cloud_data"`
		QQ          *string `json:"qq"`
		Wechat      *string `json:"wechat"`
		Phone       *string `json:"phone"`
		Email       *string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var appUser models.AppUser
	if err := database.DB.First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	updates := make(map[string]interface{})
	if req.Username != "" && req.Username != appUser.Username {
		var count int64
		database.DB.Model(&models.AppUser{}).Where("app_id = ? AND username = ? AND id != ?", appUser.AppID, req.Username, id).Count(&count)
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
	if req.UnbindDay != nil {
		updates["unbind_day"] = *req.UnbindDay
	}
	if req.UnbindWeek != nil {
		updates["unbind_week"] = *req.UnbindWeek
	}
	if req.UnbindMonth != nil {
		updates["unbind_month"] = *req.UnbindMonth
	}
	if req.UnbindQuarter != nil {
		updates["unbind_quarter"] = *req.UnbindQuarter
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

	if err := database.DB.Model(&appUser).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func AdminUploadAppUserAvatar(c *gin.Context) {
	id := c.Param("id")
	var appUser models.AppUser
	if err := database.DB.First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	avatarURL, err := saveAppUserAvatar(c, &appUser)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	if err := database.DB.Model(&appUser).Update("avatar", avatarURL).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新头像失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "上传成功", "data": gin.H{"avatar": avatarURL}})
}

func AdminDeleteAppUser(c *gin.Context) {
	id := c.Param("id")

	var appUser models.AppUser
	if err := database.DB.First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 删除关联数据
	database.DB.Where("app_user_id = ?", appUser.ID).Delete(&models.AppUserData{})
	database.DB.Where("app_user_id = ?", appUser.ID).Delete(&models.AppUserDevice{})
	database.DB.Where("app_user_id = ?", appUser.ID).Delete(&models.OnlineSession{})

	if err := database.DB.Delete(&appUser).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 管理员标识数据管理
func AdminListAppUserData(c *gin.Context) {
	appUserID := c.Param("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var dataList []models.AppUserData
	var total int64
	query := database.DB.Model(&models.AppUserData{}).Where("app_user_id = ?", appUserID)
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&dataList)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": dataList, "total": total}})
}

func AdminCreateAppUserData(c *gin.Context) {
	appUserID := c.Param("id")

	var appUser models.AppUser
	if err := database.DB.First(&appUser, appUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	var req struct {
		Key      string `json:"key" binding:"required"`
		Value    string `json:"value"`
		Remark   string `json:"remark"`
		ExpireAt string `json:"expire_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	data := &models.AppUserData{
		AppUserID: appUser.ID,
		Key:       req.Key,
		Value:     req.Value,
		Remark:    req.Remark,
	}

	if req.ExpireAt != "" {
		t, err := parseTime(req.ExpireAt)
		if err == nil {
			data.ExpireAt = &t
		}
	}

	if err := database.DB.Create(data).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
}

func AdminUpdateAppUserData(c *gin.Context) {
	appUserID := c.Param("id")
	dataID := c.Param("dataId")

	var req struct {
		Key      string  `json:"key"`
		Value    string  `json:"value"`
		Remark   string  `json:"remark"`
		ExpireAt *string `json:"expire_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Key != "" {
		updates["key"] = req.Key
	}
	updates["value"] = req.Value
	updates["remark"] = req.Remark
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

	result := database.DB.Model(&models.AppUserData{}).Where("id = ? AND app_user_id = ?", dataID, appUserID).Updates(updates)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "标识不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func AdminDeleteAppUserData(c *gin.Context) {
	appUserID := c.Param("id")
	dataID := c.Param("dataId")

	result := database.DB.Where("id = ? AND app_user_id = ?", dataID, appUserID).Delete(&models.AppUserData{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "标识不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 管理员特征码管理
func AdminListAppUserDevices(c *gin.Context) {
	appUserID := c.Param("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var appUser models.AppUser
	if err := database.DB.First(&appUser, appUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	var devices []models.AppUserDevice
	var total int64
	query := database.DB.Model(&models.AppUserDevice{}).Where("app_user_id = ?", appUserID)
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&devices)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": devices, "total": total, "features": appUser.Features}})
}

func AdminDeleteAppUserDevice(c *gin.Context) {
	appUserID := c.Param("id")
	deviceID := c.Param("deviceId")

	result := database.DB.Where("id = ? AND app_user_id = ?", deviceID, appUserID).Delete(&models.AppUserDevice{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "特征码不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "解绑成功"})
}

// ========== 辅助函数 ==========

// handleFreezeStatusChange 处理冻结/解冻状态变更
func handleFreezeStatusChange(appUser *models.AppUser, newStatus int, updates map[string]interface{}) {
	if newStatus == 3 && appUser.Status != 3 {
		now := time.Now()
		updates["frozen_at"] = &now
	} else if newStatus != 3 && appUser.Status == 3 {
		if appUser.FrozenAt != nil && appUser.ExpireAt != nil && appUser.ExpireAt.Year() < 2099 {
			frozenDuration := time.Since(*appUser.FrozenAt)
			newExpire := appUser.ExpireAt.Add(frozenDuration)
			updates["expire_at"] = &newExpire
		}
		updates["frozen_at"] = nil
	}
}

func getIntOrDefault(val, def int) int {
	if val == 0 {
		return def
	}
	return val
}

func parseTime(s string) (time.Time, error) {
	layouts := []string{
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05",
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05.000Z",
		"2006-01-02",
		time.RFC3339,
		time.RFC3339Nano,
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	if t, err := time.Parse("2006-01-02T15:04:05-07:00", s); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02T15:04:05.999-07:00", s); err == nil {
		return t, nil
	}
	if idx := strings.Index(s, "["); idx > 0 {
		s = s[:idx]
		return parseTime(s)
	}
	return time.Time{}, errors.New("invalid time format")
}

// 记录应用用户操作日志
func LogAppUserOperation(appID, appUserID uint, action, detail, ip string) {
	go database.DB.Create(&models.AppUserLog{
		AppID:     appID,
		AppUserID: appUserID,
		Action:    action,
		Detail:    detail,
		IP:        ip,
	})
}

// 获取应用用户操作日志
func ListAppUserLogs(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appUserID, _ := strconv.Atoi(c.Param("id"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	action := c.Query("action")

	if appUserID == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 验证该用户属于当前作者的应用
	var appUser models.AppUser
	if err := database.DB.Preload("App").First(&appUser, appUserID).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户不存在"})
		return
	}
	if appUser.App == nil || appUser.App.UserID != user.ID {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "无权限"})
		return
	}

	var list []models.AppUserLog
	var total int64

	query := database.DB.Model(&models.AppUserLog{}).Where("app_user_id = ?", appUserID)
	if action != "" {
		query = query.Where("action = ?", action)
	}

	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 清空应用用户操作日志
func ClearAppUserLogs(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appUserID, _ := strconv.Atoi(c.Param("id"))

	if appUserID == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var appUser models.AppUser
	if err := database.DB.Preload("App").First(&appUser, appUserID).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户不存在"})
		return
	}
	if appUser.App == nil || appUser.App.UserID != user.ID {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "无权限"})
		return
	}

	database.DB.Where("app_user_id = ?", appUserID).Delete(&models.AppUserLog{})
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已清空"})
}

// 管理员获取应用用户操作日志
func AdminListAppUserLogs(c *gin.Context) {
	appUserID, _ := strconv.Atoi(c.Param("id"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	action := c.Query("action")

	if appUserID == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var list []models.AppUserLog
	var total int64

	query := database.DB.Model(&models.AppUserLog{}).Where("app_user_id = ?", appUserID)
	if action != "" {
		query = query.Where("action = ?", action)
	}

	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 管理员清空应用用户操作日志
func AdminClearAppUserLogs(c *gin.Context) {
	appUserID, _ := strconv.Atoi(c.Param("id"))

	if appUserID == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	database.DB.Where("app_user_id = ?", appUserID).Delete(&models.AppUserLog{})
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已清空"})
}
