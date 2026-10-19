package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ImportAuthorPortable 将便携包导入到当前登录账号（自动绑定作者 user_id，自增 ID 与关联在导入时重建）
func ImportAuthorPortable(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	userID := user.ID

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
	raw, err := io.ReadAll(f)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "读取文件失败"})
		return
	}

	jsonBytes, err := portableReadJSONPayload(raw, file.Filename)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}

	var doc map[string]interface{}
	if err := json.Unmarshal(jsonBytes, &doc); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "JSON 解析失败"})
		return
	}
	if pStr(doc, "format") != portableFormatName {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "不是有效的作者数据包（format 不匹配）"})
		return
	}
	if int(pFloatKey(doc, "format_version")) != portableFormatVer {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "不支持的导出版本，请升级服务端"})
		return
	}

	appsArr := pArr(doc, "apps")
	if len(appsArr) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "包内没有应用数据"})
		return
	}

	maxApps, _, _, _ := getUserTotalQuota(user)
	var curApps int64
	database.DB.Model(&models.App{}).Where("user_id = ?", userID).Count(&curApps)
	if maxApps >= 0 && int(curApps)+len(appsArr) > maxApps {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": fmt.Sprintf("导入后将超过应用数量上限（当前 %d，上限 %d，包内 %d 个应用）", curApps, maxApps, len(appsArr))})
		return
	}

	var codes, keys []string
	for _, a := range appsArr {
		m, ok := a.(map[string]interface{})
		if !ok {
			continue
		}
		if c := pStr(m, "app_code"); c != "" {
			codes = append(codes, c)
		}
		if k := pStr(m, "app_key"); k != "" {
			keys = append(keys, k)
		}
	}
	var conflict int64
	database.DB.Model(&models.App{}).Where("app_code IN ? OR app_key IN ?", codes, keys).Count(&conflict)
	if conflict > 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "包中的应用编码或 AppKey 与服务器已有数据冲突，请先删除冲突应用或修改包内字段后再导入"})
		return
	}

	stats := map[string]int{}
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		return portableImportTx(tx, userID, doc, stats)
	}); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error()})
		return
	}

	importedCodes := make([]string, 0, len(appsArr))
	for _, a := range appsArr {
		if m, ok := a.(map[string]interface{}); ok {
			importedCodes = append(importedCodes, pStr(m, "app_code"))
		}
	}
	clearAppCachesForCodes(importedCodes)
	clearFirewallCachesForImportedApps(userID, importedCodes)

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "导入成功", "data": stats})
}

func portableReadJSONPayload(content []byte, filename string) ([]byte, error) {
	fn := strings.ToLower(filename)
	if strings.HasSuffix(fn, ".json") {
		return content, nil
	}
	if strings.HasSuffix(fn, ".zip") {
		return portableUnzipJSON(content)
	}
	return nil, fmt.Errorf("请上传 .json 或 .zip（内含 %s）", portableJSONName)
}

func portableUnzipJSON(zipBytes []byte) ([]byte, error) {
	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		return nil, fmt.Errorf("解压失败")
	}
	for _, zf := range zr.File {
		if zf.Name == portableJSONName {
			rc, err := zf.Open()
			if err != nil {
				return nil, err
			}
			b, err := io.ReadAll(rc)
			rc.Close()
			return b, err
		}
	}
	return nil, fmt.Errorf("压缩包内缺少 %s", portableJSONName)
}

func portableImportTx(tx *gorm.DB, userID uint, doc map[string]interface{}, stats map[string]int) error {
	if err := portableImportEmailRebateOpenAPI(tx, userID, doc, stats); err != nil {
		return err
	}
	appCodeToID, err := portableImportApps(tx, userID, pArr(doc, "apps"), stats)
	if err != nil {
		return err
	}
	ctRefToID, err := portableImportCardTypes(tx, appCodeToID, pArr(doc, "card_types"), stats)
	if err != nil {
		return err
	}
	poolRefToID, err := portableImportDataPools(tx, appCodeToID, pArr(doc, "data_pools"), stats)
	if err != nil {
		return err
	}
	if err := portableImportDataItems(tx, poolRefToID, pArr(doc, "data_items"), stats); err != nil {
		return err
	}
	if err := portableImportFirewall(tx, appCodeToID, pArr(doc, "firewall_configs"), stats); err != nil {
		return err
	}
	if err := portableImportAnnouncements(tx, appCodeToID, pArr(doc, "app_announcements"), stats); err != nil {
		return err
	}
	if err := portableImportVersions(tx, appCodeToID, pArr(doc, "app_versions"), stats); err != nil {
		return err
	}
	agRefToID, err := portableImportAgents(tx, userID, appCodeToID, pArr(doc, "agents"), stats)
	if err != nil {
		return err
	}
	if err := portableImportAgentCardTypes(tx, agRefToID, ctRefToID, pArr(doc, "agent_card_types"), stats); err != nil {
		return err
	}
	if err := portableImportAgentCardLogs(tx, agRefToID, ctRefToID, pArr(doc, "agent_card_logs"), stats); err != nil {
		return err
	}
	if err := portableImportAgentBalanceLogs(tx, agRefToID, pArr(doc, "agent_balance_logs"), stats); err != nil {
		return err
	}
	auKeyToID, err := portableImportAppUsersPass1(tx, appCodeToID, agRefToID, pArr(doc, "app_users"), stats)
	if err != nil {
		return err
	}
	if err := portableImportAppUsersInviter(tx, auKeyToID, pArr(doc, "app_users")); err != nil {
		return err
	}
	if err := portableImportAppUserSub(tx, appCodeToID, auKeyToID, pArr(doc, "app_user_data"), stats, "data"); err != nil {
		return err
	}
	if err := portableImportAppUserSub(tx, appCodeToID, auKeyToID, pArr(doc, "app_user_devices"), stats, "devices"); err != nil {
		return err
	}
	if err := portableImportAppUserLogs(tx, appCodeToID, auKeyToID, pArr(doc, "app_user_logs"), stats); err != nil {
		return err
	}
	if err := portableImportUnbindLogs(tx, auKeyToID, pArr(doc, "app_user_unbind_logs"), stats); err != nil {
		return err
	}
	cardNoToID, err := portableImportCards(tx, appCodeToID, ctRefToID, agRefToID, auKeyToID, pArr(doc, "cards"), stats)
	if err != nil {
		return err
	}
	if err := portableImportCardUseLogs(tx, appCodeToID, auKeyToID, cardNoToID, pArr(doc, "card_use_logs"), stats); err != nil {
		return err
	}
	if err := portableImportLicenses(tx, appCodeToID, pArr(doc, "licenses"), stats); err != nil {
		return err
	}
	if err := portableImportBlacklists(tx, userID, appCodeToID, pArr(doc, "blacklists"), stats); err != nil {
		return err
	}
	if err := portableImportActivitiesBlock(tx, userID, appCodeToID, ctRefToID, doc, stats); err != nil {
		return err
	}
	if err := portableImportWithdrawKeys(tx, userID, appCodeToID, pArr(doc, "withdraw_keys"), stats); err != nil {
		return err
	}
	if err := portableImportWithdrawLogs(tx, userID, appCodeToID, ctRefToID, cardNoToID, pArr(doc, "withdraw_logs"), stats); err != nil {
		return err
	}
	if err := portableImportRebateLogs(tx, userID, appCodeToID, auKeyToID, pArr(doc, "rebate_logs"), stats); err != nil {
		return err
	}
	if err := portableImportTrialLogs(tx, appCodeToID, auKeyToID, pArr(doc, "trial_feature_logs"), stats); err != nil {
		return err
	}
	return nil
}

func portableImportEmailRebateOpenAPI(tx *gorm.DB, userID uint, doc map[string]interface{}, stats map[string]int) error {
	if m, ok := doc["email_config"].(map[string]interface{}); ok && len(m) > 0 {
		cfg := models.EmailConfig{
			UserID: userID, SMTPHost: pStr(m, "smtp_host"), SMTPPort: pInt(m, "smtp_port", 465),
			SMTPUser: pStr(m, "smtp_user"), SMTPPass: pStr(m, "smtp_pass"), SMTPSSL: pInt(m, "smtp_ssl", 1),
			FromName: pStr(m, "from_name"), CodeTemplate: pStr(m, "code_template"),
		}
		var existing models.EmailConfig
		if tx.Where("user_id = ?", userID).First(&existing).Error == nil && existing.ID != 0 {
			cfg.ID = existing.ID
			tx.Save(&cfg)
		} else {
			tx.Create(&cfg)
		}
		stats["email_config"] = 1
	}
	if m, ok := doc["rebate_config"].(map[string]interface{}); ok && len(m) > 0 {
		rc := models.RebateConfig{UserID: userID, Enabled: pInt(m, "enabled", 0), Rate: pInt(m, "rate", 10), RegReward: pInt(m, "reg_reward", 0)}
		var ex models.RebateConfig
		if tx.Where("user_id = ?", userID).First(&ex).Error == nil && ex.ID != 0 {
			rc.ID = ex.ID
			tx.Save(&rc)
		} else {
			tx.Create(&rc)
		}
		stats["rebate_config"] = 1
	}
	for _, x := range pArr(doc, "openapi_keys") {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		sk := pStr(m, "secret_key")
		if sk == "" {
			continue
		}
		var cnt int64
		tx.Model(&models.OpenApiKey{}).Where("secret_key = ?", sk).Count(&cnt)
		if cnt > 0 {
			continue
		}
		k := models.OpenApiKey{
			UserID: userID, Name: pStr(m, "name"), SecretKey: sk, Permissions: pStr(m, "permissions"),
			Status: pInt(m, "status", 1), LastUsedAt: pTimePtr(m, "last_used_at"),
		}
		if err := tx.Select("UserID", "Name", "SecretKey", "Permissions", "Status", "LastUsedAt").Create(&k).Error; err != nil {
			return err
		}
		stats["openapi_keys"]++
	}
	return nil
}

func portableImportApps(tx *gorm.DB, userID uint, apps []interface{}, stats map[string]int) (map[string]uint, error) {
	out := make(map[string]uint)
	for _, a := range apps {
		m, ok := a.(map[string]interface{})
		if !ok {
			continue
		}
		app := models.App{
			UserID: userID, AppName: pStr(m, "app_name"), AppKey: pStr(m, "app_key"), AppCode: pStr(m, "app_code"),
			AppSecret: pStr(m, "app_secret"), Description: pStr(m, "description"), LoginMode: pInt(m, "login_mode", 1),
			BillingMode: pInt(m, "billing_mode", 1), Heartbeat: pInt(m, "heartbeat", 60), CryptoMode: pStr(m, "crypto_mode"),
			SignAlgo: pStr(m, "sign_algo"), ServerSignAlgo: pStr(m, "server_sign_algo"), BindDevice: pInt(m, "bind_device", 0),
			ChannelMode: pInt(m, "channel_mode", 1), LoginKick: pInt(m, "login_kick", 0), RegMode: pInt(m, "reg_mode", 1),
			RegLimit: pInt(m, "reg_limit", 1), RegChannels: pInt(m, "reg_channels", 1), RegFeatures: pInt(m, "reg_features", 1),
			RegDuration: pInt(m, "reg_duration", 0), RegPoints: pInt(m, "reg_points", 0), TrialDuration: pInt(m, "trial_duration", 0),
			TrialPoints: pInt(m, "trial_points", 0), TrialLimit: pInt(m, "trial_limit", 0), Maintenance: pInt(m, "maintenance", 0),
			Status: pInt(m, "status", 1),
		}
		if app.AppCode == "" || app.AppKey == "" {
			return nil, fmt.Errorf("应用缺少 app_code 或 app_key")
		}
		if err := tx.Select(
			"UserID", "AppName", "AppKey", "AppCode", "AppSecret", "Description",
			"LoginMode", "BillingMode", "Heartbeat", "CryptoMode", "SignAlgo", "ServerSignAlgo",
			"BindDevice", "ChannelMode", "LoginKick", "RegMode", "RegLimit", "RegChannels", "RegFeatures",
			"RegDuration", "RegPoints", "TrialDuration", "TrialPoints", "TrialLimit", "Maintenance", "Status",
		).Create(&app).Error; err != nil {
			return nil, err
		}
		out[app.AppCode] = app.ID
		stats["apps"]++
	}
	return out, nil
}

func portableImportCardTypes(tx *gorm.DB, appCodeToID map[string]uint, rows []interface{}, stats map[string]int) (map[string]uint, error) {
	refToID := make(map[string]uint)
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		code := pStr(m, "app_code")
		ref := pStr(m, "card_type_ref")
		appID, ok := appCodeToID[code]
		if !ok || ref == "" {
			continue
		}
		ct := models.CardType{
			AppID: appID, Category: pInt(m, "category", 1), Name: pStr(m, "name"), Prefix: pStr(m, "prefix"),
			Points: pInt(m, "points", 0), RebatePoints: pInt(m, "rebate_points", 0), Duration: pInt(m, "duration", 0), GenRule: pInt(m, "gen_rule", 1),
			MaxUse: pInt(m, "max_use", 1), MaxUserUse: pInt(m, "max_user_use", 1), Channels: pInt(m, "channels", 1),
			Features: pInt(m, "features", 1), UnbindDay: pInt(m, "unbind_day", -1), UnbindWeek: pInt(m, "unbind_week", -1),
			UnbindMonth: pInt(m, "unbind_month", -1), UnbindQuarter: pInt(m, "unbind_quarter", -1),
			UnbindHalfY: pInt(m, "unbind_halfy", -1), UnbindYear: pInt(m, "unbind_year", -1), UnbindTotal: pInt(m, "unbind_total", -1),
			CardLength: pInt(m, "card_length", 16), ExtraData: pStr(m, "extra_data"), Remark: pStr(m, "remark"),
			WithdrawPrice: pFloat64(m, "withdraw_price"),
		}
		if err := tx.Select(
			"AppID", "Category", "Name", "Prefix", "Points", "RebatePoints", "Duration", "GenRule", "MaxUse", "MaxUserUse",
			"Channels", "Features", "UnbindDay", "UnbindWeek", "UnbindMonth", "UnbindQuarter", "UnbindHalfY",
			"UnbindYear", "UnbindTotal", "CardLength", "ExtraData", "Remark", "WithdrawPrice",
		).Create(&ct).Error; err != nil {
			return nil, err
		}
		refToID[ref] = ct.ID
		stats["card_types"]++
	}
	return refToID, nil
}

func portableImportDataPools(tx *gorm.DB, appCodeToID map[string]uint, rows []interface{}, stats map[string]int) (map[string]uint, error) {
	refToID := make(map[string]uint)
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		pr := pStr(m, "pool_ref")
		appID, ok := appCodeToID[pStr(m, "app_code")]
		if !ok || pr == "" {
			continue
		}
		p := models.DataPool{
			AppID: appID, Name: pStr(m, "name"), Code: pStr(m, "code"), Sort: pInt(m, "sort", 0),
			RequireLogin: pInt(m, "require_login", 0), Remark: pStr(m, "remark"),
		}
		if err := tx.Select("AppID", "Name", "Code", "Sort", "RequireLogin", "Remark").Create(&p).Error; err != nil {
			return nil, err
		}
		refToID[pr] = p.ID
		stats["data_pools"]++
	}
	return refToID, nil
}

func portableImportDataItems(tx *gorm.DB, poolRefToID map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		pid, ok := poolRefToID[pStr(m, "pool_ref")]
		if !ok {
			continue
		}
		// modify_count：缺省按 -1（无限）；字段在 JSON 里且为 0 时必须写入 0，否则 GORM Create 会省略零值列，DB 的 default:-1 会把「0 次」误变成无限
		modifyCount := -1
		if v, ok := m["modify_count"]; ok && v != nil {
			modifyCount = int(pFloat(v))
		}
		it := models.DataItem{
			DataPoolID: pid, Name: pStr(m, "name"), Code: pStr(m, "code"), Content: pStr(m, "content"),
			ModifyCount: modifyCount, ModifiedCount: pInt(m, "modified_count", 0),
			ExpireAt: pTimePtr(m, "expire_at"), RequireLogin: pInt(m, "require_login", 0), RequirePaid: pInt(m, "require_paid", 0),
			AllowDelete: pInt(m, "allow_delete", 0), AllowModify: pInt(m, "allow_modify", 0), AllowExpire: pInt(m, "allow_expire", 0),
			Remark: pStr(m, "remark"),
		}
		if err := tx.Select(
			"DataPoolID", "Name", "Code", "Content",
			"ModifyCount", "ModifiedCount",
			"ExpireAt", "RequireLogin", "RequirePaid",
			"AllowDelete", "AllowModify", "AllowExpire", "Remark",
		).Create(&it).Error; err != nil {
			return err
		}
		stats["data_items"]++
	}
	return nil
}

func portableImportFirewall(tx *gorm.DB, appCodeToID map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		code := pStr(m, "app_code")
		appID, ok := appCodeToID[code]
		if !ok {
			return fmt.Errorf("防火墙配置引用了未知的 app_code（与包内应用不一致）: %q", code)
		}
		f := models.FirewallConfig{
			AppID: appID, Enable: pInt(m, "enable", 0), IPWhitelistEnable: pInt(m, "ip_whitelist_enable", 0),
			IPWhitelist: pStr(m, "ip_whitelist"), IPConcurrentLimit: pInt(m, "ip_concurrent_limit", 0),
			IPRateLimitEnable: pInt(m, "ip_rate_limit_enable", 0), IPRateLimit: pInt(m, "ip_rate_limit", 60),
			IPRegionEnable: pInt(m, "ip_region_enable", 0), IPRegionMode: pInt(m, "ip_region_mode", 1),
			IPRegionList: pStr(m, "ip_region_list"), LoginFailLimit: pInt(m, "login_fail_limit", 0),
			LoginFailLockTime: pInt(m, "login_fail_lock_time", 30), CaptchaLoginEnable: pInt(m, "captcha_login_enable", 0),
			CaptchaLoginAfter: pInt(m, "captcha_login_after", 3), CaptchaRegEnable: pInt(m, "captcha_reg_enable", 0),
			CaptchaRechargeEnable: pInt(m, "captcha_recharge_enable", 0), CaptchaChangePwdEnable: pInt(m, "captcha_changepwd_enable", 0),
			APIRateLimitEnable: pInt(m, "api_rate_limit_enable", 0), APIRateLimit: pInt(m, "api_rate_limit", 100),
			HeartbeatCheckEnable: pInt(m, "heartbeat_check_enable", 0), HeartbeatTolerance: pInt(m, "heartbeat_tolerance", 30),
			ReplayCheckEnable: pInt(m, "replay_check_enable", 0), ReplayWindow: pInt(m, "replay_window", 60),
			AutoBanEnable: pInt(m, "auto_ban_enable", 0), AutoBanDuration: pInt(m, "auto_ban_duration", 1440),
			AutoBanIPOnFail: pInt(m, "auto_ban_ip_on_fail", 0), AutoBanIPOnRate: pInt(m, "auto_ban_ip_on_rate", 0),
		}
		if err := tx.Select(
			"AppID", "Enable", "IPWhitelistEnable", "IPWhitelist", "IPConcurrentLimit", "IPRateLimitEnable", "IPRateLimit",
			"IPRegionEnable", "IPRegionMode", "IPRegionList", "LoginFailLimit", "LoginFailLockTime",
			"CaptchaLoginEnable", "CaptchaLoginAfter", "CaptchaRegEnable", "CaptchaRechargeEnable", "CaptchaChangePwdEnable",
			"APIRateLimitEnable", "APIRateLimit", "HeartbeatCheckEnable", "HeartbeatTolerance",
			"ReplayCheckEnable", "ReplayWindow", "AutoBanEnable", "AutoBanDuration", "AutoBanIPOnFail", "AutoBanIPOnRate",
		).Create(&f).Error; err != nil {
			return err
		}
		stats["firewall_configs"]++
	}
	return nil
}

func portableImportAnnouncements(tx *gorm.DB, appCodeToID map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		appID, ok := appCodeToID[pStr(m, "app_code")]
		if !ok {
			continue
		}
		a := models.AppAnnouncement{AppID: appID, Title: pStr(m, "title"), Content: pStr(m, "content"), Status: pInt(m, "status", 1), Sort: pInt(m, "sort", 0)}
		if err := tx.Select("AppID", "Title", "Content", "Status", "Sort").Create(&a).Error; err != nil {
			return err
		}
		stats["app_announcements"]++
	}
	return nil
}

func portableImportVersions(tx *gorm.DB, appCodeToID map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		appID, ok := appCodeToID[pStr(m, "app_code")]
		if !ok {
			continue
		}
		v := models.AppVersion{
			AppID: appID, Version: pStr(m, "version"), CheckMD5: pInt(m, "check_md5", 0), MD5Value: pStr(m, "md5_value"),
			IsBeta: pInt(m, "is_beta", 0), IsDefault: pInt(m, "is_default", 0), Status: pInt(m, "status", 1),
			DownloadURL: pStr(m, "download_url"), Changelog: pStr(m, "changelog"), PublishedAt: pTimePtr(m, "published_at"),
			Remark: pStr(m, "remark"),
		}
		if err := tx.Select(
			"AppID", "Version", "CheckMD5", "MD5Value", "IsBeta", "IsDefault", "Status",
			"DownloadURL", "Changelog", "PublishedAt", "Remark",
		).Create(&v).Error; err != nil {
			return err
		}
		stats["app_versions"]++
	}
	return nil
}

func portableImportAgents(tx *gorm.DB, userID uint, appCodeToID map[string]uint, rows []interface{}, stats map[string]int) (map[string]uint, error) {
	refToID := make(map[string]uint)
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		ref := pStr(m, "agent_ref")
		appID, ok := appCodeToID[pStr(m, "app_code")]
		if !ok || ref == "" {
			continue
		}
		ag := models.Agent{
			UserID: userID, AppID: appID, Username: pStr(m, "username"), Password: pStr(m, "password"),
			Nickname: pStr(m, "nickname"), Balance: pFloat64(m, "balance"), QQ: pStr(m, "qq"), Phone: pStr(m, "phone"),
			Status: pInt(m, "status", 1), Remark: pStr(m, "remark"),
		}
		if err := tx.Select(
			"UserID", "AppID", "Username", "Password", "Nickname", "Balance", "QQ", "Phone", "Status", "Remark",
		).Create(&ag).Error; err != nil {
			return nil, err
		}
		refToID[ref] = ag.ID
		stats["agents"]++
	}
	return refToID, nil
}

func portableImportAgentCardTypes(tx *gorm.DB, agRef, ctRef map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		aid, ok1 := agRef[pStr(m, "agent_ref")]
		cid, ok2 := ctRef[pStr(m, "card_type_ref")]
		if !ok1 || !ok2 {
			continue
		}
		rec := models.AgentCardType{AgentID: aid, CardTypeID: cid, Price: pFloat64(m, "price")}
		if err := tx.Select("AgentID", "CardTypeID", "Price").Create(&rec).Error; err != nil {
			return err
		}
		stats["agent_card_types"]++
	}
	return nil
}

func portableImportAgentCardLogs(tx *gorm.DB, agRef, ctRef map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		aid, ok1 := agRef[pStr(m, "agent_ref")]
		cid, ok2 := ctRef[pStr(m, "card_type_ref")]
		if !ok1 || !ok2 {
			continue
		}
		rec := models.AgentCardLog{
			AgentID: aid, CardTypeID: cid, BatchNo: pStr(m, "batch_no"), Count: pInt(m, "count", 0),
			Price: pFloat64(m, "price"), TotalCost: pFloat64(m, "total_cost"), CreatedAt: pTimeRFC(m, "created_at"),
		}
		if err := tx.Select("AgentID", "CardTypeID", "BatchNo", "Count", "Price", "TotalCost", "CreatedAt").Create(&rec).Error; err != nil {
			return err
		}
		stats["agent_card_logs"]++
	}
	return nil
}

func portableImportAgentBalanceLogs(tx *gorm.DB, agRef map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		aid, ok := agRef[pStr(m, "agent_ref")]
		if !ok {
			continue
		}
		rec := models.AgentBalanceLog{
			AgentID: aid, Kind: pStr(m, "kind"), Amount: pFloat64(m, "amount"), BalanceAfter: pFloat64(m, "balance_after"),
			Ref: pStr(m, "ref"), Remark: pStr(m, "remark"), CreatedAt: pTimeRFC(m, "created_at"),
		}
		if err := tx.Select("AgentID", "Kind", "Amount", "BalanceAfter", "Ref", "Remark", "CreatedAt").Create(&rec).Error; err != nil {
			return err
		}
		stats["agent_balance_logs"]++
	}
	return nil
}

func portableImportAppUsersPass1(tx *gorm.DB, appCodeToID, agRef map[string]uint, rows []interface{}, stats map[string]int) (map[string]uint, error) {
	keyToID := make(map[string]uint)
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		code := pStr(m, "app_code")
		appID, ok := appCodeToID[code]
		if !ok {
			continue
		}
		u := models.AppUser{
			AppID: appID, Username: pStr(m, "username"), Password: pStr(m, "password"), Status: pInt(m, "status", 1),
			IsPaid: pInt(m, "is_paid", 0), IsTester: pInt(m, "is_tester", 0), ExpireAt: pTimePtr(m, "expire_at"),
			Points: pInt(m, "points", 0), Channels: pInt(m, "channels", 1), Features: pInt(m, "features", 1),
			UnbindDay: pInt(m, "unbind_day", -1), UnbindWeek: pInt(m, "unbind_week", -1), UnbindMonth: pInt(m, "unbind_month", -1),
			UnbindQuarter: pInt(m, "unbind_quarter", -1), UnbindHalfY: pInt(m, "unbind_halfy", -1), UnbindYear: pInt(m, "unbind_year", -1),
			UnbindTotal: pInt(m, "unbind_total", -1), ExtraData: pStr(m, "extra_data"), CloudData: pStr(m, "cloud_data"),
			RegFeature: pStr(m, "reg_feature"), InviteCode: pStr(m, "invite_code"), InviteCount: pInt(m, "invite_count", 0),
			RebatePoints: pInt(m, "rebate_points", 0), TotalRebate: pInt(m, "total_rebate", 0), QQ: pStr(m, "qq"),
			Wechat: pStr(m, "wechat"), Phone: pStr(m, "phone"), Email: pStr(m, "email"), IsCardUser: pInt(m, "is_card_user", 0),
			IsTrial: pInt(m, "is_trial", 0), RegIP: pStr(m, "reg_ip"), RegAddress: pStr(m, "reg_address"),
			LastRechargeAt: pTimePtr(m, "last_recharge_at"), FrozenAt: pTimePtr(m, "frozen_at"),
		}
		if ar, ok := m["agent_ref"].(string); ok && ar != "" {
			if aid, ok := agRef[ar]; ok {
				u.AgentID = &aid
			}
		}
		if err := tx.Select(
			"AppID", "AgentID", "Username", "Password", "Status", "IsPaid", "IsTester", "ExpireAt",
			"Points", "Channels", "Features", "UnbindDay", "UnbindWeek", "UnbindMonth", "UnbindQuarter",
			"UnbindHalfY", "UnbindYear", "UnbindTotal", "ExtraData", "CloudData", "RegFeature", "InviteCode",
			"InviteCount", "RebatePoints", "TotalRebate", "QQ", "Wechat", "Phone", "Email",
			"IsCardUser", "IsTrial", "RegIP", "RegAddress", "LastRechargeAt", "FrozenAt",
		).Create(&u).Error; err != nil {
			return nil, err
		}
		keyToID[code+"|"+u.Username] = u.ID
		stats["app_users"]++
	}
	return keyToID, nil
}

func portableImportAppUsersInviter(tx *gorm.DB, auKeyToID map[string]uint, rows []interface{}) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		inv := pStr(m, "inviter_username")
		if inv == "" {
			continue
		}
		code := pStr(m, "app_code")
		selfKey := code + "|" + pStr(m, "username")
		invKey := code + "|" + inv
		sid, ok1 := auKeyToID[selfKey]
		iid, ok2 := auKeyToID[invKey]
		if !ok1 || !ok2 {
			continue
		}
		tx.Model(&models.AppUser{}).Where("id = ?", sid).Update("inviter_id", iid)
	}
	return nil
}

func portableImportAppUserSub(tx *gorm.DB, appCodeToID, auKeyToID map[string]uint, rows []interface{}, stats map[string]int, kind string) error {
	_ = appCodeToID
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		code := pStr(m, "app_code")
		key := code + "|" + pStr(m, "username")
		uid, ok := auKeyToID[key]
		if !ok {
			continue
		}
		switch kind {
		case "data":
			d := models.AppUserData{AppUserID: uid, Key: pStr(m, "key"), Value: pStr(m, "value"), Remark: pStr(m, "remark"), ExpireAt: pTimePtr(m, "expire_at")}
			if err := tx.Create(&d).Error; err != nil {
				return err
			}
			stats["app_user_data"]++
		case "devices":
			d := models.AppUserDevice{AppUserID: uid, Feature: pStr(m, "feature"), Remark: pStr(m, "remark")}
			if err := tx.Create(&d).Error; err != nil {
				return err
			}
			stats["app_user_devices"]++
		}
	}
	return nil
}

func portableImportAppUserLogs(tx *gorm.DB, appCodeToID, auKeyToID map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		appID, ok := appCodeToID[pStr(m, "app_code")]
		if !ok {
			continue
		}
		key := pStr(m, "app_code") + "|" + pStr(m, "username")
		uid, ok := auKeyToID[key]
		if !ok {
			continue
		}
		lg := models.AppUserLog{
			AppID: appID, AppUserID: uid, Action: pStr(m, "action"), Detail: pStr(m, "detail"),
			IP: pStr(m, "ip"), CreatedAt: pTimeRFC(m, "created_at"),
		}
		if err := tx.Create(&lg).Error; err != nil {
			return err
		}
		stats["app_user_logs"]++
	}
	return nil
}

func portableImportUnbindLogs(tx *gorm.DB, auKeyToID map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		key := pStr(m, "app_code") + "|" + pStr(m, "username")
		uid, ok := auKeyToID[key]
		if !ok {
			continue
		}
		lg := models.AppUserUnbindLog{AppUserID: uid, Feature: pStr(m, "feature"), CreatedAt: pTimeRFC(m, "created_at")}
		if err := tx.Create(&lg).Error; err != nil {
			return err
		}
		stats["app_user_unbind_logs"]++
	}
	return nil
}

func portableImportCards(tx *gorm.DB, appCodeToID, ctRef, agRef, auKeyToID map[string]uint, rows []interface{}, stats map[string]int) (map[string]uint, error) {
	cardNoToID := make(map[string]uint)
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		code := pStr(m, "app_code")
		appID, ok := appCodeToID[code]
		if !ok {
			continue
		}
		ctID, ok := ctRef[pStr(m, "card_type_ref")]
		if !ok {
			return nil, fmt.Errorf("卡种引用缺失: %s", pStr(m, "card_type_ref"))
		}
		card := models.Card{
			AppID: appID, CardTypeID: ctID, CardNo: pStr(m, "card_no"), BatchNo: pStr(m, "batch_no"),
			Status: pInt(m, "status", 1), UsedCount: pInt(m, "used_count", 0), Remark: pStr(m, "remark"), UsedAt: pTimePtr(m, "used_at"),
		}
		if ar, ok := m["agent_ref"].(string); ok && ar != "" {
			if aid, ok := agRef[ar]; ok {
				card.AgentID = &aid
			}
		}
		if ub, ok := m["used_by_usernames"].(map[string]interface{}); ok && len(ub) > 0 {
			out := make(map[string]int)
			for uname, cnt := range ub {
				k := code + "|" + uname
				if newUID, ok := auKeyToID[k]; ok {
					out[strconv.FormatUint(uint64(newUID), 10)] = int(pFloat(cnt))
				}
			}
			if b, err := json.Marshal(out); err == nil && len(out) > 0 {
				card.UsedBy = string(b)
			}
		}
		if err := tx.Select(
			"AppID", "CardTypeID", "AgentID", "CardNo", "BatchNo", "Status", "UsedCount", "UsedBy", "Remark", "UsedAt",
		).Create(&card).Error; err != nil {
			return nil, err
		}
		if card.CardNo != "" {
			cardNoToID[card.CardNo] = card.ID
		}
		stats["cards"]++
	}
	return cardNoToID, nil
}

func portableImportCardUseLogs(tx *gorm.DB, appCodeToID, auKeyToID, cardNoToID map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		appID, ok := appCodeToID[pStr(m, "app_code")]
		if !ok {
			continue
		}
		key := pStr(m, "app_code") + "|" + pStr(m, "username")
		uid, ok := auKeyToID[key]
		if !ok {
			continue
		}
		cid, ok := cardNoToID[pStr(m, "card_no")]
		if !ok {
			continue
		}
		lg := models.CardUseLog{
			CardID: cid, AppID: appID, AppUserID: uid, Username: pStr(m, "username"), Action: pStr(m, "action"),
			IP: pStr(m, "ip"), Feature: pStr(m, "feature"), ClientID: pStr(m, "client_id"), ClientOS: pStr(m, "client_os"),
			CreatedAt: pTimeRFC(m, "created_at"),
		}
		if err := tx.Create(&lg).Error; err != nil {
			return err
		}
		stats["card_use_logs"]++
	}
	return nil
}


func portableImportBlacklists(tx *gorm.DB, userID uint, appCodeToID map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		appID, ok := appCodeToID[pStr(m, "app_code")]
		if !ok {
			continue
		}
		b := models.Blacklist{
			UserID: userID, AppID: appID, Type: pInt(m, "type", 1), Value: pStr(m, "value"),
			Remark: pStr(m, "remark"), ExpireAt: pTimePtr(m, "expire_at"),
		}
		if err := tx.Select("UserID", "AppID", "Type", "Value", "Remark", "ExpireAt").Create(&b).Error; err != nil {
			return err
		}
		stats["blacklists"]++
	}
	return nil
}

func portableImportLicenses(tx *gorm.DB, appCodeToID map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		appID, ok := appCodeToID[pStr(m, "app_code")]
		if !ok {
			continue
		}
		l := models.License{
			AppID: appID, Name: pStr(m, "name"), Certificate: pStr(m, "certificate"), EncryptedData: pStr(m, "encrypted_data"),
			MaxUse: pInt(m, "max_use", 0), UsedCount: pInt(m, "used_count", 0), BindFeature: pStr(m, "bind_feature"),
			Remark: pStr(m, "remark"), Status: pInt(m, "status", 1), ExpireAt: pTimePtr(m, "expire_at"),
		}
		if err := tx.Select(
			"AppID", "Name", "Certificate", "EncryptedData", "MaxUse", "UsedCount", "BindFeature", "Remark", "Status", "ExpireAt",
		).Create(&l).Error; err != nil {
			return err
		}
		stats["licenses"]++
	}
	return nil
}

func portableImportActivitiesBlock(tx *gorm.DB, userID uint, appCodeToID, ctRef map[string]uint, doc map[string]interface{}, stats map[string]int) error {
	actRefToID := make(map[string]uint)
	prizeKeyToID := make(map[string]uint)

	for _, x := range pArr(doc, "activities") {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		ref := pStr(m, "activity_ref")
		maxJoin := -1
		if v, ok := m["max_join"]; ok && v != nil {
			maxJoin = int(pFloat(v))
		}
		a := models.Activity{
			UserID: userID, Title: pStr(m, "title"), Type: pInt(m, "type", 1), Description: pStr(m, "description"),
			Cover: pStr(m, "cover"), StartAt: pTimePtr(m, "start_at"), EndAt: pTimePtr(m, "end_at"), DrawAt: pTimePtr(m, "draw_at"),
			MaxJoin: maxJoin, Status: pInt(m, "status", 1), Config: pStr(m, "config"),
		}
		if err := tx.Select(
			"UserID", "Title", "Type", "Description", "Cover", "StartAt", "EndAt", "DrawAt", "MaxJoin", "Status", "Config",
		).Create(&a).Error; err != nil {
			return err
		}
		if ref != "" {
			actRefToID[ref] = a.ID
		}
		stats["activities"]++
	}

	for _, x := range pArr(doc, "activity_prizes") {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		aref := pStr(m, "activity_ref")
		aid, ok := actRefToID[aref]
		if !ok {
			continue
		}
		stock := -1
		if v, ok := m["stock"]; ok && v != nil {
			stock = int(pFloat(v))
		}
		pz := models.ActivityPrize{
			ActivityID: aid, Name: pStr(m, "name"), Type: pInt(m, "type", 1), Content: pStr(m, "content"),
			Probability: pInt(m, "probability", 0), Stock: stock, Sort: pInt(m, "sort", 0),
		}
		if cr, ok := m["card_type_ref"].(string); ok && cr != "" {
			if cid, ok := ctRef[cr]; ok {
				pz.CardTypeID = &cid
			}
		}
		if err := tx.Select(
			"ActivityID", "Name", "Type", "Content", "CardTypeID", "Probability", "Stock", "Sort",
		).Create(&pz).Error; err != nil {
			return err
		}
		pkey := fmt.Sprintf("%s|%d", aref, int(pFloat(m["prize_index"])))
		prizeKeyToID[pkey] = pz.ID
		stats["activity_prizes"]++
	}

	for _, x := range pArr(doc, "activity_users") {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		aref := pStr(m, "activity_ref")
		aid, ok := actRefToID[aref]
		if !ok {
			continue
		}
		u := models.ActivityUser{AuthorID: userID, ActivityID: aid, Username: pStr(m, "username"), Password: pStr(m, "password")}
		if err := tx.Create(&u).Error; err != nil {
			return err
		}
		stats["activity_users"]++
	}

	for _, x := range pArr(doc, "activity_records") {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		aref := pStr(m, "activity_ref")
		aid, ok := actRefToID[aref]
		if !ok {
			continue
		}
		var au models.ActivityUser
		if tx.Where("author_id = ? AND activity_id = ? AND username = ?", userID, aid, pStr(m, "username")).First(&au).Error != nil {
			continue
		}
		pkey := fmt.Sprintf("%s|%d", aref, int(pFloat(m["prize_index"])))
		prizeID, ok := prizeKeyToID[pkey]
		if !ok {
			continue
		}
		rec := models.ActivityRecord{
			ActivityID: aid, ActivityUserID: au.ID, PrizeID: prizeID, PrizeName: pStr(m, "prize_name"),
			PrizeContent: pStr(m, "prize_content"), Status: pInt(m, "status", 1), IP: pStr(m, "ip"),
			CreatedAt: pTimeRFC(m, "created_at"),
		}
		if err := tx.Select(
			"ActivityID", "ActivityUserID", "PrizeID", "PrizeName", "PrizeContent", "Status", "IP", "CreatedAt",
		).Create(&rec).Error; err != nil {
			return err
		}
		stats["activity_records"]++
	}
	_ = appCodeToID
	return nil
}

func portableImportWithdrawKeys(tx *gorm.DB, userID uint, appCodeToID map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		appID, ok := appCodeToID[pStr(m, "app_code")]
		if !ok {
			continue
		}
		sk := pStr(m, "secret_key")
		if sk == "" {
			continue
		}
		var cnt int64
		tx.Model(&models.WithdrawKey{}).Where("secret_key = ?", sk).Count(&cnt)
		if cnt > 0 {
			continue
		}
		k := models.WithdrawKey{
			UserID: userID, AppID: appID, Name: pStr(m, "name"), SecretKey: sk, Quota: pFloat64(m, "quota"),
			UsedQuota: pFloat64(m, "used_quota"), Status: pInt(m, "status", 1), Remark: pStr(m, "remark"),
		}
		if err := tx.Select("UserID", "AppID", "Name", "SecretKey", "Quota", "UsedQuota", "Status", "Remark").Create(&k).Error; err != nil {
			return err
		}
		stats["withdraw_keys"]++
	}
	return nil
}

func portableImportWithdrawLogs(tx *gorm.DB, userID uint, appCodeToID, ctRef map[string]uint, cardNoToID map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		appID, ok := appCodeToID[pStr(m, "app_code")]
		if !ok {
			continue
		}
		var wk models.WithdrawKey
		if tx.Where("user_id = ? AND app_id = ? AND secret_key = ?", userID, appID, pStr(m, "withdraw_secret_key")).First(&wk).Error != nil {
			continue
		}
		ctID, ok := ctRef[pStr(m, "card_type_ref")]
		if !ok {
			continue
		}
		cid, ok := cardNoToID[pStr(m, "card_no")]
		if !ok {
			continue
		}
		wl := models.WithdrawLog{
			WithdrawKeyID: wk.ID, CardTypeID: ctID, CardID: cid, CardNo: pStr(m, "card_no"), Count: pInt(m, "count", 1),
			Price: pFloat64(m, "price"), TotalCost: pFloat64(m, "total_cost"), IP: pStr(m, "ip"), Remark: pStr(m, "remark"),
			CreatedAt: pTimeRFC(m, "created_at"),
		}
		if err := tx.Select(
			"WithdrawKeyID", "CardTypeID", "CardID", "CardNo", "Count", "Price", "TotalCost", "IP", "Remark", "CreatedAt",
		).Create(&wl).Error; err != nil {
			return err
		}
		stats["withdraw_logs"]++
	}
	return nil
}

func portableImportRebateLogs(tx *gorm.DB, userID uint, appCodeToID, auKeyToID map[string]uint, rows []interface{}, stats map[string]int) error {
	_ = appCodeToID
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		code := pStr(m, "app_code")
		k1 := code + "|" + pStr(m, "app_user_username")
		k2 := code + "|" + pStr(m, "from_username")
		uid1, ok1 := auKeyToID[k1]
		uid2, ok2 := auKeyToID[k2]
		if !ok1 || !ok2 {
			continue
		}
		rl := models.RebateLog{
			UserID: userID, AppUserID: uid1, FromUserID: uid2, Type: pInt(m, "type", 1), Amount: pInt(m, "amount", 0),
			SourceValue: pInt(m, "source_value", 0), Remark: pStr(m, "remark"), CreatedAt: pTimeRFC(m, "created_at"),
		}
		if err := tx.Select(
			"UserID", "AppUserID", "FromUserID", "Type", "Amount", "SourceValue", "Remark", "CreatedAt",
		).Create(&rl).Error; err != nil {
			return err
		}
		stats["rebate_logs"]++
	}
	return nil
}

func portableImportTrialLogs(tx *gorm.DB, appCodeToID, auKeyToID map[string]uint, rows []interface{}, stats map[string]int) error {
	for _, x := range rows {
		m, ok := x.(map[string]interface{})
		if !ok {
			continue
		}
		appID, ok := appCodeToID[pStr(m, "app_code")]
		if !ok {
			continue
		}
		key := pStr(m, "app_code") + "|" + pStr(m, "username")
		uid, ok := auKeyToID[key]
		if !ok {
			continue
		}
		tl := models.TrialFeatureLog{AppID: appID, Feature: pStr(m, "feature"), AppUserID: uid, CreatedAt: pTimeRFC(m, "created_at")}
		if err := tx.Create(&tl).Error; err != nil {
			return err
		}
		stats["trial_feature_logs"]++
	}
	return nil
}

func pArr(doc map[string]interface{}, key string) []interface{} {
	raw, ok := doc[key]
	if !ok || raw == nil {
		return nil
	}
	arr, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	return arr
}

func pStr(doc map[string]interface{}, key string) string {
	v, ok := doc[key]
	if !ok || v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	default:
		return fmt.Sprint(t)
	}
}

func pFloat(v interface{}) float64 {
	if v == nil {
		return 0
	}
	switch t := v.(type) {
	case float64:
		return t
	case int:
		return float64(t)
	case json.Number:
		f, _ := t.Float64()
		return f
	default:
		f, _ := strconv.ParseFloat(fmt.Sprint(t), 64)
		return f
	}
}

func pFloatKey(doc map[string]interface{}, key string) float64 {
	return pFloat(doc[key])
}

func pFloat64(doc map[string]interface{}, key string) float64 {
	return pFloat(doc[key])
}

func pInt(doc map[string]interface{}, key string, def int) int {
	if v, ok := doc[key]; ok && v != nil {
		return int(pFloat(v))
	}
	return def
}

func pTimePtr(doc map[string]interface{}, key string) *time.Time {
	s := pStr(doc, key)
	if s == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05Z07:00", "2006-01-02T15:04:05Z", "2006-01-02 15:04:05", "2006-01-02"} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

func pTimeRFC(doc map[string]interface{}, key string) time.Time {
	if t := pTimePtr(doc, key); t != nil {
		return *t
	}
	return time.Now()
}

