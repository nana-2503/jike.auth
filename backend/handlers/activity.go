package handlers

import (
	"jike-auth/database"
	"jike-auth/models"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ========== 作者端活动管理 ==========

func ListActivities(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var activities []models.Activity
	var total int64
	query := database.DB.Model(&models.Activity{}).Where("user_id = ?", user.ID)
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&activities)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": activities, "total": total}})
}

func GetActivity(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var activity models.Activity
	if err := database.DB.First(&activity, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "活动不存在"})
		return
	}
	if activity.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var prizes []models.ActivityPrize
	database.DB.Preload("CardType").Where("activity_id = ?", id).Order("sort asc").Find(&prizes)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"activity": activity, "prizes": prizes}})
}

func CreateActivity(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		Title       string `json:"title" binding:"required"`
		Type        int    `json:"type" binding:"required"`
		Description string `json:"description"`
		Cover       string `json:"cover"`
		StartAt     string `json:"start_at"`
		EndAt       string `json:"end_at"`
		DrawAt      string `json:"draw_at"`
		MaxJoin     int    `json:"max_join"`
		Status      int    `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	activity := &models.Activity{
		UserID:      user.ID,
		Title:       req.Title,
		Type:        req.Type,
		Description: req.Description,
		Cover:       req.Cover,
		MaxJoin:     getIntOrDefault(req.MaxJoin, -1),
		Status:      getIntOrDefault(req.Status, 1),
	}
	if req.StartAt != "" {
		if t, err := time.ParseInLocation("2006-01-02T15:04:05", req.StartAt, time.Local); err == nil {
			activity.StartAt = &t
		}
	}
	if req.EndAt != "" {
		if t, err := time.ParseInLocation("2006-01-02T15:04:05", req.EndAt, time.Local); err == nil {
			activity.EndAt = &t
		}
	}
	if req.DrawAt != "" {
		if t, err := time.ParseInLocation("2006-01-02T15:04:05", req.DrawAt, time.Local); err == nil {
			activity.DrawAt = &t
		}
	}

	if err := database.DB.Create(activity).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": activity})
}

func UpdateActivity(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var activity models.Activity
	if err := database.DB.First(&activity, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "活动不存在"})
		return
	}
	if activity.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Cover       string `json:"cover"`
		StartAt     string `json:"start_at"`
		EndAt       string `json:"end_at"`
		DrawAt      string `json:"draw_at"`
		MaxJoin     int    `json:"max_join"`
		Status      int    `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := map[string]interface{}{
		"title":       req.Title,
		"description": req.Description,
		"cover":       req.Cover,
		"max_join":    req.MaxJoin,
		"status":      req.Status,
	}

	if req.StartAt != "" {
		t, _ := time.ParseInLocation("2006-01-02T15:04:05", req.StartAt[:19], time.Local)
		updates["start_at"] = &t
	} else {
		updates["start_at"] = nil
	}
	if req.EndAt != "" {
		t, _ := time.ParseInLocation("2006-01-02T15:04:05", req.EndAt[:19], time.Local)
		updates["end_at"] = &t
	} else {
		updates["end_at"] = nil
	}
	if req.DrawAt != "" {
		t, _ := time.ParseInLocation("2006-01-02T15:04:05", req.DrawAt[:19], time.Local)
		updates["draw_at"] = &t
	} else {
		updates["draw_at"] = nil
	}

	database.DB.Model(&activity).Updates(updates)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "保存成功"})
}

func DeleteActivity(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var activity models.Activity
	if err := database.DB.First(&activity, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "活动不存在"})
		return
	}
	if activity.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	database.DB.Unscoped().Where("activity_id = ?", activity.ID).Delete(&models.ActivityPrize{})
	database.DB.Unscoped().Where("activity_id = ?", activity.ID).Delete(&models.ActivityRecord{})
	database.DB.Unscoped().Where("activity_id = ?", activity.ID).Delete(&models.ActivityUser{})
	database.DB.Delete(&activity)

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// ========== 奖品管理 ==========

func SaveActivityPrizes(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var activity models.Activity
	if err := database.DB.First(&activity, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "活动不存在"})
		return
	}
	if activity.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Prizes []struct {
			Name        string `json:"name"`
			Type        int    `json:"type"`
			Content     string `json:"content"`
			CardTypeID  uint   `json:"card_type_id"`
			Probability int    `json:"probability"`
			Stock       int    `json:"stock"`
			Sort        int    `json:"sort"`
		} `json:"prizes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	tx := database.DB.Begin()
	if err := tx.Where("activity_id = ?", activity.ID).Delete(&models.ActivityPrize{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除旧奖品失败"})
		return
	}

	for _, p := range req.Prizes {
		prize := &models.ActivityPrize{
			ActivityID:  activity.ID,
			Name:        p.Name,
			Type:        p.Type,
			Content:     p.Content,
			Probability: p.Probability,
			Stock:       p.Stock,
			Sort:        p.Sort,
		}
		if p.Type == 3 && p.CardTypeID > 0 {
			prize.CardTypeID = &p.CardTypeID
		}
		if err := tx.Create(prize).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建奖品失败: " + err.Error()})
			return
		}
	}
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "保存奖品失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "保存成功"})
}

// ========== 参与记录 ==========

func ListActivityRecords(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var activity models.Activity
	if err := database.DB.First(&activity, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "活动不存在"})
		return
	}
	if activity.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var records []models.ActivityRecord
	var total int64
	query := database.DB.Model(&models.ActivityRecord{}).Where("activity_id = ?", id)
	query.Count(&total)
	query.Preload("ActivityUser").Preload("Prize").
		Offset((page - 1) * size).Limit(size).Order("id desc").Find(&records)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": records, "total": total}})
}

func ManualDraw(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var activity models.Activity
	if err := database.DB.First(&activity, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "活动不存在"})
		return
	}
	if activity.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}
	if activity.Type != 2 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "仅定时抽奖活动可手动开奖"})
		return
	}
	if activity.Status == 2 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "活动已开奖"})
		return
	}

	if err := ExecuteTimedDraw(activity.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "开奖成功"})
}

// ========== 公开接口（活动参与） ==========

// 活动用户注册
func ActivityRegister(c *gin.Context) {
	var req struct {
		ActivityID uint   `json:"activity_id" binding:"required"`
		Username   string `json:"username" binding:"required"`
		Password   string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var activity models.Activity
	if err := database.DB.First(&activity, req.ActivityID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "活动不存在"})
		return
	}
	if activity.Status == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "活动已关闭"})
		return
	}

	authorID := activity.UserID

	// 检查用户名是否已存在（按作者隔离）
	var count int64
	database.DB.Model(&models.ActivityUser{}).Where("author_id = ? AND username = ?", authorID, req.Username).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "用户名已存在"})
		return
	}

	hashed, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	actUser := &models.ActivityUser{
		AuthorID:   authorID,
		ActivityID: req.ActivityID,
		Username:   req.Username,
		Password:   string(hashed),
	}
	if err := database.DB.Create(actUser).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "注册失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "注册成功", "data": gin.H{"user_id": actUser.ID, "username": actUser.Username}})
}

// 活动用户登录
func ActivityLogin(c *gin.Context) {
	var req struct {
		ActivityID uint   `json:"activity_id" binding:"required"`
		Username   string `json:"username" binding:"required"`
		Password   string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 获取活动的作者ID
	var activity models.Activity
	if err := database.DB.First(&activity, req.ActivityID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "活动不存在"})
		return
	}

	var actUser models.ActivityUser
	if err := database.DB.Where("author_id = ? AND username = ?", activity.UserID, req.Username).First(&actUser).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(actUser.Password), []byte(req.Password)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "密码错误"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"user_id": actUser.ID, "username": actUser.Username}})
}

// 获取公开活动列表
func ListPublicActivities(c *gin.Context) {
	ch := c.Query("ch")
	if ch == "" {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "缺少活动频道码"})
		return
	}
	var activities []models.Activity
	var user models.User
	if err := database.DB.Where("activity_code = ?", ch).First(&user).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 0, "data": []interface{}{}})
		return
	}
	database.DB.Where("status != 0 AND user_id = ?", user.ID).Order("id desc").Find(&activities)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": activities})
}

// 获取公开活动详情
func GetPublicActivity(c *gin.Context) {
	id := c.Param("id")
	ch := c.Query("ch")

	var activity models.Activity
	if err := database.DB.First(&activity, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "活动不存在"})
		return
	}

	// 校验 ch 参数：如果传了 ch，必须匹配活动作者
	if ch != "" {
		var user models.User
		if err := database.DB.Where("activity_code = ? AND id = ?", ch, activity.UserID).First(&user).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "活动不存在"})
			return
		}
	}

	var prizes []models.ActivityPrize
	database.DB.Where("activity_id = ?", id).Order("sort asc").Find(&prizes)
	// 隐藏概率
	for i := range prizes {
		prizes[i].Probability = 0
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"activity": activity, "prizes": prizes}})
}

// 转盘抽奖
func SpinWheel(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		UserID uint `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var actUser models.ActivityUser
	if err := database.DB.First(&actUser, req.UserID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	var activity models.Activity
	if err := database.DB.First(&activity, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "活动不存在"})
		return
	}
	if activity.Status != 1 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "活动已关闭"})
		return
	}
	if activity.Type != 1 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "活动类型错误"})
		return
	}
	if actUser.AuthorID != activity.UserID {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "用户不属于该活动作者"})
		return
	}

	now := time.Now()
	if activity.StartAt != nil && now.Before(*activity.StartAt) {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "活动未开始"})
		return
	}
	if activity.EndAt != nil && now.After(*activity.EndAt) {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "活动已结束"})
		return
	}

	if activity.MaxJoin > 0 {
		var count int64
		database.DB.Model(&models.ActivityRecord{}).Where("activity_id = ? AND activity_user_id = ?", activity.ID, actUser.ID).Count(&count)
		if int(count) >= activity.MaxJoin {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "已达到最大参与次数"})
			return
		}
	}

	var prizes []models.ActivityPrize
	database.DB.Where("activity_id = ?", activity.ID).Order("sort asc").Find(&prizes)
	if len(prizes) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "活动未配置奖品"})
		return
	}

	prize := drawPrize(prizes)
	record := &models.ActivityRecord{
		ActivityID:     activity.ID,
		ActivityUserID: actUser.ID,
		IP:             c.ClientIP(),
	}

	if prize != nil && prize.Type != 2 && prize.Stock > 0 {
		result := database.DB.Model(&models.ActivityPrize{}).Where("id = ? AND stock > 0", prize.ID).
			UpdateColumn("stock", gorm.Expr("stock - 1"))
		if result.RowsAffected == 0 {
			// 库存并发耗尽，降级为未中奖
			prize = nil
		}
	}

	if prize != nil && prize.Type != 2 {
		record.PrizeID = prize.ID
		record.PrizeName = prize.Name
		record.PrizeContent = prize.Content
		record.Status = 2

		// 卡种类型：自动生成一张新卡号
		if prize.Type == 3 && prize.CardTypeID != nil {
			var cardType models.CardType
			if err := database.DB.First(&cardType, *prize.CardTypeID).Error; err == nil {
				charset := getCharset(cardType.GenRule)
				cardNo := generateCardNo(cardType.Prefix, cardType.CardLength, charset)
				for {
					var count int64
					database.DB.Model(&models.Card{}).Where("card_no = ?", cardNo).Count(&count)
					if count == 0 {
						break
					}
					cardNo = generateCardNo(cardType.Prefix, cardType.CardLength, charset)
				}
				newCard := &models.Card{
					AppID:      cardType.AppID,
					CardTypeID: cardType.ID,
					CardNo:     cardNo,
					BatchNo:    "activity",
					Status:     1,
					Remark:     "[" + activity.Title + "] 活动中奖发放",
				}
				if err := database.DB.Create(newCard).Error; err == nil {
					record.PrizeContent = cardNo
				} else {
					record.PrizeContent = "卡号生成失败"
				}
			} else {
				record.PrizeContent = "卡种不存在"
			}
		}
	} else {
		// 未中奖也要记一次参与；PrizeID 兜底为一个现有奖品ID，避免外键导致记录写入失败
		if len(prizes) > 0 {
			fallbackPrizeID := prizes[0].ID
			for _, p := range prizes {
				if p.Type == 2 {
					fallbackPrizeID = p.ID
					break
				}
			}
			record.PrizeID = fallbackPrizeID
		}
		record.PrizeName = "谢谢参与"
		record.Status = 3
	}

	if err := database.DB.Create(record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "记录抽奖失败"})
		return
	}

	prizeIndex := getPrizeIndex(prizes, record.PrizeID)
	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"prize_index":   prizeIndex,
			"prize_name":    record.PrizeName,
			"prize_content": record.PrizeContent,
			"status":        record.Status,
		},
	})
}

// 参与定时抽奖
func JoinTimedDraw(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		UserID uint `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var actUser models.ActivityUser
	if err := database.DB.First(&actUser, req.UserID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	var activity models.Activity
	if err := database.DB.First(&activity, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "活动不存在"})
		return
	}
	if activity.Status != 1 || activity.Type != 2 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "活动不可参与"})
		return
	}
	if actUser.AuthorID != activity.UserID {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "用户不属于该活动作者"})
		return
	}

	// 检查是否已参与
	var count int64
	database.DB.Model(&models.ActivityRecord{}).Where("activity_id = ? AND activity_user_id = ?", activity.ID, actUser.ID).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "已参与过"})
		return
	}

	record := &models.ActivityRecord{
		ActivityID:     activity.ID,
		ActivityUserID: actUser.ID,
		Status:         1,
		IP:             c.ClientIP(),
	}
	database.DB.Create(record)

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "参与成功"})
}

// 领取卡号（发放卡号活动）
func ClaimCard(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		UserID uint `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var actUser models.ActivityUser
	if err := database.DB.First(&actUser, req.UserID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	var activity models.Activity
	if err := database.DB.First(&activity, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "活动不存在"})
		return
	}
	if activity.Status != 1 || activity.Type != 3 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "活动不可参与"})
		return
	}
	if actUser.AuthorID != activity.UserID {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "用户不属于该活动作者"})
		return
	}

	if activity.MaxJoin > 0 {
		var count int64
		database.DB.Model(&models.ActivityRecord{}).Where("activity_id = ? AND activity_user_id = ?", activity.ID, actUser.ID).Count(&count)
		if int(count) >= activity.MaxJoin {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "已达到最大领取次数"})
			return
		}
	}

	var prizes []models.ActivityPrize
	database.DB.Where("activity_id = ? AND type IN (1, 3) AND (stock = -1 OR stock > 0)", activity.ID).Order("sort asc").Find(&prizes)
	if len(prizes) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "奖品已领完"})
		return
	}

	prize := prizes[0]
	if prize.Stock > 0 {
		result := database.DB.Model(&models.ActivityPrize{}).Where("id = ? AND stock > 0", prize.ID).
			UpdateColumn("stock", gorm.Expr("stock - 1"))
		if result.RowsAffected == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "奖品已领完"})
			return
		}
	}

	record := &models.ActivityRecord{
		ActivityID:     activity.ID,
		ActivityUserID: actUser.ID,
		PrizeID:        prize.ID,
		PrizeName:      prize.Name,
		Status:         2,
		IP:             c.ClientIP(),
	}

	// 卡种奖品：实时生成并发放一张卡号；普通文本奖品沿用配置内容
	if prize.Type == 3 && prize.CardTypeID != nil {
		var cardType models.CardType
		if err := database.DB.First(&cardType, *prize.CardTypeID).Error; err == nil {
			charset := getCharset(cardType.GenRule)
			cardNo := generateCardNo(cardType.Prefix, cardType.CardLength, charset)
			for {
				var count int64
				database.DB.Model(&models.Card{}).Where("card_no = ?", cardNo).Count(&count)
				if count == 0 {
					break
				}
				cardNo = generateCardNo(cardType.Prefix, cardType.CardLength, charset)
			}
			newCard := &models.Card{
				AppID:      cardType.AppID,
				CardTypeID: cardType.ID,
				CardNo:     cardNo,
				BatchNo:    "activity",
				Status:     1,
				Remark:     "[" + activity.Title + "] 活动领取发放",
			}
			if err := database.DB.Create(newCard).Error; err == nil {
				record.PrizeContent = cardNo
			} else {
				record.PrizeContent = "卡号生成失败"
			}
		} else {
			record.PrizeContent = "卡种不存在"
		}
	} else {
		record.PrizeContent = prize.Content
	}
	database.DB.Create(record)

	// 返回实际发放内容：卡种奖品应返回生成后的 cardNo（record.PrizeContent），而不是配置里的 prize.Content
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"prize_name": record.PrizeName, "prize_content": record.PrizeContent}})
}

// 检查参与状态
func CheckActivityJoined(c *gin.Context) {
	id := c.Param("id")
	userID := c.Query("user_id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "缺少user_id"})
		return
	}

	var count int64
	database.DB.Model(&models.ActivityRecord{}).Where("activity_id = ? AND activity_user_id = ?", id, userID).Count(&count)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"joined": count > 0, "count": count}})
}

// 获取中奖名单
func GetActivityWinners(c *gin.Context) {
	id := c.Param("id")
	var records []models.ActivityRecord
	database.DB.Preload("ActivityUser").Where("activity_id = ? AND status = 2", id).Order("id desc").Limit(100).Find(&records)

	winners := make([]gin.H, 0)
	for _, r := range records {
		username := ""
		if r.ActivityUser != nil {
			username = r.ActivityUser.Username
		}
		winners = append(winners, gin.H{"username": username, "prize_name": r.PrizeName})
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": winners})
}

// 获取我的参与记录
func GetMyActivityRecords(c *gin.Context) {
	userID := c.Query("user_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "缺少user_id"})
		return
	}

	var records []models.ActivityRecord
	var total int64
	query := database.DB.Model(&models.ActivityRecord{}).Where("activity_user_id = ?", userID)
	query.Count(&total)
	query.Preload("Prize").Preload("Activity").Offset((page - 1) * size).Limit(size).Order("id desc").Find(&records)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": records, "total": total}})
}

// 获取我领取的卡号
func GetMyClaimedCards(c *gin.Context) {
	id := c.Param("id")
	userID := c.Query("user_id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "缺少user_id"})
		return
	}

	var records []models.ActivityRecord
	database.DB.Where("activity_id = ? AND activity_user_id = ? AND status = 2", id, userID).Order("id desc").Find(&records)

	cards := make([]gin.H, 0)
	for _, r := range records {
		cards = append(cards, gin.H{"prize_name": r.PrizeName, "prize_content": r.PrizeContent, "created_at": r.CreatedAt})
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": cards})
}

// ========== 辅助函数 ==========

func drawPrize(prizes []models.ActivityPrize) *models.ActivityPrize {
	// 过滤掉库存为0的奖品
	available := make([]models.ActivityPrize, 0)
	for _, p := range prizes {
		if p.Stock == -1 || p.Stock > 0 {
			available = append(available, p)
		}
	}
	if len(available) == 0 {
		return nil
	}

	total := 0
	for _, p := range available {
		total += p.Probability
	}
	if total <= 0 {
		return nil
	}

	r := rand.Intn(total)
	cumulative := 0
	for i := range available {
		cumulative += available[i].Probability
		if r < cumulative {
			return &available[i]
		}
	}
	return &available[len(available)-1]
}

func getPrizeIndex(prizes []models.ActivityPrize, prizeID uint) int {
	for i, p := range prizes {
		if p.ID == prizeID {
			return i
		}
	}
	return -1
}

func ExecuteTimedDraw(activityID uint) error {
	var activity models.Activity
	if err := database.DB.First(&activity, activityID).Error; err != nil {
		return err
	}

	var prizes []models.ActivityPrize
	database.DB.Where("activity_id = ? AND type = 1", activityID).Order("sort asc").Find(&prizes)

	// 展开奖品池（每个库存=1个名额）
	prizePool := make([]models.ActivityPrize, 0)
	for _, p := range prizes {
		count := p.Stock
		if count == -1 {
			count = 1
		}
		for i := 0; i < count; i++ {
			prizePool = append(prizePool, p)
		}
	}

	// 获取所有参与者（status=1）
	var records []models.ActivityRecord
	database.DB.Where("activity_id = ? AND status = 1", activityID).Find(&records)

	// 打乱参与者
	rand.Shuffle(len(records), func(i, j int) { records[i], records[j] = records[j], records[i] })

	// 分配奖品
	for i := range records {
		if i < len(prizePool) {
			prize := prizePool[i]
			records[i].Status = 2
			records[i].PrizeID = prize.ID
			records[i].PrizeName = prize.Name
			records[i].PrizeContent = prize.Content
		} else {
			records[i].Status = 3
			records[i].PrizeName = "未中奖"
		}
		database.DB.Save(&records[i])
	}

	// 更新活动状态为已开奖
	database.DB.Model(&activity).Update("status", 2)
	return nil
}

// 列出作者的活动用户
func ListActivityUsers(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	keyword := c.Query("keyword")

	var users []models.ActivityUser
	var total int64
	query := database.DB.Model(&models.ActivityUser{}).Where("author_id = ?", user.ID)
	if keyword != "" {
		query = query.Where("username LIKE ?", "%"+keyword+"%")
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&users)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": users, "total": total}})
}

// 删除活动用户
func DeleteActivityUser(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var actUser models.ActivityUser
	if err := database.DB.First(&actUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}
	if actUser.AuthorID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权操作"})
		return
	}

	database.DB.Delete(&actUser)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 重置活动用户密码
func ResetActivityUserPassword(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var req struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var actUser models.ActivityUser
	if err := database.DB.First(&actUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}
	if actUser.AuthorID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权操作"})
		return
	}

	hashed, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	database.DB.Model(&actUser).Update("password", string(hashed))
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "密码已重置"})
}

// 查看活动用户的参与记录
func ListActivityUserRecords(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var actUser models.ActivityUser
	if err := database.DB.First(&actUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}
	if actUser.AuthorID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var records []models.ActivityRecord
	database.DB.Where("activity_user_id = ?", actUser.ID).Preload("Activity").Order("id desc").Find(&records)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": records})
}
