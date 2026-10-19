package handlers

import (
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// 用户卡种管理
func ListCardTypes(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appID := c.Query("app_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var list []models.CardType
	var total int64
	query := database.DB.Model(&models.CardType{}).Preload("App")

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
			c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": []models.CardType{}, "total": 0}})
			return
		}
		query = query.Where("app_id IN ?", appIDs)
	}

	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

func GetCardType(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var cardType models.CardType
	if err := database.DB.First(&cardType, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "卡种不存在"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", cardType.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": cardType})
}

func CreateCardType(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		AppID         uint    `json:"app_id" binding:"required"`
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
		StockWarn     int     `json:"stock_warn"`
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
		AppID:         req.AppID,
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
		StockWarn:     req.StockWarn,
	}

	if cardType.CardLength < 5 {
		cardType.CardLength = 5
	}

	if err := database.DB.Create(cardType).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": cardType})
}

func UpdateCardType(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var cardType models.CardType
	if err := database.DB.First(&cardType, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "卡种不存在"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", cardType.AppID, user.ID).First(&app).Error; err != nil {
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
		StockWarn     *int     `json:"stock_warn"`
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
		if length < 5 {
			length = 5
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
	if req.StockWarn != nil {
		updates["stock_warn"] = *req.StockWarn
	}

	if err := database.DB.Model(&cardType).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func DeleteCardType(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var cardType models.CardType
	if err := database.DB.First(&cardType, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "卡种不存在"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", cardType.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	if err := database.DB.Delete(&cardType).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 管理员卡种管理
func AdminListCardTypes(c *gin.Context) {
	appID := c.Query("app_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var list []models.CardType
	var total int64
	query := database.DB.Model(&models.CardType{}).Preload("App").Preload("App.User")
	if appID != "" {
		query = query.Where("app_id = ?", appID)
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

func AdminCreateCardType(c *gin.Context) {
	var req struct {
		AppID         uint    `json:"app_id" binding:"required"`
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
		StockWarn     int     `json:"stock_warn"`
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
	cardType := &models.CardType{
		AppID: req.AppID, Name: req.Name, Category: getIntOrDefault(req.Category, 1), Prefix: req.Prefix,
		Points: req.Points, RebatePoints: req.RebatePoints, Duration: req.Duration, GenRule: getIntOrDefault(req.GenRule, 1),
		MaxUse: getIntOrDefault(req.MaxUse, 1), MaxUserUse: getIntOrDefault(req.MaxUserUse, 1), Channels: getIntOrDefault(req.Channels, 1), Features: getIntOrDefault(req.Features, 1),
		UnbindDay: getIntOrDefault(req.UnbindDay, -1), UnbindWeek: getIntOrDefault(req.UnbindWeek, -1), UnbindMonth: getIntOrDefault(req.UnbindMonth, -1),
		UnbindHalfY: getIntOrDefault(req.UnbindHalfY, -1), UnbindYear: getIntOrDefault(req.UnbindYear, -1), UnbindTotal: getIntOrDefault(req.UnbindTotal, -1),
		CardLength: getIntOrDefault(req.CardLength, 16), ExtraData: req.ExtraData, Remark: req.Remark, WithdrawPrice: req.WithdrawPrice, StockWarn: req.StockWarn,
	}
	if cardType.CardLength < 5 {
		cardType.CardLength = 5
	}
	if err := database.DB.Create(cardType).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": cardType})
}

func AdminGetCardType(c *gin.Context) {
	id := c.Param("id")
	var cardType models.CardType
	if err := database.DB.Preload("App").First(&cardType, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "卡种不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": cardType})
}

func AdminUpdateCardType(c *gin.Context) {
	id := c.Param("id")

	var cardType models.CardType
	if err := database.DB.First(&cardType, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "卡种不存在"})
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
		StockWarn     *int     `json:"stock_warn"`
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
		if length < 5 {
			length = 5
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
	if req.StockWarn != nil {
		updates["stock_warn"] = *req.StockWarn
	}

	if err := database.DB.Model(&cardType).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func AdminDeleteCardType(c *gin.Context) {
	id := c.Param("id")
	if err := database.DB.Delete(&models.CardType{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}
