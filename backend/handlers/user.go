package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"jike-auth/database"
	"jike-auth/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const userAvatarBaseDir = "uploads/avatars"

func userAvatarExt(contentType string) (string, bool) {
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

func removeLocalUserAvatar(avatar string) {
	if !strings.HasPrefix(avatar, "/"+userAvatarBaseDir+"/") {
		return
	}
	path := strings.TrimPrefix(avatar, "/")
	cleanPath := filepath.Clean(path)
	if strings.HasPrefix(cleanPath, userAvatarBaseDir+string(os.PathSeparator)) {
		_ = os.Remove(cleanPath)
	}
}

func GetProfile(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": user})
}

// 更新用户资料
func UpdateProfile(c *gin.Context) {
	user := c.MustGet("user").(*models.User)

	var req struct {
		Nickname string `json:"nickname"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	if req.Nickname != "" {
		database.DB.Model(&models.User{}).Where("id = ?", user.ID).Update("nickname", req.Nickname)
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 上传头像
func UploadAvatar(c *gin.Context) {
	user := c.MustGet("user").(*models.User)

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请选择文件"})
		return
	}

	contentType := file.Header.Get("Content-Type")
	ext, ok := userAvatarExt(contentType)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "只支持 JPG/PNG/GIF/WebP 格式"})
		return
	}

	// 检查文件大小（最大2MB）
	if file.Size > 2*1024*1024 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "文件大小不能超过2MB"})
		return
	}

	dir := filepath.Join(userAvatarBaseDir, strconv.Itoa(int(user.ID)))
	if err := os.MkdirAll(dir, 0755); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "创建目录失败"})
		return
	}
	for _, oldExt := range []string{".jpg", ".png", ".gif", ".webp"} {
		_ = os.Remove(filepath.Join(dir, "avatar"+oldExt))
	}
	removeLocalUserAvatar(user.Avatar)
	savePath := filepath.Join(dir, "avatar"+ext)

	if err := c.SaveUploadedFile(file, savePath); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "保存失败"})
		return
	}

	// 更新用户头像
	avatarURL := "/" + filepath.ToSlash(savePath)
	database.DB.Model(&models.User{}).Where("id = ?", user.ID).Update("avatar", avatarURL)

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "上传成功", "data": gin.H{"avatar": avatarURL}})
}

// 修改密码
func ChangePassword(c *gin.Context) {
	user := c.MustGet("user").(*models.User)

	var req struct {
		OldPassword string `json:"old_password" binding:"required"`
		NewPassword string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	if len(req.NewPassword) < 6 || len(req.NewPassword) > 16 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "密码长度为6-16个字符"})
		return
	}
	if !alphanumRegex.MatchString(req.NewPassword) {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "密码只能包含大小写字母和数字"})
		return
	}

	// 获取完整用户信息（包含密码）
	var fullUser models.User
	database.DB.First(&fullUser, user.ID)

	// 验证旧密码
	if err := bcrypt.CompareHashAndPassword([]byte(fullUser.Password), []byte(req.OldPassword)); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "原密码错误"})
		return
	}

	// 加密新密码
	hashedPwd, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "密码加密失败"})
		return
	}

	database.DB.Model(&models.User{}).Where("id = ?", user.ID).Updates(map[string]interface{}{
		"password":      string(hashedPwd),
		"token_version": gorm.Expr("token_version + 1"),
	})
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "密码修改成功，请重新登录"})
}

// 获取用户统计数据
func GetUserStats(c *gin.Context) {
	user := c.MustGet("user").(*models.User)

	// 统计应用数
	var appCount int64
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Count(&appCount)

	// 获取用户的所有应用ID
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)

	var userCount, cardTypeCount, cardCount, onlineCount int64
	if len(appIDs) > 0 {
		// 统计软件用户数
		database.DB.Model(&models.AppUser{}).Where("app_id IN ?", appIDs).Count(&userCount)
		// 统计卡种数
		database.DB.Model(&models.CardType{}).Where("app_id IN ?", appIDs).Count(&cardTypeCount)
		// 统计卡号数
		database.DB.Model(&models.Card{}).Where("app_id IN ?", appIDs).Count(&cardCount)
		// 统计在线数
		database.DB.Model(&models.OnlineSession{}).Where("app_id IN ?", appIDs).Count(&onlineCount)
	}

	// 计算套餐额外配额
	var extraApps, extraUsers, extraCardTypes, extraCards int
	var packageExpireAt *time.Time
	packageName := ""
	var userPackages []models.UserPackage
	database.DB.Preload("Package").Where("user_id = ? AND expire_at > ?", user.ID, time.Now()).Find(&userPackages)
	for _, up := range userPackages {
		extraApps += up.ExtraApps
		extraUsers += up.ExtraUsers
		extraCardTypes += up.ExtraCardTypes
		extraCards += up.ExtraCards
		if packageExpireAt == nil || up.ExpireAt.After(*packageExpireAt) {
			expireAt := up.ExpireAt
			packageExpireAt = &expireAt
			if up.Package != nil {
				packageName = up.Package.Name
			}
		}
	}

	// 计算总配额（基础配额 + 套餐额外配额）
	totalMaxApps := user.MaxApps
	totalMaxUsers := user.MaxUsers
	totalMaxCardTypes := user.MaxCardTypes
	totalMaxCards := user.MaxCards
	if totalMaxApps != -1 {
		totalMaxApps += extraApps
	}
	if totalMaxUsers != -1 {
		totalMaxUsers += extraUsers
	}
	if totalMaxCardTypes != -1 {
		totalMaxCardTypes += extraCardTypes
	}
	if totalMaxCards != -1 {
		totalMaxCards += extraCards
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"app_count":           appCount,
			"user_count":          userCount,
			"card_type_count":     cardTypeCount,
			"card_count":          cardCount,
			"online_count":        onlineCount,
			"max_apps":            totalMaxApps,
			"max_users":           totalMaxUsers,
			"max_card_types":      totalMaxCardTypes,
			"max_cards":           totalMaxCards,
			"base_max_apps":       user.MaxApps,
			"base_max_users":      user.MaxUsers,
			"base_max_card_types": user.MaxCardTypes,
			"base_max_cards":      user.MaxCards,
			"extra_apps":          extraApps,
			"extra_users":         extraUsers,
			"extra_card_types":    extraCardTypes,
			"extra_cards":         extraCards,
			"package_name":        packageName,
			"package_expire_at":   packageExpireAt,
		},
	})
}

// 获取最近7天用户统计（注册量、充值用户量）
func GetUserChart(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appIDs, ok := getAuthorAppIDs(user.ID, c.Query("app_id"))
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}

	type DayStat struct {
		Date       string `json:"date"`
		Registered int64  `json:"registered"` // 注册用户数
		Paid       int64  `json:"paid"`       // 付费用户数
	}

	result := make([]DayStat, 7)
	now := time.Now()

	for i := 6; i >= 0; i-- {
		day := now.AddDate(0, 0, -i)
		dayStart := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
		dayEnd := dayStart.AddDate(0, 0, 1)
		dateStr := dayStart.Format("01-02")

		stat := DayStat{Date: dateStr}

		if len(appIDs) > 0 {
			// 注册用户：当天创建的用户数
			database.DB.Model(&models.AppUser{}).
				Where("app_id IN ? AND created_at >= ? AND created_at < ?", appIDs, dayStart, dayEnd).
				Count(&stat.Registered)

			// 付费用户：当天有充值记录的用户数（去重）
			// 通过 cards 表的 used_at 字段判断，used_by 包含用户ID
			database.DB.Model(&models.Card{}).
				Where("app_id IN ? AND used_at >= ? AND used_at < ? AND status = 2", appIDs, dayStart, dayEnd).
				Distinct("SUBSTR(used_by, 1, INSTR(used_by || ':', ':') - 1)").
				Count(&stat.Paid)
		}

		result[6-i] = stat
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": result})
}

// 获取最近7天卡统计（生成卡数量、充值次数）
func GetCardChart(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appIDs, ok := getAuthorAppIDs(user.ID, c.Query("app_id"))
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}

	type DayStat struct {
		Date      string `json:"date"`
		Created   int64  `json:"created"`   // 生成卡数量
		Recharged int64  `json:"recharged"` // 充值次数
	}

	result := make([]DayStat, 7)
	now := time.Now()

	for i := 6; i >= 0; i-- {
		day := now.AddDate(0, 0, -i)
		dayStart := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
		dayEnd := dayStart.AddDate(0, 0, 1)
		dateStr := dayStart.Format("01-02")

		stat := DayStat{Date: dateStr}

		if len(appIDs) > 0 {
			// 生成卡数量：当天创建的卡数
			database.DB.Model(&models.Card{}).
				Where("app_id IN ? AND created_at >= ? AND created_at < ?", appIDs, dayStart, dayEnd).
				Count(&stat.Created)

			// 充值次数：当天的充值记录次数（一张卡多次充值算多次）
			database.DB.Model(&models.Card{}).
				Where("app_id IN ? AND used_at >= ? AND used_at < ? AND status = 2", appIDs, dayStart, dayEnd).
				Count(&stat.Recharged)
		}

		result[6-i] = stat
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": result})
}

// 获取最近7天代理统计（代理生成卡数量、代理消费金额）
func GetAgentChart(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appIDs, ok := getAuthorAppIDs(user.ID, c.Query("app_id"))
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此APP"})
		return
	}

	// 获取用户所有代理的ID
	var agentIDs []uint
	if len(appIDs) > 0 {
		database.DB.Model(&models.Agent{}).Where("app_id IN ?", appIDs).Pluck("id", &agentIDs)
	}

	type DayStat struct {
		Date      string  `json:"date"`
		CardCount int64   `json:"card_count"` // 代理生成卡数量
		TotalCost float64 `json:"total_cost"` // 代理消费金额
	}

	result := make([]DayStat, 7)
	now := time.Now()

	for i := 6; i >= 0; i-- {
		day := now.AddDate(0, 0, -i)
		dayStart := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
		dayEnd := dayStart.AddDate(0, 0, 1)
		dateStr := dayStart.Format("01-02")

		stat := DayStat{Date: dateStr}

		if len(agentIDs) > 0 {
			// 代理生成卡数量
			var totalCount int64
			database.DB.Model(&models.AgentCardLog{}).
				Where("agent_id IN ? AND created_at >= ? AND created_at < ?", agentIDs, dayStart, dayEnd).
				Select("COALESCE(SUM(count), 0)").Scan(&totalCount)
			stat.CardCount = totalCount

			// 代理消费金额
			var totalCost float64
			database.DB.Model(&models.AgentCardLog{}).
				Where("agent_id IN ? AND created_at >= ? AND created_at < ?", agentIDs, dayStart, dayEnd).
				Select("COALESCE(SUM(total_cost), 0)").Scan(&totalCost)
			stat.TotalCost = totalCost
		}

		result[6-i] = stat
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": result})
}
