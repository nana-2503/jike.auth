package handlers

import (
	"jike-auth/database"
	"jike-auth/models"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// 生成提卡Key
func generateWithdrawKey() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// 列出提卡Key
func ListWithdrawKeys(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	userID := user.ID
	appID := c.Query("app_id")

	var keys []models.WithdrawKey
	query := database.DB.Where("user_id = ?", userID)
	if appID != "" {
		query = query.Where("app_id = ?", appID)
	}

	if err := query.Preload("App").Order("created_at DESC").Find(&keys).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "查询失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": keys})
}

// 创建提卡Key
func CreateWithdrawKey(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	userID := user.ID

	var req struct {
		AppID  uint    `json:"app_id" binding:"required"`
		Name   string  `json:"name" binding:"required"`
		Quota  float64 `json:"quota" binding:"required"`
		Remark string  `json:"remark"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 验证应用归属
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", req.AppID, userID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"code":    1,
			"message": fmt.Sprintf("应用不存在或无权限 (AppID: %d, UserID: %d)", req.AppID, userID),
		})
		return
	}

	key := &models.WithdrawKey{
		UserID:    userID,
		AppID:     req.AppID,
		Name:      req.Name,
		SecretKey: generateWithdrawKey(),
		Quota:     req.Quota,
		Status:    1,
		Remark:    req.Remark,
	}

	if err := database.DB.Create(key).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	// 记录日志
	LogOperation(userID, "create", "withdraw_key", key.ID, fmt.Sprintf("创建提卡Key: %s", key.Name), c.ClientIP(), c.Request.UserAgent())

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "创建成功", "data": key})
}

// 更新提卡Key
func UpdateWithdrawKey(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	userID := user.ID
	id := c.Param("id")

	var req struct {
		Name   string  `json:"name"`
		Quota  float64 `json:"quota" binding:"min=0"`
		Status int     `json:"status"`
		Remark string  `json:"remark"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var key models.WithdrawKey
	if err := database.DB.Where("id = ? AND user_id = ?", id, userID).First(&key).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "提卡Key不存在"})
		return
	}

	updates := map[string]interface{}{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Quota >= 0 {
		updates["quota"] = req.Quota
	}
	if req.Status >= 0 {
		updates["status"] = req.Status
	}
	updates["remark"] = req.Remark

	if err := database.DB.Model(&key).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}

	// 记录日志
	LogOperation(userID, "update", "withdraw_key", key.ID, fmt.Sprintf("更新提卡Key: %s", key.Name), c.ClientIP(), c.Request.UserAgent())

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 删除提卡Key
func DeleteWithdrawKey(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	userID := user.ID
	id := c.Param("id")

	var key models.WithdrawKey
	if err := database.DB.Where("id = ? AND user_id = ?", id, userID).First(&key).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "提卡Key不存在"})
		return
	}

	if err := database.DB.Delete(&key).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}

	// 记录日志
	LogOperation(userID, "delete", "withdraw_key", key.ID, fmt.Sprintf("删除提卡Key: %s", key.Name), c.ClientIP(), c.Request.UserAgent())

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 重置提卡Key
func ResetWithdrawKey(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	userID := user.ID
	id := c.Param("id")

	var key models.WithdrawKey
	if err := database.DB.Where("id = ? AND user_id = ?", id, userID).First(&key).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "提卡Key不存在"})
		return
	}

	newSecretKey := generateWithdrawKey()
	if err := database.DB.Model(&key).Update("secret_key", newSecretKey).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "重置失败"})
		return
	}

	// 记录日志
	LogOperation(userID, "update", "withdraw_key", key.ID, fmt.Sprintf("重置提卡Key: %s", key.Name), c.ClientIP(), c.Request.UserAgent())

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "重置成功", "secret_key": newSecretKey})
}

// 提卡记录
func ListWithdrawLogs(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	userID := user.ID
	keyID := c.Query("key_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	var logs []models.WithdrawLog
	var total int64

	query := database.DB.Joins("JOIN withdraw_keys ON withdraw_keys.id = withdraw_logs.withdraw_key_id").
		Where("withdraw_keys.user_id = ?", userID)

	if keyID != "" {
		query = query.Where("withdraw_logs.withdraw_key_id = ?", keyID)
	}

	query.Model(&models.WithdrawLog{}).Count(&total)

	offset := (page - 1) * pageSize
	if err := query.Preload("WithdrawKey").Preload("CardType").
		Order("withdraw_logs.created_at DESC").
		Offset(offset).Limit(pageSize).
		Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "查询失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":  0,
		"data":  logs,
		"total": total,
		"page":  page,
	})
}

// 公开提卡接口 - 自动生成新卡号
func WithdrawCard(c *gin.Context) {
	var req struct {
		SecretKey  string `json:"secret_key" binding:"required"`
		CardTypeID uint   `json:"card_type_id" binding:"required"`
		Count      int    `json:"count" binding:"required,min=1"`
		Remark     string `json:"remark"` // 备注（可选）
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 查找提卡Key
	var withdrawKey models.WithdrawKey
	if err := database.DB.Where("secret_key = ?", req.SecretKey).First(&withdrawKey).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "提卡密钥不存在"})
		return
	}

	// 检查状态
	if withdrawKey.Status != 1 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "提卡密钥已禁用"})
		return
	}

	// 验证应用归属（确保应用属于提卡密钥的所有者）
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", withdrawKey.AppID, withdrawKey.UserID).First(&app).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "应用不存在或无权限"})
		return
	}

	// 查找卡种（必须属于该应用）
	var cardType models.CardType
	if err := database.DB.Where("id = ? AND app_id = ?", req.CardTypeID, withdrawKey.AppID).First(&cardType).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "卡种不存在或不属于该应用"})
		return
	}

	// 检查提卡单价
	if cardType.WithdrawPrice <= 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "该卡种未设置提卡单价"})
		return
	}

	// 计算总花费
	totalCost := cardType.WithdrawPrice * float64(req.Count)

	// 检查额度（-1表示无限额度）
	remainingQuota := withdrawKey.Quota - withdrawKey.UsedQuota
	if withdrawKey.Quota != -1 && remainingQuota < totalCost {
		c.JSON(http.StatusOK, gin.H{
			"code":            1,
			"message":         "额度不足",
			"remaining_quota": remainingQuota,
			"required":        totalCost,
		})
		return
	}

	// 开始事务
	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 生成新卡号
	charset := getCharset(cardType.GenRule)
	batchNo := generateBatchNo()
	cards := make([]models.Card, 0, req.Count)
	cardNos := make([]string, 0, req.Count)

	// 生成卡号，确保唯一
	existingCards := make(map[string]bool)
	for i := 0; i < req.Count; i++ {
		var cardNo string
		for {
			cardNo = generateCardNo(cardType.Prefix, cardType.CardLength, charset)
			if !existingCards[cardNo] {
				// 检查数据库是否存在
				var count int64
				tx.Model(&models.Card{}).Where("card_no = ?", cardNo).Count(&count)
				if count == 0 {
					existingCards[cardNo] = true
					break
				}
			}
		}
		
		now := time.Now()
		
		cards = append(cards, models.Card{
			AppID:      cardType.AppID,
			CardTypeID: cardType.ID,
			CardNo:     cardNo,
			BatchNo:    batchNo,
			Status:     2, // 直接设置为已使用状态
			UsedAt:     &now,
			Remark:     req.Remark, // 只使用用户提供的备注
		})
		cardNos = append(cardNos, cardNo)
	}

	// 批量插入卡号
	if err := tx.Create(&cards).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "生成卡号失败"})
		return
	}

	// 更新提卡Key已使用额度（包括无限额度也要统计）
	if err := tx.Model(&withdrawKey).Update("used_quota", gorm.Expr("used_quota + ?", totalCost)).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "更新额度失败"})
		return
	}

	// 记录提卡日志
	for _, card := range cards {
		log := &models.WithdrawLog{
			WithdrawKeyID: withdrawKey.ID,
			CardTypeID:    req.CardTypeID,
			CardID:        card.ID,
			CardNo:        card.CardNo,
			Count:         1,
			Price:         cardType.WithdrawPrice,
			TotalCost:     cardType.WithdrawPrice,
			IP:            c.ClientIP(),
			Remark:        req.Remark,
		}
		if err := tx.Create(log).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "记录日志失败"})
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "提交事务失败"})
		return
	}

	// 计算剩余额度（无限额度返回-1）
	var finalRemainingQuota float64
	if withdrawKey.Quota == -1 {
		finalRemainingQuota = -1
	} else {
		finalRemainingQuota = remainingQuota - totalCost
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "提卡成功",
		"data": gin.H{
			"cards":           cardNos,
			"count":           len(cardNos),
			"total_cost":      totalCost,
			"remaining_quota": finalRemainingQuota,
		},
	})
}
