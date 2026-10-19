package handlers

import (
	"fmt"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func pointShopPage(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}
	return page, size
}

func validatePointShopApp(userID uint, appID uint) (*models.App, bool) {
	var app models.App
	if appID == 0 {
		return nil, false
	}
	if err := database.DB.Where("id = ? AND user_id = ?", appID, userID).First(&app).Error; err != nil {
		return nil, false
	}
	return &app, true
}

// ListPointShopItems 作者端商品列表。
func ListPointShopItems(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	page, size := pointShopPage(c)
	appID, _ := strconv.Atoi(c.Query("app_id"))

	query := database.DB.Model(&models.PointShopItem{}).Preload("App").Preload("CardType").Where("user_id = ?", user.ID)
	if appID > 0 {
		query = query.Where("app_id = ?", appID)
	}
	var list []models.PointShopItem
	var total int64
	query.Count(&total)
	query.Order("sort desc, id desc").Offset((page - 1) * size).Limit(size).Find(&list)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

func bindPointShopItem(c *gin.Context) (*models.PointShopItem, bool) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		AppID          uint   `json:"app_id"`
		Name           string `json:"name"`
		Description    string `json:"description"`
		Cost           int    `json:"cost"`
		RewardType     int    `json:"reward_type"`
		RewardPoints   int    `json:"reward_points"`
		RewardDuration int    `json:"reward_duration"`
		CardTypeID     *uint  `json:"card_type_id"`
		Stock          int    `json:"stock"`
		Status         int    `json:"status"`
		Sort           int    `json:"sort"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return nil, false
	}
	if req.Name == "" || req.AppID == 0 || req.Cost <= 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请填写应用、名称和兑换积分"})
		return nil, false
	}
	if req.RewardType < 1 || req.RewardType > 3 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "奖励类型错误"})
		return nil, false
	}
	if _, ok := validatePointShopApp(user.ID, req.AppID); !ok {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "应用不存在或无权限"})
		return nil, false
	}
	if req.RewardType == 1 && req.RewardPoints <= 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "点数奖励必须大于0"})
		return nil, false
	}
	if req.RewardType == 2 && req.RewardDuration == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "时长奖励不能为空"})
		return nil, false
	}
	if req.RewardType == 3 {
		if req.CardTypeID == nil || *req.CardTypeID == 0 {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请选择卡种"})
			return nil, false
		}
		var cardType models.CardType
		if err := database.DB.Where("id = ? AND app_id = ?", *req.CardTypeID, req.AppID).First(&cardType).Error; err != nil {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "卡种不存在或不属于该应用"})
			return nil, false
		}
	}
	if req.Stock == 0 {
		req.Stock = -1
	}
	if req.Status != 1 {
		req.Status = 0
	}
	if req.RewardType == 1 {
		req.RewardDuration = 0
		req.CardTypeID = nil
	}
	if req.RewardType == 2 {
		req.RewardPoints = 0
		req.CardTypeID = nil
	}
	if req.RewardType == 3 {
		req.RewardPoints = 0
		req.RewardDuration = 0
	}
	return &models.PointShopItem{
		UserID:         user.ID,
		AppID:          req.AppID,
		Name:           req.Name,
		Description:    req.Description,
		Cost:           req.Cost,
		RewardType:     req.RewardType,
		RewardPoints:   req.RewardPoints,
		RewardDuration: req.RewardDuration,
		CardTypeID:     req.CardTypeID,
		Stock:          req.Stock,
		Status:         req.Status,
		Sort:           req.Sort,
	}, true
}

func CreatePointShopItem(c *gin.Context) {
	item, ok := bindPointShopItem(c)
	if !ok {
		return
	}
	if err := database.DB.Create(item).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "创建失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "创建成功", "data": item})
}

func UpdatePointShopItem(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id, _ := strconv.Atoi(c.Param("id"))
	var old models.PointShopItem
	if err := database.DB.Where("id = ? AND user_id = ?", id, user.ID).First(&old).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "商品不存在"})
		return
	}
	item, ok := bindPointShopItem(c)
	if !ok {
		return
	}
	updates := map[string]interface{}{
		"app_id": item.AppID, "name": item.Name, "description": item.Description, "cost": item.Cost,
		"reward_type": item.RewardType, "reward_points": item.RewardPoints, "reward_duration": item.RewardDuration,
		"card_type_id": item.CardTypeID, "stock": item.Stock, "status": item.Status, "sort": item.Sort,
	}
	database.DB.Model(&old).Updates(updates)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func DeletePointShopItem(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id, _ := strconv.Atoi(c.Param("id"))
	result := database.DB.Where("id = ? AND user_id = ?", id, user.ID).Delete(&models.PointShopItem{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "商品不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// ListPointShopExchangeLogs 作者端兑换记录。
func ListPointShopExchangeLogs(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	page, size := pointShopPage(c)
	appID, _ := strconv.Atoi(c.Query("app_id"))
	query := database.DB.Model(&models.PointShopExchangeLog{}).Preload("App").Preload("AppUser").Preload("Item").Where("user_id = ?", user.ID)
	if appID > 0 {
		query = query.Where("app_id = ?", appID)
	}
	var list []models.PointShopExchangeLog
	var total int64
	query.Count(&total)
	query.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&list)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

func buildPointShopRewardValue(item *models.PointShopItem, cardNo string) string {
	switch item.RewardType {
	case 1:
		return fmt.Sprintf("增加%d点", item.RewardPoints)
	case 2:
		if item.RewardDuration == -1 {
			return "增加永久时长"
		}
		return fmt.Sprintf("增加%d分钟", item.RewardDuration)
	case 3:
		return cardNo
	default:
		return ""
	}
}

func pointShopItemResponse(item models.PointShopItem) map[string]interface{} {
	result := map[string]interface{}{
		"id":              item.ID,
		"name":            item.Name,
		"description":     item.Description,
		"cost":            item.Cost,
		"reward_type":     item.RewardType,
		"stock":           item.Stock,
		"exchanged_count": item.ExchangedCount,
	}
	switch item.RewardType {
	case 1:
		result["reward_points"] = item.RewardPoints
	case 2:
		result["reward_duration"] = item.RewardDuration
	case 3:
		result["card_type"] = item.CardType
	}
	return result
}

func createPointShopCard(tx *gorm.DB, item *models.PointShopItem) (*models.Card, error) {
	var cardType models.CardType
	if item.CardTypeID == nil {
		return nil, fmt.Errorf("未配置卡种")
	}
	if err := tx.First(&cardType, *item.CardTypeID).Error; err != nil {
		return nil, fmt.Errorf("卡种不存在")
	}
	charset := getCharset(cardType.GenRule)
	var cardNo string
	for {
		cardNo = generateCardNo(cardType.Prefix, cardType.CardLength, charset)
		var count int64
		tx.Model(&models.Card{}).Where("card_no = ?", cardNo).Count(&count)
		if count == 0 {
			break
		}
	}
	card := &models.Card{AppID: item.AppID, CardTypeID: cardType.ID, CardNo: cardNo, BatchNo: "SHOP" + generateBatchNo(), Status: 1, Remark: "积分商城兑换"}
	if err := tx.Create(card).Error; err != nil {
		return nil, err
	}
	return card, nil
}

func applyPointShopReward(tx *gorm.DB, appUser *models.AppUser, item *models.PointShopItem) (*models.Card, error) {
	switch item.RewardType {
	case 1:
		return nil, tx.Model(&models.AppUser{}).Where("id = ?", appUser.ID).UpdateColumn("points", gorm.Expr("points + ?", item.RewardPoints)).Error
	case 2:
		var newExpire time.Time
		if item.RewardDuration == -1 {
			newExpire = time.Date(2099, 12, 31, 23, 59, 59, 0, time.Local)
		} else {
			base := time.Now()
			if appUser.ExpireAt != nil && appUser.ExpireAt.After(base) {
				base = *appUser.ExpireAt
			}
			newExpire = base.Add(time.Duration(item.RewardDuration) * time.Minute)
		}
		return nil, tx.Model(&models.AppUser{}).Where("id = ?", appUser.ID).Updates(map[string]interface{}{"expire_at": newExpire, "is_paid": 1}).Error
	case 3:
		return createPointShopCard(tx, item)
	default:
		return nil, fmt.Errorf("奖励类型错误")
	}
}

// SDKListPointShopItems 软件用户查看可兑换商品。
func SDKListPointShopItems(c *gin.Context) {
	app, err := sdkDecryptRequestWithToken(c, nil)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}
	session := c.MustGet("sdk_session").(*models.OnlineSession)
	var items []models.PointShopItem
	database.DB.Preload("CardType").Where("app_id = ? AND status = 1 AND (stock = -1 OR stock > exchanged_count)", app.ID).Order("sort desc, id desc").Find(&items)
	result := make([]gin.H, 0, len(items))
	for _, item := range items {
		result = append(result, pointShopItemResponse(item))
	}
	sdkEncryptedResponse(c, app, 0, "success", gin.H{"points": session.AppUser.RebatePoints, "list": result})
}

// SDKExchangePointShopItem 软件用户兑换积分商城商品。
func SDKExchangePointShopItem(c *gin.Context) {
	var req struct {
		ItemID uint `json:"item_id"`
	}
	app, err := sdkDecryptRequestWithToken(c, &req)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}
	if req.ItemID == 0 {
		sdkEncryptedResponse(c, app, 201, "缺少item_id参数", nil)
		return
	}
	session := c.MustGet("sdk_session").(*models.OnlineSession)
	var exchangeLog models.PointShopExchangeLog
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		var appUser models.AppUser
		if err := tx.Set("gorm:query_option", "FOR UPDATE").First(&appUser, session.AppUserID).Error; err != nil {
			return fmt.Errorf("用户不存在")
		}
		var item models.PointShopItem
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Preload("CardType").Where("id = ? AND app_id = ? AND status = 1", req.ItemID, app.ID).First(&item).Error; err != nil {
			return fmt.Errorf("商品不存在或已下架")
		}
		if item.Stock >= 0 && item.ExchangedCount >= item.Stock {
			return fmt.Errorf("商品库存不足")
		}
		if appUser.RebatePoints < item.Cost {
			return fmt.Errorf("积分不足")
		}
		var card *models.Card
		card, err = applyPointShopReward(tx, &appUser, &item)
		if err != nil {
			return err
		}
		if err := tx.Model(&models.AppUser{}).Where("id = ? AND rebate_points >= ?", appUser.ID, item.Cost).UpdateColumn("rebate_points", gorm.Expr("rebate_points - ?", item.Cost)).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.PointShopItem{}).Where("id = ?", item.ID).UpdateColumn("exchanged_count", gorm.Expr("exchanged_count + 1")).Error; err != nil {
			return err
		}
		var cardID *uint
		cardNo := ""
		if card != nil {
			cardID = &card.ID
			cardNo = card.CardNo
		}
		exchangeLog = models.PointShopExchangeLog{
			UserID: app.UserID, AppID: app.ID, AppUserID: appUser.ID, ItemID: item.ID, ItemName: item.Name,
			Cost: item.Cost, RewardType: item.RewardType, RewardValue: buildPointShopRewardValue(&item, cardNo), CardID: cardID, CardNo: cardNo, IP: getClientIP(c),
		}
		return tx.Create(&exchangeLog).Error
	})
	if err != nil {
		sdkEncryptedResponse(c, app, 203, err.Error(), nil)
		return
	}
	var user models.AppUser
	database.DB.First(&user, session.AppUserID)
	sdkEncryptedResponse(c, app, 0, "兑换成功", gin.H{"log": exchangeLog, "points": user.RebatePoints})
}

func SDKListPointShopExchangeLogs(c *gin.Context) {
	app, err := sdkDecryptRequestWithToken(c, nil)
	if err != nil {
		sdkErrorResponse(c, app, getErrorCode(err), err.Error())
		return
	}
	session := c.MustGet("sdk_session").(*models.OnlineSession)
	var logs []models.PointShopExchangeLog
	database.DB.Where("app_user_id = ?", session.AppUserID).Order("id desc").Limit(50).Find(&logs)
	sdkEncryptedResponse(c, app, 0, "success", logs)
}
