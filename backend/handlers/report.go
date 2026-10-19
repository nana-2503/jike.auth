package handlers

import (
	"fmt"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

func getAuthorAppIDs(userID uint, appID string) ([]uint, bool) {
	if appID != "" {
		var app models.App
		if err := database.DB.Where("id = ? AND user_id = ?", appID, userID).First(&app).Error; err != nil {
			return nil, false
		}
		return []uint{app.ID}, true
	}
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", userID).Pluck("id", &appIDs)
	return appIDs, true
}

func GetReportOverview(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appIDs, ok := getAuthorAppIDs(user.ID, c.Query("app_id"))
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}
	data := gin.H{"app_count": 0, "user_count": 0, "paid_user_count": 0, "card_count": 0, "unused_card_count": 0, "used_card_count": 0, "disabled_card_count": 0, "online_count": 0, "agent_count": 0, "today_new_users": 0, "today_recharges": 0}
	if len(appIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "data": data})
		return
	}

	var appCount, userCount, paidUserCount, cardCount, unusedCardCount, usedCardCount, disabledCardCount, onlineCount, agentCount, todayNewUsers, todayRecharges int64
	today := time.Now()
	dayStart := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location())
	database.DB.Model(&models.App{}).Where("id IN ?", appIDs).Count(&appCount)
	database.DB.Model(&models.AppUser{}).Where("app_id IN ?", appIDs).Count(&userCount)
	database.DB.Model(&models.AppUser{}).Where("app_id IN ? AND is_paid = 1", appIDs).Count(&paidUserCount)
	database.DB.Model(&models.Card{}).Where("app_id IN ?", appIDs).Count(&cardCount)
	database.DB.Model(&models.Card{}).Where("app_id IN ? AND status = 1", appIDs).Count(&unusedCardCount)
	database.DB.Model(&models.Card{}).Where("app_id IN ? AND status IN ?", appIDs, []int{2, 4}).Count(&usedCardCount)
	database.DB.Model(&models.Card{}).Where("app_id IN ? AND status = 3", appIDs).Count(&disabledCardCount)
	database.DB.Model(&models.OnlineSession{}).Where("app_id IN ?", appIDs).Count(&onlineCount)
	database.DB.Model(&models.Agent{}).Where("app_id IN ?", appIDs).Count(&agentCount)
	database.DB.Model(&models.AppUser{}).Where("app_id IN ? AND created_at >= ?", appIDs, dayStart).Count(&todayNewUsers)
	database.DB.Model(&models.CardUseLog{}).Where("app_id IN ? AND created_at >= ?", appIDs, dayStart).Count(&todayRecharges)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{
		"app_count": appCount, "user_count": userCount, "paid_user_count": paidUserCount,
		"card_count": cardCount, "unused_card_count": unusedCardCount, "used_card_count": usedCardCount,
		"disabled_card_count": disabledCardCount, "online_count": onlineCount, "agent_count": agentCount,
		"today_new_users": todayNewUsers, "today_recharges": todayRecharges,
	}})
}

func GetReportTrend(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appIDs, ok := getAuthorAppIDs(user.ID, c.Query("app_id"))
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	if days < 7 {
		days = 7
	}
	if days > 90 {
		days = 90
	}

	type DayStat struct {
		Date        string `json:"date"`
		NewUsers    int64  `json:"new_users"`
		Logins      int64  `json:"logins"`
		Recharges   int64  `json:"recharges"`
		Cards       int64  `json:"cards"`
		AgentCards  int64  `json:"agent_cards"`
	}
	result := make([]DayStat, days)
	now := time.Now()
	var agentIDs []uint
	if len(appIDs) > 0 {
		database.DB.Model(&models.Agent{}).Where("app_id IN ?", appIDs).Pluck("id", &agentIDs)
	}
	for i := days - 1; i >= 0; i-- {
		day := now.AddDate(0, 0, -i)
		dayStart := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
		dayEnd := dayStart.AddDate(0, 0, 1)
		stat := DayStat{Date: dayStart.Format("01-02")}
		if len(appIDs) > 0 {
			database.DB.Model(&models.AppUser{}).Where("app_id IN ? AND created_at >= ? AND created_at < ?", appIDs, dayStart, dayEnd).Count(&stat.NewUsers)
			database.DB.Unscoped().Model(&models.OnlineSession{}).Where("app_id IN ? AND login_at >= ? AND login_at < ?", appIDs, dayStart, dayEnd).Count(&stat.Logins)
			database.DB.Model(&models.CardUseLog{}).Where("app_id IN ? AND created_at >= ? AND created_at < ?", appIDs, dayStart, dayEnd).Count(&stat.Recharges)
			database.DB.Model(&models.Card{}).Where("app_id IN ? AND created_at >= ? AND created_at < ?", appIDs, dayStart, dayEnd).Count(&stat.Cards)
			if len(agentIDs) > 0 {
				database.DB.Model(&models.AgentCardLog{}).Where("agent_id IN ? AND created_at >= ? AND created_at < ?", agentIDs, dayStart, dayEnd).Select("COALESCE(SUM(count), 0)").Scan(&stat.AgentCards)
			}
		}
		result[days-1-i] = stat
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": result})
}

func GetVersionStats(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appIDs, ok := getAuthorAppIDs(user.ID, c.Query("app_id"))
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}
	type VersionStat struct {
		Version string `json:"version"`
		Online  int64  `json:"online"`
		Logins  int64  `json:"logins"`
	}
	stats := []VersionStat{}
	if len(appIDs) > 0 {
		onlineSince := time.Now().Add(-5 * time.Minute)
		database.DB.Model(&models.OnlineSession{}).
			Select("version, COUNT(*) AS online").
			Where("app_id IN ? AND heartbeat_at >= ?", appIDs, onlineSince).
			Group("version").
			Order("online desc").
			Scan(&stats)
		for i := range stats {
			database.DB.Unscoped().Model(&models.OnlineSession{}).Where("app_id IN ? AND version = ?", appIDs, stats[i].Version).Count(&stats[i].Logins)
		}
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": stats})
}

func GetCardStockWarnings(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appIDs, ok := getAuthorAppIDs(user.ID, c.Query("app_id"))
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}
	type StockItem struct {
		ID          uint   `json:"id"`
		AppID       uint   `json:"app_id"`
		AppName     string `json:"app_name"`
		Name        string `json:"name"`
		StockWarn   int    `json:"stock_warn"`
		UnusedCount int64  `json:"unused_count"`
	}
	items := []StockItem{}
	if len(appIDs) > 0 {
		var cardTypes []models.CardType
		database.DB.Preload("App").Where("app_id IN ? AND stock_warn > 0", appIDs).Order("id desc").Find(&cardTypes)
		for _, ct := range cardTypes {
			var unused int64
			database.DB.Model(&models.Card{}).Where("card_type_id = ? AND status = 1", ct.ID).Count(&unused)
			if unused <= int64(ct.StockWarn) {
				item := StockItem{ID: ct.ID, AppID: ct.AppID, Name: ct.Name, StockWarn: ct.StockWarn, UnusedCount: unused}
				if ct.App != nil {
					item.AppName = ct.App.AppName
				}
				items = append(items, item)
				createUserNotification(user.ID, "stock", "warning", "卡密库存预警", fmt.Sprintf("卡种 %s 未使用库存 %d，已低于预警阈值 %d", ct.Name, unused, ct.StockWarn), "card_type", ct.ID)
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": items})
}
