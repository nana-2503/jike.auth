package database

import (
	"crypto/rand"
	"fmt"
	"jike-auth/config"
	"jike-auth/models"
	"strings"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// Open 只负责按配置打开数据库连接，不做迁移。
// 安装向导的“测试连接”和正式启动都会复用它，因此不要在这里写入业务数据。
func Open(cfg config.DatabaseConfig, gormConfig *gorm.Config) (*gorm.DB, error) {
	switch cfg.Type {
	case "postgres":
		dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
			cfg.Postgres.Host, cfg.Postgres.Port, cfg.Postgres.User,
			cfg.Postgres.Password, cfg.Postgres.DBName, cfg.Postgres.SSLMode)
		return gorm.Open(postgres.Open(dsn), gormConfig)
	case "mysql", "mariadb":
		dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
			cfg.MySQL.User, cfg.MySQL.Password, cfg.MySQL.Host, cfg.MySQL.Port, cfg.MySQL.DBName)
		db, err := gorm.Open(mysql.Open(dsn), gormConfig)
		if err == nil {
			// 确保连接级字符集是 utf8mb4，避免中文、emoji 或特殊符号写入异常。
			db.Exec("SET NAMES utf8mb4")
			db.Exec("SET CHARACTER SET utf8mb4")
			db.Exec("SET character_set_connection=utf8mb4")
		}
		return db, err
	default:
		return nil, fmt.Errorf("unsupported database type: %s (supported: postgres, mysql, mariadb)", cfg.Type)
	}
}

func TestConnection(cfg config.DatabaseConfig) error {
	// 安装向导使用：只 ping 数据库，不污染表结构和数据。
	db, err := Open(cfg, &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		return err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	defer sqlDB.Close()

	return sqlDB.Ping()
}

func Init() error {
	cfg := config.Cfg.Database

	gormConfig := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	}

	db, err := Open(cfg, gormConfig)
	if err != nil {
		return err
	}
	DB = db

	// 自动迁移所有模型。新增 GORM 模型后必须加到这里，否则启动不会自动建表/补字段。
	if err := DB.AutoMigrate(
		&models.User{},
		&models.Announcement{},
		&models.SiteConfig{},
		&models.App{},
		&models.SDKInterfaceLog{},
		&models.AppUser{},
		&models.AppUserData{},
		&models.AppUserDevice{},
		&models.CardType{},
		&models.Card{},
		&models.CardUseLog{},
		&models.AppAnnouncement{},
		&models.AppVersion{},
		&models.OnlineSession{},
		&models.Agent{},
		&models.AgentCardType{},
		&models.AgentCardLog{},
		&models.AgentBalanceLog{},
		&models.AgentStockPackage{},
		&models.AgentStockPackageItem{},
		&models.DataPool{},
		&models.DataItem{},
		&models.EmailConfig{},
		&models.RegisterConfig{},
		&models.EmailCode{},
		&models.Package{},
		&models.UserPackage{},
		&models.License{},
		&models.TelegramConfig{},
		&models.AppUserLog{},
		&models.ClientErrorLog{},
		&models.OperationLog{},
		&models.CheckinConfig{},
		&models.CheckinStreakReward{},
		&models.CheckinLog{},
		&models.LoginFailure{},
		&models.SecurityConfig{},
		&models.Ticket{},
		&models.TicketMessage{},
		&models.Activity{},
		&models.ActivityUser{},
		&models.ActivityPrize{},
		&models.ActivityRecord{},
		&models.RebateConfig{},
		&models.RebateLog{},
		&models.PointShopItem{},
		&models.PointShopExchangeLog{},
		&models.WebhookConfig{},
		&models.WebhookLog{},
		&models.Blacklist{},
		&models.FirewallConfig{},
		&models.SDKCryptoConfig{},
		&models.FirewallLog{},
		&models.AppUserUnbindLog{},
		&models.WithdrawKey{},
		&models.WithdrawLog{},
		&models.SDKCaptcha{},
		&models.SocialLoginConfig{},
		&models.SocialAccount{},
		&models.RechargeConfig{},
		&models.RechargePackage{},
		&models.RechargeOrder{},
		&models.TrialFeatureLog{},
		&models.OpenApiKey{},
		&models.UserNotification{},
	); err != nil {
		return err
	}

	// 以下迁移函数用于给旧版本数据补新字段，必须保证可重复执行。
	if err := generateAppCodesForExistingApps(DB); err != nil {
		return fmt.Errorf("生成AppCode失败: %w", err)
	}

	if err := generateActivityCodesForExistingUsers(DB); err != nil {
		return fmt.Errorf("生成ActivityCode失败: %w", err)
	}

	// 创建默认网站配置。站点配置只需要一条记录，后台会编辑这条记录。
	var siteCount int64
	DB.Model(&models.SiteConfig{}).Count(&siteCount)
	if siteCount == 0 {
		siteConfig := &models.SiteConfig{
			SiteName:     "验证系统",
			SiteSubtitle: "简单好用的验证系统",
		}
		DB.Create(siteConfig)
	}

	return nil
}

// generateAppCodesForExistingApps 为现有的没有app_code的应用生成app_code
func generateAppCodesForExistingApps(db *gorm.DB) error {
	// 历史应用可能没有 app_code；客户端 SDK 使用 app_code 接入，所以启动时补齐。
	var apps []models.App
	if err := db.Where("app_code IS NULL OR app_code = ''").Find(&apps).Error; err != nil {
		return err
	}

	for _, app := range apps {
		appCode := generateAppCodeForMigration()
		// 确保生成的 app_code 是唯一的
		for {
			var count int64
			db.Model(&models.App{}).Where("app_code = ?", appCode).Count(&count)
			if count == 0 {
				break
			}
			// 如果重复，重新生成
			appCode = generateAppCodeForMigration()
		}

		if err := db.Model(&app).Update("app_code", appCode).Error; err != nil {
			return err
		}
	}

	return nil
}

// generateAppCodeForMigration 为迁移生成 app_code（格式：2601-AB123456，前4位是年月YYMM）
func generateAppCodeForMigration() string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

	// 获取当前年份的后两位和月份
	now := time.Now()
	year := now.Year() % 100
	month := int(now.Month())
	yearMonthPrefix := fmt.Sprintf("%02d%02d", year, month)

	// 生成剩余8位随机字符
	bytes := make([]byte, 8)
	rand.Read(bytes)

	code := yearMonthPrefix
	for i := 0; i < 8; i++ {
		code += string(charset[int(bytes[i])%len(charset)])
	}

	// 格式化为 2601-AB123456
	return code[:4] + "-" + code[4:12]
}

func generateActivityCodesForExistingUsers(db *gorm.DB) error {
	// 活动频道 ch 参数依赖作者 activity_code，旧用户没有时在启动迁移中补齐。
	var users []models.User
	if err := db.Where("activity_code IS NULL OR activity_code = ''").Find(&users).Error; err != nil {
		return err
	}
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	for _, user := range users {
		code := make([]byte, 8)
		rand.Read(code)
		for i := range code {
			code[i] = charset[int(code[i])%len(charset)]
		}
		activityCode := string(code)
		for {
			var count int64
			db.Model(&models.User{}).Where("activity_code = ?", activityCode).Count(&count)
			if count == 0 {
				break
			}
			rand.Read(code)
			for i := range code {
				code[i] = charset[int(code[i])%len(charset)]
			}
			activityCode = string(code)
		}
		if err := db.Model(&user).Update("activity_code", activityCode).Error; err != nil {
			return err
		}
	}
	return nil
}

// EscapeLike 转义 LIKE 查询中的通配符（%、_、\）
func EscapeLike(keyword string) string {
	keyword = strings.ReplaceAll(keyword, `\`, `\\`)
	keyword = strings.ReplaceAll(keyword, `%`, `\%`)
	keyword = strings.ReplaceAll(keyword, `_`, `\_`)
	return keyword
}
