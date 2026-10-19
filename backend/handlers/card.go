package handlers

import (
	"crypto/rand"
	"fmt"
	"gorm.io/gorm"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

func restoredCardStatus(card models.Card) int {
	return cardStatusByUseCount(card.UsedCount, card.CardType)
}

func cardStatusAfterUse(card models.Card) int {
	return cardStatusByUseCount(card.UsedCount+1, card.CardType)
}

func cardStatusByUseCount(usedCount int, cardType *models.CardType) int {
	maxUse := 1
	if cardType != nil && cardType.MaxUse > 0 {
		maxUse = cardType.MaxUse
	}
	if usedCount >= maxUse {
		return 2
	}
	if usedCount > 0 {
		return 4
	}
	return 1
}

func restoreDisabledCardsStatus(query *gorm.DB) *gorm.DB {
	return query.
		Joins("LEFT JOIN card_types ON card_types.id = cards.card_type_id").
		Updates(map[string]interface{}{
			"status": gorm.Expr("CASE WHEN cards.used_count >= COALESCE(NULLIF(card_types.max_use, 0), 1) THEN 2 WHEN cards.used_count > 0 THEN 4 ELSE 1 END"),
		})
}

const (
	lowerChars      = "abcdefghijklmnopqrstuvwxyz"
	upperChars      = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	digitChars      = "0123456789"
	lowerDigitChars = lowerChars + digitChars
	upperDigitChars = upperChars + digitChars
	allChars        = lowerChars + upperChars
	allDigitChars   = allChars + digitChars
)

func getCharset(genRule int) string {
	switch genRule {
	case 1:
		return lowerChars
	case 2:
		return upperChars
	case 3:
		return allChars
	case 4:
		return lowerDigitChars
	case 5:
		return upperDigitChars
	case 6:
		return allDigitChars
	default:
		return allDigitChars
	}
}

func generateCardNo(prefix string, length int, charset string) string {
	prefixLen := len(prefix)
	if prefixLen >= length {
		return prefix[:length]
	}
	randomLen := length - prefixLen
	result := make([]byte, randomLen)
	randBytes := make([]byte, randomLen)
	rand.Read(randBytes)
	for i := range result {
		result[i] = charset[int(randBytes[i])%len(charset)]
	}
	return prefix + string(result)
}

func generateBatchNo() string {
	return time.Now().Format("20060102150405")
}

// 用户制卡
func GenerateCards(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		CardTypeID uint   `json:"card_type_id" binding:"required"`
		Count      int    `json:"count" binding:"required,min=1,max=1000"`
		Remark     string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 获取卡种
	var cardType models.CardType
	if err := database.DB.First(&cardType, req.CardTypeID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "卡种不存在"})
		return
	}

	// 验证APP归属
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", cardType.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此卡种"})
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
	if maxCards >= 0 && int(cardCount)+req.Count > maxCards {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": fmt.Sprintf("已达到卡号数量上限，当前%d张，最多%d张", cardCount, maxCards)})
		return
	}

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
				database.DB.Model(&models.Card{}).Where("card_no = ?", cardNo).Count(&count)
				if count == 0 {
					existingCards[cardNo] = true
					break
				}
			}
		}
		cards = append(cards, models.Card{
			AppID:      cardType.AppID,
			CardTypeID: cardType.ID,
			CardNo:     cardNo,
			BatchNo:    batchNo,
			Status:     1,
			Remark:     req.Remark,
		})
		cardNos = append(cardNos, cardNo)
	}

	// 批量插入
	if err := database.DB.Create(&cards).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "生成失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"batch_no": batchNo,
			"count":    len(cardNos),
			"cards":    cardNos,
		},
	})
}

// 用户卡号列表
func ListCards(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appID := c.Query("app_id")
	cardTypeID := c.Query("card_type_id")
	batchNo := c.Query("batch_no")
	status := c.Query("status")
	keyword := c.Query("keyword")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var list []models.Card
	var total int64
	query := database.DB.Model(&models.Card{}).Preload("CardType").Preload("App.User").Preload("Agent")

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
			c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": []models.Card{}, "total": 0}})
			return
		}
		query = query.Where("app_id IN ?", appIDs)
	}

	if cardTypeID != "" {
		query = query.Where("card_type_id = ?", cardTypeID)
	}
	if batchNo != "" {
		query = query.Where("batch_no = ?", batchNo)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if keyword != "" {
		query = query.Where("card_no LIKE ?", "%"+database.EscapeLike(keyword)+"%")
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 获取卡号使用记录
func GetCardUsageRecords(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
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

	var logs []models.CardUseLog
	database.DB.Where("card_id = ?", card.ID).Order("id desc").Find(&logs)

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"card_no": card.CardNo,
			"records": logs,
		},
	})
}

// 用户删除卡号
func DeleteCard(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
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

	if err := database.DB.Delete(&card).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 用户禁用/启用卡号
func UpdateCardStatus(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var card models.Card
	if err := database.DB.Preload("CardType").First(&card, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "卡号不存在"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", card.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Status int `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	if req.Status != 1 && req.Status != 3 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "卡号只能启用或禁用"})
		return
	}

	newStatus := req.Status
	if req.Status == 1 && card.Status == 3 {
		newStatus = restoredCardStatus(card)
	}

	if err := database.DB.Model(&card).Update("status", newStatus).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 获取批次列表
func ListCardBatches(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appID := c.Query("app_id")

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}

	var batches []struct {
		BatchNo       string `json:"batch_no"`
		Count         int64  `json:"count"`
		UnusedCount   int64  `json:"unused_count"`
		UsingCount    int64  `json:"using_count"`
		UsedCount     int64  `json:"used_count"`
		DisabledCount int64  `json:"disabled_count"`
		CreatedAt     string `json:"created_at"`
	}
	database.DB.Model(&models.Card{}).
		Select("batch_no, COUNT(*) as count, SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as unused_count, SUM(CASE WHEN status = 4 THEN 1 ELSE 0 END) as using_count, SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as used_count, SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) as disabled_count, MIN(created_at) as created_at").
		Where("app_id = ?", appID).
		Group("batch_no").
		Order("created_at desc").
		Scan(&batches)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": batches})
}

func UpdateCardsByBatchStatus(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		AppID   uint   `json:"app_id" binding:"required"`
		BatchNo string `json:"batch_no" binding:"required"`
		Status  int    `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	if req.Status != 1 && req.Status != 3 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "批次只能启用或禁用"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", req.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}

	query := database.DB.Model(&models.Card{}).Where("app_id = ? AND batch_no = ?", req.AppID, req.BatchNo)
	var result *gorm.DB
	if req.Status == 1 {
		result = restoreDisabledCardsStatus(query.Where("status = 3"))
	} else {
		result = query.Where("status NOT IN ?", []int{2, 4}).Update("status", req.Status)
	}
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("成功更新 %d 张卡", result.RowsAffected)})
}

// 管理员卡号列表
func AdminListCards(c *gin.Context) {
	appID := c.Query("app_id")
	cardTypeID := c.Query("card_type_id")
	batchNo := c.Query("batch_no")
	status := c.Query("status")
	keyword := c.Query("keyword")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var list []models.Card
	var total int64
	query := database.DB.Model(&models.Card{}).Preload("CardType").Preload("App")
	if appID != "" {
		query = query.Where("app_id = ?", appID)
	}
	if cardTypeID != "" {
		query = query.Where("card_type_id = ?", cardTypeID)
	}
	if batchNo != "" {
		query = query.Where("batch_no = ?", batchNo)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if keyword != "" {
		query = query.Where("card_no LIKE ?", "%"+database.EscapeLike(keyword)+"%")
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 管理员删除卡号
func AdminDeleteCard(c *gin.Context) {
	id := c.Param("id")
	if err := database.DB.Delete(&models.Card{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 管理员更新卡号状态
func AdminUpdateCardStatus(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Status int `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	if req.Status != 1 && req.Status != 3 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "卡号只能启用或禁用"})
		return
	}

	var card models.Card
	if err := database.DB.Preload("CardType").First(&card, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "卡号不存在"})
		return
	}

	newStatus := req.Status
	if req.Status == 1 && card.Status == 3 {
		newStatus = restoredCardStatus(card)
	}

	if err := database.DB.Model(&card).Update("status", newStatus).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 批量删除卡号
func DeleteCardsByBatch(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		AppID   uint   `json:"app_id" binding:"required"`
		BatchNo string `json:"batch_no" binding:"required"`
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

	result := database.DB.Where("app_id = ? AND batch_no = ?", req.AppID, req.BatchNo).Delete(&models.Card{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("成功删除 %d 张卡", result.RowsAffected)})
}

// 导出批次卡号
func ExportCardsByBatch(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appID := c.Query("app_id")
	batchNo := c.Query("batch_no")
	status := c.Query("status")

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}

	var cards []models.Card
	query := database.DB.Where("app_id = ? AND batch_no = ?", appID, batchNo)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	query.Find(&cards)

	cardNos := make([]string, len(cards))
	for i, card := range cards {
		cardNos[i] = card.CardNo
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": cardNos})
}

// 导出卡号为Excel格式（CSV）
func ExportCardsExcel(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appID := c.Query("app_id")
	cardTypeID := c.Query("card_type_id")
	batchNo := c.Query("batch_no")
	status := c.Query("status")

	query := database.DB.Model(&models.Card{}).Preload("CardType")

	if appID != "" {
		var app models.App
		if err := database.DB.Where("id = ? AND user_id = ?", appID, user.ID).First(&app).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
			return
		}
		query = query.Where("app_id = ?", appID)
	} else {
		var appIDs []uint
		database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)
		if len(appIDs) == 0 {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "暂无数据"})
			return
		}
		query = query.Where("app_id IN ?", appIDs)
	}

	if cardTypeID != "" {
		query = query.Where("card_type_id = ?", cardTypeID)
	}
	if batchNo != "" {
		query = query.Where("batch_no = ?", batchNo)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var cards []models.Card
	query.Order("id desc").Limit(10000).Find(&cards)

	// 生成CSV内容
	csv := "卡号,卡种,批次号,状态,使用次数,创建时间\n"
	for _, card := range cards {
		statusText := "未使用"
		if card.Status == 2 {
			statusText = "已使用"
		} else if card.Status == 3 {
			statusText = "已禁用"
		} else if card.Status == 4 {
			statusText = "使用中"
		}
		cardTypeName := ""
		if card.CardType != nil {
			cardTypeName = card.CardType.Name
		}
		csv += fmt.Sprintf("%s,%s,%s,%s,%d,%s\n",
			card.CardNo, cardTypeName, card.BatchNo, statusText, card.UsedCount, card.CreatedAt.Format("2006-01-02 15:04:05"))
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=cards.csv")
	// 添加BOM以支持Excel正确识别UTF-8
	c.String(http.StatusOK, "\xEF\xBB\xBF"+csv)
}

// 批量删除卡号（按ID列表）
func BatchDeleteCards(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		IDs []uint `json:"ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	if len(req.IDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请选择要删除的卡号"})
		return
	}

	// 获取用户所有APP的ID
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)

	result := database.DB.Where("id IN ? AND app_id IN ?", req.IDs, appIDs).Delete(&models.Card{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("成功删除 %d 张卡", result.RowsAffected)})
}

// 批量更新卡号状态
func BatchUpdateCardStatus(c *gin.Context) {
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
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请选择要操作的卡号"})
		return
	}

	// 获取用户所有APP的ID
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)

	if req.Status != 1 && req.Status != 3 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "卡号只能启用或禁用"})
		return
	}

	query := database.DB.Model(&models.Card{}).Where("id IN ? AND app_id IN ?", req.IDs, appIDs)
	var result *gorm.DB
	if req.Status == 1 {
		result = restoreDisabledCardsStatus(query.Where("status = 3"))
	} else {
		result = query.Update("status", req.Status)
	}
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("成功更新 %d 张卡", result.RowsAffected)})
}
