package handlers

import (
	"jike-auth/database"
	"jike-auth/models"
	"crypto/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// 生成推广码 - 12位大小写字母+数字
func generateInviteCode() string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 12)
	rand.Read(b)
	for i := range b {
		b[i] = chars[int(b[i])%len(chars)]
	}
	return string(b)
}

// 获取int参数
func getRebateIntParam(c *gin.Context, key string, defaultVal int) int {
	val := c.Query(key)
	if val == "" {
		return defaultVal
	}
	intVal, err := strconv.Atoi(val)
	if err != nil {
		return defaultVal
	}
	return intVal
}

// ========== 作者端 - 推广配置 ==========

// 获取推广配置
func GetRebateConfig(c *gin.Context) {
	userID := c.GetUint("userID")

	var config models.RebateConfig
	database.DB.Where("user_id = ?", userID).First(&config)

	// 默认值
	if config.Rate == 0 {
		config.Rate = 10
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"enabled":    config.Enabled,
			"rate":       config.Rate,
			"reg_reward": config.RegReward,
			"description": "注册奖励和消费返利均发放到返利积分，可用于积分商城兑换。",
		},
	})
}

// 保存推广配置
func SaveRebateConfig(c *gin.Context) {
	userID := c.GetUint("userID")

	var req struct {
		Enabled   int `json:"enabled"`
		Rate      int `json:"rate"`
		RegReward int `json:"reg_reward"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var config models.RebateConfig
	database.DB.Where("user_id = ?", userID).First(&config)

	if config.ID == 0 {
		config = models.RebateConfig{
			UserID:    userID,
			Enabled:   req.Enabled,
			Rate:      req.Rate,
			RegReward: req.RegReward,
		}
		database.DB.Create(&config)
	} else {
		database.DB.Model(&config).Updates(map[string]interface{}{
			"enabled":    req.Enabled,
			"rate":       req.Rate,
			"reg_reward": req.RegReward,
		})
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "保存成功"})
}

// 获取返利记录列表
func ListRebateLogs(c *gin.Context) {
	userID := c.GetUint("userID")
	page := getRebateIntParam(c, "page", 1)
	size := getRebateIntParam(c, "size", 20)

	var total int64
	var logs []models.RebateLog

	query := database.DB.Model(&models.RebateLog{}).Where("user_id = ?", userID)
	query.Count(&total)
	query.Preload("AppUser").Preload("FromUser").
		Order("id desc").Offset((page - 1) * size).Limit(size).Find(&logs)

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"list":  logs,
			"total": total,
		},
	})
}

// 获取推广统计
func GetRebateStats(c *gin.Context) {
	userID := c.GetUint("userID")

	// 获取用户的所有应用ID
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", userID).Pluck("id", &appIDs)

	// 总推广人数
	var totalInviters int64
	if len(appIDs) > 0 {
		database.DB.Model(&models.AppUser{}).Where("app_id IN ? AND inviter_id > 0", appIDs).Count(&totalInviters)
	}

	// 总返利积分
	var totalRebate int64
	database.DB.Model(&models.RebateLog{}).Where("user_id = ?", userID).Select("COALESCE(SUM(amount), 0)").Scan(&totalRebate)

	// 今日返利
	var todayRebate int64
	startOfDay := time.Date(time.Now().Year(), time.Now().Month(), time.Now().Day(), 0, 0, 0, 0, time.Now().Location())
	endOfDay := startOfDay.Add(24 * time.Hour)
	database.DB.Model(&models.RebateLog{}).
		Where("user_id = ? AND created_at >= ? AND created_at < ?", userID, startOfDay, endOfDay).
		Select("COALESCE(SUM(amount), 0)").Scan(&todayRebate)

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"total_inviters": totalInviters,
			"total_rebate":   totalRebate,
			"today_rebate":   todayRebate,
		},
	})
}

// 获取推广排行榜
func GetRebateRanking(c *gin.Context) {
	userID := c.GetUint("userID")

	// 获取用户的所有应用ID
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", userID).Pluck("id", &appIDs)

	type RankItem struct {
		AppUserID   uint   `json:"app_user_id"`
		Username    string `json:"username"`
		InviteCount int    `json:"invite_count"`
		TotalRebate int    `json:"total_rebate"`
	}

	var ranking []RankItem
	if len(appIDs) > 0 {
		database.DB.Model(&models.AppUser{}).
			Select("id as app_user_id, username, invite_count, total_rebate").
			Where("app_id IN ? AND invite_count > 0", appIDs).
			Order("total_rebate desc, invite_count desc").
			Limit(20).
			Scan(&ranking)
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": ranking})
}

// ========== 处理推广返利逻辑 ==========

// 处理注册返利
func ProcessRegisterRebate(userID uint, newUser *models.AppUser) {
	if newUser.InviterID == nil {
		return
	}

	// 获取返利配置
	var config models.RebateConfig
	database.DB.Where("user_id = ?", userID).First(&config)
	if config.ID == 0 || config.Enabled != 1 || config.RegReward <= 0 {
		return
	}

	// 获取直接上级
	var inviter models.AppUser
	if err := database.DB.First(&inviter, *newUser.InviterID).Error; err != nil {
		return
	}

	// 增加返利积分（不是软件点数）
	database.DB.Model(&models.AppUser{}).Where("id = ?", inviter.ID).
		Update("rebate_points", inviter.RebatePoints+config.RegReward)
	database.DB.Model(&models.AppUser{}).Where("id = ?", inviter.ID).
		Update("total_rebate", inviter.TotalRebate+config.RegReward)

	// 记录日志
	log := &models.RebateLog{
		UserID:      userID,
		AppUserID:   inviter.ID,
		FromUserID:  newUser.ID,
		Type:        1, // 注册奖励
		Amount:      config.RegReward,
		SourceValue: 0,
		Remark:      "下级注册奖励",
	}
	database.DB.Create(log)

	// 更新推广人数
	database.DB.Model(&models.AppUser{}).Where("id = ?", inviter.ID).
		Update("invite_count", inviter.InviteCount+1)
}

// 处理消费返利
func ProcessConsumeRebate(userID uint, appUser *models.AppUser, rebatePoints int) {
	if appUser.InviterID == nil || rebatePoints <= 0 {
		return
	}

	// 获取返利配置
	var config models.RebateConfig
	database.DB.Where("user_id = ?", userID).First(&config)
	if config.ID == 0 || config.Enabled != 1 || config.Rate <= 0 {
		return
	}

	// 获取直接上级
	var inviter models.AppUser
	if err := database.DB.First(&inviter, *appUser.InviterID).Error; err != nil {
		return
	}

	// 使用卡种预设的固定返利积分
	rebateAmount := rebatePoints
	if rebateAmount <= 0 {
		return
	}

	// 增加返利积分（不是软件点数）
	database.DB.Model(&models.AppUser{}).Where("id = ?", inviter.ID).
		Update("rebate_points", inviter.RebatePoints+rebateAmount)
	database.DB.Model(&models.AppUser{}).Where("id = ?", inviter.ID).
		Update("total_rebate", inviter.TotalRebate+rebateAmount)

	// 记录日志
	log := &models.RebateLog{
		UserID:      userID,
		AppUserID:   inviter.ID,
		FromUserID:  appUser.ID,
		Type:        2, // 消费返利
		Amount:      rebateAmount,
		SourceValue: rebatePoints,
		Remark:      "下级消费返利",
	}
	database.DB.Create(log)
}

// 根据推广码查找推广人（按应用ID查找）
func FindInviterByCode(appID uint, inviteCode string) *models.AppUser {
	if inviteCode == "" {
		return nil
	}

	var inviter models.AppUser
	if err := database.DB.Where("app_id = ? AND invite_code = ?", appID, inviteCode).First(&inviter).Error; err != nil {
		return nil
	}
	return &inviter
}

// 为用户生成推广码
func EnsureInviteCode(appUser *models.AppUser) {
	if appUser.InviteCode != "" {
		return
	}
	code := generateInviteCode()
	database.DB.Model(appUser).Update("invite_code", code)
	appUser.InviteCode = code
}

// 获取推广树（下级用户列表）
func GetInviteTree(c *gin.Context) {
	userID := c.GetUint("userID")
	page := getRebateIntParam(c, "page", 1)
	size := getRebateIntParam(c, "size", 20)
	parentID := getRebateIntParam(c, "parent_id", 0) // 0表示获取一级下线

	// 获取用户的所有应用ID
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", userID).Pluck("id", &appIDs)

	var total int64
	var users []models.AppUser

	if len(appIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": gin.H{
				"list":  []interface{}{},
				"total": 0,
			},
		})
		return
	}

	query := database.DB.Model(&models.AppUser{}).Where("app_id IN ?", appIDs)

	if parentID == 0 {
		// 获取所有有下线的用户（一级推广人）
		query = query.Where("invite_count > 0")
	} else {
		// 获取指定用户的下线
		query = query.Where("inviter_id = ?", parentID)
	}

	query.Count(&total)
	query.Select("id, username, invite_code, inviter_id, invite_count, total_rebate, rebate_points, created_at").
		Order("invite_count desc, id desc").
		Offset((page - 1) * size).Limit(size).
		Find(&users)

	// 构建返回数据
	type UserItem struct {
		ID           uint      `json:"id"`
		Username     string    `json:"username"`
		InviteCode   string    `json:"invite_code"`
		InviterID    *uint     `json:"inviter_id"`
		InviteCount  int       `json:"invite_count"`
		TotalRebate  int       `json:"total_rebate"`
		RebatePoints int       `json:"rebate_points"` // 返利积分余额
		CreatedAt    time.Time `json:"created_at"`
		HasChildren  bool      `json:"has_children"`
	}

	var result []UserItem
	for _, u := range users {
		result = append(result, UserItem{
			ID:           u.ID,
			Username:     u.Username,
			InviteCode:   u.InviteCode,
			InviterID:    u.InviterID,
			InviteCount:  u.InviteCount,
			TotalRebate:  u.TotalRebate,
			RebatePoints: u.RebatePoints,
			CreatedAt:    u.CreatedAt,
			HasChildren:  u.InviteCount > 0,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"list":  result,
			"total": total,
		},
	})
}
