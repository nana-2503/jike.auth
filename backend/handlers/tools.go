package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"jike-auth/cache"
	"jike-auth/database"
	"jike-auth/middleware"
	"jike-auth/models"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ==================== 黑名单管理 ====================

// clearBlacklistCache 清除黑名单相关的 Redis 缓存
func clearBlacklistCache(appID uint, itemType int, value string) {
	if !cache.Enabled {
		return
	}
	if itemType == 1 {
		cache.Del(fmt.Sprintf("blacklist:ip:%d:%s", appID, value))
	} else if itemType == 2 {
		cache.Del(fmt.Sprintf("blacklist:feat:%d:%s", appID, value))
	}
}

// ListBlacklist 获取黑名单列表
func ListBlacklist(c *gin.Context) {
	userID := c.GetUint("userID")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "12"))
	appID, _ := strconv.Atoi(c.Query("app_id"))
	typeFilter, _ := strconv.Atoi(c.Query("type"))
	keyword := c.Query("keyword")

	var items []models.Blacklist
	var total int64

	query := database.DB.Model(&models.Blacklist{}).Where("user_id = ?", userID)
	if appID > 0 {
		query = query.Where("app_id = ?", appID)
	}
	if typeFilter > 0 {
		query = query.Where("type = ?", typeFilter)
	}
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("value LIKE ? OR remark LIKE ?", kw, kw)
	}

	query.Count(&total)
	query.Preload("App").Offset((page - 1) * size).Limit(size).Order("id desc").Find(&items)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": items, "total": total}})
}

// CreateBlacklist 创建黑名单
func CreateBlacklist(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		AppID    uint   `json:"app_id" binding:"required"`
		Type     int    `json:"type" binding:"required"`
		Value    string `json:"value" binding:"required"`
		Remark   string `json:"remark"`
		ExpireAt string `json:"expire_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", req.AppID, userID).First(&app).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "应用不存在"})
		return
	}

	item := &models.Blacklist{
		UserID: userID,
		AppID:  req.AppID,
		Type:   req.Type,
		Value:  req.Value,
		Remark: req.Remark,
	}
	if req.ExpireAt != "" {
		t, _ := time.Parse(time.RFC3339, req.ExpireAt)
		item.ExpireAt = &t
	}

	if err := database.DB.Create(item).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	clearBlacklistCache(item.AppID, item.Type, item.Value)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": item})
}

// UpdateBlacklist 更新黑名单
func UpdateBlacklist(c *gin.Context) {
	userID := c.GetUint("userID")
	id := c.Param("id")
	var req struct {
		Value    string `json:"value"`
		Remark   string `json:"remark"`
		ExpireAt string `json:"expire_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var item models.Blacklist
	if err := database.DB.Where("id = ? AND user_id = ?", id, userID).First(&item).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "记录不存在"})
		return
	}

	// 清除旧值的缓存
	clearBlacklistCache(item.AppID, item.Type, item.Value)

	updates := map[string]interface{}{}
	if req.Value != "" {
		updates["value"] = req.Value
	}
	updates["remark"] = req.Remark
	if req.ExpireAt != "" {
		t, _ := time.Parse(time.RFC3339, req.ExpireAt)
		updates["expire_at"] = &t
	} else {
		updates["expire_at"] = nil
	}

	database.DB.Model(&item).Updates(updates)

	// 清除新值的缓存
	newValue := item.Value
	if req.Value != "" {
		newValue = req.Value
	}
	clearBlacklistCache(item.AppID, item.Type, newValue)

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// DeleteBlacklist 删除黑名单
func DeleteBlacklist(c *gin.Context) {
	userID := c.GetUint("userID")
	id := c.Param("id")

	var item models.Blacklist
	if err := database.DB.Where("id = ? AND user_id = ?", id, userID).First(&item).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "记录不存在"})
		return
	}

	database.DB.Delete(&item)
	clearBlacklistCache(item.AppID, item.Type, item.Value)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// BatchDeleteBlacklist 批量删除黑名单
func BatchDeleteBlacklist(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		IDs []uint `json:"ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 先查出要删除的记录以清除缓存
	var items []models.Blacklist
	database.DB.Where("id IN ? AND user_id = ?", req.IDs, userID).Find(&items)
	database.DB.Where("id IN ? AND user_id = ?", req.IDs, userID).Delete(&models.Blacklist{})
	for _, item := range items {
		clearBlacklistCache(item.AppID, item.Type, item.Value)
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "批量删除成功"})
}

// ==================== 防火墙管理 ====================

// GetFirewallConfig 获取防火墙配置
func GetFirewallConfig(c *gin.Context) {
	userID := c.GetUint("userID")
	appID, _ := strconv.Atoi(c.Query("app_id"))

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appID, userID).First(&app).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "应用不存在"})
		return
	}

	var config models.FirewallConfig
	database.DB.Where("app_id = ?", appID).First(&config)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": config})
}

// SaveFirewallConfig 保存防火墙配置
func SaveFirewallConfig(c *gin.Context) {
	userID := c.GetUint("userID")
	var req models.FirewallConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", req.AppID, userID).First(&app).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "应用不存在"})
		return
	}

	var existing models.FirewallConfig
	if database.DB.Where("app_id = ?", req.AppID).First(&existing).Error == nil {
		req.ID = existing.ID
		req.CreatedAt = existing.CreatedAt
	}

	if err := database.DB.Save(&req).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "保存失败"})
		return
	}

	// 清除防火墙配置缓存
	if cache.Enabled {
		cache.Del(fmt.Sprintf("fw:config:%d", req.AppID))
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "保存成功"})
}

// ListLoginLocks 获取登录锁定IP列表
func ListLoginLocks(c *gin.Context) {
	userID := c.GetUint("userID")
	appID, _ := strconv.Atoi(c.Query("app_id"))
	if appID == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "缺少app_id"})
		return
	}
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appID, userID).First(&app).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "应用不存在"})
		return
	}
	locks := middleware.ListSDKLoginLocks(uint(appID))
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": locks})
}

// UnlockLoginIP 解除登录锁定
func UnlockLoginIP(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		AppID uint   `json:"app_id" binding:"required"`
		IP    string `json:"ip" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", req.AppID, userID).First(&app).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "应用不存在"})
		return
	}
	middleware.ClearSDKLoginFail(req.AppID, req.IP)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "解锁成功"})
}

// ListFirewallLogs 获取防火墙日志
func ListFirewallLogs(c *gin.Context) {
	userID := c.GetUint("userID")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	appID, _ := strconv.Atoi(c.Query("app_id"))
	logType := c.Query("type")
	keyword := c.Query("keyword")

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appID, userID).First(&app).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "应用不存在"})
		return
	}

	var logs []models.FirewallLog
	var total int64

	query := database.DB.Model(&models.FirewallLog{}).Where("app_id = ?", appID)
	if logType != "" {
		query = query.Where("type = ?", logType)
	}
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("ip LIKE ? OR feature LIKE ? OR username LIKE ? OR detail LIKE ? OR action LIKE ?", kw, kw, kw, kw, kw)
	}

	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&logs)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": logs, "total": total}})
}

// ClearFirewallLogs 清空防火墙日志
func ClearFirewallLogs(c *gin.Context) {
	userID := c.GetUint("userID")
	appID, _ := strconv.Atoi(c.Query("app_id"))

	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", appID, userID).First(&app).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "应用不存在"})
		return
	}

	database.DB.Where("app_id = ?", appID).Delete(&models.FirewallLog{})
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "清空成功"})
}

// ==================== 数据备份 ====================

type systemBackupData struct {
	Format       string                   `json:"format,omitempty"`
	Version      int                      `json:"version"`
	Scope        string                   `json:"scope"`
	SourceDriver string                   `json:"source_driver,omitempty"`
	ExportTime   string                   `json:"export_time"`
	Tables       map[string][]interface{} `json:"tables"`
}

var systemBackupTables = []interface{}{
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
	&models.TrialFeatureLog{},
	&models.OnlineSession{},
	&models.SDKCaptcha{},
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
	&models.TelegramConfig{},
	&models.AppUserLog{},
	&models.ClientErrorLog{},
	&models.OperationLog{},
	&models.CheckinConfig{},
	&models.CheckinStreakReward{},
	&models.CheckinLog{},
	&models.LoginFailure{},
	&models.SecurityConfig{},
	&models.SDKCryptoConfig{},
	&models.SocialLoginConfig{},
	&models.SocialAccount{},
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
	&models.FirewallLog{},
	&models.WithdrawKey{},
	&models.WithdrawLog{},
	&models.AppUserUnbindLog{},
	&models.OpenApiKey{},
	&models.UserNotification{},
	&models.RechargeConfig{},
	&models.RechargePackage{},
	&models.RechargeOrder{},
}

func systemBackupTableNames() []string {
	names := make([]string, 0, len(systemBackupTables))
	for _, model := range systemBackupTables {
		tableName := systemBackupTableName(model)
		if tableName != "" {
			names = append(names, tableName)
		}
	}
	return names
}

func systemBackupTableName(model interface{}) string {
	stmt := &gorm.Statement{DB: database.DB}
	if err := stmt.Parse(model); err != nil {
		return ""
	}
	return stmt.Table
}

func scanBackupTable(tableName string) ([]interface{}, error) {
	rows, err := database.DB.Table(tableName).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	var records []interface{}
	for rows.Next() {
		values := make([]interface{}, len(cols))
		valuePtrs := make([]interface{}, len(cols))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, err
		}

		record := make(map[string]interface{}, len(cols))
		for i, col := range cols {
			switch v := values[i].(type) {
			case []byte:
				record[col] = string(v)
			default:
				record[col] = v
			}
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func insertBackupRows(tx *gorm.DB, tableName string, rows []interface{}) error {
	columns, err := backupTableColumns(tx, tableName)
	if err != nil {
		return err
	}
	records := make([]map[string]interface{}, 0, len(rows))
	for _, raw := range rows {
		record, ok := raw.(map[string]interface{})
		if !ok {
			return fmt.Errorf("表 %s 数据格式错误", tableName)
		}
		normalized := normalizeBackupRecord(record, columns)
		if len(normalized) == 0 {
			continue
		}
		records = append(records, normalized)
	}
	sort.SliceStable(records, func(i, j int) bool {
		return backupRecordID(records[i]) < backupRecordID(records[j])
	})
	if len(records) == 0 {
		return nil
	}
	return tx.Table(tableName).CreateInBatches(records, 500).Error
}

func backupRecordID(record map[string]interface{}) int64 {
	value, ok := record["id"]
	if !ok || value == nil {
		return 0
	}
	switch v := value.(type) {
	case int64:
		return v
	case int:
		return int64(v)
	case uint:
		return int64(v)
	case uint64:
		return int64(v)
	case float64:
		return int64(v)
	case json.Number:
		id, _ := v.Int64()
		return id
	default:
		return 0
	}
}

func backupTableColumns(tx *gorm.DB, tableName string) (map[string]gorm.ColumnType, error) {
	columnTypes, err := tx.Migrator().ColumnTypes(tableName)
	if err != nil {
		return nil, err
	}
	columns := make(map[string]gorm.ColumnType, len(columnTypes))
	for _, columnType := range columnTypes {
		columns[columnType.Name()] = columnType
	}
	return columns, nil
}

func normalizeBackupRecord(record map[string]interface{}, columns map[string]gorm.ColumnType) map[string]interface{} {
	normalized := make(map[string]interface{}, len(record))
	for key, value := range record {
		columnType, ok := columns[key]
		if !ok {
			continue
		}
		normalized[key] = normalizeBackupValue(value, columnType)
	}
	return normalized
}

func normalizeBackupValue(value interface{}, columnType gorm.ColumnType) interface{} {
	if value == nil {
		return nil
	}
	dbType := strings.ToLower(columnType.DatabaseTypeName())
	if number, ok := value.(json.Number); ok {
		if isBackupBoolColumn(dbType) {
			return number.String() != "0"
		}
		if isBackupIntegerColumn(dbType) {
			if intValue, err := number.Int64(); err == nil {
				return intValue
			}
		}
		if isBackupDecimalColumn(dbType) {
			return number.String()
		}
		if floatValue, err := number.Float64(); err == nil {
			return floatValue
		}
		return number.String()
	}
	if text, ok := value.(string); ok && isBackupTimeColumn(dbType) {
		if t, err := time.Parse(time.RFC3339Nano, text); err == nil {
			return t
		}
	}
	return value
}

func isBackupIntegerColumn(dbType string) bool {
	return strings.Contains(dbType, "int") || dbType == "serial" || dbType == "bigserial"
}

func isBackupDecimalColumn(dbType string) bool {
	return strings.Contains(dbType, "decimal") || strings.Contains(dbType, "numeric")
}

func isBackupBoolColumn(dbType string) bool {
	return strings.Contains(dbType, "bool")
}

func isBackupTimeColumn(dbType string) bool {
	return strings.Contains(dbType, "time") || strings.Contains(dbType, "date")
}

func quoteBackupIdentifier(tx *gorm.DB, name string) string {
	if tx.Dialector != nil {
		switch tx.Dialector.Name() {
		case "mysql":
			return "`" + strings.ReplaceAll(name, "`", "``") + "`"
		}
	}
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func setBackupForeignKeyChecks(tx *gorm.DB, enabled bool) error {
	if tx.Dialector == nil {
		return nil
	}
	switch tx.Dialector.Name() {
	case "mysql":
		value := 0
		if enabled {
			value = 1
		}
		return tx.Exec(fmt.Sprintf("SET FOREIGN_KEY_CHECKS = %d", value)).Error
	default:
		return nil
	}
}

func clearBackupTables(tx *gorm.DB) error {
	tableNames := systemBackupTableNames()
	for i := len(tableNames) - 1; i >= 0; i-- {
		tableName := tableNames[i]
		if err := tx.Exec("DELETE FROM " + quoteBackupIdentifier(tx, tableName)).Error; err != nil {
			return fmt.Errorf("清空表 %s 失败: %w", tableName, err)
		}
	}
	return nil
}

func resetBackupIdentity(tx *gorm.DB, tableName string) error {
	columns, err := backupTableColumns(tx, tableName)
	if err != nil {
		return err
	}
	if _, ok := columns["id"]; !ok {
		return nil
	}

	var maxID uint
	if err := tx.Table(tableName).Select("COALESCE(MAX(id), 0)").Scan(&maxID).Error; err != nil {
		return err
	}

	if tx.Dialector != nil && tx.Dialector.Name() == "mysql" {
		return tx.Exec(fmt.Sprintf("ALTER TABLE %s AUTO_INCREMENT = ?", quoteBackupIdentifier(tx, tableName)), maxID+1).Error
	}

	quotedTableName := quoteBackupIdentifier(tx, tableName)
	return tx.Exec(fmt.Sprintf(
		"SELECT setval(pg_get_serial_sequence(?, 'id'), COALESCE((SELECT MAX(id) FROM %s), 0) + 1, false)",
		quotedTableName,
	), tableName).Error
}

func decodeSystemBackupData(jsonData []byte) (systemBackupData, error) {
	var backupData systemBackupData
	decoder := json.NewDecoder(bytes.NewReader(jsonData))
	decoder.UseNumber()
	if err := decoder.Decode(&backupData); err != nil {
		return backupData, err
	}
	return backupData, nil
}

// GetBackupStats 获取备份统计
func GetBackupStats(c *gin.Context) {
	var stats struct {
		Users      int64 `json:"users"`
		Apps       int64 `json:"apps"`
		AppUsers   int64 `json:"app_users"`
		CardTypes  int64 `json:"card_types"`
		Cards      int64 `json:"cards"`
		Orders     int64 `json:"orders"`
		Versions   int64 `json:"versions"`
		Agents     int64 `json:"agents"`
		DataPools  int64 `json:"data_pools"`
		Licenses   int64 `json:"licenses"`
		Blacklists int64 `json:"blacklists"`
		Activities int64 `json:"activities"`
		Tables     int   `json:"tables"`
	}

	database.DB.Model(&models.User{}).Count(&stats.Users)
	database.DB.Model(&models.App{}).Count(&stats.Apps)
	database.DB.Model(&models.AppUser{}).Count(&stats.AppUsers)
	database.DB.Model(&models.CardType{}).Count(&stats.CardTypes)
	database.DB.Model(&models.Card{}).Count(&stats.Cards)
	database.DB.Model(&models.RechargeOrder{}).Count(&stats.Orders)
	database.DB.Model(&models.AppVersion{}).Count(&stats.Versions)
	database.DB.Model(&models.Agent{}).Count(&stats.Agents)
	database.DB.Model(&models.DataPool{}).Count(&stats.DataPools)
	database.DB.Model(&models.License{}).Count(&stats.Licenses)
	database.DB.Model(&models.Blacklist{}).Count(&stats.Blacklists)
	database.DB.Model(&models.Activity{}).Count(&stats.Activities)
	stats.Tables = len(systemBackupTables)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": stats})
}

// ExportBackup 导出整站备份
func ExportBackup(c *gin.Context) {
	backupData := systemBackupData{
		Format:       "jike_auth_system_backup",
		Version:      2,
		Scope:        "system",
		SourceDriver: database.DB.Dialector.Name(),
		ExportTime:   time.Now().Format("2006-01-02 15:04:05"),
		Tables:       make(map[string][]interface{}),
	}

	for _, model := range systemBackupTables {
		tableName := systemBackupTableName(model)
		if tableName == "" {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "读取备份表失败"})
			return
		}
		records, err := scanBackupTable(tableName)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "读取表数据失败: " + tableName})
			return
		}
		backupData.Tables[tableName] = records
	}

	jsonData, err := json.MarshalIndent(backupData, "", "  ")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "序列化数据失败"})
		return
	}

	// 创建ZIP，只包含一个backup.json文件
	buf := new(bytes.Buffer)
	zipWriter := zip.NewWriter(buf)

	w, err := zipWriter.Create("backup.json")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "创建压缩文件失败"})
		return
	}
	w.Write(jsonData)
	zipWriter.Close()

	filename := fmt.Sprintf("system_backup_%s.zip", time.Now().Format("2006-01-02"))
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

// ImportBackup 导入整站备份
func ImportBackup(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请选择文件"})
		return
	}

	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "打开文件失败"})
		return
	}
	defer f.Close()

	content, err := io.ReadAll(f)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "读取文件失败"})
		return
	}

	var result struct {
		Tables  int `json:"tables"`
		Records int `json:"records"`
	}

	importFromJSON := func(jsonData []byte) error {
		backupData, err := decodeSystemBackupData(jsonData)
		if err != nil {
			return err
		}
		if backupData.Scope != "system" || backupData.Tables == nil {
			return fmt.Errorf("不是整站备份文件")
		}

		allowedTables := make(map[string]bool)
		for _, model := range systemBackupTables {
			allowedTables[systemBackupTableName(model)] = true
		}

		return database.DB.Transaction(func(tx *gorm.DB) error {
			if err := setBackupForeignKeyChecks(tx, false); err != nil {
				return err
			}
			defer setBackupForeignKeyChecks(tx, true)

			if err := clearBackupTables(tx); err != nil {
				return err
			}

			for _, model := range systemBackupTables {
				tableName := systemBackupTableName(model)
				if !allowedTables[tableName] {
					continue
				}
				if err := resetBackupIdentity(tx, tableName); err != nil {
					return err
				}
			}

			for _, model := range systemBackupTables {
				tableName := systemBackupTableName(model)
				if !allowedTables[tableName] {
					continue
				}
				rows := backupData.Tables[tableName]
				if len(rows) == 0 {
					continue
				}
				if err := insertBackupRows(tx, tableName, rows); err != nil {
					return fmt.Errorf("导入表 %s 失败: %w", tableName, err)
				}
				if err := resetBackupIdentity(tx, tableName); err != nil {
					return err
				}
				result.Tables++
				result.Records += len(rows)
			}
			return nil
		})
	}

	// 处理JSON文件
	if strings.HasSuffix(file.Filename, ".json") {
		if err := importFromJSON(content); err != nil {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "导入失败: " + err.Error()})
			return
		}
	} else if strings.HasSuffix(file.Filename, ".zip") {
		zipReader, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "解析ZIP失败"})
			return
		}

		var backupJsonData []byte
		for _, zf := range zipReader.File {
			if zf.Name == "backup.json" {
				rc, err := zf.Open()
				if err == nil {
					backupJsonData, _ = io.ReadAll(rc)
					rc.Close()
				}
				break
			}
		}

		if backupJsonData != nil {
			if err := importFromJSON(backupJsonData); err != nil {
				c.JSON(http.StatusOK, gin.H{"code": 1, "message": "导入失败: " + err.Error()})
				return
			}
		} else {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "未找到backup.json"})
			return
		}
	} else {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "不支持的文件格式，请上传.json或.zip文件"})
		return
	}

	if cache.Enabled {
		cache.RDB.FlushDB(context.Background())
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "导入成功", "data": result})
}

// ==================== 维护工具 ====================

// ToolsCleanUnusedCards 清理未使用卡号
func ToolsCleanUnusedCards(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		AppID uint `json:"app_id"`
		Days  int  `json:"days"`
	}
	c.ShouldBindJSON(&req)

	query := database.DB.Where("status = 1")
	if req.AppID > 0 {
		var app models.App
		if database.DB.Where("id = ? AND user_id = ?", req.AppID, userID).First(&app).Error != nil {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "应用不存在"})
			return
		}
		query = query.Where("app_id = ?", req.AppID)
	} else {
		query = query.Where("app_id IN (SELECT id FROM apps WHERE user_id = ?)", userID)
	}

	if req.Days > 0 {
		cutoff := time.Now().AddDate(0, 0, -req.Days)
		query = query.Where("created_at < ?", cutoff)
	}

	result := query.Delete(&models.Card{})
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("已删除 %d 张未使用卡号", result.RowsAffected)})
}

// ToolsCleanUsedCards 清理已使用卡号
func ToolsCleanUsedCards(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		AppID uint `json:"app_id"`
	}
	c.ShouldBindJSON(&req)

	query := database.DB.Where("status = 2")
	if req.AppID > 0 {
		var app models.App
		if database.DB.Where("id = ? AND user_id = ?", req.AppID, userID).First(&app).Error != nil {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "应用不存在"})
			return
		}
		query = query.Where("app_id = ?", req.AppID)
	} else {
		query = query.Where("app_id IN (SELECT id FROM apps WHERE user_id = ?)", userID)
	}

	result := query.Delete(&models.Card{})
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("已删除 %d 张已使用卡号", result.RowsAffected)})
}

// ToolsCleanDisabledCards 清理禁用卡号
func ToolsCleanDisabledCards(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		AppID uint `json:"app_id"`
	}
	c.ShouldBindJSON(&req)

	query := database.DB.Where("status = 3")
	if req.AppID > 0 {
		var app models.App
		if database.DB.Where("id = ? AND user_id = ?", req.AppID, userID).First(&app).Error != nil {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "应用不存在"})
			return
		}
		query = query.Where("app_id = ?", req.AppID)
	} else {
		query = query.Where("app_id IN (SELECT id FROM apps WHERE user_id = ?)", userID)
	}

	result := query.Delete(&models.Card{})
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("已删除 %d 张禁用卡号", result.RowsAffected)})
}

// ToolsKickAllOnline 踢下线所有在线用户
func ToolsKickAllOnline(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		AppID uint `json:"app_id"`
	}
	c.ShouldBindJSON(&req)

	query := database.DB.Model(&models.OnlineSession{})
	if req.AppID > 0 {
		var app models.App
		if database.DB.Where("id = ? AND user_id = ?", req.AppID, userID).First(&app).Error != nil {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "应用不存在"})
			return
		}
		query = query.Where("app_id = ?", req.AppID)
	} else {
		query = query.Where("app_id IN (SELECT id FROM apps WHERE user_id = ?)", userID)
	}

	result := query.Delete(&models.OnlineSession{})
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("已踢下线 %d 个用户", result.RowsAffected)})
}

// ToolsCleanExpiredBlacklist 清理过期黑名单
func ToolsCleanExpiredBlacklist(c *gin.Context) {
	userID := c.GetUint("userID")

	result := database.DB.Where("user_id = ? AND expire_at IS NOT NULL AND expire_at < ?", userID, time.Now()).Delete(&models.Blacklist{})
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("已清理 %d 条过期黑名单", result.RowsAffected)})
}

// ==================== 条件筛选批量操作 ====================

// ToolsFilterUsers 筛选用户
func ToolsFilterUsers(c *gin.Context) {
	userID := c.GetUint("userID")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	status := c.Query("status")
	appID, _ := strconv.Atoi(c.Query("app_id"))
	expire := c.Query("expire")
	pointsMin := c.Query("points_min")
	pointsMax := c.Query("points_max")
	regStart := c.Query("reg_start")
	regEnd := c.Query("reg_end")
	keyword := c.Query("keyword")

	var users []models.AppUser
	var total int64

	query := database.DB.Model(&models.AppUser{}).
		Joins("JOIN apps ON apps.id = app_users.app_id").
		Where("apps.user_id = ?", userID)

	if appID > 0 {
		query = query.Where("app_users.app_id = ?", appID)
	}
	if status != "" {
		s, _ := strconv.Atoi(status)
		query = query.Where("app_users.status = ?", s)
	}
	if expire != "" {
		now := time.Now()
		switch expire {
		case "expired":
			query = query.Where("app_users.expire_at IS NULL OR app_users.expire_at < ?", now)
		case "expiring":
			query = query.Where("app_users.expire_at IS NOT NULL AND app_users.expire_at >= ? AND app_users.expire_at < ?", now, now.AddDate(0, 0, 7))
		case "active":
			query = query.Where("app_users.expire_at IS NOT NULL AND app_users.expire_at >= ?", now)
		case "never":
			query = query.Where("app_users.expire_at IS NOT NULL AND app_users.expire_at >= '2099-01-01'")
		}
	}
	if pointsMin != "" {
		min, _ := strconv.Atoi(pointsMin)
		query = query.Where("app_users.points >= ?", min)
	}
	if pointsMax != "" {
		max, _ := strconv.Atoi(pointsMax)
		query = query.Where("app_users.points <= ?", max)
	}
	if regStart != "" {
		query = query.Where("app_users.created_at >= ?", regStart)
	}
	if regEnd != "" {
		query = query.Where("app_users.created_at <= ?", regEnd+" 23:59:59")
	}
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("app_users.username LIKE ? OR app_users.qq LIKE ? OR app_users.phone LIKE ? OR app_users.email LIKE ?",
			kw, kw, kw, kw)
	}

	if err := query.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "查询失败: " + err.Error()})
		return
	}
	if err := query.Select("app_users.id, app_users.username, app_users.status, app_users.points, app_users.expire_at, app_users.created_at").
		Offset((page - 1) * size).Limit(size).Order("app_users.id desc").Find(&users).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "查询失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": users, "total": total}})
}

// filterJSONInt 解析 JSON filter 中的整型（前端可能发 string / float64）
func filterJSONInt(v interface{}) (int, bool) {
	if v == nil {
		return 0, false
	}
	switch x := v.(type) {
	case int:
		return x, true
	case int64:
		return int(x), true
	case float64:
		return int(x), true
	case json.Number:
		i, err := x.Int64()
		if err != nil {
			return 0, false
		}
		return int(i), true
	case string:
		if strings.TrimSpace(x) == "" {
			return 0, false
		}
		n, err := strconv.Atoi(x)
		if err != nil {
			return 0, false
		}
		return n, true
	default:
		n, err := strconv.Atoi(strings.TrimSpace(fmt.Sprint(x)))
		return n, err == nil
	}
}

func filterExpireKey(v interface{}) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return strings.TrimSpace(fmt.Sprint(v))
}

func buildFilterQuery(userID uint, filter map[string]interface{}) *gorm.DB {
	if filter == nil {
		filter = map[string]interface{}{}
	}
	query := database.DB.Model(&models.AppUser{}).
		Joins("JOIN apps ON apps.id = app_users.app_id").
		Where("apps.user_id = ?", userID)

	if status, ok := filter["status"]; ok && status != nil {
		if n, ok2 := filterJSONInt(status); ok2 {
			query = query.Where("app_users.status = ?", n)
		}
	}
	if appID, ok := filter["app_id"]; ok && appID != nil {
		if n, ok2 := filterJSONInt(appID); ok2 && n > 0 {
			query = query.Where("app_users.app_id = ?", n)
		}
	}
	if expire, ok := filter["expire_status"]; ok && expire != nil {
		switch filterExpireKey(expire) {
		case "expired":
			now := time.Now()
			query = query.Where("app_users.expire_at IS NULL OR app_users.expire_at < ?", now)
		case "expiring":
			now := time.Now()
			query = query.Where("app_users.expire_at IS NOT NULL AND app_users.expire_at >= ? AND app_users.expire_at < ?", now, now.AddDate(0, 0, 7))
		case "active":
			now := time.Now()
			query = query.Where("app_users.expire_at IS NOT NULL AND app_users.expire_at >= ?", now)
		case "never":
			query = query.Where("app_users.expire_at IS NOT NULL AND app_users.expire_at >= '2099-01-01'")
		}
	}
	if min, ok := filter["points_min"]; ok && min != nil {
		if n, ok2 := filterJSONInt(min); ok2 {
			query = query.Where("app_users.points >= ?", n)
		}
	}
	if max, ok := filter["points_max"]; ok && max != nil {
		if n, ok2 := filterJSONInt(max); ok2 {
			query = query.Where("app_users.points <= ?", n)
		}
	}
	if start, ok := filter["reg_date_start"]; ok && start != nil {
		s := strings.TrimSpace(fmt.Sprint(start))
		if s != "" && s != "<nil>" {
			query = query.Where("app_users.created_at >= ?", s)
		}
	}
	if end, ok := filter["reg_date_end"]; ok && end != nil {
		s := strings.TrimSpace(fmt.Sprint(end))
		if s != "" && s != "<nil>" {
			query = query.Where("app_users.created_at <= ?", s+" 23:59:59")
		}
	}
	if kw, ok := filter["keyword"]; ok && kw != nil {
		s := strings.TrimSpace(fmt.Sprint(kw))
		if s != "" && s != "<nil>" {
			pattern := "%" + database.EscapeLike(s) + "%"
			query = query.Where("app_users.username LIKE ? OR app_users.qq LIKE ? OR app_users.phone LIKE ? OR app_users.email LIKE ?",
				pattern, pattern, pattern, pattern)
		}
	}

	return query
}

// appUserFilterChunkSize MySQL 单条 IN 列表不宜过大；且必须用「先查 id 再更新」避免 Error 1093（不能对正在 UPDATE 的表使用同表子查询）。
const appUserFilterChunkSize = 500

func dedupeUint(ids []uint) []uint {
	if len(ids) <= 1 {
		return ids
	}
	seen := make(map[uint]struct{}, len(ids))
	out := make([]uint, 0, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

// filteredAppUserIDs 仅执行 SELECT，得到当前作者名下满足筛选的软件用户 id 列表（供后续分批 UPDATE/DELETE，兼容 MySQL）。
func filteredAppUserIDs(userID uint, filter map[string]interface{}) ([]uint, error) {
	var ids []uint
	if err := buildFilterQuery(userID, filter).Pluck("app_users.id", &ids).Error; err != nil {
		return nil, err
	}
	return dedupeUint(ids), nil
}

func forEachUintChunk(ids []uint, chunkSize int, fn func(chunk []uint) error) error {
	for i := 0; i < len(ids); i += chunkSize {
		j := i + chunkSize
		if j > len(ids) {
			j = len(ids)
		}
		if err := fn(ids[i:j]); err != nil {
			return err
		}
	}
	return nil
}

// ToolsFilterSetStatus 批量设置状态
func ToolsFilterSetStatus(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		Filter    map[string]interface{} `json:"filter"`
		NewStatus int                    `json:"new_status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	ids, err := filteredAppUserIDs(userID, req.Filter)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	if len(ids) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "没有匹配的用户，已更新 0 个用户状态"})
		return
	}

	var affected int64
	if err := forEachUintChunk(ids, appUserFilterChunkSize, func(chunk []uint) error {
		r := database.DB.Model(&models.AppUser{}).Where("id IN ?", chunk).Update("status", req.NewStatus)
		affected += r.RowsAffected
		return r.Error
	}); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("已更新 %d 个用户状态", affected)})
}

// ToolsFilterAddPoints 批量增减点数
func ToolsFilterAddPoints(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		Filter map[string]interface{} `json:"filter"`
		Points int                    `json:"points"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	ids, err := filteredAppUserIDs(userID, req.Filter)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	if len(ids) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "没有匹配的用户，已更新 0 个用户点数"})
		return
	}

	var affected int64
	if err := forEachUintChunk(ids, appUserFilterChunkSize, func(chunk []uint) error {
		r := database.DB.Model(&models.AppUser{}).Where("id IN ?", chunk).UpdateColumn("points", gorm.Expr("points + ?", req.Points))
		affected += r.RowsAffected
		return r.Error
	}); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("已更新 %d 个用户点数", affected)})
}

// ToolsFilterAddDuration 批量增加时长
func ToolsFilterAddDuration(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		Filter  map[string]interface{} `json:"filter"`
		Days    int                    `json:"days"`
		Hours   int                    `json:"hours"`
		Minutes int                    `json:"minutes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	duration := time.Duration(req.Days)*24*time.Hour + time.Duration(req.Hours)*time.Hour + time.Duration(req.Minutes)*time.Minute

	ids, err := filteredAppUserIDs(userID, req.Filter)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	if len(ids) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "没有匹配的用户，已更新 0 个用户时长"})
		return
	}

	var count int64
	err = forEachUintChunk(ids, appUserFilterChunkSize, func(chunk []uint) error {
		var users []models.AppUser
		if err := database.DB.Where("id IN ?", chunk).Find(&users).Error; err != nil {
			return err
		}
		for _, user := range users {
			var newExpire time.Time
			if user.ExpireAt != nil {
				newExpire = user.ExpireAt.Add(duration)
			} else {
				newExpire = time.Now().Add(duration)
			}
			if err := database.DB.Model(&models.AppUser{}).Where("id = ?", user.ID).Update("expire_at", newExpire).Error; err != nil {
				return err
			}
			count++
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("已更新 %d 个用户时长", count)})
}

// ToolsFilterSetExpire 批量设置到期时间
func ToolsFilterSetExpire(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		Filter   map[string]interface{} `json:"filter"`
		ExpireAt string                 `json:"expire_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var expireAt *time.Time
	if req.ExpireAt != "" {
		value := strings.TrimSpace(req.ExpireAt)
		layouts := []string{"2006-01-02 15:04:05", "2006-01-02T15:04:05", time.RFC3339, "2006-01-02"}
		var t time.Time
		var err error
		for _, layout := range layouts {
			t, err = time.ParseInLocation(layout, value, time.Local)
			if err == nil {
				break
			}
		}
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "到期时间格式错误，请使用 YYYY-MM-DD HH:mm:ss"})
			return
		}
		expireAt = &t
	}

	ids, err := filteredAppUserIDs(userID, req.Filter)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	if len(ids) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "没有匹配的用户，已更新 0 个用户到期时间"})
		return
	}

	var affected int64
	if err := forEachUintChunk(ids, appUserFilterChunkSize, func(chunk []uint) error {
		r := database.DB.Model(&models.AppUser{}).Where("id IN ?", chunk).Update("expire_at", expireAt)
		affected += r.RowsAffected
		return r.Error
	}); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("已更新 %d 个用户到期时间", affected)})
}

// ToolsFilterDelete 批量删除用户
func ToolsFilterDelete(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		Filter map[string]interface{} `json:"filter"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	ids, err := filteredAppUserIDs(userID, req.Filter)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	if len(ids) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "没有匹配的用户，已删除 0 个用户"})
		return
	}

	var affected int64
	if err := forEachUintChunk(ids, appUserFilterChunkSize, func(chunk []uint) error {
		r := database.DB.Where("id IN ?", chunk).Delete(&models.AppUser{})
		affected += r.RowsAffected
		return r.Error
	}); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("已删除 %d 个用户", affected)})
}

// ToolsFilterKick 批量踢下线
func ToolsFilterKick(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		Filter map[string]interface{} `json:"filter"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	userIDs, err := filteredAppUserIDs(userID, req.Filter)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	if len(userIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "没有匹配的用户，已踢下线 0 个会话"})
		return
	}

	var sessions int64
	if err := forEachUintChunk(userIDs, appUserFilterChunkSize, func(chunk []uint) error {
		r := database.DB.Where("app_user_id IN ?", chunk).Delete(&models.OnlineSession{})
		sessions += r.RowsAffected
		return r.Error
	}); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("已踢下线 %d 个会话", sessions)})
}

// ToolsFilterUnbind 批量解绑设备
func ToolsFilterUnbind(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		Filter map[string]interface{} `json:"filter"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	userIDs, err := filteredAppUserIDs(userID, req.Filter)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	if len(userIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "没有匹配的用户，已解绑 0 个设备"})
		return
	}

	var devices int64
	if err := forEachUintChunk(userIDs, appUserFilterChunkSize, func(chunk []uint) error {
		r := database.DB.Where("app_user_id IN ?", chunk).Delete(&models.AppUserDevice{})
		devices += r.RowsAffected
		return r.Error
	}); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": fmt.Sprintf("已解绑 %d 个设备", devices)})
}
