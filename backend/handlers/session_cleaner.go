package handlers

import (
	"jike-auth/database"
	"jike-auth/models"
	"log"
	"time"
)

// StartSessionCleaner 启动后台会话清理任务
func StartSessionCleaner() {
	go runSessionCleaner()
	go runIdleSessionCleaner()
	log.Println("会话清理任务已启动")
}

func runSessionCleaner() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		if !isBackgroundTaskEnabled("session-expired-cleaner") {
			continue
		}
		cleanExpiredSessions()
	}
}

// runIdleSessionCleaner 运行空闲会话清理任务（每小时执行一次）
func runIdleSessionCleaner() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		if !isBackgroundTaskEnabled("session-idle-cleaner") {
			continue
		}
		cleanIdleSessions()
	}
}

// cleanExpiredSessions 清理心跳超时的在线会话
func cleanExpiredSessions() {
	defer markBackgroundTaskRun("session-expired-cleaner")

	// 获取所有启用的应用
	var apps []models.App
	database.DB.Where("status = 1").Find(&apps)

	for _, app := range apps {
		tolerance := getHeartbeatTolerance(&app)
		if tolerance <= 0 {
			continue
		}

		cutoff := time.Now().Add(-time.Duration(tolerance) * time.Second)

		// 查找超时会话
		var expiredSessions []models.OnlineSession
		database.DB.Where("app_id = ? AND heartbeat_at < ?", app.ID, cutoff).
			Find(&expiredSessions)

		if len(expiredSessions) == 0 {
			continue
		}

		// 收集要删除的会话ID
		var sessionIDs []uint
		for _, s := range expiredSessions {
			sessionIDs = append(sessionIDs, s.ID)
		}

		// 批量删除
		database.DB.Where("id IN ?", sessionIDs).Delete(&models.OnlineSession{})

		log.Printf("应用[%s] 清理了 %d 个超时会话", app.AppName, len(expiredSessions))
	}
}

// getHeartbeatTolerance 获取心跳超时容差（秒）
// 使用应用心跳周期 × 3（允许错过2次心跳）
func getHeartbeatTolerance(app *models.App) int {
	if app.Heartbeat > 0 {
		return app.Heartbeat * 3
	}
	return 180
}

// cleanIdleSessions 清理长时间空闲的会话（超过24小时无心跳）
func cleanIdleSessions() {
	defer markBackgroundTaskRun("session-idle-cleaner")

	// 清理超过24小时无心跳的会话
	idleThreshold := time.Now().Add(-24 * time.Hour)
	
	var idleSessions []models.OnlineSession
	database.DB.Where("heartbeat_at < ?", idleThreshold).
		Find(&idleSessions)

	if len(idleSessions) == 0 {
		return
	}

	// 收集要删除的会话ID
	var sessionIDs []uint
	for _, s := range idleSessions {
		sessionIDs = append(sessionIDs, s.ID)
	}

	// 批量删除
	result := database.DB.Where("id IN ?", sessionIDs).Delete(&models.OnlineSession{})
	
	log.Printf("清理了 %d 个长时间空闲会话（超过24小时无心跳）", result.RowsAffected)
}
