package handlers

import (
	"crypto/rand"
	"encoding/binary"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// secureFloat64 使用 crypto/rand 生成 [0, 1) 范围的安全随机浮点数
func secureFloat64() float64 {
	var buf [8]byte
	rand.Read(buf[:])
	// 取53位有效位（IEEE 754 double精度）
	return float64(binary.BigEndian.Uint64(buf[:])>>(64-53)) / float64(1<<53)
}

// 获取签到状态
func GetCheckinStatus(c *gin.Context) {
	userID := c.GetUint("userID")

	// 获取签到配置
	var config models.CheckinConfig
	if err := database.DB.First(&config).Error; err != nil {
		// 创建默认配置
		config = models.CheckinConfig{
			MinReward: 3,
			MaxReward: 8,
			Enabled:   1,
		}
		database.DB.Create(&config)
	}

	// 获取连续签到奖励规则
	var streakRewards []models.CheckinStreakReward
	database.DB.Order("streak_days asc").Find(&streakRewards)

	// 获取今日是否已签到
	today := time.Now().Format("2006-01-02")
	var todayLog models.CheckinLog
	hasCheckedIn := database.DB.Where("user_id = ? AND DATE(checkin_at) = ?", userID, today).First(&todayLog).Error == nil

	// 获取连续签到天数（每月1号重置）
	streak := 0
	now := time.Now()

	if hasCheckedIn {
		streak = todayLog.Streak
	} else if now.Day() != 1 {
		// 不是1号时，检查昨天是否签到
		yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")
		var yesterdayLog models.CheckinLog
		if database.DB.Where("user_id = ? AND DATE(checkin_at) = ?", userID, yesterday).First(&yesterdayLog).Error == nil {
			streak = yesterdayLog.Streak
		}
	}
	// 如果是1号且今天未签到，streak保持为0

	// 获取累计签到天数
	var totalDays int64
	database.DB.Model(&models.CheckinLog{}).Where("user_id = ?", userID).Count(&totalDays)

	// 获取累计奖励
	var totalReward struct {
		Total float64
	}
	database.DB.Model(&models.CheckinLog{}).Where("user_id = ?", userID).Select("COALESCE(SUM(reward + extra_reward), 0) as total").Scan(&totalReward)

	// 获取本月签到日期
	firstOfMonth := time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.Local)
	var monthLogs []models.CheckinLog
	database.DB.Where("user_id = ? AND checkin_at >= ?", userID, firstOfMonth).Order("checkin_at asc").Find(&monthLogs)

	checkinDays := make([]int, 0)
	for _, log := range monthLogs {
		checkinDays = append(checkinDays, log.CheckinAt.Day())
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"has_checked_in": hasCheckedIn,
			"streak":         streak,
			"total_days":     totalDays,
			"total_reward":   totalReward.Total,
			"checkin_days":   checkinDays,
			"config":         config,
			"streak_rewards": streakRewards,
		},
	})
}

// 签到
func DoCheckin(c *gin.Context) {
	userID := c.GetUint("userID")

	// 获取签到配置
	var config models.CheckinConfig
	if err := database.DB.First(&config).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "签到功能未启用"})
		return
	}

	if config.Enabled != 1 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "签到功能未启用"})
		return
	}

	// 使用事务防止并发重复签到
	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 在事务中检查今日是否已签到（加行锁）
	today := time.Now().Format("2006-01-02")
	var existingLog models.CheckinLog
	if tx.Where("user_id = ? AND DATE(checkin_at) = ?", userID, today).First(&existingLog).Error == nil {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "今日已签到"})
		return
	}

	// 计算连续签到天数
	streak := 1
	now := time.Now()

	// 如果是每月1号，连续天数重置为1
	if now.Day() != 1 {
		// 检查昨天是否签到
		yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")
		var yesterdayLog models.CheckinLog
		if tx.Where("user_id = ? AND DATE(checkin_at) = ?", userID, yesterday).First(&yesterdayLog).Error == nil {
			streak = yesterdayLog.Streak + 1
		}
	}

	// 计算基础奖励(使用 crypto/rand 安全随机数)
	reward := config.MinReward + secureFloat64()*(config.MaxReward-config.MinReward)
	reward = float64(int(reward*100)) / 100 // 保留两位小数

	// 获取连续签到奖励规则并计算额外奖励
	var streakRewards []models.CheckinStreakReward
	tx.Order("streak_days desc").Find(&streakRewards)

	var extraReward float64 = 0
	for _, sr := range streakRewards {
		if streak >= sr.StreakDays {
			extraReward = sr.ExtraReward
			break
		}
	}

	// 创建签到记录
	checkinLog := models.CheckinLog{
		UserID:      userID,
		Reward:      reward,
		ExtraReward: extraReward,
		Streak:      streak,
		CheckinAt:   time.Now(),
	}
	if err := tx.Create(&checkinLog).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "签到失败"})
		return
	}

	// 增加用户余额（原子操作）
	totalReward := reward + extraReward
	if err := tx.Model(&models.User{}).Where("id = ?", userID).
		UpdateColumn("balance", tx.Raw("balance + ?", totalReward)).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "签到失败"})
		return
	}

	// 提交事务
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "签到失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"reward":       reward,
			"extra_reward": extraReward,
			"total_reward": totalReward,
			"streak":       streak,
		},
		"message": "签到成功",
	})
}

// 获取签到记录
func GetCheckinLogs(c *gin.Context) {
	userID := c.GetUint("userID")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var logs []models.CheckinLog
	var total int64

	query := database.DB.Model(&models.CheckinLog{}).Where("user_id = ?", userID)
	query.Count(&total)
	query.Order("checkin_at desc").Offset((page - 1) * size).Limit(size).Find(&logs)

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"list":  logs,
			"total": total,
		},
	})
}

// 获取指定月份的签到记录
func GetMonthCheckinLogs(c *gin.Context) {
	userID := c.GetUint("userID")
	year, _ := strconv.Atoi(c.DefaultQuery("year", strconv.Itoa(time.Now().Year())))
	month, _ := strconv.Atoi(c.DefaultQuery("month", strconv.Itoa(int(time.Now().Month()))))

	// 计算月份的开始和结束时间
	startOfMonth := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.Local)
	endOfMonth := startOfMonth.AddDate(0, 1, 0)

	var logs []models.CheckinLog
	database.DB.Where("user_id = ? AND checkin_at >= ? AND checkin_at < ?", userID, startOfMonth, endOfMonth).
		Order("checkin_at asc").Find(&logs)

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": logs,
	})
}

// 管理员: 获取签到配置
func GetCheckinConfig(c *gin.Context) {
	var config models.CheckinConfig
	if err := database.DB.First(&config).Error; err != nil {
		// 返回默认配置
		config = models.CheckinConfig{
			MinReward: 3,
			MaxReward: 8,
			Enabled:   1,
		}
	}

	// 获取连续签到奖励规则
	var streakRewards []models.CheckinStreakReward
	database.DB.Order("streak_days asc").Find(&streakRewards)

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"config":         config,
			"streak_rewards": streakRewards,
		},
	})
}

// 管理员: 保存签到配置
func SaveCheckinConfig(c *gin.Context) {
	var req struct {
		MinReward float64 `json:"min_reward"`
		MaxReward float64 `json:"max_reward"`
		Enabled   int     `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var config models.CheckinConfig
	database.DB.First(&config)

	config.MinReward = req.MinReward
	config.MaxReward = req.MaxReward
	config.Enabled = req.Enabled

	if config.ID == 0 {
		database.DB.Create(&config)
	} else {
		database.DB.Save(&config)
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "保存成功"})
}

// 管理员: 添加连续签到奖励规则
func AddStreakReward(c *gin.Context) {
	var req struct {
		StreakDays  int     `json:"streak_days"`
		ExtraReward float64 `json:"extra_reward"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	if req.StreakDays <= 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "连续天数必须大于0"})
		return
	}

	// 检查是否已存在相同天数的规则
	var existing models.CheckinStreakReward
	if database.DB.Where("streak_days = ?", req.StreakDays).First(&existing).Error == nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "该连续天数的规则已存在"})
		return
	}

	reward := models.CheckinStreakReward{
		StreakDays:  req.StreakDays,
		ExtraReward: req.ExtraReward,
	}
	database.DB.Create(&reward)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": reward, "message": "添加成功"})
}

// 管理员: 删除连续签到奖励规则
func DeleteStreakReward(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	database.DB.Delete(&models.CheckinStreakReward{}, id)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 管理员: 获取连续签到奖励规则列表
func ListStreakRewards(c *gin.Context) {
	var rewards []models.CheckinStreakReward
	database.DB.Order("streak_days asc").Find(&rewards)

	// 按天数排序
	sort.Slice(rewards, func(i, j int) bool {
		return rewards[i].StreakDays < rewards[j].StreakDays
	})

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": rewards})
}
