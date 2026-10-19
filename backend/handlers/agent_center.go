package handlers

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"jike-auth/config"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AgentClaims struct {
	AgentID uint `json:"agent_id"`
	AppID   uint `json:"app_id"`
	jwt.RegisteredClaims
}

const agentAvatarBaseDir = "uploads/agent-avatars"

func agentAvatarExt(contentType string) (string, bool) {
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

func removeLocalAgentAvatar(avatar string) {
	if !strings.HasPrefix(avatar, "/"+agentAvatarBaseDir+"/") {
		return
	}
	path := strings.TrimPrefix(avatar, "/")
	cleanPath := filepath.Clean(path)
	if strings.HasPrefix(cleanPath, agentAvatarBaseDir+string(os.PathSeparator)) {
		_ = os.Remove(cleanPath)
	}
}

func agentCreateCards(tx *gorm.DB, agentID uint, cardType models.CardType, count int, batchNo, remark string) ([]string, error) {
	charset := getCharset(cardType.GenRule)
	cards := make([]string, 0, count)
	agentIDPtr := &agentID
	for i := 0; i < count; i++ {
		var cardNo string
		var createErr error
		for attempt := 0; attempt < 30; attempt++ {
			cardNo = generateCardNo(cardType.Prefix, cardType.CardLength, charset)
			card := models.Card{
				AppID:      cardType.AppID,
				CardTypeID: cardType.ID,
				AgentID:    agentIDPtr,
				CardNo:     cardNo,
				BatchNo:    batchNo,
				Status:     1,
				Remark:     remark,
			}
			createErr = tx.Create(&card).Error
			if createErr == nil {
				cards = append(cards, cardNo)
				break
			}
		}
		if len(cards) != i+1 {
			if createErr != nil {
				return nil, createErr
			}
			return nil, fmt.Errorf("生成卡号失败")
		}
	}
	return cards, nil
}

// 代理登录
func AgentLogin(c *gin.Context) {
	var req struct {
		AppCode  string `json:"app_code" binding:"required"`
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	clientIP := c.ClientIP()

	// 登录失败限制：30分钟内最多10次
	var recentFails int64
	lockTime := time.Now().Add(-30 * time.Minute)
	database.DB.Model(&models.LoginFailure{}).Where("ip = ? AND username = ? AND created_at > ?", clientIP, "agent:"+req.Username, lockTime).Count(&recentFails)
	if recentFails >= 10 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "登录失败次数过多，请30分钟后再试"})
		return
	}

	// 查找应用（按 AppCode）
	var app models.App
	if err := database.DB.Where("app_code = ?", req.AppCode).First(&app).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "应用不存在"})
		return
	}

	// 查找代理
	var agent models.Agent
	if err := database.DB.Where("app_id = ? AND username = ?", app.ID, req.Username).First(&agent).Error; err != nil {
		database.DB.Create(&models.LoginFailure{IP: clientIP, Username: "agent:" + req.Username})
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "账号或密码错误"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(agent.Password), []byte(req.Password)); err != nil {
		database.DB.Create(&models.LoginFailure{IP: clientIP, Username: "agent:" + req.Username})
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "账号或密码错误"})
		return
	}

	if agent.Status != 1 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "账号已被禁用"})
		return
	}

	// 登录成功，清除失败记录
	database.DB.Where("ip = ? AND username = ?", clientIP, "agent:"+req.Username).Delete(&models.LoginFailure{})

	// 生成JWT token
	claims := AgentClaims{
		AgentID: agent.ID,
		AppID:   app.ID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(config.Cfg.JWT.Expire) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString([]byte(config.Cfg.JWT.Secret))

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"token":    tokenString,
			"agent_id": agent.ID,
			"app_id":   app.ID,
			"app_name": app.AppName,
			"username": agent.Username,
			"nickname": agent.Nickname,
			"avatar":   agent.Avatar,
			"qq":       agent.QQ,
			"balance":  agent.Balance,
		},
	})
}

// 代理获取个人信息
func AgentGetProfile(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	database.DB.Preload("App").First(&agent, agent.ID)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": agent})
}

// 代理上传头像
func AgentUploadAvatar(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请选择文件"})
		return
	}

	contentType := file.Header.Get("Content-Type")
	ext, ok := agentAvatarExt(contentType)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "只能上传图片类型，支持 JPG/PNG/GIF/WebP"})
		return
	}

	if file.Size > 2*1024*1024 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "文件大小不能超过2MB"})
		return
	}

	var row models.Agent
	if err := database.DB.Select("id", "avatar").First(&row, agent.ID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "代理不存在"})
		return
	}

	dir := filepath.Join(agentAvatarBaseDir, strconv.Itoa(int(agent.ID)))
	if err := os.MkdirAll(dir, 0755); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "创建目录失败"})
		return
	}
	for _, oldExt := range []string{".jpg", ".png", ".gif", ".webp"} {
		_ = os.Remove(filepath.Join(dir, "avatar"+oldExt))
	}
	removeLocalAgentAvatar(row.Avatar)
	savePath := filepath.Join(dir, "avatar"+ext)

	if err := c.SaveUploadedFile(file, savePath); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "保存失败"})
		return
	}

	avatarURL := "/" + filepath.ToSlash(savePath)
	if err := database.DB.Model(&models.Agent{}).Where("id = ?", agent.ID).Update("avatar", avatarURL).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "更新头像失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "上传成功", "data": gin.H{"avatar": avatarURL}})
}

// 代理获取可用卡种
func AgentListCardTypes(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)

	var list []models.AgentCardType
	database.DB.Preload("CardType").Where("agent_id = ?", agent.ID).Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": list})
}

// 代理制卡
func AgentGenerateCards(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)

	var req struct {
		CardTypeID uint   `json:"card_type_id" binding:"required"`
		Count      int    `json:"count" binding:"required,min=1,max=1000"`
		Remark     string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 检查卡种权限
	var agentCardType models.AgentCardType
	if err := database.DB.Where("agent_id = ? AND card_type_id = ?", agent.ID, req.CardTypeID).First(&agentCardType).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无此卡种权限"})
		return
	}
	if agent.ParentID != nil {
		var parentPermCount int64
		database.DB.Model(&models.AgentCardType{}).Where("agent_id = ? AND card_type_id = ?", *agent.ParentID, req.CardTypeID).Count(&parentPermCount)
		if parentPermCount == 0 {
			c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "上级代理已取消此卡种权限"})
			return
		}
	}

	// 获取卡种信息
	var cardType models.CardType
	if err := database.DB.First(&cardType, req.CardTypeID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "卡种不存在"})
		return
	}

	// 获取应用信息
	var app models.App
	database.DB.First(&app, cardType.AppID)

	// 获取应用所属用户
	var user models.User
	database.DB.First(&user, app.UserID)

	// 检查用户卡号配额
	if user.MaxCards != -1 {
		var currentCardCount int64
		var userAppIDs []uint
		database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &userAppIDs)
		if len(userAppIDs) > 0 {
			database.DB.Model(&models.Card{}).Where("app_id IN ?", userAppIDs).Count(&currentCardCount)
		}
		if int(currentCardCount)+req.Count > user.MaxCards {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": fmt.Sprintf("用户卡号配额不足，当前%d/%d，无法制卡%d张", currentCardCount, user.MaxCards, req.Count)})
			return
		}
	}

	// 计算费用
	totalCost := agentCardType.Price * float64(req.Count)

	tx := database.DB.Begin()

	// 0 元卡种无需扣款；避免 balance = balance - 0 时 RowsAffected=0 被误判为余额不足
	if totalCost > 0 {
		result := tx.Model(&models.Agent{}).Where("id = ? AND balance >= ?", agent.ID, totalCost).
			UpdateColumn("balance", gorm.Expr("balance - ?", totalCost))
		if result.RowsAffected == 0 {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": fmt.Sprintf("余额不足，需要%.2f，当前余额%.2f", totalCost, agent.Balance)})
			return
		}
	}

	var randBuf [2]byte
	rand.Read(randBuf[:])
	batchNo := time.Now().Format("20060102150405") + fmt.Sprintf("%04d", binary.BigEndian.Uint16(randBuf[:])%10000)

	cards, err := agentCreateCards(tx, agent.ID, cardType, req.Count, batchNo, req.Remark)
	if err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "制卡失败: " + err.Error()})
		return
	}

	cardLog := models.AgentCardLog{
		AgentID:    agent.ID,
		CardTypeID: cardType.ID,
		BatchNo:    batchNo,
		Count:      len(cards),
		Price:      agentCardType.Price,
		TotalCost:  totalCost,
	}
	if err := tx.Create(&cardLog).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "记录制卡日志失败"})
		return
	}

	var bal models.Agent
	if err := tx.Select("id", "balance").First(&bal, agent.ID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "制卡失败"})
		return
	}
	balLog := models.AgentBalanceLog{
		AgentID:      agent.ID,
		Kind:         "generate_card",
		Amount:       -totalCost,
		BalanceAfter: bal.Balance,
		Ref:          batchNo,
		Remark:       fmt.Sprintf("制卡 %d 张", len(cards)),
	}
	if err := tx.Create(&balLog).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "记录余额流水失败"})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "制卡失败"})
		return
	}

	// 重新查询获取最新余额
	database.DB.First(&agent, agent.ID)

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"cards":      cards,
			"batch_no":   batchNo,
			"count":      len(cards),
			"total_cost": totalCost,
			"balance":    agent.Balance,
		},
	})
}

// 代理查卡
func AgentListCards(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	cardTypeID := c.Query("card_type_id")
	batchNo := c.Query("batch_no")
	status := c.Query("status")
	keyword := c.Query("keyword")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var list []models.Card
	var total int64
	query := database.DB.Model(&models.Card{}).Preload("CardType").Where("agent_id = ?", agent.ID)

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

// 代理制卡记录
func AgentListCardLogs(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	cardTypeID := c.Query("card_type_id")
	dateFrom := c.Query("date_from")
	dateTo := c.Query("date_to")

	var list []models.AgentCardLog
	var total int64
	query := database.DB.Model(&models.AgentCardLog{}).Preload("CardType").Where("agent_id = ?", agent.ID)
	if cardTypeID != "" {
		query = query.Where("card_type_id = ?", cardTypeID)
	}
	if dateFrom != "" {
		if t, err := time.ParseInLocation("2006-01-02", dateFrom, time.Local); err == nil {
			query = query.Where("created_at >= ?", t)
		}
	}
	if dateTo != "" {
		if t, err := time.ParseInLocation("2006-01-02", dateTo, time.Local); err == nil {
			query = query.Where("created_at < ?", t.Add(24*time.Hour))
		}
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 代理获取名下用户列表
func AgentListAppUsers(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	keyword := c.Query("keyword")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var list []models.AppUser
	var total int64

	// 获取代理名下的用户
	query := database.DB.Model(&models.AppUser{}).Preload("App").Where("agent_id = ? AND app_id = ?", agent.ID, agent.AppID)

	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("username LIKE ? OR qq LIKE ? OR phone LIKE ?",
			kw, kw, kw)
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 代理封禁/解封用户
func AgentUpdateAppUserStatus(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	id := c.Param("id") // AppUser 的 ID

	var appUser models.AppUser
	if err := database.DB.First(&appUser, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 验证用户是否属于此代理
	if appUser.AgentID == nil || *appUser.AgentID != agent.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权操作此用户"})
		return
	}

	var req struct {
		Status int `json:"status" binding:"required"` // 1:正常 2:封停 3:冻结
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	if req.Status != 1 && req.Status != 2 && req.Status != 3 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "状态值无效"})
		return
	}

	database.DB.Model(&appUser).Update("status", req.Status)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "操作成功"})
}

// 代理解绑用户特征码
func AgentUnbindAppUserDevice(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	appUserID := c.Param("id") // AppUser 的 ID
	deviceID := c.Param("deviceId")

	var appUser models.AppUser
	if err := database.DB.First(&appUser, appUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 验证用户是否属于此代理
	if appUser.AgentID == nil || *appUser.AgentID != agent.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权操作此用户"})
		return
	}

	var device models.AppUserDevice
	if err := database.DB.Where("id = ? AND app_user_id = ?", deviceID, appUserID).First(&device).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "特征码不存在"})
		return
	}

	database.DB.Delete(&device)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "解绑成功"})
}

// 代理获取用户特征码列表
func AgentListAppUserDevices(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	appUserID := c.Param("id") // AppUser 的 ID

	var appUser models.AppUser
	if err := database.DB.First(&appUser, appUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 验证用户是否属于此代理
	if appUser.AgentID == nil || *appUser.AgentID != agent.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此用户"})
		return
	}

	var list []models.AppUserDevice
	database.DB.Where("app_user_id = ?", appUserID).Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "features": appUser.Features}})
}

// 代理修改登录密码
func AgentChangePassword(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	var req struct {
		OldPassword string `json:"old_password" binding:"required"`
		NewPassword string `json:"new_password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var row models.Agent
	if err := database.DB.Select("id", "password").First(&row, agent.ID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "代理不存在"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(row.Password), []byte(req.OldPassword)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "原密码错误"})
		return
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "修改失败"})
		return
	}
	database.DB.Model(&row).Update("password", string(hashed))
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "密码已更新"})
}

// 代理余额流水
func AgentListBalanceLogs(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	if size > 100 {
		size = 100
	}

	var list []models.AgentBalanceLog
	var total int64
	q := database.DB.Model(&models.AgentBalanceLog{}).Where("agent_id = ?", agent.ID)
	q.Count(&total)
	q.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 代理获取下级代理列表
func AgentListSubAgents(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	keyword := c.Query("keyword")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	if size > 100 {
		size = 100
	}

	var list []models.Agent
	var total int64
	query := database.DB.Model(&models.Agent{}).Where("parent_id = ? AND app_id = ?", agent.ID, agent.AppID)
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("username LIKE ? OR nickname LIKE ? OR qq LIKE ? OR phone LIKE ?", kw, kw, kw, kw)
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 代理添加下级代理
func AgentCreateSubAgent(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required,min=6"`
		Nickname string `json:"nickname"`
		QQ       string `json:"qq"`
		Phone    string `json:"phone"`
		Remark   string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var count int64
	database.DB.Model(&models.Agent{}).Where("app_id = ? AND username = ?", agent.AppID, req.Username).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "代理账号已存在"})
		return
	}

	hashedPwd, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	parentID := agent.ID
	child := models.Agent{
		UserID:   agent.UserID,
		AppID:    agent.AppID,
		ParentID: &parentID,
		Username: req.Username,
		Password: string(hashedPwd),
		Nickname: req.Nickname,
		QQ:       req.QQ,
		Phone:    req.Phone,
		Remark:   req.Remark,
		Status:   1,
	}

	if err := database.DB.Create(&child).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": child})
}

// 代理更新下级代理
func AgentUpdateSubAgent(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	id := c.Param("id")

	var child models.Agent
	if err := database.DB.Where("id = ? AND parent_id = ? AND app_id = ?", id, agent.ID, agent.AppID).First(&child).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "下级代理不存在"})
		return
	}

	var req struct {
		Password *string `json:"password"`
		Nickname *string `json:"nickname"`
		QQ       *string `json:"qq"`
		Phone    *string `json:"phone"`
		Status   *int    `json:"status"`
		Remark   *string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Password != nil && *req.Password != "" {
		hashedPwd, err := bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
			return
		}
		updates["password"] = string(hashedPwd)
	}
	if req.Nickname != nil {
		updates["nickname"] = *req.Nickname
	}
	if req.QQ != nil {
		updates["qq"] = *req.QQ
	}
	if req.Phone != nil {
		updates["phone"] = *req.Phone
	}
	if req.Status != nil {
		if *req.Status != 1 && *req.Status != 2 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "状态值无效"})
			return
		}
		updates["status"] = *req.Status
	}
	if req.Remark != nil {
		updates["remark"] = *req.Remark
	}

	if len(updates) > 0 {
		if err := database.DB.Model(&child).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 代理获取下级代理卡种权限
func AgentListSubAgentCardTypes(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	id := c.Param("id")

	var child models.Agent
	if err := database.DB.Where("id = ? AND parent_id = ? AND app_id = ?", id, agent.ID, agent.AppID).First(&child).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "下级代理不存在"})
		return
	}

	var list []models.AgentCardType
	database.DB.Preload("CardType").Where("agent_id = ?", child.ID).Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": list})
}

// 代理设置下级代理卡种权限
func AgentSetSubAgentCardTypes(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	id := c.Param("id")

	var child models.Agent
	if err := database.DB.Where("id = ? AND parent_id = ? AND app_id = ?", id, agent.ID, agent.AppID).First(&child).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "下级代理不存在"})
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

	parentPerms := make(map[uint]models.AgentCardType)
	var parentList []models.AgentCardType
	if err := database.DB.Where("agent_id = ?", agent.ID).Find(&parentList).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "加载卡种权限失败"})
		return
	}
	for _, perm := range parentList {
		parentPerms[perm.CardTypeID] = perm
	}

	seen := make(map[uint]bool)
	for _, ct := range req.CardTypes {
		if seen[ct.CardTypeID] {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "卡种重复"})
			return
		}
		seen[ct.CardTypeID] = true
		parentPerm, ok := parentPerms[ct.CardTypeID]
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "不能授权未拥有的卡种"})
			return
		}
		if ct.Price < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "制卡单价不能为负数"})
			return
		}
		// 下级代理单价不得低于上级代理拿货价，防止价格体系被击穿（上级倒亏）
		if ct.Price < parentPerm.Price {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": fmt.Sprintf("下级代理单价(¥%.2f)不得低于您的拿货价(¥%.2f)", ct.Price, parentPerm.Price)})
			return
		}
	}

	tx := database.DB.Begin()
	if err := tx.Where("agent_id = ?", child.ID).Delete(&models.AgentCardType{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "设置失败"})
		return
	}
	for _, ct := range req.CardTypes {
		agentCardType := models.AgentCardType{
			AgentID:    child.ID,
			CardTypeID: ct.CardTypeID,
			Price:      ct.Price,
		}
		if err := tx.Create(&agentCardType).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "设置失败"})
			return
		}
	}
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "设置失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "设置成功"})
}

// 代理删除下级代理
func AgentDeleteSubAgent(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	id := c.Param("id")

	var child models.Agent
	if err := database.DB.Where("id = ? AND parent_id = ? AND app_id = ?", id, agent.ID, agent.AppID).First(&child).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "下级代理不存在"})
		return
	}

	var grandChildCount int64
	database.DB.Model(&models.Agent{}).Where("parent_id = ?", child.ID).Count(&grandChildCount)
	if grandChildCount > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "请先删除或转移该代理的下级"})
		return
	}

	tx := database.DB.Begin()
	if err := tx.Where("agent_id = ?", child.ID).Delete(&models.AgentCardType{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}
	if err := tx.Delete(&child).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 代理给下级代理转账
func AgentTransferToSubAgent(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	id := c.Param("id")

	var req struct {
		Amount float64 `json:"amount" binding:"required"`
		Remark string  `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	if req.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "转账金额必须大于0"})
		return
	}

	var child models.Agent
	if err := database.DB.Where("id = ? AND parent_id = ? AND app_id = ?", id, agent.ID, agent.AppID).First(&child).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "下级代理不存在"})
		return
	}
	if child.Status != 1 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "下级代理已禁用"})
		return
	}

	tx := database.DB.Begin()
	result := tx.Model(&models.Agent{}).Where("id = ? AND balance >= ?", agent.ID, req.Amount).
		UpdateColumn("balance", gorm.Expr("balance - ?", req.Amount))
	if result.Error != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "转账失败"})
		return
	}
	if result.RowsAffected == 0 {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "余额不足"})
		return
	}
	if err := tx.Model(&models.Agent{}).Where("id = ?", child.ID).
		UpdateColumn("balance", gorm.Expr("balance + ?", req.Amount)).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "转账失败"})
		return
	}

	var parentAfter models.Agent
	if err := tx.Select("id", "balance").First(&parentAfter, agent.ID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "转账失败"})
		return
	}
	var childAfter models.Agent
	if err := tx.Select("id", "balance").First(&childAfter, child.ID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "转账失败"})
		return
	}

	ref := fmt.Sprintf("agent_transfer:%d:%d:%d", agent.ID, child.ID, time.Now().UnixNano())
	remark := req.Remark
	if remark == "" {
		remark = fmt.Sprintf("转账给下级代理 %s", child.Username)
	}
	parentLog := models.AgentBalanceLog{
		AgentID:      agent.ID,
		Kind:         "transfer_out",
		Amount:       -req.Amount,
		BalanceAfter: parentAfter.Balance,
		Ref:          ref,
		Remark:       remark,
	}
	childLog := models.AgentBalanceLog{
		AgentID:      child.ID,
		Kind:         "transfer_in",
		Amount:       req.Amount,
		BalanceAfter: childAfter.Balance,
		Ref:          ref,
		Remark:       fmt.Sprintf("上级代理 %s 转账", agent.Username),
	}
	if err := tx.Create(&parentLog).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "记录流水失败"})
		return
	}
	if err := tx.Create(&childLog).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "记录流水失败"})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "转账失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "转账成功",
		"data": gin.H{
			"balance":       parentAfter.Balance,
			"child_balance": childAfter.Balance,
		},
	})
}

// 代理创建的库存卡包列表
func AgentListStockPackages(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	if size > 100 {
		size = 100
	}

	var list []models.AgentStockPackage
	var total int64
	query := database.DB.Model(&models.AgentStockPackage{}).
		Preload("AssignedAgent").
		Preload("Items.CardType").
		Where("owner_agent_id = ? AND app_id = ?", agent.ID, agent.AppID)
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 当前代理可使用的库存卡包
func AgentListUsableStockPackages(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)

	var list []models.AgentStockPackage
	database.DB.
		Preload("Items.CardType").
		Where("assigned_agent_id = ? AND app_id = ? AND status = 1", agent.ID, agent.AppID).
		Order("id desc").
		Find(&list)

	// 屏蔽上级代理的拿货价与成本信息，下级只需知道卡种与剩余次数
	for i := range list {
		list[i].TotalCost = 0
		list[i].OwnerAgentID = 0
		for j := range list[i].Items {
			list[i].Items[j].Price = 0
		}
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": list})
}

// 代理创建库存卡包并预扣余额
func AgentCreateStockPackage(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	var req struct {
		Name   string `json:"name" binding:"required"`
		Remark string `json:"remark"`
		Items  []struct {
			CardTypeID uint `json:"card_type_id"`
			Count      int  `json:"count"`
		} `json:"items" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	parentPerms := make(map[uint]models.AgentCardType)
	var permList []models.AgentCardType
	if err := database.DB.Where("agent_id = ?", agent.ID).Find(&permList).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "加载卡种权限失败"})
		return
	}
	for _, perm := range permList {
		parentPerms[perm.CardTypeID] = perm
	}

	seen := make(map[uint]bool)
	totalCost := 0.0
	items := make([]models.AgentStockPackageItem, 0, len(req.Items))
	for _, item := range req.Items {
		if item.CardTypeID == 0 || item.Count <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "卡种和次数必须有效"})
			return
		}
		if seen[item.CardTypeID] {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "卡种重复"})
			return
		}
		seen[item.CardTypeID] = true
		perm, ok := parentPerms[item.CardTypeID]
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "不能选择未授权给自己的卡种"})
			return
		}
		var cardType models.CardType
		if err := database.DB.Where("id = ? AND app_id = ?", item.CardTypeID, agent.AppID).First(&cardType).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "卡种不存在"})
			return
		}
		totalCost += perm.Price * float64(item.Count)
		items = append(items, models.AgentStockPackageItem{
			CardTypeID: item.CardTypeID,
			TotalCount: item.Count,
			Price:      perm.Price,
		})
	}

	tx := database.DB.Begin()
	if totalCost > 0 {
		result := tx.Model(&models.Agent{}).Where("id = ? AND balance >= ?", agent.ID, totalCost).
			UpdateColumn("balance", gorm.Expr("balance - ?", totalCost))
		if result.Error != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
			return
		}
		if result.RowsAffected == 0 {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": fmt.Sprintf("余额不足，需要%.2f，当前余额%.2f", totalCost, agent.Balance)})
			return
		}
	}

	pkg := models.AgentStockPackage{
		AppID:        agent.AppID,
		OwnerAgentID: agent.ID,
		Name:         req.Name,
		TotalCost:    totalCost,
		Status:       1,
		Remark:       req.Remark,
	}
	if err := tx.Create(&pkg).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}
	for i := range items {
		items[i].PackageID = pkg.ID
		if err := tx.Create(&items[i]).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
			return
		}
	}

	var bal models.Agent
	if err := tx.Select("id", "balance").First(&bal, agent.ID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}
	log := models.AgentBalanceLog{
		AgentID:      agent.ID,
		Kind:         "stock_package",
		Amount:       -totalCost,
		BalanceAfter: bal.Balance,
		Ref:          fmt.Sprintf("stock_package:%d", pkg.ID),
		Remark:       fmt.Sprintf("创建库存卡包 %s", pkg.Name),
	}
	if err := tx.Create(&log).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "记录流水失败"})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"id": pkg.ID, "total_cost": totalCost, "balance": bal.Balance}})
}

// 代理发放库存卡包给下级代理
func AgentAssignStockPackage(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	id := c.Param("id")
	var req struct {
		AssignedAgentID uint `json:"assigned_agent_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var pkg models.AgentStockPackage
	if err := database.DB.Preload("Items").Where("id = ? AND owner_agent_id = ? AND app_id = ?", id, agent.ID, agent.AppID).First(&pkg).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "库存卡包不存在"})
		return
	}
	if pkg.AssignedAgentID != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "库存卡包已发放"})
		return
	}

	var child models.Agent
	if err := database.DB.Where("id = ? AND parent_id = ? AND app_id = ?", req.AssignedAgentID, agent.ID, agent.AppID).First(&child).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "下级代理不存在"})
		return
	}
	if child.Status != 1 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "下级代理已禁用"})
		return
	}

	assignedID := child.ID
	if err := database.DB.Model(&pkg).Update("assigned_agent_id", &assignedID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "发放失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "发放成功"})
}

// 代理回收已发放的库存卡包
func AgentRecycleStockPackage(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	id := c.Param("id")

	var pkg models.AgentStockPackage
	if err := database.DB.Where("id = ? AND owner_agent_id = ? AND app_id = ?", id, agent.ID, agent.AppID).First(&pkg).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "库存卡包不存在"})
		return
	}
	if pkg.AssignedAgentID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "库存卡包未发放"})
		return
	}

	if err := database.DB.Model(&pkg).Update("assigned_agent_id", nil).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "回收失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "回收成功"})
}

// 代理启用/禁用库存卡包
func AgentToggleStockPackageStatus(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	id := c.Param("id")

	var pkg models.AgentStockPackage
	if err := database.DB.Where("id = ? AND owner_agent_id = ? AND app_id = ?", id, agent.ID, agent.AppID).First(&pkg).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "库存卡包不存在"})
		return
	}

	nextStatus := 2
	if pkg.Status != 1 {
		nextStatus = 1
	}
	if err := database.DB.Model(&pkg).Update("status", nextStatus).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "操作失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "操作成功", "data": gin.H{"status": nextStatus}})
}

// 代理删除未发放/已回收的库存卡包，并退回剩余金额
func AgentDeleteStockPackage(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	id := c.Param("id")

	var pkg models.AgentStockPackage
	if err := database.DB.Preload("Items").Where("id = ? AND owner_agent_id = ? AND app_id = ?", id, agent.ID, agent.AppID).First(&pkg).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "库存卡包不存在"})
		return
	}
	if pkg.AssignedAgentID != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "请先回收已发放的库存卡包"})
		return
	}

	refund := 0.0
	for _, item := range pkg.Items {
		remaining := item.TotalCount - item.UsedCount
		if remaining > 0 {
			refund += float64(remaining) * item.Price
		}
	}

	tx := database.DB.Begin()
	if refund > 0 {
		if err := tx.Model(&models.Agent{}).Where("id = ?", agent.ID).
			UpdateColumn("balance", gorm.Expr("balance + ?", refund)).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "退款失败"})
			return
		}
	}
	if err := tx.Delete(&pkg).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}

	var bal models.Agent
	if err := tx.Select("id", "balance").First(&bal, agent.ID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}
	if refund > 0 {
		log := models.AgentBalanceLog{
			AgentID:      agent.ID,
			Kind:         "stock_package_refund",
			Amount:       refund,
			BalanceAfter: bal.Balance,
			Ref:          fmt.Sprintf("stock_package:%d", pkg.ID),
			Remark:       fmt.Sprintf("删除库存卡包 %s，退回剩余金额", pkg.Name),
		}
		if err := tx.Create(&log).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "记录流水失败"})
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功", "data": gin.H{"refund": refund, "balance": bal.Balance}})
}

// 下级代理使用库存卡包制卡
func AgentGenerateCardsFromStockPackage(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	id := c.Param("id")
	var req struct {
		CardTypeID uint   `json:"card_type_id" binding:"required"`
		Count      int    `json:"count" binding:"required,min=1,max=1000"`
		Remark     string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var pkg models.AgentStockPackage
	if err := database.DB.Where("id = ? AND assigned_agent_id = ? AND app_id = ? AND status = 1", id, agent.ID, agent.AppID).First(&pkg).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "库存卡包不存在"})
		return
	}
	var item models.AgentStockPackageItem
	if err := database.DB.Where("package_id = ? AND card_type_id = ?", pkg.ID, req.CardTypeID).First(&item).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "卡包不包含此卡种"})
		return
	}
	if item.TotalCount-item.UsedCount < req.Count {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "卡包剩余次数不足"})
		return
	}

	var cardType models.CardType
	if err := database.DB.Where("id = ? AND app_id = ?", req.CardTypeID, agent.AppID).First(&cardType).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "卡种不存在"})
		return
	}

	var app models.App
	database.DB.First(&app, cardType.AppID)
	var user models.User
	database.DB.First(&user, app.UserID)
	if user.MaxCards != -1 {
		var currentCardCount int64
		var userAppIDs []uint
		database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &userAppIDs)
		if len(userAppIDs) > 0 {
			database.DB.Model(&models.Card{}).Where("app_id IN ?", userAppIDs).Count(&currentCardCount)
		}
		if int(currentCardCount)+req.Count > user.MaxCards {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": fmt.Sprintf("用户卡号配额不足，当前%d/%d，无法制卡%d张", currentCardCount, user.MaxCards, req.Count)})
			return
		}
	}

	tx := database.DB.Begin()
	result := tx.Model(&models.AgentStockPackageItem{}).
		Where("id = ? AND used_count + ? <= total_count", item.ID, req.Count).
		UpdateColumn("used_count", gorm.Expr("used_count + ?", req.Count))
	if result.Error != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "制卡失败"})
		return
	}
	if result.RowsAffected == 0 {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "卡包剩余次数不足"})
		return
	}

	var randBuf [2]byte
	rand.Read(randBuf[:])
	batchNo := time.Now().Format("20060102150405") + fmt.Sprintf("%04d", binary.BigEndian.Uint16(randBuf[:])%10000)
	cards, err := agentCreateCards(tx, agent.ID, cardType, req.Count, batchNo, req.Remark)
	if err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "制卡失败: " + err.Error()})
		return
	}

	cardLog := models.AgentCardLog{
		AgentID:    agent.ID,
		CardTypeID: cardType.ID,
		BatchNo:    batchNo,
		Count:      len(cards),
		Price:      0, // 卡包制卡不按单价扣费，避免上级拿货价泄露到下级制卡记录
		TotalCost:  0,
	}
	if err := tx.Create(&cardLog).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "记录制卡日志失败"})
		return
	}
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "制卡失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"cards":      cards,
			"batch_no":   batchNo,
			"count":      len(cards),
			"total_cost": 0,
		},
	})
}

// 代理首页统计
func AgentStats(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)

	var ag models.Agent
	database.DB.Select("balance").First(&ag, agent.ID)

	var totalCards int64
	database.DB.Model(&models.Card{}).Where("agent_id = ?", agent.ID).Count(&totalCards)

	var totalSpent float64
	database.DB.Model(&models.AgentCardLog{}).
		Where("agent_id = ?", agent.ID).
		Select("COALESCE(SUM(total_cost),0)").Scan(&totalSpent)

	var userCount int64
	database.DB.Model(&models.AppUser{}).Where("agent_id = ? AND app_id = ?", agent.ID, agent.AppID).Count(&userCount)

	startOfDay := time.Date(time.Now().Year(), time.Now().Month(), time.Now().Day(), 0, 0, 0, 0, time.Local)
	var todayBatches int64
	database.DB.Model(&models.AgentCardLog{}).
		Where("agent_id = ? AND created_at >= ?", agent.ID, startOfDay).
		Count(&todayBatches)

	var onlineCount int64
	database.DB.Model(&models.OnlineSession{}).
		Joins("JOIN app_users ON app_users.id = online_sessions.app_user_id").
		Where("online_sessions.app_id = ? AND app_users.agent_id = ?", agent.AppID, agent.ID).
		Count(&onlineCount)

	type trendRow struct {
		Date      string  `gorm:"column:date"`
		CardCount int     `gorm:"column:card_count"`
		TotalCost float64 `gorm:"column:total_cost"`
	}
	startTrend := time.Now().AddDate(0, 0, -13)
	startTrend = time.Date(startTrend.Year(), startTrend.Month(), startTrend.Day(), 0, 0, 0, 0, time.Local)
	var rawTrend []trendRow
	database.DB.Model(&models.AgentCardLog{}).
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') as date, COALESCE(SUM(count),0) as card_count, COALESCE(SUM(total_cost),0) as total_cost").
		Where("agent_id = ? AND created_at >= ?", agent.ID, startTrend).
		Group("DATE_FORMAT(created_at, '%Y-%m-%d')").
		Order("date ASC").
		Scan(&rawTrend)

	trendMap := map[string]trendRow{}
	for _, row := range rawTrend {
		trendMap[row.Date] = row
	}
	trend := make([]gin.H, 0, 14)
	for i := 0; i < 14; i++ {
		day := startTrend.AddDate(0, 0, i)
		key := day.Format("2006-01-02")
		row := trendMap[key]
		trend = append(trend, gin.H{
			"date":       day.Format("01-02"),
			"card_count": row.CardCount,
			"total_cost": row.TotalCost,
		})
	}

	type cardTypeRow struct {
		CardTypeID uint    `json:"card_type_id"`
		Name       string  `json:"name"`
		Count      int     `json:"count"`
		TotalCost  float64 `json:"total_cost"`
	}
	var cardTypeStats []cardTypeRow
	database.DB.Model(&models.AgentCardLog{}).
		Select("agent_card_logs.card_type_id as card_type_id, card_types.name as name, COALESCE(SUM(agent_card_logs.count),0) as count, COALESCE(SUM(agent_card_logs.total_cost),0) as total_cost").
		Joins("LEFT JOIN card_types ON card_types.id = agent_card_logs.card_type_id").
		Where("agent_card_logs.agent_id = ?", agent.ID).
		Group("agent_card_logs.card_type_id, card_types.name").
		Order("count DESC").
		Limit(8).
		Scan(&cardTypeStats)

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"total_cards":       totalCards,
			"total_spent":       totalSpent,
			"user_count":        userCount,
			"today_batch_count": todayBatches,
			"online_count":      onlineCount,
			"balance":           ag.Balance,
			"trend":             trend,
			"card_type_stats":   cardTypeStats,
		},
	})
}

// 代理名下在线会话（仅 app_users.agent_id = 当前代理）
func AgentListOnlineSessions(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	appUserID := c.Query("app_user_id")
	keyword := c.Query("keyword")

	var list []models.OnlineSession
	var total int64
	query := database.DB.Model(&models.OnlineSession{}).
		Preload("AppUser").
		Joins("JOIN app_users ON app_users.id = online_sessions.app_user_id").
		Where("online_sessions.app_id = ? AND app_users.agent_id = ?", agent.AppID, agent.ID)

	if appUserID != "" {
		query = query.Where("online_sessions.app_user_id = ?", appUserID)
	}
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("app_users.username LIKE ? OR online_sessions.client_ip LIKE ? OR online_sessions.token LIKE ?", kw, kw, kw)
	}
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("online_sessions.heartbeat_at desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 代理踢下线单条会话
func AgentKickOnlineSession(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	id := c.Param("id")

	var session models.OnlineSession
	if err := database.DB.First(&session, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "会话不存在"})
		return
	}
	if session.AppID != agent.AppID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权操作"})
		return
	}
	var appUser models.AppUser
	if err := database.DB.First(&appUser, session.AppUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}
	if appUser.AgentID == nil || *appUser.AgentID != agent.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权操作"})
		return
	}
	if err := database.DB.Delete(&session).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "操作失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已踢下线"})
}

// 代理按用户踢全部在线
func AgentKickOnlineByUser(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	var req struct {
		AppUserID uint `json:"app_user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var appUser models.AppUser
	if err := database.DB.First(&appUser, req.AppUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}
	if appUser.AppID != agent.AppID || appUser.AgentID == nil || *appUser.AgentID != agent.ID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权操作"})
		return
	}

	res := database.DB.Where("app_id = ? AND app_user_id = ?", agent.AppID, req.AppUserID).Delete(&models.OnlineSession{})
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "操作失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已踢下线", "data": gin.H{"count": res.RowsAffected}})
}

const agentExportCardsMax = 5000

// 代理导出卡号（纯文本，每行一个，最多 5000 条）
func AgentExportCards(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	cardTypeID := c.Query("card_type_id")
	batchNo := c.Query("batch_no")
	status := c.Query("status")
	keyword := c.Query("keyword")

	query := database.DB.Model(&models.Card{}).Where("agent_id = ?", agent.ID)
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

	var list []models.Card
	query.Order("id desc").Limit(agentExportCardsMax).Find(&list)

	var b strings.Builder
	for _, card := range list {
		b.WriteString(card.CardNo)
		b.WriteByte('\n')
	}

	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=cards_export.txt")
	c.String(http.StatusOK, b.String())
}

// 导出制卡记录（CSV，最多 5000 条）
func AgentExportCardLogs(c *gin.Context) {
	agent := c.MustGet("agent").(*models.Agent)
	cardTypeID := c.Query("card_type_id")
	dateFrom := c.Query("date_from")
	dateTo := c.Query("date_to")

	query := database.DB.Model(&models.AgentCardLog{}).Preload("CardType").Where("agent_id = ?", agent.ID)
	if cardTypeID != "" {
		query = query.Where("card_type_id = ?", cardTypeID)
	}
	if dateFrom != "" {
		if t, err := time.ParseInLocation("2006-01-02", dateFrom, time.Local); err == nil {
			query = query.Where("created_at >= ?", t)
		}
	}
	if dateTo != "" {
		if t, err := time.ParseInLocation("2006-01-02", dateTo, time.Local); err == nil {
			query = query.Where("created_at < ?", t.Add(24*time.Hour))
		}
	}

	var list []models.AgentCardLog
	query.Order("id desc").Limit(agentExportCardsMax).Find(&list)

	var b strings.Builder
	b.WriteString("批次号,卡种,数量,单价,总花费,时间\n")
	for _, log := range list {
		name := ""
		if log.CardType != nil {
			name = strings.ReplaceAll(log.CardType.Name, ",", " ")
		}
		b.WriteString(log.BatchNo)
		b.WriteByte(',')
		b.WriteString(name)
		b.WriteByte(',')
		b.WriteString(strconv.Itoa(log.Count))
		b.WriteByte(',')
		b.WriteString(fmt.Sprintf("%.4f", log.Price))
		b.WriteByte(',')
		b.WriteString(fmt.Sprintf("%.4f", log.TotalCost))
		b.WriteByte(',')
		b.WriteString(log.CreatedAt.Format("2006-01-02 15:04:05"))
		b.WriteByte('\n')
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=card_logs.csv")
	c.String(http.StatusOK, b.String())
}
