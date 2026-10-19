package main

import (
	"fmt"
	"jike-auth/cache"
	"jike-auth/config"
	"jike-auth/database"
	"jike-auth/handlers"
	"jike-auth/middleware"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

func resolveGinMode(configMode string) string {
	// 生产环境默认强制 release；仅当显式设置 ALLOW_DEBUG=true 时才接受 debug。
	if configMode == gin.DebugMode && os.Getenv("ALLOW_DEBUG") != "true" {
		return gin.ReleaseMode
	}
	if configMode != gin.DebugMode && configMode != gin.ReleaseMode && configMode != gin.TestMode {
		return gin.ReleaseMode
	}
	return configMode
}

func main() {
	// 后端所有默认时间计算使用上海时区，避免日志、过期时间、统计口径跨时区混乱。
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.FixedZone("Asia/Shanghai", 8*60*60)
	}
	time.Local = loc

	// 加载根目录 config.yaml；首次部署时配置可不存在，后续由 /api/setup/* 初始化写入。
	if err := config.Load("config.yaml"); err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}

	initialized := config.Cfg.Initialized == 1
	if initialized {
		// 已初始化后才连接数据库并迁移模型；未初始化时只开放安装向导相关接口。
		if err := database.Init(); err != nil {
			log.Fatalf("初始化数据库失败: %v", err)
		}

		// 初始化 Redis（可选，未启用则使用内存缓存）
		if err := cache.Init(); err != nil {
			log.Printf("Redis 初始化失败，将使用内存缓存: %v", err)
		} else if cache.Enabled {
			log.Println("Redis 缓存已启用")
		}
	} else {
		log.Println("系统尚未初始化，仅开放初始化接口")
	}

	// 设置 Gin 模式。resolveGinMode 会避免交付环境意外跑在 debug 模式。
	gin.SetMode(resolveGinMode(config.Cfg.Server.Mode))

	r := gin.Default()

	// 静态文件服务（嵌入式）。调试请加 -tags dev，本函数为空实现，前端用 npm run dev。
	setupStaticFiles(r)

	// uploads 目录仍使用文件系统（禁用目录列表）
	r.StaticFS("/uploads", http.Dir("./uploads"))

	api := r.Group("/api")
	{
		// 初始化未完成时，除 setup 接口外都返回 need_setup，前端据此跳转安装页。
		api.Use(middleware.SetupRequiredMiddleware())

		// 公开接口：不需要登录，主要用于安装、登录注册、站点配置和充值回调。
		api.GET("/setup/status", handlers.GetSetupStatus)
		api.POST("/setup/test-database", handlers.SetupTestDatabase)
		api.POST("/setup/test-redis", handlers.SetupTestRedis)
		api.POST("/setup/init", handlers.SetupInitialize)
		api.POST("/setup/admin", handlers.SetupAdmin)
		api.POST("/auth/register", handlers.Register)
		api.POST("/auth/login", handlers.Login)
		api.POST("/auth/send-code", handlers.SendRegisterCode)
		api.POST("/auth/send-reset-code", handlers.SendResetCode)
		api.POST("/auth/reset-password", handlers.ResetPassword)
		api.GET("/auth/captcha", handlers.GenerateCaptcha)
		api.GET("/auth/login-status", handlers.GetLoginStatus)
		api.GET("/config/site", handlers.GetSiteConfig)
		api.GET("/config/announcements", handlers.GetAnnouncements)
		api.GET("/config/register", handlers.GetPublicRegisterConfig)
		api.GET("/config/security", handlers.GetPublicSecurityConfig)

		// 充值公开接口
		api.GET("/recharge/packages", handlers.GetRechargePackages)
		api.POST("/recharge/notify", handlers.EpayNotify)
		api.GET("/recharge/notify", handlers.EpayNotify)
		api.GET("/recharge/return", handlers.EpayReturn)
		api.GET("/config/social-login", handlers.GetSocialLoginStatus)
		api.GET("/auth/social/url", handlers.GetSocialLoginURL)
		api.GET("/auth/social/callback", handlers.SocialCallback)
		api.POST("/auth/social/bind", handlers.BindSocialAccount)
		api.POST("/auth/social/register-bind", handlers.RegisterAndBindSocial)

		// 作者后台接口：需要普通用户 JWT，业务处理器可通过 c.GetUint("userID") 获取作者ID。
		auth := api.Group("")
		auth.Use(middleware.AuthMiddleware())
		{
			auth.GET("/user/profile", handlers.GetProfile)
			auth.PUT("/user/profile", handlers.UpdateProfile)
			auth.GET("/user/portable-export", handlers.ExportAuthorPortable)
			auth.POST("/user/portable-import", handlers.ImportAuthorPortable)
			auth.POST("/user/avatar", handlers.UploadAvatar)
			auth.POST("/user/change-password", handlers.ChangePassword)
			auth.GET("/user/social-accounts", handlers.GetUserSocialAccounts)
			auth.DELETE("/user/social-accounts/:type", handlers.UnbindSocialAccount)
			auth.GET("/user/stats", handlers.GetUserStats)
			auth.GET("/user/chart", handlers.GetUserChart)
			auth.GET("/user/card-chart", handlers.GetCardChart)
			auth.GET("/user/agent-chart", handlers.GetAgentChart)
			auth.GET("/user/reports/overview", handlers.GetReportOverview)
			auth.GET("/user/reports/trend", handlers.GetReportTrend)
			auth.GET("/user/reports/versions", handlers.GetVersionStats)
			auth.GET("/user/client-errors", handlers.ListClientErrorLogs)
			auth.DELETE("/user/client-errors", handlers.ClearClientErrorLogs)
			auth.DELETE("/user/client-errors/:id", handlers.DeleteClientErrorLog)
			auth.GET("/user/cardtypes/stock-warnings", handlers.GetCardStockWarnings)
			auth.GET("/user/notifications", handlers.ListNotifications)
			auth.DELETE("/user/notifications", handlers.ClearNotifications)
			auth.POST("/user/notifications/read-all", handlers.MarkAllNotificationsRead)
			auth.POST("/user/notifications/:id/read", handlers.MarkNotificationRead)
			auth.DELETE("/user/notifications/:id", handlers.DeleteNotification)

			// 邮箱配置（作者级别）
			auth.GET("/user/email-config", handlers.GetEmailConfig)
			auth.POST("/user/email-config", handlers.UpdateEmailConfig)
			auth.POST("/user/email-config/test", handlers.TestSendEmail)
			auth.GET("/user/email-codes", handlers.ListEmailCodes)

			// 充值
			auth.POST("/user/recharge/order", handlers.CreateRechargeOrder)
			auth.GET("/user/recharge/order", handlers.GetRechargeOrderStatus)
			auth.GET("/user/recharge/orders", handlers.GetRechargeOrders)

			// 用户APP管理
			auth.GET("/user/apps", handlers.ListUserApps)
			auth.POST("/user/apps", handlers.CreateUserApp)
			auth.PUT("/user/apps/:id", handlers.UpdateUserApp)
			auth.DELETE("/user/apps/:id", handlers.DeleteUserApp)
			auth.POST("/user/apps/:id/reset-secret", handlers.ResetUserAppSecret)

			// 应用公告管理
			auth.GET("/user/app-announcements", handlers.ListAppAnnouncements)
			auth.POST("/user/app-announcements", handlers.CreateAppAnnouncement)
			auth.PUT("/user/app-announcements/:id", handlers.UpdateAppAnnouncement)
			auth.DELETE("/user/app-announcements/:id", handlers.DeleteAppAnnouncement)

			// 软件用户管理
			auth.GET("/user/appusers", handlers.ListAppUsers)
			auth.GET("/user/appusers/risk", handlers.ListRiskAppUsers)
			auth.POST("/user/appusers/:id/risk-dispose", handlers.DisposeRiskAppUser)
			auth.GET("/user/appusers/:id", handlers.GetAppUser)
			auth.GET("/user/appusers/:id/profile", handlers.GetAppUserProfile)
			auth.POST("/user/appusers", handlers.CreateAppUser)
			auth.PUT("/user/appusers/:id", handlers.UpdateAppUser)
			auth.POST("/user/appusers/:id/avatar", handlers.UploadAppUserAvatar)
			auth.DELETE("/user/appusers/:id", handlers.DeleteAppUser)
			auth.POST("/user/appusers/:id/reset-invite-code", handlers.ResetAppUserInviteCode)
			auth.POST("/user/appusers/batch-status", handlers.BatchUpdateAppUserStatus)
			auth.POST("/user/appusers/batch-delete", handlers.BatchDeleteAppUsers)

			// 用户标识管理
			auth.GET("/user/appusers/:id/data", handlers.ListAppUserData)
			auth.POST("/user/appusers/:id/data", handlers.CreateAppUserData)
			auth.PUT("/user/appusers/:id/data/:dataId", handlers.UpdateAppUserData)
			auth.DELETE("/user/appusers/:id/data/:dataId", handlers.DeleteAppUserData)

			// 用户特征码管理
			auth.GET("/user/appusers/:id/devices", handlers.ListAppUserDevices)
			auth.DELETE("/user/appusers/:id/devices/:deviceId", handlers.DeleteAppUserDevice)

			// 用户操作日志
			auth.GET("/user/appusers/:id/logs", handlers.ListAppUserLogs)
			auth.DELETE("/user/appusers/:id/logs", handlers.ClearAppUserLogs)

			// 卡种管理
			auth.GET("/user/cardtypes", handlers.ListCardTypes)
			auth.GET("/user/cardtypes/:id", handlers.GetCardType)
			auth.POST("/user/cardtypes", handlers.CreateCardType)
			auth.PUT("/user/cardtypes/:id", handlers.UpdateCardType)
			auth.DELETE("/user/cardtypes/:id", handlers.DeleteCardType)

			// 卡号管理
			auth.POST("/user/cards/generate", handlers.GenerateCards)
			auth.GET("/user/cards", handlers.ListCards)
			auth.PUT("/user/cards/:id/status", handlers.UpdateCardStatus)
			auth.DELETE("/user/cards/:id", handlers.DeleteCard)
			auth.GET("/user/cards/:id/usage", handlers.GetCardUsageRecords)
			auth.GET("/user/cards/batches", handlers.ListCardBatches)
			auth.POST("/user/cards/batches/status", handlers.UpdateCardsByBatchStatus)
			auth.POST("/user/cards/batch-delete", handlers.DeleteCardsByBatch)
			auth.GET("/user/cards/export", handlers.ExportCardsByBatch)
			auth.GET("/user/cards/export-excel", handlers.ExportCardsExcel)
			auth.POST("/user/cards/batch-delete-ids", handlers.BatchDeleteCards)
			auth.POST("/user/cards/batch-status", handlers.BatchUpdateCardStatus)

			// 版本管理
			auth.GET("/user/versions", handlers.ListAppVersions)
			auth.GET("/user/versions/:id", handlers.GetAppVersion)
			auth.POST("/user/versions", handlers.CreateAppVersion)
			auth.PUT("/user/versions/:id", handlers.UpdateAppVersion)
			auth.DELETE("/user/versions/:id", handlers.DeleteAppVersion)

			// 在线管理
			auth.GET("/user/online", handlers.ListOnlineSessions)
			auth.GET("/user/online/stats", handlers.GetOnlineStats)
			auth.GET("/user/online/chart", handlers.GetOnlineChart)
			auth.DELETE("/user/online/:id", handlers.KickOnlineSession)
			auth.POST("/user/online/kick-user", handlers.KickOnlineSessionsByUser)

			// 代理管理
			auth.GET("/user/agents", handlers.ListAgents)
			auth.GET("/user/agents/:id", handlers.GetAgent)
			auth.POST("/user/agents", handlers.CreateAgent)
			auth.PUT("/user/agents/:id", handlers.UpdateAgent)
			auth.DELETE("/user/agents/:id", handlers.DeleteAgent)
			auth.POST("/user/agents/:id/recharge", handlers.RechargeAgent)
			auth.GET("/user/agents/:id/daily-stats", handlers.GetAgentDailyStats)
			auth.GET("/user/agents/:id/daily-logs", handlers.GetAgentDailyLogs)
			auth.GET("/user/agents/:id/cardtypes", handlers.ListAgentCardTypes)
			auth.POST("/user/agents/:id/cardtypes", handlers.SetAgentCardTypes)

			// 数据池管理
			auth.GET("/user/datapools", handlers.ListDataPools)
			auth.POST("/user/datapools", handlers.CreateDataPool)
			auth.GET("/user/datapools/:id", handlers.GetDataPool)
			auth.PUT("/user/datapools/:id", handlers.UpdateDataPool)
			auth.DELETE("/user/datapools/:id", handlers.DeleteDataPool)

			// 数据项管理
			auth.GET("/user/dataitems/:poolId", handlers.ListDataItems)
			auth.POST("/user/dataitems/:poolId", handlers.CreateDataItem)
			auth.GET("/user/dataitems/:poolId/:itemId", handlers.GetDataItem)
			auth.PUT("/user/dataitems/:poolId/:itemId", handlers.UpdateDataItem)
			auth.DELETE("/user/dataitems/:poolId/:itemId", handlers.DeleteDataItem)

			// 套餐管理
			auth.GET("/user/packages", handlers.ListPackages)
			auth.GET("/user/package", handlers.GetUserPackage)
			auth.POST("/user/packages/:id/buy", handlers.BuyPackage)
			auth.GET("/user/packages/history", handlers.ListUserPackages)

			// 授权证书管理
			auth.POST("/user/licenses/generate", handlers.GenerateCertificate)
			auth.POST("/user/licenses/encrypt", handlers.EncryptPreview)
			auth.POST("/user/licenses/decrypt", handlers.DecryptContent)
			auth.GET("/user/licenses", handlers.ListLicenses)
			auth.GET("/user/licenses/:id", handlers.GetLicense)
			auth.POST("/user/licenses", handlers.CreateLicense)
			auth.PUT("/user/licenses/:id", handlers.UpdateLicense)
			auth.DELETE("/user/licenses/:id", handlers.DeleteLicense)

			// 操作日志
			auth.GET("/user/logs", handlers.ListOperationLogs)

			// 签到
			auth.GET("/user/checkin/status", handlers.GetCheckinStatus)
			auth.POST("/user/checkin", handlers.DoCheckin)
			auth.GET("/user/checkin/logs", handlers.GetCheckinLogs)
			auth.GET("/user/checkin/month-logs", handlers.GetMonthCheckinLogs)

			// 工单
			auth.GET("/user/tickets", handlers.ListTickets)
			auth.POST("/user/tickets", handlers.CreateTicket)
			auth.GET("/user/tickets/:id", handlers.GetTicket)
			auth.GET("/user/tickets/:id/messages", handlers.ListTicketMessages)
			auth.POST("/user/tickets/:id/messages", handlers.SendTicketMessage)
			auth.POST("/user/tickets/:id/close", handlers.CloseTicket)

			// 活动管理
			auth.GET("/user/activities", handlers.ListActivities)
			auth.GET("/user/activities/:id", handlers.GetActivity)
			auth.POST("/user/activities", handlers.CreateActivity)
			auth.PUT("/user/activities/:id", handlers.UpdateActivity)
			auth.DELETE("/user/activities/:id", handlers.DeleteActivity)
			auth.POST("/user/activities/:id/prizes", handlers.SaveActivityPrizes)
			auth.GET("/user/activities/:id/records", handlers.ListActivityRecords)
			auth.POST("/user/activities/:id/draw", handlers.ManualDraw)
			auth.GET("/user/activity-users", handlers.ListActivityUsers)
			auth.DELETE("/user/activity-users/:id", handlers.DeleteActivityUser)
			auth.PUT("/user/activity-users/:id/password", handlers.ResetActivityUserPassword)
			auth.GET("/user/activity-users/:id/records", handlers.ListActivityUserRecords)

			// 推广返利管理
			auth.GET("/user/rebate/config", handlers.GetRebateConfig)
			auth.POST("/user/rebate/config", handlers.SaveRebateConfig)
			auth.GET("/user/rebate/stats", handlers.GetRebateStats)
			auth.GET("/user/rebate/logs", handlers.ListRebateLogs)
			auth.GET("/user/rebate/ranking", handlers.GetRebateRanking)
			auth.GET("/user/rebate/tree", handlers.GetInviteTree)

			// 积分商城
			auth.GET("/user/point-shop/items", handlers.ListPointShopItems)
			auth.POST("/user/point-shop/items", handlers.CreatePointShopItem)
			auth.PUT("/user/point-shop/items/:id", handlers.UpdatePointShopItem)
			auth.DELETE("/user/point-shop/items/:id", handlers.DeletePointShopItem)
			auth.GET("/user/point-shop/exchanges", handlers.ListPointShopExchangeLogs)

			// 黑名单管理
			auth.GET("/user/blacklist", handlers.ListBlacklist)
			auth.POST("/user/blacklist", handlers.CreateBlacklist)
			auth.PUT("/user/blacklist/:id", handlers.UpdateBlacklist)
			auth.DELETE("/user/blacklist/:id", handlers.DeleteBlacklist)
			auth.POST("/user/blacklist/batch-delete", handlers.BatchDeleteBlacklist)

			// 防火墙管理
			auth.GET("/user/firewall/config", handlers.GetFirewallConfig)
			auth.POST("/user/firewall/config", handlers.SaveFirewallConfig)
			auth.GET("/user/firewall/logs", handlers.ListFirewallLogs)
			auth.DELETE("/user/firewall/logs", handlers.ClearFirewallLogs)
			auth.GET("/user/firewall/locks", handlers.ListLoginLocks)
			auth.POST("/user/firewall/unlock", handlers.UnlockLoginIP)

			// 维护工具
			auth.POST("/user/tools/clean-unused-cards", handlers.ToolsCleanUnusedCards)
			auth.POST("/user/tools/clean-used-cards", handlers.ToolsCleanUsedCards)
			auth.POST("/user/tools/clean-disabled-cards", handlers.ToolsCleanDisabledCards)
			auth.POST("/user/tools/kick-all-online", handlers.ToolsKickAllOnline)
			auth.POST("/user/tools/clean-expired-blacklist", handlers.ToolsCleanExpiredBlacklist)
			auth.GET("/user/tools/filter-users", handlers.ToolsFilterUsers)
			auth.POST("/user/tools/filter-set-status", handlers.ToolsFilterSetStatus)
			auth.POST("/user/tools/filter-add-points", handlers.ToolsFilterAddPoints)
			auth.POST("/user/tools/filter-add-duration", handlers.ToolsFilterAddDuration)
			auth.POST("/user/tools/filter-set-expire", handlers.ToolsFilterSetExpire)
			auth.POST("/user/tools/filter-delete", handlers.ToolsFilterDelete)
			auth.POST("/user/tools/filter-kick", handlers.ToolsFilterKick)
			auth.POST("/user/tools/filter-unbind", handlers.ToolsFilterUnbind)

			// WebSocket连接管理
			auth.GET("/user/ws-connections", handlers.ListWSConnections)
			auth.POST("/user/ws-connections/kick", handlers.KickWSConnection)

			// SDK接口日志
			auth.GET("/user/sdk-logs", handlers.ListSDKInterfaceLogs)
			auth.DELETE("/user/sdk-logs", handlers.ClearSDKInterfaceLogs)

			// 提卡Key管理
			auth.GET("/user/withdraw-keys", handlers.ListWithdrawKeys)
			auth.POST("/user/withdraw-keys", handlers.CreateWithdrawKey)
			auth.PUT("/user/withdraw-keys/:id", handlers.UpdateWithdrawKey)
			auth.DELETE("/user/withdraw-keys/:id", handlers.DeleteWithdrawKey)
			auth.POST("/user/withdraw-keys/:id/reset", handlers.ResetWithdrawKey)
			auth.GET("/user/withdraw-logs", handlers.ListWithdrawLogs)

			// 开放API密钥管理
			auth.GET("/user/openapi-keys", handlers.ListOpenApiKeys)
			auth.GET("/user/openapi-keys/permissions", handlers.GetOpenApiPermissions)
			auth.POST("/user/openapi-keys", handlers.CreateOpenApiKey)
			auth.PUT("/user/openapi-keys/:id", handlers.UpdateOpenApiKey)
			auth.DELETE("/user/openapi-keys/:id", handlers.DeleteOpenApiKey)
			auth.POST("/user/openapi-keys/:id/reset", handlers.ResetOpenApiKey)

			// 网盘开放接口代理
			auth.GET("/user/pan/files", handlers.ListPanFiles)
			auth.POST("/user/pan/files", handlers.UploadPanFile)
			auth.DELETE("/user/pan/files/:id", handlers.DeletePanFile)
			auth.GET("/user/pan/files/:id/content", handlers.DownloadPanFileContent)
			auth.POST("/user/pan/uploads", handlers.CreatePanUploadSession)
			auth.GET("/user/pan/uploads/:uploadId", handlers.GetPanUploadSession)
			auth.POST("/user/pan/uploads/:uploadId/chunks/:index", handlers.UploadPanChunk)
			auth.POST("/user/pan/uploads/:uploadId/complete", handlers.CompletePanUpload)
			auth.DELETE("/user/pan/uploads/:uploadId", handlers.CancelPanUpload)
			auth.POST("/user/pan/files/:id/direct-link", handlers.GetPanDirectLink)
			auth.GET("/user/pan/files/:id/direct-link", handlers.GetPanDirectLink)
			auth.POST("/user/pan/files/:id/share", handlers.CreatePanFileShare)
			auth.POST("/user/pan/folders", handlers.CreatePanFolder)
			auth.DELETE("/user/pan/folders/:id", handlers.DeletePanFolder)
			auth.GET("/user/pan/shares", handlers.ListPanShares)
			auth.POST("/user/pan/shares", handlers.CreatePanShare)
			auth.PUT("/user/pan/shares/:token", handlers.UpdatePanShare)
			auth.DELETE("/user/pan/shares/:token", handlers.DeletePanShare)
		}

		// 管理员接口：先走普通 JWT，再由 AdminMiddleware 校验 role=1。
		admin := api.Group("/admin")
		admin.Use(middleware.AuthMiddleware(), middleware.AdminMiddleware())
		{
			// 首页数据一览
			admin.GET("/dashboard", handlers.AdminGetDashboardStats)
			admin.GET("/health", handlers.AdminGetHealthStatus)
			admin.GET("/tasks", handlers.AdminListBackgroundTasks)
			admin.PUT("/tasks/:key", handlers.AdminUpdateBackgroundTask)

			// 用户管理
			admin.GET("/users", handlers.AdminListUsers)
			admin.PUT("/users/:id", handlers.AdminUpdateUser)
			admin.DELETE("/users/:id", handlers.AdminDeleteUser)
			admin.POST("/users/:id/recharge", handlers.AdminRechargeUser)

			// 公告管理
			admin.GET("/announcements", handlers.AdminListAnnouncements)
			admin.POST("/announcements", handlers.AdminSaveAnnouncements)
			admin.POST("/announcements/create", handlers.AdminCreateAnnouncement)
			admin.PUT("/announcements/:id", handlers.AdminUpdateAnnouncement)
			admin.DELETE("/announcements/:id", handlers.AdminDeleteAnnouncement)

			// 网站配置
			admin.GET("/site", handlers.AdminGetSiteConfig)
			admin.POST("/site", handlers.AdminSaveSiteConfig)
			admin.POST("/site/upload", handlers.AdminUploadSiteAsset)

			// 邮箱配置
			admin.GET("/email", handlers.AdminGetEmailConfig)
			admin.POST("/email", handlers.AdminUpdateEmailConfig)
			admin.POST("/email/test", handlers.AdminTestSendEmail)

			// 注册登录配置
			admin.GET("/register", handlers.GetRegisterConfig)
			admin.POST("/register", handlers.UpdateRegisterConfig)

			// TG通知配置
			admin.GET("/telegram", handlers.GetTelegramConfig)
			admin.POST("/telegram", handlers.UpdateTelegramConfig)
			admin.POST("/telegram/test", handlers.TestTelegramNotify)

			// 签到配置
			admin.GET("/checkin", handlers.GetCheckinConfig)
			admin.POST("/checkin", handlers.SaveCheckinConfig)
			admin.POST("/checkin/streak", handlers.AddStreakReward)
			admin.DELETE("/checkin/streak/:id", handlers.DeleteStreakReward)
			admin.GET("/checkin/streaks", handlers.ListStreakRewards)

			// 安全配置
			admin.GET("/security", handlers.GetSecurityConfig)
			admin.POST("/security", handlers.UpdateSecurityConfig)

			// SDK 通讯加解密配置
			admin.GET("/sdk-crypto", handlers.AdminGetSDKCryptoConfig)
			admin.POST("/sdk-crypto", handlers.AdminSaveSDKCryptoConfig)

			// 社交登录配置
			admin.GET("/social-login", handlers.AdminGetSocialLoginConfig)
			admin.POST("/social-login", handlers.AdminSaveSocialLoginConfig)

			// 工单管理
			admin.GET("/tickets", handlers.AdminListTickets)
			admin.GET("/tickets/:id", handlers.AdminGetTicket)
			admin.GET("/tickets/:id/messages", handlers.AdminListTicketMessages)
			admin.POST("/tickets/:id/messages", handlers.AdminSendTicketMessage)
			admin.PUT("/tickets/:id/status", handlers.AdminUpdateTicketStatus)
			admin.DELETE("/tickets/:id", handlers.AdminDeleteTicket)

			// 套餐管理
			admin.GET("/packages", handlers.AdminListPackages)
			admin.POST("/packages", handlers.AdminCreatePackage)
			admin.PUT("/packages/:id", handlers.AdminUpdatePackage)
			admin.DELETE("/packages/:id", handlers.AdminDeletePackage)
			admin.POST("/packages/upload", handlers.AdminUploadPackageIcon)

			// APP管理
			admin.GET("/apps", handlers.AdminListApps)
			admin.POST("/apps/:id/reset-secret", handlers.AdminResetAppSecret)
			admin.PUT("/apps/:id", handlers.AdminUpdateApp)
			admin.DELETE("/apps/:id", handlers.AdminDeleteApp)
			admin.GET("/app-announcements", handlers.AdminListAppAnnouncements)
			admin.POST("/app-announcements", handlers.AdminCreateAppAnnouncement)
			admin.PUT("/app-announcements/:id", handlers.AdminUpdateAppAnnouncement)
			admin.DELETE("/app-announcements/:id", handlers.AdminDeleteAppAnnouncement)

			// 软件用户管理
			admin.GET("/appusers", handlers.AdminListAppUsers)
			admin.GET("/appusers/risk", handlers.AdminListRiskAppUsers)
			admin.POST("/appusers/:id/risk-dispose", handlers.AdminDisposeRiskAppUser)
			admin.GET("/appusers/:id", handlers.AdminGetAppUser)
			admin.GET("/appusers/:id/profile", handlers.AdminGetAppUserProfile)
			admin.POST("/appusers", handlers.AdminCreateAppUser)
			admin.PUT("/appusers/:id", handlers.AdminUpdateAppUser)
			admin.POST("/appusers/:id/avatar", handlers.AdminUploadAppUserAvatar)
			admin.POST("/appusers/:id/reset-invite-code", handlers.AdminResetAppUserInviteCode)
			admin.POST("/appusers/batch-status", handlers.AdminBatchUpdateAppUserStatus)
			admin.POST("/appusers/batch-delete", handlers.AdminBatchDeleteAppUsers)
			admin.DELETE("/appusers/:id", handlers.AdminDeleteAppUser)

			// 用户标识管理
			admin.GET("/appusers/:id/data", handlers.AdminListAppUserData)
			admin.POST("/appusers/:id/data", handlers.AdminCreateAppUserData)
			admin.PUT("/appusers/:id/data/:dataId", handlers.AdminUpdateAppUserData)
			admin.DELETE("/appusers/:id/data/:dataId", handlers.AdminDeleteAppUserData)

			// 用户特征码管理
			admin.GET("/appusers/:id/devices", handlers.AdminListAppUserDevices)
			admin.DELETE("/appusers/:id/devices/:deviceId", handlers.AdminDeleteAppUserDevice)

			// 用户操作日志
			admin.GET("/appusers/:id/logs", handlers.AdminListAppUserLogs)
			admin.DELETE("/appusers/:id/logs", handlers.AdminClearAppUserLogs)

			// 卡种管理
			admin.GET("/cardtypes", handlers.AdminListCardTypes)
			admin.GET("/cardtypes/:id", handlers.AdminGetCardType)
			admin.POST("/cardtypes", handlers.AdminCreateCardType)
			admin.PUT("/cardtypes/:id", handlers.AdminUpdateCardType)
			admin.DELETE("/cardtypes/:id", handlers.AdminDeleteCardType)

			// 卡号管理
			admin.GET("/cards", handlers.AdminListCards)
			admin.PUT("/cards/:id/status", handlers.AdminUpdateCardStatus)
			admin.DELETE("/cards/:id", handlers.AdminDeleteCard)

			// 版本管理
			admin.GET("/versions", handlers.AdminListAppVersions)
			admin.GET("/versions/:id", handlers.AdminGetAppVersion)
			admin.PUT("/versions/:id", handlers.AdminUpdateAppVersion)
			admin.DELETE("/versions/:id", handlers.AdminDeleteAppVersion)

			// 在线管理
			admin.GET("/online", handlers.AdminListOnlineSessions)
			admin.DELETE("/online/:id", handlers.AdminKickOnlineSession)
			admin.POST("/online/kick-app", handlers.AdminKickOnlineSessionsByApp)
			admin.POST("/online/kick-user", handlers.AdminKickOnlineSessionsByUser)

			// 操作日志
			admin.GET("/logs", handlers.AdminListOperationLogs)

			// 充值管理
			admin.GET("/recharge/config", handlers.AdminGetRechargeConfig)
			admin.POST("/recharge/config", handlers.AdminSaveRechargeConfig)
			admin.GET("/recharge/packages", handlers.AdminGetRechargePackages)
			admin.POST("/recharge/packages", handlers.AdminCreateRechargePackage)
			admin.PUT("/recharge/packages/:id", handlers.AdminUpdateRechargePackage)
			admin.DELETE("/recharge/packages/:id", handlers.AdminDeleteRechargePackage)
			admin.GET("/recharge/orders", handlers.AdminGetRechargeOrders)
			admin.POST("/recharge/orders/:id/complete", handlers.AdminCompleteRechargeOrder)

			// 数据备份
			admin.GET("/backup/stats", handlers.GetBackupStats)
			admin.GET("/backup/export", handlers.ExportBackup)
			admin.POST("/backup/import", handlers.ImportBackup)
		}

		// 代理中心接口：登录接口公开，登录后接口使用 agent_token，对应 AgentAuthMiddleware。
		api.POST("/agent/login", handlers.AgentLogin)

		// 公开活动接口：面向外部活动页，独立限流，避免匿名接口被高频调用。
		activityLimiter := middleware.NewRateLimiter(60, time.Minute)
		activityGroup := api.Group("")
		activityGroup.Use(activityLimiter.Middleware())
		{
			activityGroup.POST("/public/activity/register", handlers.ActivityRegister)
			activityGroup.POST("/public/activity/login", handlers.ActivityLogin)
			activityGroup.GET("/public/activities", handlers.ListPublicActivities)
			activityGroup.GET("/public/activities/:id", handlers.GetPublicActivity)
			activityGroup.GET("/public/activities/:id/joined", handlers.CheckActivityJoined)
			activityGroup.GET("/public/activities/:id/winners", handlers.GetActivityWinners)
			activityGroup.GET("/public/activities/:id/my-cards", handlers.GetMyClaimedCards)
			activityGroup.POST("/public/activities/:id/spin", handlers.SpinWheel)
			activityGroup.POST("/public/activities/:id/join", handlers.JoinTimedDraw)
			activityGroup.POST("/public/activities/:id/claim", handlers.ClaimCard)
			activityGroup.GET("/public/activities/my-records", handlers.GetMyActivityRecords)
		}

		// 公开提卡接口：给提卡工具批量调用，鉴权逻辑在处理器内完成。
		api.POST("/public/withdraw", handlers.WithdrawCard)

		// 开放 API：给第三方系统调用，通过 OpenApiKey 在处理器/中间件内鉴权。
		openApi := api.Group("/open")
		{
			openApi.GET("/apps", handlers.OpenApiListApps)
			openApi.POST("/apps", handlers.OpenApiCreateApp)
			openApi.GET("/apps/:id", handlers.OpenApiGetApp)
			openApi.PUT("/apps/:id", handlers.OpenApiUpdateApp)
			openApi.GET("/cardtypes", handlers.OpenApiListCardTypes)
			openApi.POST("/cardtypes", handlers.OpenApiCreateCardType)
			openApi.GET("/cardtype", handlers.OpenApiGetCardType)
			openApi.PUT("/cardtypes/:id", handlers.OpenApiUpdateCardType)
			openApi.GET("/cards", handlers.OpenApiListCards)
			openApi.POST("/cards", handlers.OpenApiCreateCard)
			openApi.GET("/cards/:card_no", handlers.OpenApiGetCard)
			openApi.PUT("/cards/:id", handlers.OpenApiUpdateCard)
			openApi.GET("/users", handlers.OpenApiListUsers)
			openApi.POST("/users", handlers.OpenApiCreateUser)
			openApi.GET("/user", handlers.OpenApiGetUser)
			openApi.PUT("/users/:id", handlers.OpenApiUpdateUser)
		}

		// 代理中心登录后的业务接口。注意这里复用了 /api/agent 前缀，但与作者后台 token 不同。
		agentApi := api.Group("/agent")
		agentApi.Use(middleware.AgentAuthMiddleware())
		{
			agentApi.GET("/profile", handlers.AgentGetProfile)
			agentApi.POST("/avatar", handlers.AgentUploadAvatar)
			agentApi.POST("/password", handlers.AgentChangePassword)
			agentApi.GET("/stats", handlers.AgentStats)
			agentApi.GET("/balance-logs", handlers.AgentListBalanceLogs)
			agentApi.GET("/sub-agents", handlers.AgentListSubAgents)
			agentApi.POST("/sub-agents", handlers.AgentCreateSubAgent)
			agentApi.PUT("/sub-agents/:id", handlers.AgentUpdateSubAgent)
			agentApi.DELETE("/sub-agents/:id", handlers.AgentDeleteSubAgent)
			agentApi.POST("/sub-agents/:id/transfer", handlers.AgentTransferToSubAgent)
			agentApi.GET("/sub-agents/:id/cardtypes", handlers.AgentListSubAgentCardTypes)
			agentApi.POST("/sub-agents/:id/cardtypes", handlers.AgentSetSubAgentCardTypes)
			agentApi.GET("/stock-packages", handlers.AgentListStockPackages)
			agentApi.POST("/stock-packages", handlers.AgentCreateStockPackage)
			agentApi.POST("/stock-packages/:id/assign", handlers.AgentAssignStockPackage)
			agentApi.POST("/stock-packages/:id/recycle", handlers.AgentRecycleStockPackage)
			agentApi.POST("/stock-packages/:id/status", handlers.AgentToggleStockPackageStatus)
			agentApi.DELETE("/stock-packages/:id", handlers.AgentDeleteStockPackage)
			agentApi.GET("/stock-packages/usable", handlers.AgentListUsableStockPackages)
			agentApi.POST("/stock-packages/:id/generate", handlers.AgentGenerateCardsFromStockPackage)
			agentApi.GET("/cardtypes", handlers.AgentListCardTypes)
			agentApi.POST("/cards/generate", handlers.AgentGenerateCards)
			agentApi.GET("/cards", handlers.AgentListCards)
			agentApi.GET("/cards/export", handlers.AgentExportCards)
			agentApi.GET("/card-logs", handlers.AgentListCardLogs)
			agentApi.GET("/card-logs/export", handlers.AgentExportCardLogs)
			agentApi.GET("/users", handlers.AgentListAppUsers)
			agentApi.PUT("/users/:id/status", handlers.AgentUpdateAppUserStatus)
			agentApi.GET("/users/:id/devices", handlers.AgentListAppUserDevices)
			agentApi.DELETE("/users/:id/devices/:deviceId", handlers.AgentUnbindAppUserDevice)
			agentApi.GET("/online", handlers.AgentListOnlineSessions)
			agentApi.DELETE("/online/:id", handlers.AgentKickOnlineSession)
			agentApi.POST("/online/kick-user", handlers.AgentKickOnlineByUser)
		}

		// SDK/API 接口：给软件客户端调用，通常包含 app_code、签名/加密数据和可选 X-Token。
		sdk := api.Group("/sdk")
		sdk.Use(handlers.SDKInterfaceLogMiddleware())
		sdk.Use(middleware.SDKFirewallMiddleware())
		{
			// 无需登录
			sdk.POST("/register", handlers.SDKRegister)
			sdk.POST("/login", handlers.SDKLogin)
			sdk.POST("/card-login", handlers.SDKCardLogin)
			sdk.POST("/trial", handlers.SDKTrial)
			sdk.POST("/captcha", handlers.SDKGenerateCaptcha)
			sdk.POST("/send-email-code", handlers.SDKSendEmailCode)
			sdk.POST("/app-info", handlers.SDKGetAppInfo)
			sdk.POST("/custom-field", handlers.SDKGetCustomField)
			sdk.POST("/versions", handlers.SDKGetVersions)
			sdk.POST("/version", handlers.SDKGetVersion)
			sdk.POST("/datapools", handlers.SDKGetDataPools)
			sdk.POST("/datapool/create", handlers.SDKCreateDataPool)
			sdk.POST("/dataitem", handlers.SDKGetDataItem)
			sdk.POST("/dataitem/create", handlers.SDKCreateDataItem)
			sdk.POST("/dataitem/delete", handlers.SDKDeleteDataItem)
			sdk.POST("/dataitem/update", handlers.SDKUpdateDataItem)
			sdk.POST("/announcements", handlers.SDKGetAnnouncements)
			sdk.POST("/report-error", handlers.SDKReportError)
			sdk.POST("/recharge-offline", handlers.SDKRechargeOffline)
			sdk.POST("/forgot-password", handlers.SDKForgotPassword)

			// 需要Token
			sdk.POST("/logout", handlers.SDKLogout)
			sdk.POST("/heartbeat", handlers.SDKHeartbeat)
			sdk.POST("/recharge", handlers.SDKRecharge)
			sdk.POST("/deduct-points", handlers.SDKDeductPoints)
			sdk.POST("/deduct-time", handlers.SDKDeductTime)
			sdk.POST("/userinfo", handlers.SDKGetUserInfo)
			sdk.POST("/avatar", handlers.SDKUploadAppUserAvatar)
			sdk.POST("/extradata", handlers.SDKGetExtraData)
			sdk.POST("/clouddata/get", handlers.SDKGetCloudData)
			sdk.POST("/clouddata/set", handlers.SDKSetCloudData)
			sdk.POST("/usermark/get", handlers.SDKGetUserData)
			sdk.POST("/usermark/set", handlers.SDKSetUserData)

			// 设备管理：无需X-Token，使用user/password或card_no验证
			sdk.POST("/devices", handlers.SDKGetDevices)
			sdk.POST("/unbind-device", handlers.SDKUnbindDevice)

			// 需要Token
			sdk.POST("/change-password", handlers.SDKChangePassword)
			sdk.POST("/point-shop/items", handlers.SDKListPointShopItems)
			sdk.POST("/point-shop/exchange", handlers.SDKExchangePointShopItem)
			sdk.POST("/point-shop/exchanges", handlers.SDKListPointShopExchangeLogs)
		}
	}

	// WebSocket 接口不在 /api 下，客户端直接连接 /ws 后按消息 action 调用业务能力。
	r.GET("/ws", handlers.WSHandler)

	addr := fmt.Sprintf(":%d", config.Cfg.Server.Port)

	// 初始化完成后才启动后台任务，避免首次安装时任务访问未连接的数据库。
	if initialized {
		handlers.StartBackgroundTaskSchedulers()
	}

	log.Printf("服务启动在 http://localhost%s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("启动服务失败: %v", err)
	}
}

