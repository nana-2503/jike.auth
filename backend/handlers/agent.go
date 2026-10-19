package handlers

import (
	"jike-auth/database"
	"jike-auth/models"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ========== 用户管理代理 ==========

// 代理列表
func ListAgents(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appID := c.Query("app_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	keyword := c.Query("keyword")

	var list []models.Agent
	var total int64
	query := database.DB.Model(&models.Agent{}).Preload("App").Preload("Parent").Where("user_id = ?", user.ID)

	if appID != "" {
		query = query.Where("app_id = ?", appID)
	}
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("username LIKE ? OR nickname LIKE ? OR qq LIKE ? OR phone LIKE ?",
			kw, kw, kw, kw)
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 获取代理详情
func GetAgent(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var agent models.Agent
	if err := database.DB.Preload("App").Preload("Parent").First(&agent, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "代理不存在"})
		return
	}
	if agent.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": agent})
}

// 创建代理
func CreateAgent(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		AppID    uint    `json:"app_id" binding:"required"`
		ParentID *uint   `json:"parent_id"`
		Username string  `json:"username" binding:"required"`
		Password string  `json:"password" binding:"required"`
		Nickname string  `json:"nickname"`
		Balance  float64 `json:"balance"`
		QQ       string  `json:"qq"`
		Phone    string  `json:"phone"`
		Remark   string  `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 验证APP归属
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", req.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}

	if req.ParentID != nil {
		var parent models.Agent
		if err := database.DB.Where("id = ? AND user_id = ? AND app_id = ?", *req.ParentID, user.ID, req.AppID).First(&parent).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "上级代理不存在"})
			return
		}
	}

	// 检查用户名是否已存在
	var count int64
	database.DB.Model(&models.Agent{}).Where("app_id = ? AND username = ?", req.AppID, req.Username).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "代理账号已存在"})
		return
	}

	hashedPwd, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	agent := models.Agent{
		UserID:   user.ID,
		AppID:    req.AppID,
		ParentID: req.ParentID,
		Username: req.Username,
		Password: string(hashedPwd),
		Nickname: req.Nickname,
		Balance:  req.Balance,
		QQ:       req.QQ,
		Phone:    req.Phone,
		Remark:   req.Remark,
		Status:   1,
	}
	if err := database.DB.Create(&agent).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": agent})
}

// 更新代理
func UpdateAgent(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var agent models.Agent
	if err := database.DB.First(&agent, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "代理不存在"})
		return
	}
	if agent.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Password *string  `json:"password"`
		ParentID *uint    `json:"parent_id"`
		Nickname *string  `json:"nickname"`
		Balance  *float64 `json:"balance"`
		QQ       *string  `json:"qq"`
		Phone    *string  `json:"phone"`
		Status   *int     `json:"status"`
		Remark   *string  `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Password != nil && *req.Password != "" {
		hashedPwd, _ := bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
		updates["password"] = string(hashedPwd)
	}
	if req.ParentID != nil {
		if *req.ParentID == 0 {
			updates["parent_id"] = nil
		} else {
			if *req.ParentID == agent.ID {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "上级代理不能是自己"})
				return
			}
			var parent models.Agent
			if err := database.DB.Where("id = ? AND user_id = ? AND app_id = ?", *req.ParentID, user.ID, agent.AppID).First(&parent).Error; err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "上级代理不存在"})
				return
			}
			updates["parent_id"] = *req.ParentID
		}
	}
	if req.Nickname != nil {
		updates["nickname"] = *req.Nickname
	}
	if req.Balance != nil {
		updates["balance"] = *req.Balance
	}
	if req.QQ != nil {
		updates["qq"] = *req.QQ
	}
	if req.Phone != nil {
		updates["phone"] = *req.Phone
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.Remark != nil {
		updates["remark"] = *req.Remark
	}

	database.DB.Model(&agent).Updates(updates)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 删除代理
func DeleteAgent(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var agent models.Agent
	if err := database.DB.First(&agent, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "代理不存在"})
		return
	}
	if agent.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var childCount int64
	database.DB.Model(&models.Agent{}).Where("parent_id = ?", agent.ID).Count(&childCount)
	if childCount > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "请先删除或转移下级代理"})
		return
	}

	// 删除代理的卡种权限
	database.DB.Where("agent_id = ?", agent.ID).Delete(&models.AgentCardType{})
	database.DB.Delete(&agent)

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 代理充值余额
func RechargeAgent(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var agent models.Agent
	if err := database.DB.First(&agent, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "代理不存在"})
		return
	}
	if agent.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Amount float64 `json:"amount" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	tx := database.DB.Begin()
	if err := tx.Model(&models.Agent{}).Where("id = ?", agent.ID).
		UpdateColumn("balance", gorm.Expr("balance + ?", req.Amount)).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "充值失败"})
		return
	}
	if err := tx.First(&agent, agent.ID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "充值失败"})
		return
	}
	log := models.AgentBalanceLog{
		AgentID:      agent.ID,
		Kind:         "recharge",
		Amount:       req.Amount,
		BalanceAfter: agent.Balance,
		Remark:       "站长充值",
	}
	if err := tx.Create(&log).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "记录流水失败"})
		return
	}
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "充值失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "充值成功", "data": gin.H{"balance": agent.Balance}})
}

// 获取代理每日制卡和消费统计
func GetAgentDailyStats(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	if days <= 0 || days > 180 {
		days = 30
	}

	var agent models.Agent
	if err := database.DB.Preload("App").First(&agent, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "代理不存在"})
		return
	}
	if agent.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	type dayRow struct {
		Date      string  `json:"date" gorm:"column:date"`
		Count     int     `json:"count" gorm:"column:count"`
		TotalCost float64 `json:"total_cost" gorm:"column:total_cost"`
		Batches   int     `json:"batches" gorm:"column:batches"`
	}
	type balanceDayRow struct {
		Date   string  `gorm:"column:date"`
		Kind   string  `gorm:"column:kind"`
		Amount float64 `gorm:"column:amount"`
	}

	start := time.Now().AddDate(0, 0, -(days - 1))
	start = time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.Local)

	var raw []dayRow
	database.DB.Model(&models.AgentCardLog{}).
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') as date, COALESCE(SUM(count),0) as count, COALESCE(SUM(total_cost),0) as total_cost, COUNT(*) as batches").
		Where("agent_id = ? AND created_at >= ?", agent.ID, start).
		Group("DATE_FORMAT(created_at, '%Y-%m-%d')").
		Order("date DESC").
		Scan(&raw)

	var packageRows []balanceDayRow
	database.DB.Model(&models.AgentBalanceLog{}).
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') as date, kind, COALESCE(SUM(amount),0) as amount").
		Where("agent_id = ? AND kind IN ? AND created_at >= ?", agent.ID, []string{"stock_package", "stock_package_refund"}, start).
		Group("DATE_FORMAT(created_at, '%Y-%m-%d'), kind").
		Scan(&packageRows)

	dayMap := map[string]gin.H{}
	packageCostMap := map[string]float64{}
	packageRefundMap := map[string]float64{}
	for _, row := range packageRows {
		if row.Kind == "stock_package" {
			packageCostMap[row.Date] += math.Abs(row.Amount)
		}
		if row.Kind == "stock_package_refund" {
			packageRefundMap[row.Date] += math.Abs(row.Amount)
		}
	}
	for date, packageCost := range packageCostMap {
		packageRefund := packageRefundMap[date]
		dayMap[date] = gin.H{
			"date":             date,
			"count":            0,
			"card_cost":        0.0,
			"package_cost":     packageCost,
			"package_refund":   packageRefund,
			"total_cost":       packageCost - packageRefund,
			"batches":          0,
			"has_package_cost": true,
		}
	}
	for date, packageRefund := range packageRefundMap {
		if _, ok := dayMap[date]; ok {
			continue
		}
		dayMap[date] = gin.H{
			"date":             date,
			"count":            0,
			"card_cost":        0.0,
			"package_cost":     0.0,
			"package_refund":   packageRefund,
			"total_cost":       -packageRefund,
			"batches":          0,
			"has_package_cost": true,
		}
	}

	var totalCount int
	var totalCost float64
	var totalBatches int
	for _, row := range raw {
		packageCost := packageCostMap[row.Date]
		packageRefund := packageRefundMap[row.Date]
		dayMap[row.Date] = gin.H{
			"date":             row.Date,
			"count":            row.Count,
			"card_cost":        row.TotalCost,
			"package_cost":     packageCost,
			"package_refund":   packageRefund,
			"total_cost":       row.TotalCost + packageCost - packageRefund,
			"batches":          row.Batches,
			"has_package_cost": packageCost > 0 || packageRefund > 0,
		}
		totalCount += row.Count
		totalCost += row.TotalCost + packageCost - packageRefund
		totalBatches += row.Batches
	}
	for date, packageCost := range packageCostMap {
		foundCardLog := false
		for _, cardRow := range raw {
			if cardRow.Date == date {
				foundCardLog = true
				break
			}
		}
		if !foundCardLog {
			totalCost += packageCost - packageRefundMap[date]
		}
	}
	for date, packageRefund := range packageRefundMap {
		if _, hasCost := packageCostMap[date]; hasCost {
			continue
		}
		foundCardLog := false
		for _, cardRow := range raw {
			if cardRow.Date == date {
				foundCardLog = true
				break
			}
		}
		if !foundCardLog {
			totalCost -= packageRefund
		}
	}

	list := make([]gin.H, 0, len(dayMap))
	for i := days - 1; i >= 0; i-- {
		key := start.AddDate(0, 0, i).Format("2006-01-02")
		if row, ok := dayMap[key]; ok {
			list = append(list, row)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"agent": gin.H{
				"id":       agent.ID,
				"username": agent.Username,
				"nickname": agent.Nickname,
				"app_name": agent.App.AppName,
			},
			"days":          days,
			"total_count":   totalCount,
			"total_cost":    totalCost,
			"total_batches": totalBatches,
			"list":          list,
		},
	})
}

// 获取代理某日制卡明细
func GetAgentDailyLogs(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")
	date := c.Query("date")
	if date == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "请选择日期"})
		return
	}

	var agent models.Agent
	if err := database.DB.First(&agent, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "代理不存在"})
		return
	}
	if agent.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	start, err := time.ParseInLocation("2006-01-02", date, time.Local)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "日期格式错误"})
		return
	}

	var cardLogs []models.AgentCardLog
	database.DB.Preload("CardType").
		Where("agent_id = ? AND created_at >= ? AND created_at < ?", agent.ID, start, start.Add(24*time.Hour)).
		Order("id desc").
		Find(&cardLogs)

	var balanceLogs []models.AgentBalanceLog
	database.DB.Where("agent_id = ? AND kind IN ? AND created_at >= ? AND created_at < ?",
		agent.ID, []string{"stock_package", "stock_package_refund"}, start, start.Add(24*time.Hour)).
		Order("id desc").
		Find(&balanceLogs)

	items := make([]gin.H, 0, len(cardLogs)+len(balanceLogs))
	for _, log := range cardLogs {
		items = append(items, gin.H{
			"type":       "card",
			"id":         log.ID,
			"batch_no":   log.BatchNo,
			"count":      log.Count,
			"price":      log.Price,
			"total_cost": log.TotalCost,
			"created_at": log.CreatedAt,
			"card_type":  log.CardType,
		})
	}
	for _, log := range balanceLogs {
		items = append(items, gin.H{
			"type":          "balance",
			"id":            log.ID,
			"kind":          log.Kind,
			"amount":        log.Amount,
			"balance_after": log.BalanceAfter,
			"ref":           log.Ref,
			"remark":        log.Remark,
			"created_at":    log.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": items}})
}

// ========== 代理卡种权限管理 ==========

// 获取代理卡种权限列表
func ListAgentCardTypes(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	agentID := c.Param("id")

	var agent models.Agent
	if err := database.DB.First(&agent, agentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "代理不存在"})
		return
	}
	if agent.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var list []models.AgentCardType
	database.DB.Preload("CardType").Where("agent_id = ?", agentID).Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": list})
}

// 设置代理卡种权限
func SetAgentCardTypes(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	agentID := c.Param("id")

	var agent models.Agent
	if err := database.DB.First(&agent, agentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "代理不存在"})
		return
	}
	if agent.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		CardTypes []struct {
			CardTypeID uint    `json:"card_type_id"`
			Price      float64 `json:"price"`
		} `json:"card_types"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 验证卡种归属
	for _, ct := range req.CardTypes {
		var cardType models.CardType
		if err := database.DB.First(&cardType, ct.CardTypeID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "卡种不存在"})
			return
		}
		if cardType.AppID != agent.AppID {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "卡种不属于此应用"})
			return
		}
		if ct.Price < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "制卡单价不能为负数"})
			return
		}
	}

	// 删除旧权限
	database.DB.Where("agent_id = ?", agent.ID).Delete(&models.AgentCardType{})

	// 添加新权限
	for _, ct := range req.CardTypes {
		agentCardType := models.AgentCardType{
			AgentID:    agent.ID,
			CardTypeID: ct.CardTypeID,
			Price:      ct.Price,
		}
		database.DB.Create(&agentCardType)
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "设置成功"})
}
