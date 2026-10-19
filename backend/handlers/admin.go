package handlers

import (
	"context"
	"errors"
	"fmt"
	"jike-auth/cache"
	"jike-auth/config"
	"jike-auth/database"
	"jike-auth/models"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var adminServerStartedAt = time.Now()

type adminHealthItem struct {
	Key       string `json:"key"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	Message   string `json:"message"`
	LatencyMS int64  `json:"latency_ms,omitempty"`
}

// 用户管理
func AdminListUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	keyword := c.Query("keyword")

	var users []models.User
	var total int64

	query := database.DB.Model(&models.User{})
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("username LIKE ? OR email LIKE ? OR nickname LIKE ?",
			kw, kw, kw)
	}

	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&users)

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"list":  users,
			"total": total,
		},
	})
}

func AdminUpdateUser(c *gin.Context) {
	id := c.Param("id")
	currentUser := c.MustGet("user").(*models.User)

	var req struct {
		Username     string `json:"username"`
		Email        string `json:"email"`
		Nickname     string `json:"nickname"`
		Status       *int   `json:"status"`
		Role         *int   `json:"role"`
		MaxApps      *int   `json:"max_apps"`
		MaxUsers     *int   `json:"max_users"`
		MaxCardTypes *int   `json:"max_card_types"`
		MaxCards     *int   `json:"max_cards"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 防止管理员修改自己的角色或状态
	if fmt.Sprintf("%d", currentUser.ID) == id {
		if req.Role != nil && *req.Role != int(currentUser.Role) {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "不能修改自己的角色"})
			return
		}
		if req.Status != nil && *req.Status == 0 {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "不能禁用自己的账号"})
			return
		}
	}

	updates := make(map[string]interface{})
	if req.Username != "" {
		// 检查用户名唯一性
		var count int64
		database.DB.Unscoped().Model(&models.User{}).Where("username = ? AND id != ?", req.Username, id).Count(&count)
		if count > 0 {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户名已存在"})
			return
		}
		updates["username"] = req.Username
	}
	if req.Email != "" {
		// 检查邮箱唯一性
		var count int64
		database.DB.Unscoped().Model(&models.User{}).Where("email = ? AND id != ?", req.Email, id).Count(&count)
		if count > 0 {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "邮箱已存在"})
			return
		}
		updates["email"] = req.Email
	}
	if req.Nickname != "" {
		updates["nickname"] = req.Nickname
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.Role != nil {
		updates["role"] = *req.Role
	}
	if req.MaxApps != nil {
		updates["max_apps"] = *req.MaxApps
	}
	if req.MaxUsers != nil {
		updates["max_users"] = *req.MaxUsers
	}
	if req.MaxCardTypes != nil {
		updates["max_card_types"] = *req.MaxCardTypes
	}
	if req.MaxCards != nil {
		updates["max_cards"] = *req.MaxCards
	}

	if err := database.DB.Model(&models.User{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		// 兜底处理唯一索引冲突，避免只返回泛化错误
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户名或邮箱已存在"})
			return
		}
		// 部分驱动不会映射 ErrDuplicatedKey，做关键字兜底
		msg := err.Error()
		if msg != "" && (containsIgnoreCase(msg, "duplicate") || containsIgnoreCase(msg, "unique")) {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户名或邮箱已存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func containsIgnoreCase(src, sub string) bool {
	return strings.Contains(strings.ToLower(src), strings.ToLower(sub))
}

func AdminDeleteUser(c *gin.Context) {
	id := c.Param("id")

	// 防止删除自己
	currentUser := c.MustGet("user").(*models.User)
	if fmt.Sprintf("%d", currentUser.ID) == id {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "不能删除自己的账号"})
		return
	}

	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	// 级联删除用户的所有关联数据
	var appIDs []uint
	database.DB.Model(&models.App{}).Where("user_id = ?", user.ID).Pluck("id", &appIDs)
	for _, appID := range appIDs {
		deleteAppRelatedData(appID)
	}
	database.DB.Where("user_id = ?", user.ID).Delete(&models.App{})
	database.DB.Where("user_id = ?", user.ID).Delete(&models.Agent{})
	database.DB.Where("user_id = ?", user.ID).Delete(&models.OperationLog{})
	database.DB.Where("user_id = ?", user.ID).Delete(&models.CheckinLog{})
	database.DB.Where("user_id = ?", user.ID).Delete(&models.Ticket{})
	database.DB.Where("user_id = ?", user.ID).Delete(&models.UserPackage{})
	database.DB.Where("user_id = ?", user.ID).Delete(&models.WithdrawKey{})

	if err := database.DB.Delete(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 用户余额充值
func AdminRechargeUser(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Amount float64 `json:"amount" binding:"required"`
		Remark string  `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户不存在"})
		return
	}

	newBalance := user.Balance + req.Amount
	if newBalance < 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "余额不能为负数"})
		return
	}

	database.DB.Model(&user).UpdateColumn("balance", gorm.Expr("balance + ?", req.Amount))

	// 重新查询获取最新余额
	database.DB.First(&user, user.ID)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "充值成功", "data": gin.H{"balance": user.Balance}})
}

// 后台系统健康状态
func AdminGetHealthStatus(c *gin.Context) {
	items := []adminHealthItem{
		checkDatabaseHealth(),
		checkRedisHealth(),
		checkEmailConfigHealth(),
		checkTelegramConfigHealth(),
		checkStorageHealth(),
	}

	overall := "ok"
	for _, item := range items {
		if item.Status == "error" {
			overall = "error"
			break
		}
		if item.Status == "warning" && overall == "ok" {
			overall = "warning"
		}
	}
	checkedAt := time.Now()

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"overall":        overall,
			"items":          items,
			"checked_at":     checkedAt,
			"uptime_seconds": int64(time.Since(adminServerStartedAt).Seconds()),
			"go_version":     runtime.Version(),
			"os":             runtime.GOOS,
			"arch":           runtime.GOARCH,
			"metrics":        collectAdminRuntimeMetrics(),
		},
	})
}

// AdminListBackgroundTasks 返回后台定时任务状态。
func AdminListBackgroundTasks(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"list":       listBackgroundTasks(),
			"checked_at": time.Now(),
		},
	})
}

// AdminUpdateBackgroundTask 更新后台定时任务运行开关。
func AdminUpdateBackgroundTask(c *gin.Context) {
	var req struct {
		Enabled *bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Enabled == nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	item, ok := setBackgroundTaskEnabled(c.Param("key"), *req.Enabled)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "任务不存在"})
		return
	}
	if *req.Enabled {
		runBackgroundTaskNow(item.Key)
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": item})
}

func collectAdminRuntimeMetrics() gin.H {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	dbStats := gin.H{}
	if database.DB != nil {
		if sqlDB, err := database.DB.DB(); err == nil {
			stats := sqlDB.Stats()
			dbStats = gin.H{
				"open_connections": stats.OpenConnections,
				"in_use":           stats.InUse,
				"idle":             stats.Idle,
				"wait_count":       stats.WaitCount,
				"wait_duration_ms": stats.WaitDuration.Milliseconds(),
				"max_open":         stats.MaxOpenConnections,
			}
		}
	}

	storage := readDiskMetrics()
	sysMem := readSystemMemoryMetrics()
	cpu := readCPUUsageMetrics()

	return gin.H{
		"process": gin.H{
			"pid":             os.Getpid(),
			"started_at":      adminServerStartedAt,
			"uptime_seconds":  int64(time.Since(adminServerStartedAt).Seconds()),
			"goroutines":      runtime.NumGoroutine(),
			"cpu_count":       runtime.NumCPU(),
			"go_version":      runtime.Version(),
			"gc_count":        mem.NumGC,
			"last_gc_at":      formatLastGCTime(mem.LastGC),
			"gc_pause_total":  int64(mem.PauseTotalNs / uint64(time.Millisecond)),
			"heap_alloc":      mem.HeapAlloc,
			"heap_sys":        mem.HeapSys,
			"stack_inuse":     mem.StackInuse,
			"next_gc":         mem.NextGC,
			"memory_alloc":    mem.Alloc,
			"memory_sys":      mem.Sys,
			"memory_total_gc": mem.TotalAlloc,
		},
		"cpu":       cpu,
		"memory":    sysMem,
		"database":  dbStats,
		"online":    readOnlineSessionMetrics(),
		"redis":     readRedisMetrics(),
		"storage":   storage,
		"websocket": getWSConnectionMetrics(),
	}
}

func readOnlineSessionMetrics() gin.H {
	now := time.Now()
	fiveMinAgo := now.Add(-5 * time.Minute)
	var online, expired, total int64
	database.DB.Model(&models.OnlineSession{}).Where("heartbeat_at >= ?", fiveMinAgo).Count(&online)
	database.DB.Model(&models.OnlineSession{}).Where("heartbeat_at < ?", fiveMinAgo).Count(&expired)
	database.DB.Model(&models.OnlineSession{}).Count(&total)
	return gin.H{
		"online":  online,
		"expired": expired,
		"total":   total,
	}
}

func readRedisMetrics() gin.H {
	if !config.Cfg.Redis.Enable {
		return gin.H{"enabled": false}
	}
	result := gin.H{"enabled": true, "connected": cache.Enabled}
	if cache.RDB == nil || !cache.Enabled {
		return result
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	info, err := cache.RDB.Info(ctx, "server", "clients", "memory", "keyspace").Result()
	if err != nil {
		result["error"] = err.Error()
		return result
	}
	for _, line := range strings.Split(info, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || !strings.Contains(line, ":") {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		key, value := parts[0], parts[1]
		switch key {
		case "redis_version", "connected_clients", "used_memory", "used_memory_human", "used_memory_peak_human":
			result[key] = value
		}
		if strings.HasPrefix(key, "db") {
			result["keyspace"] = value
		}
	}
	if size, err := cache.RDB.DBSize(ctx).Result(); err == nil {
		result["db_size"] = size
	}
	return result
}

func formatLastGCTime(ns uint64) interface{} {
	if ns == 0 {
		return nil
	}
	return time.Unix(0, int64(ns))
}

func readDiskMetrics() gin.H {
	total, free, err := getDiskSpace(".")
	if err != nil {
		return gin.H{"error": err.Error()}
	}
	used := total - free
	usedPercent := 0.0
	if total > 0 {
		usedPercent = float64(used) / float64(total) * 100
	}
	return gin.H{
		"total":        total,
		"used":         used,
		"free":         free,
		"used_percent": roundFloat(usedPercent, 1),
	}
}

func readSystemMemoryMetrics() gin.H {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return gin.H{"error": err.Error()}
	}
	values := map[string]uint64{}
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		key := strings.TrimSuffix(fields[0], ":")
		value, err := strconv.ParseUint(fields[1], 10, 64)
		if err == nil {
			values[key] = value * 1024
		}
	}
	total := values["MemTotal"]
	available := values["MemAvailable"]
	used := total - available
	usedPercent := 0.0
	if total > 0 {
		usedPercent = float64(used) / float64(total) * 100
	}
	return gin.H{
		"total":        total,
		"available":    available,
		"used":         used,
		"used_percent": roundFloat(usedPercent, 1),
	}
}

func readCPUUsageMetrics() gin.H {
	sys1, idle1, ok1 := readSystemCPUStat()
	proc1, procOK1 := readProcessCPUJiffies()
	time.Sleep(120 * time.Millisecond)
	sys2, idle2, ok2 := readSystemCPUStat()
	proc2, procOK2 := readProcessCPUJiffies()
	if !ok1 || !ok2 || sys2 <= sys1 {
		return gin.H{"cpu_count": runtime.NumCPU()}
	}
	totalDelta := float64(sys2 - sys1)
	idleDelta := float64(idle2 - idle1)
	systemPercent := (totalDelta - idleDelta) / totalDelta * 100
	result := gin.H{
		"cpu_count":      runtime.NumCPU(),
		"system_percent": roundFloat(systemPercent, 1),
	}
	if procOK1 && procOK2 && proc2 >= proc1 {
		processPercent := float64(proc2-proc1) * float64(runtime.NumCPU()) / totalDelta * 100
		result["process_percent"] = roundFloat(processPercent, 1)
	}
	return result
}

func readSystemCPUStat() (total uint64, idle uint64, ok bool) {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0, 0, false
	}
	line := strings.SplitN(string(data), "\n", 2)[0]
	fields := strings.Fields(line)
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0, 0, false
	}
	values := make([]uint64, 0, len(fields)-1)
	for _, field := range fields[1:] {
		value, err := strconv.ParseUint(field, 10, 64)
		if err != nil {
			return 0, 0, false
		}
		values = append(values, value)
		total += value
	}
	idle = values[3]
	if len(values) > 4 {
		idle += values[4]
	}
	return total, idle, true
}

func readProcessCPUJiffies() (uint64, bool) {
	data, err := os.ReadFile("/proc/self/stat")
	if err != nil {
		return 0, false
	}
	content := string(data)
	idx := strings.LastIndex(content, ")")
	if idx < 0 || idx+2 >= len(content) {
		return 0, false
	}
	fields := strings.Fields(content[idx+2:])
	if len(fields) < 15 {
		return 0, false
	}
	utime, err1 := strconv.ParseUint(fields[11], 10, 64)
	stime, err2 := strconv.ParseUint(fields[12], 10, 64)
	if err1 != nil || err2 != nil {
		return 0, false
	}
	return utime + stime, true
}

func roundFloat(value float64, precision int) float64 {
	ratio := math.Pow(10, float64(precision))
	return math.Round(value*ratio) / ratio
}

func checkDatabaseHealth() adminHealthItem {
	start := time.Now()
	if database.DB == nil {
		return adminHealthItem{Key: "database", Name: "数据库", Status: "error", Message: "数据库未初始化"}
	}
	sqlDB, err := database.DB.DB()
	if err != nil {
		return adminHealthItem{Key: "database", Name: "数据库", Status: "error", Message: err.Error()}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := sqlDB.PingContext(ctx); err != nil {
		return adminHealthItem{Key: "database", Name: "数据库", Status: "error", Message: err.Error(), LatencyMS: time.Since(start).Milliseconds()}
	}
	return adminHealthItem{Key: "database", Name: "数据库", Status: "ok", Message: "连接正常", LatencyMS: time.Since(start).Milliseconds()}
}

func checkRedisHealth() adminHealthItem {
	if !config.Cfg.Redis.Enable {
		return adminHealthItem{Key: "redis", Name: "Redis缓存", Status: "disabled", Message: "未启用，当前使用内存缓存"}
	}
	start := time.Now()
	if cache.RDB == nil || !cache.Enabled {
		return adminHealthItem{Key: "redis", Name: "Redis缓存", Status: "error", Message: "Redis未初始化"}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := cache.RDB.Ping(ctx).Err(); err != nil {
		return adminHealthItem{Key: "redis", Name: "Redis缓存", Status: "error", Message: err.Error(), LatencyMS: time.Since(start).Milliseconds()}
	}
	return adminHealthItem{Key: "redis", Name: "Redis缓存", Status: "ok", Message: "连接正常", LatencyMS: time.Since(start).Milliseconds()}
}

func checkEmailConfigHealth() adminHealthItem {
	var emailConfig models.EmailConfig
	database.DB.Where("user_id = 0 OR user_id IS NULL").First(&emailConfig)
	if strings.TrimSpace(emailConfig.SMTPHost) == "" || strings.TrimSpace(emailConfig.SMTPUser) == "" || strings.TrimSpace(emailConfig.SMTPPass) == "" {
		return adminHealthItem{Key: "email", Name: "邮箱服务", Status: "warning", Message: "全局邮箱未完整配置"}
	}
	return adminHealthItem{Key: "email", Name: "邮箱服务", Status: "ok", Message: fmt.Sprintf("已配置 %s:%d", emailConfig.SMTPHost, emailConfig.SMTPPort)}
}

func checkTelegramConfigHealth() adminHealthItem {
	var telegramConfig models.TelegramConfig
	database.DB.First(&telegramConfig)
	if strings.TrimSpace(telegramConfig.BotToken) == "" || strings.TrimSpace(telegramConfig.ChatID) == "" {
		return adminHealthItem{Key: "telegram", Name: "TG通知", Status: "disabled", Message: "未配置Bot Token或Chat ID"}
	}
	return adminHealthItem{Key: "telegram", Name: "TG通知", Status: "ok", Message: "已配置通知通道"}
}

func checkStorageHealth() adminHealthItem {
	total, free, err := getDiskSpace(".")
	if err != nil {
		return adminHealthItem{Key: "storage", Name: "磁盘空间", Status: "warning", Message: "无法读取磁盘空间: " + err.Error()}
	}
	if total == 0 {
		return adminHealthItem{Key: "storage", Name: "磁盘空间", Status: "warning", Message: "无法计算磁盘空间"}
	}
	usedPercent := float64(total-free) / float64(total) * 100
	status := "ok"
	if usedPercent >= 90 {
		status = "error"
	} else if usedPercent >= 80 {
		status = "warning"
	}
	return adminHealthItem{Key: "storage", Name: "磁盘空间", Status: status, Message: fmt.Sprintf("已使用 %.1f%%，剩余 %.1f GB", usedPercent, float64(free)/1024/1024/1024)}
}

// 公告管理
func AdminListAnnouncements(c *gin.Context) {
	var announcements []models.Announcement
	database.DB.Order("sort desc, id desc").Find(&announcements)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": announcements})
}

func AdminSaveAnnouncements(c *gin.Context) {
	var announcements []struct {
		Content string `json:"content"`
		Color   string `json:"color"`
		Popup   bool   `json:"popup"`
	}
	if err := c.ShouldBindJSON(&announcements); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 删除所有旧公告
	database.DB.Unscoped().Where("1 = 1").Delete(&models.Announcement{})

	// 创建新公告
	for i, a := range announcements {
		if a.Content == "" {
			continue
		}
		announcement := &models.Announcement{
			Title:   "公告",
			Content: a.Content,
			Color:   a.Color,
			Status:  1,
			Sort:    len(announcements) - i,
		}
		database.DB.Create(announcement)
	}

	if cache.Enabled {
		cache.Del("config:announcements")
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "保存成功"})
}

func AdminCreateAnnouncement(c *gin.Context) {
	var req struct {
		Title   string `json:"title" binding:"required"`
		Content string `json:"content" binding:"required"`
		Color   string `json:"color"`
		Popup   int    `json:"popup"`
		Status  int    `json:"status"`
		Sort    int    `json:"sort"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	if req.Color == "" {
		req.Color = "primary"
	}

	announcement := &models.Announcement{
		Title:   req.Title,
		Content: req.Content,
		Color:   req.Color,
		Popup:   req.Popup,
		Status:  req.Status,
		Sort:    req.Sort,
	}

	if err := database.DB.Create(announcement).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	if cache.Enabled {
		cache.Del("config:announcements")
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": announcement})
}

func AdminUpdateAnnouncement(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
		Color   string `json:"color"`
		Popup   *int   `json:"popup"`
		Status  *int   `json:"status"`
		Sort    *int   `json:"sort"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Content != "" {
		updates["content"] = req.Content
	}
	if req.Color != "" {
		updates["color"] = req.Color
	}
	if req.Popup != nil {
		updates["popup"] = *req.Popup
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.Sort != nil {
		updates["sort"] = *req.Sort
	}

	if err := database.DB.Model(&models.Announcement{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "更新失败"})
		return
	}

	if cache.Enabled {
		cache.Del("config:announcements")
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func AdminDeleteAnnouncement(c *gin.Context) {
	id := c.Param("id")
	if err := database.DB.Delete(&models.Announcement{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "删除失败"})
		return
	}
	if cache.Enabled {
		cache.Del("config:announcements")
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 网站配置管理
func AdminGetSiteConfig(c *gin.Context) {
	var siteConfig models.SiteConfig
	database.DB.First(&siteConfig)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": siteConfig})
}

func AdminSaveSiteConfig(c *gin.Context) {
	var req struct {
		SiteName     string `json:"site_name"`
		SiteSubtitle string `json:"site_subtitle"`
		SiteLogo     string `json:"site_logo"`
		SiteLogoDark string `json:"site_logo_dark"`
		SiteFavicon  string `json:"site_favicon"`
		ServiceQQ    string `json:"service_qq"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var siteConfig models.SiteConfig
	database.DB.First(&siteConfig)

	siteConfig.SiteName = req.SiteName
	siteConfig.SiteSubtitle = req.SiteSubtitle
	siteConfig.SiteLogo = req.SiteLogo
	siteConfig.SiteLogoDark = req.SiteLogoDark
	siteConfig.SiteFavicon = req.SiteFavicon
	siteConfig.ServiceQQ = req.ServiceQQ

	if siteConfig.ID == 0 {
		database.DB.Create(&siteConfig)
	} else {
		database.DB.Save(&siteConfig)
	}

	if cache.Enabled {
		cache.Del("config:site")
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "保存成功"})
}

func AdminUploadSiteAsset(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "请选择文件"})
		return
	}

	// 创建上传目录
	uploadDir := "./uploads/site"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建目录失败"})
		return
	}

	// 生成文件名
	ext := filepath.Ext(file.Filename)
	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	filePath := filepath.Join(uploadDir, filename)

	// 保存文件
	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "保存文件失败"})
		return
	}

	// 返回访问路径
	url := "/uploads/site/" + filename
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"url": url}})
}

// 后台首页数据一览
func AdminGetDashboardStats(c *gin.Context) {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	yesterday := today.AddDate(0, 0, -1)

	// 平台用户总数
	var totalUsers int64
	database.DB.Model(&models.User{}).Count(&totalUsers)

	// 今日新增用户
	var todayUsers int64
	database.DB.Model(&models.User{}).Where("created_at >= ?", today).Count(&todayUsers)

	// 昨日新增用户
	var yesterdayUsers int64
	database.DB.Model(&models.User{}).Where("created_at >= ? AND created_at < ?", yesterday, today).Count(&yesterdayUsers)

	// 今日登录用户数（通过操作日志统计，去重）
	var todayLoginUsers int64
	database.DB.Model(&models.OperationLog{}).
		Where("action = 'login' AND created_at >= ?", today).
		Distinct("user_id").
		Count(&todayLoginUsers)

	// 应用总数
	var totalApps int64
	database.DB.Model(&models.App{}).Count(&totalApps)

	// 软件用户总数
	var totalAppUsers int64
	database.DB.Model(&models.AppUser{}).Count(&totalAppUsers)

	// 今日新增软件用户
	var todayAppUsers int64
	database.DB.Model(&models.AppUser{}).Where("created_at >= ?", today).Count(&todayAppUsers)

	// 昨日新增软件用户
	var yesterdayAppUsers int64
	database.DB.Model(&models.AppUser{}).Where("created_at >= ? AND created_at < ?", yesterday, today).Count(&yesterdayAppUsers)

	// 当前在线数
	var onlineCount int64
	fiveMinAgo := now.Add(-5 * time.Minute)
	database.DB.Model(&models.OnlineSession{}).Where("heartbeat_at >= ?", fiveMinAgo).Count(&onlineCount)

	// 卡号总数
	var totalCards int64
	database.DB.Model(&models.Card{}).Count(&totalCards)

	// 已使用卡号数
	var usedCards int64
	database.DB.Model(&models.Card{}).Where("status = 2").Count(&usedCards)

	// 今日充值卡数
	var todayUsedCards int64
	database.DB.Model(&models.Card{}).Where("status IN ? AND used_at >= ?", []int{2, 4}, today).Count(&todayUsedCards)

	// 代理总数
	var totalAgents int64
	database.DB.Model(&models.Agent{}).Count(&totalAgents)

	// 工单统计
	var pendingTickets int64
	database.DB.Model(&models.Ticket{}).Where("status IN (1, 2)").Count(&pendingTickets)

	var resolvedTickets int64
	database.DB.Model(&models.Ticket{}).Where("status IN (3, 4)").Count(&resolvedTickets)

	// 签到统计
	var todayCheckins int64
	database.DB.Model(&models.CheckinLog{}).Where("checkin_at >= ?", today).Count(&todayCheckins)

	var totalCheckins int64
	database.DB.Model(&models.CheckinLog{}).Count(&totalCheckins)

	// 活动统计
	var activeActivities int64
	database.DB.Model(&models.Activity{}).Where("status = 1").Count(&activeActivities)

	var totalActivityRecords int64
	database.DB.Model(&models.ActivityRecord{}).Count(&totalActivityRecords)

	var todayActivityRecords int64
	database.DB.Model(&models.ActivityRecord{}).Where("created_at >= ?", today).Count(&todayActivityRecords)

	// 近7天趋势
	type DayStat struct {
		Date  string `json:"date"`
		Count int64  `json:"count"`
	}
	userTrend := make([]DayStat, 7)
	appUserTrend := make([]DayStat, 7)
	cardTrend := make([]DayStat, 7)
	onlineTrend := make([]DayStat, 7)
	loginTrend := make([]DayStat, 7)

	for i := 6; i >= 0; i-- {
		day := now.AddDate(0, 0, -i)
		dayStart := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())
		dayEnd := dayStart.AddDate(0, 0, 1)
		dateStr := dayStart.Format("01-02")

		var uCount, auCount, cCount, oCount, lCount int64
		database.DB.Model(&models.User{}).Where("created_at >= ? AND created_at < ?", dayStart, dayEnd).Count(&uCount)
		database.DB.Model(&models.AppUser{}).Where("created_at >= ? AND created_at < ?", dayStart, dayEnd).Count(&auCount)
		database.DB.Model(&models.Card{}).Where("status IN ? AND used_at >= ? AND used_at < ?", []int{2, 4}, dayStart, dayEnd).Count(&cCount)
		// 在线趋势：当天有心跳的去重用户数
		database.DB.Unscoped().Model(&models.OnlineSession{}).
			Where("login_at < ? AND heartbeat_at >= ?", dayEnd, dayStart).
			Distinct("app_user_id").
			Count(&oCount)
		// 登录趋势：当天登录的去重平台用户数
		database.DB.Model(&models.OperationLog{}).
			Where("action = 'login' AND created_at >= ? AND created_at < ?", dayStart, dayEnd).
			Distinct("user_id").
			Count(&lCount)

		userTrend[6-i] = DayStat{Date: dateStr, Count: uCount}
		appUserTrend[6-i] = DayStat{Date: dateStr, Count: auCount}
		cardTrend[6-i] = DayStat{Date: dateStr, Count: cCount}
		onlineTrend[6-i] = DayStat{Date: dateStr, Count: oCount}
		loginTrend[6-i] = DayStat{Date: dateStr, Count: lCount}
	}

	// 最近注册用户（最新10个）
	type RecentUser struct {
		ID        uint      `json:"id"`
		Username  string    `json:"username"`
		Email     string    `json:"email"`
		Nickname  string    `json:"nickname"`
		Status    int       `json:"status"`
		CreatedAt time.Time `json:"created_at"`
	}
	var recentUsers []RecentUser
	database.DB.Model(&models.User{}).
		Select("id, username, email, nickname, status, created_at").
		Order("id desc").Limit(10).
		Find(&recentUsers)

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"total_users":            totalUsers,
			"today_users":            todayUsers,
			"yesterday_users":        yesterdayUsers,
			"today_login_users":      todayLoginUsers,
			"total_apps":             totalApps,
			"total_app_users":        totalAppUsers,
			"today_app_users":        todayAppUsers,
			"yesterday_app_users":    yesterdayAppUsers,
			"online_count":           onlineCount,
			"total_cards":            totalCards,
			"used_cards":             usedCards,
			"today_used_cards":       todayUsedCards,
			"total_agents":           totalAgents,
			"pending_tickets":        pendingTickets,
			"resolved_tickets":       resolvedTickets,
			"today_checkins":         todayCheckins,
			"total_checkins":         totalCheckins,
			"active_activities":      activeActivities,
			"total_activity_records": totalActivityRecords,
			"today_activity_records": todayActivityRecords,
			"user_trend":             userTrend,
			"app_user_trend":         appUserTrend,
			"card_trend":             cardTrend,
			"online_trend":           onlineTrend,
			"login_trend":            loginTrend,
			"recent_users":           recentUsers,
		},
	})
}
