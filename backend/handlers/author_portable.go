package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"jike-auth/cache"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	portableFormatName = "jike_author_portable"
	portableFormatVer  = 1
	portableJSONName   = "author_data.json"
)

// ExportAuthorPortable 导出作者业务数据（不含任何数据库自增 ID，便于迁移到自建服后导入到当前账号）
func ExportAuthorPortable(c *gin.Context) {
	userID := c.GetUint("userID")
	var apps []models.App
	q := database.DB.Where("user_id = ?", userID).Order("id asc")
	if s := strings.TrimSpace(c.Query("app_codes")); s != "" {
		codes := strings.Split(s, ",")
		for i := range codes {
			codes[i] = strings.TrimSpace(codes[i])
		}
		q = q.Where("app_code IN ?", codes)
	}
	q.Find(&apps)
	if len(apps) == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "没有可导出的应用数据"})
		return
	}

	appIDs := make([]uint, len(apps))
	appCodeByID := make(map[uint]string, len(apps))
	for i, a := range apps {
		appIDs[i] = a.ID
		appCodeByID[a.ID] = a.AppCode
	}

	doc := map[string]interface{}{
		"format":        portableFormatName,
		"format_version": portableFormatVer,
		"exported_at":   time.Now().UTC().Format(time.RFC3339),
	}

	// 作者级配置（不含 user_id）
	var emailCfg models.EmailConfig
	if database.DB.Where("user_id = ?", userID).First(&emailCfg).Error == nil && emailCfg.ID != 0 {
		doc["email_config"] = map[string]interface{}{
			"smtp_host": emailCfg.SMTPHost, "smtp_port": emailCfg.SMTPPort,
			"smtp_user": emailCfg.SMTPUser, "smtp_pass": emailCfg.SMTPPass,
			"smtp_ssl": emailCfg.SMTPSSL, "from_name": emailCfg.FromName,
			"code_template": emailCfg.CodeTemplate,
		}
	}
	var rebateCfg models.RebateConfig
	if database.DB.Where("user_id = ?", userID).First(&rebateCfg).Error == nil && rebateCfg.ID != 0 {
		doc["rebate_config"] = map[string]interface{}{
			"enabled": rebateCfg.Enabled, "rate": rebateCfg.Rate, "reg_reward": rebateCfg.RegReward,
		}
	}
	var openKeys []models.OpenApiKey
	database.DB.Where("user_id = ?", userID).Order("id asc").Find(&openKeys)
	if len(openKeys) > 0 {
		oks := make([]map[string]interface{}, 0, len(openKeys))
		for _, k := range openKeys {
			oks = append(oks, map[string]interface{}{
				"name": k.Name, "secret_key": k.SecretKey, "permissions": k.Permissions, "status": k.Status,
				"last_used_at": portableTimePtr(k.LastUsedAt),
			})
		}
		doc["openapi_keys"] = oks
	}

	// 卡种 ref: app_code + "#" + 序号（按 id 排序）
	cardTypeRef := make(map[uint]string)
	var cardTypes []models.CardType
	database.DB.Where("app_id IN ?", appIDs).Order("app_id asc, id asc").Find(&cardTypes)
	byAppIdx := make(map[uint]int)
	for _, ct := range cardTypes {
		n := byAppIdx[ct.AppID]
		code := appCodeByID[ct.AppID]
		ref := fmt.Sprintf("%s#%d", code, n)
		byAppIdx[ct.AppID] = n + 1
		cardTypeRef[ct.ID] = ref
	}

	// 应用
	appArr := make([]map[string]interface{}, 0, len(apps))
	for _, a := range apps {
		appArr = append(appArr, portableAppFields(&a))
	}
	doc["apps"] = appArr

	// 防火墙
	var fws []models.FirewallConfig
	database.DB.Where("app_id IN ?", appIDs).Find(&fws)
	fwArr := make([]map[string]interface{}, 0, len(fws))
	for _, f := range fws {
		m := portableFirewallFields(&f)
		m["app_code"] = appCodeByID[f.AppID]
		fwArr = append(fwArr, m)
	}
	doc["firewall_configs"] = fwArr

	// 公告 / 版本
	var annos []models.AppAnnouncement
	database.DB.Where("app_id IN ?", appIDs).Order("app_id asc, sort asc, id asc").Find(&annos)
	doc["app_announcements"] = portableAnnouncements(annos, appCodeByID)
	var vers []models.AppVersion
	database.DB.Where("app_id IN ?", appIDs).Order("app_id asc, id asc").Find(&vers)
	doc["app_versions"] = portableVersions(vers, appCodeByID)

	// 卡种
	ctArr := make([]map[string]interface{}, 0, len(cardTypes))
	for _, ct := range cardTypes {
		row := portableCardTypeFields(&ct)
		row["app_code"] = appCodeByID[ct.AppID]
		row["card_type_ref"] = cardTypeRef[ct.ID]
		ctArr = append(ctArr, row)
	}
	doc["card_types"] = ctArr

	// 数据池 / 数据项
	poolRef := make(map[uint]string)
	var pools []models.DataPool
	database.DB.Where("app_id IN ?", appIDs).Order("app_id asc, id asc").Find(&pools)
	poolArr := make([]map[string]interface{}, 0, len(pools))
	seenCode := make(map[string]bool)
	for _, p := range pools {
		code := strings.TrimSpace(p.Code)
		if code == "" {
			code = fmt.Sprintf("__idx_%d", p.ID)
		}
		base := appCodeByID[p.AppID] + "/" + code
		for seenCode[base] {
			code = code + "_"
			base = appCodeByID[p.AppID] + "/" + code
		}
		seenCode[base] = true
		poolRef[p.ID] = base
		row := portableDataPoolFields(&p)
		row["app_code"] = appCodeByID[p.AppID]
		row["pool_ref"] = base
		poolArr = append(poolArr, row)
	}
	doc["data_pools"] = poolArr

	var items []models.DataItem
	if len(poolRef) > 0 {
		ids := make([]uint, 0, len(poolRef))
		for id := range poolRef {
			ids = append(ids, id)
		}
		database.DB.Where("data_pool_id IN ?", ids).Order("data_pool_id asc, id asc").Find(&items)
	}
	itemArr := make([]map[string]interface{}, 0, len(items))
	seenItem := make(map[string]bool)
	for _, it := range items {
		pr := poolRef[it.DataPoolID]
		icode := strings.TrimSpace(it.Code)
		if icode == "" {
			icode = fmt.Sprintf("__i_%d", it.ID)
		}
		iref := pr + "@" + icode
		for seenItem[iref] {
			icode = icode + "_"
			iref = pr + "@" + icode
		}
		seenItem[iref] = true
		row := portableDataItemFields(&it)
		row["pool_ref"] = pr
		row["item_ref"] = iref
		itemArr = append(itemArr, row)
	}
	doc["data_items"] = itemArr

	// 代理
	agentRef := make(map[uint]string)
	var agents []models.Agent
	database.DB.Where("user_id = ? AND app_id IN ?", userID, appIDs).Order("app_id asc, id asc").Find(&agents)
	agArr := make([]map[string]interface{}, 0, len(agents))
	for _, ag := range agents {
		ref := fmt.Sprintf("%s|%s", appCodeByID[ag.AppID], ag.Username)
		agentRef[ag.ID] = ref
		row := portableAgentFields(&ag)
		row["app_code"] = appCodeByID[ag.AppID]
		row["agent_ref"] = ref
		agArr = append(agArr, row)
	}
	doc["agents"] = agArr

	var agCT []models.AgentCardType
	if len(agentRef) > 0 {
		aids := make([]uint, 0, len(agentRef))
		for id := range agentRef {
			aids = append(aids, id)
		}
		database.DB.Where("agent_id IN ?", aids).Find(&agCT)
	}
	agctArr := make([]map[string]interface{}, 0, len(agCT))
	for _, x := range agCT {
		agctArr = append(agctArr, map[string]interface{}{
			"agent_ref":      agentRef[x.AgentID],
			"card_type_ref": cardTypeRef[x.CardTypeID],
			"price":         x.Price,
		})
	}
	doc["agent_card_types"] = agctArr

	var agLogs []models.AgentCardLog
	var agBal []models.AgentBalanceLog
	if len(agentRef) > 0 {
		aids := make([]uint, 0, len(agentRef))
		for id := range agentRef {
			aids = append(aids, id)
		}
		database.DB.Where("agent_id IN ?", aids).Order("id asc").Find(&agLogs)
		database.DB.Where("agent_id IN ?", aids).Order("id asc").Find(&agBal)
	}
	doc["agent_card_logs"] = portableAgentCardLogs(agLogs, agentRef, cardTypeRef)
	doc["agent_balance_logs"] = portableAgentBalanceLogs(agBal, agentRef)

	// 软件用户：用户名映射（用于 used_by、返利等）
	auIDToName := make(map[uint]string)
	var appUsers []models.AppUser
	database.DB.Where("app_id IN ?", appIDs).Order("app_id asc, id asc").Find(&appUsers)
	for _, u := range appUsers {
		auIDToName[u.ID] = u.Username
	}

	doc["app_users"] = portableAppUsers(appUsers, appCodeByID, agentRef, auIDToName)
	doc["app_user_data"] = portableExportAppUserData(appIDs, appCodeByID, auIDToName)
	doc["app_user_devices"] = portableExportAppUserDevices(appIDs, appCodeByID, auIDToName)
	doc["app_user_logs"] = portableExportAppUserLogs(appIDs, appCodeByID, auIDToName)
	doc["app_user_unbind_logs"] = portableExportUnbindLogs(appIDs, appCodeByID, auIDToName)

	doc["cards"] = portableCards(database.DB, appIDs, appCodeByID, cardTypeRef, agentRef, auIDToName)
	doc["card_use_logs"] = portableCardUseLogs(appIDs, appCodeByID, auIDToName)

	var lic []models.License
	database.DB.Where("app_id IN ?", appIDs).Order("app_id asc, id asc").Find(&lic)
	doc["licenses"] = portableLicenses(lic, appCodeByID)

	var bl []models.Blacklist
	database.DB.Where("user_id = ? AND app_id IN ?", userID, appIDs).Order("id asc").Find(&bl)
	doc["blacklists"] = portableBlacklists(bl, appCodeByID)

	// 活动：按 id 排序后给 activity_ref = act0, act1...
	var activities []models.Activity
	database.DB.Where("user_id = ?", userID).Order("id asc").Find(&activities)
	actRefByID := make(map[uint]string)
	for i, a := range activities {
		actRefByID[a.ID] = fmt.Sprintf("act%d", i)
	}
	doc["activities"] = portableActivities(activities, actRefByID)

	var prizes []models.ActivityPrize
	if len(actRefByID) > 0 {
		ids := make([]uint, 0, len(actRefByID))
		for id := range actRefByID {
			ids = append(ids, id)
		}
		database.DB.Where("activity_id IN ?", ids).Order("activity_id asc, sort asc, id asc").Find(&prizes)
	}
	doc["activity_prizes"] = portableActivityPrizes(prizes, actRefByID, cardTypeRef)

	var actUsers []models.ActivityUser
	database.DB.Where("author_id = ?", userID).Order("id asc").Find(&actUsers)
	doc["activity_users"] = portableActivityUsers(actUsers, actRefByID)

	var actRec []models.ActivityRecord
	if len(actRefByID) > 0 {
		ids := make([]uint, 0, len(actRefByID))
		for id := range actRefByID {
			ids = append(ids, id)
		}
		database.DB.Where("activity_id IN ?", ids).Order("id asc").Find(&actRec)
	}
	doc["activity_records"] = portableActivityRecords(actRec, actRefByID)

	doc["withdraw_keys"] = portableWithdrawKeys(userID, appIDs, appCodeByID)
	doc["withdraw_logs"] = portableWithdrawLogs(userID, appIDs, appCodeByID, cardTypeRef, auIDToName)

	var rlogs []models.RebateLog
	database.DB.Where("user_id = ?", userID).Order("id asc").Find(&rlogs)
	doc["rebate_logs"] = portableRebateLogs(rlogs, appCodeByID, auIDToName)

	var trials []models.TrialFeatureLog
	database.DB.Where("app_id IN ?", appIDs).Order("id asc").Find(&trials)
	doc["trial_feature_logs"] = portableTrialLogs(trials, appCodeByID, auIDToName)

	raw, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "序列化失败"})
		return
	}
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)
	w, err := zw.Create(portableJSONName)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "创建压缩包失败"})
		return
	}
	if _, err := w.Write(raw); err != nil {
		zw.Close()
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "写入压缩包失败"})
		return
	}
	zw.Close()
	fn := fmt.Sprintf("jike_author_data_%s.zip", time.Now().Format("2006-01-02"))
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", fn))
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

func portableTimePtr(t *time.Time) interface{} {
	if t == nil {
		return nil
	}
	return t.UTC().Format(time.RFC3339)
}

func portableAppFields(a *models.App) map[string]interface{} {
	return map[string]interface{}{
		"app_name": a.AppName, "app_key": a.AppKey, "app_code": a.AppCode, "app_secret": a.AppSecret,
		"description": a.Description, "login_mode": a.LoginMode, "billing_mode": a.BillingMode,
		"heartbeat": a.Heartbeat, "crypto_mode": a.CryptoMode, "sign_algo": a.SignAlgo,
		"server_sign_algo": a.ServerSignAlgo, "bind_device": a.BindDevice, "channel_mode": a.ChannelMode,
		"login_kick": a.LoginKick, "reg_mode": a.RegMode, "reg_limit": a.RegLimit,
		"reg_channels": a.RegChannels, "reg_features": a.RegFeatures, "reg_duration": a.RegDuration,
		"reg_points": a.RegPoints, "trial_duration": a.TrialDuration, "trial_points": a.TrialPoints,
		"trial_limit": a.TrialLimit, "maintenance": a.Maintenance, "status": a.Status,
	}
}

func portableFirewallFields(f *models.FirewallConfig) map[string]interface{} {
	return map[string]interface{}{
		"enable": f.Enable, "ip_whitelist_enable": f.IPWhitelistEnable, "ip_whitelist": f.IPWhitelist,
		"ip_concurrent_limit": f.IPConcurrentLimit, "ip_rate_limit_enable": f.IPRateLimitEnable,
		"ip_rate_limit": f.IPRateLimit, "ip_region_enable": f.IPRegionEnable, "ip_region_mode": f.IPRegionMode,
		"ip_region_list": f.IPRegionList, "login_fail_limit": f.LoginFailLimit, "login_fail_lock_time": f.LoginFailLockTime,
		"captcha_login_enable": f.CaptchaLoginEnable, "captcha_login_after": f.CaptchaLoginAfter,
		"captcha_reg_enable": f.CaptchaRegEnable, "captcha_recharge_enable": f.CaptchaRechargeEnable,
		"captcha_changepwd_enable": f.CaptchaChangePwdEnable, "api_rate_limit_enable": f.APIRateLimitEnable,
		"api_rate_limit": f.APIRateLimit, "heartbeat_check_enable": f.HeartbeatCheckEnable,
		"heartbeat_tolerance": f.HeartbeatTolerance, "replay_check_enable": f.ReplayCheckEnable,
		"replay_window": f.ReplayWindow, "auto_ban_enable": f.AutoBanEnable, "auto_ban_duration": f.AutoBanDuration,
		"auto_ban_ip_on_fail": f.AutoBanIPOnFail, "auto_ban_ip_on_rate": f.AutoBanIPOnRate,
	}
}

func portableAnnouncements(annos []models.AppAnnouncement, appCode map[uint]string) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(annos))
	for _, a := range annos {
		out = append(out, map[string]interface{}{
			"app_code": appCode[a.AppID], "title": a.Title, "content": a.Content,
			"status": a.Status, "sort": a.Sort,
		})
	}
	return out
}

func portableVersions(vers []models.AppVersion, appCode map[uint]string) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(vers))
	for _, v := range vers {
		out = append(out, map[string]interface{}{
			"app_code": appCode[v.AppID], "version": v.Version, "check_md5": v.CheckMD5, "md5_value": v.MD5Value,
			"is_beta": v.IsBeta, "is_default": v.IsDefault, "status": v.Status, "download_url": v.DownloadURL,
			"changelog": v.Changelog, "published_at": portableTimePtr(v.PublishedAt), "remark": v.Remark,
		})
	}
	return out
}

func portableCardTypeFields(ct *models.CardType) map[string]interface{} {
	return map[string]interface{}{
		"category": ct.Category, "name": ct.Name, "prefix": ct.Prefix, "points": ct.Points, "rebate_points": ct.RebatePoints, "duration": ct.Duration,
		"gen_rule": ct.GenRule, "max_use": ct.MaxUse, "max_user_use": ct.MaxUserUse, "channels": ct.Channels,
		"features": ct.Features, "unbind_day": ct.UnbindDay, "unbind_week": ct.UnbindWeek, "unbind_month": ct.UnbindMonth,
		"unbind_quarter": ct.UnbindQuarter, "unbind_halfy": ct.UnbindHalfY, "unbind_year": ct.UnbindYear,
		"unbind_total": ct.UnbindTotal, "card_length": ct.CardLength, "extra_data": ct.ExtraData, "remark": ct.Remark,
		"withdraw_price": ct.WithdrawPrice,
	}
}

func portableDataPoolFields(p *models.DataPool) map[string]interface{} {
	return map[string]interface{}{
		"name": p.Name, "code": p.Code, "sort": p.Sort, "require_login": p.RequireLogin, "remark": p.Remark,
	}
}

func portableDataItemFields(it *models.DataItem) map[string]interface{} {
	return map[string]interface{}{
		"name": it.Name, "code": it.Code, "content": it.Content, "modify_count": it.ModifyCount,
		"modified_count": it.ModifiedCount, "expire_at": portableTimePtr(it.ExpireAt), "require_login": it.RequireLogin,
		"require_paid": it.RequirePaid, "allow_delete": it.AllowDelete, "allow_modify": it.AllowModify,
		"allow_expire": it.AllowExpire, "remark": it.Remark,
	}
}

func portableAgentFields(ag *models.Agent) map[string]interface{} {
	return map[string]interface{}{
		"username": ag.Username, "password": ag.Password, "nickname": ag.Nickname, "balance": ag.Balance,
		"qq": ag.QQ, "phone": ag.Phone, "status": ag.Status, "remark": ag.Remark,
	}
}

func portableAgentCardLogs(logs []models.AgentCardLog, agentRef, ctRef map[uint]string) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(logs))
	for _, l := range logs {
		out = append(out, map[string]interface{}{
			"agent_ref": agentRef[l.AgentID], "card_type_ref": ctRef[l.CardTypeID], "batch_no": l.BatchNo,
			"count": l.Count, "price": l.Price, "total_cost": l.TotalCost, "created_at": l.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out
}

func portableAgentBalanceLogs(logs []models.AgentBalanceLog, agentRef map[uint]string) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(logs))
	for _, l := range logs {
		out = append(out, map[string]interface{}{
			"agent_ref": agentRef[l.AgentID], "kind": l.Kind, "amount": l.Amount, "balance_after": l.BalanceAfter,
			"ref": l.Ref, "remark": l.Remark, "created_at": l.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out
}

func portableAppUsers(users []models.AppUser, appCode map[uint]string, agentRef map[uint]string, idToName map[uint]string) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(users))
	for _, u := range users {
		row := map[string]interface{}{
			"app_code": appCode[u.AppID], "username": u.Username, "password": u.Password, "status": u.Status,
			"is_paid": u.IsPaid, "is_tester": u.IsTester, "expire_at": portableTimePtr(u.ExpireAt),
			"points": u.Points, "channels": u.Channels, "features": u.Features,
			"unbind_day": u.UnbindDay, "unbind_week": u.UnbindWeek, "unbind_month": u.UnbindMonth,
			"unbind_quarter": u.UnbindQuarter, "unbind_halfy": u.UnbindHalfY, "unbind_year": u.UnbindYear,
			"unbind_total": u.UnbindTotal, "extra_data": u.ExtraData, "cloud_data": u.CloudData,
			"reg_feature": u.RegFeature, "invite_code": u.InviteCode, "invite_count": u.InviteCount,
			"rebate_points": u.RebatePoints, "total_rebate": u.TotalRebate, "qq": u.QQ, "wechat": u.Wechat,
			"phone": u.Phone, "email": u.Email, "is_card_user": u.IsCardUser, "is_trial": u.IsTrial,
			"reg_ip": u.RegIP, "reg_address": u.RegAddress, "last_recharge_at": portableTimePtr(u.LastRechargeAt),
			"frozen_at": portableTimePtr(u.FrozenAt),
		}
		if u.AgentID != nil {
			if r, ok := agentRef[*u.AgentID]; ok {
				row["agent_ref"] = r
			}
		}
		if u.InviterID != nil {
			if name, ok := idToName[*u.InviterID]; ok {
				row["inviter_username"] = name
			}
		}
		out = append(out, row)
	}
	return out
}

func portableExportAppUserData(appIDs []uint, appCode map[uint]string, auName map[uint]string) []map[string]interface{} {
	var rows []models.AppUserData
	database.DB.Where("app_user_id IN (SELECT id FROM app_users WHERE app_id IN ?)", appIDs).Order("id asc").Find(&rows)
	out := make([]map[string]interface{}, 0, len(rows))
	for _, d := range rows {
		var au models.AppUser
		if database.DB.Select("app_id", "username").First(&au, d.AppUserID).Error != nil {
			continue
		}
		out = append(out, map[string]interface{}{
			"app_code": appCode[au.AppID], "username": au.Username, "key": d.Key, "value": d.Value,
			"remark": d.Remark, "expire_at": portableTimePtr(d.ExpireAt),
		})
	}
	_ = auName
	return out
}

func portableExportAppUserDevices(appIDs []uint, appCode map[uint]string, auName map[uint]string) []map[string]interface{} {
	var rows []models.AppUserDevice
	database.DB.Where("app_user_id IN (SELECT id FROM app_users WHERE app_id IN ?)", appIDs).Order("id asc").Find(&rows)
	out := make([]map[string]interface{}, 0, len(rows))
	for _, d := range rows {
		var au models.AppUser
		if database.DB.Select("app_id", "username").First(&au, d.AppUserID).Error != nil {
			continue
		}
		out = append(out, map[string]interface{}{
			"app_code": appCode[au.AppID], "username": au.Username, "feature": d.Feature, "remark": d.Remark,
		})
	}
	_ = auName
	return out
}

func portableExportAppUserLogs(appIDs []uint, appCode map[uint]string, auName map[uint]string) []map[string]interface{} {
	var rows []models.AppUserLog
	database.DB.Where("app_id IN ?", appIDs).Order("id asc").Find(&rows)
	out := make([]map[string]interface{}, 0, len(rows))
	for _, lg := range rows {
		uname := auName[lg.AppUserID]
		out = append(out, map[string]interface{}{
			"app_code": appCode[lg.AppID], "username": uname, "action": lg.Action, "detail": lg.Detail,
			"ip": lg.IP, "created_at": lg.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out
}

func portableExportUnbindLogs(appIDs []uint, appCode map[uint]string, auName map[uint]string) []map[string]interface{} {
	var rows []models.AppUserUnbindLog
	database.DB.Where("app_user_id IN (SELECT id FROM app_users WHERE app_id IN ?)", appIDs).Order("id asc").Find(&rows)
	out := make([]map[string]interface{}, 0, len(rows))
	for _, lg := range rows {
		var au models.AppUser
		if database.DB.Select("app_id", "username").First(&au, lg.AppUserID).Error != nil {
			continue
		}
		_ = auName
		out = append(out, map[string]interface{}{
			"app_code": appCode[au.AppID], "username": au.Username, "feature": lg.Feature,
			"created_at": lg.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out
}

func portableCards(db *gorm.DB, appIDs []uint, appCode map[uint]string, ctRef, agRef map[uint]string, auName map[uint]string) []map[string]interface{} {
	var cards []models.Card
	db.Where("app_id IN ?", appIDs).Order("app_id asc, id asc").Find(&cards)
	out := make([]map[string]interface{}, 0, len(cards))
	for _, card := range cards {
		row := map[string]interface{}{
			"app_code": appCode[card.AppID], "card_no": card.CardNo, "card_type_ref": ctRef[card.CardTypeID],
			"batch_no": card.BatchNo, "status": card.Status, "used_count": card.UsedCount, "remark": card.Remark,
			"used_at": portableTimePtr(card.UsedAt),
		}
		if card.AgentID != nil {
			if r, ok := agRef[*card.AgentID]; ok {
				row["agent_ref"] = r
			}
		}
		if card.UsedBy != "" {
			var m map[string]int
			if json.Unmarshal([]byte(card.UsedBy), &m) == nil {
				ub := make(map[string]int)
				for uidStr, n := range m {
					uid, err := strconv.ParseUint(uidStr, 10, 32)
					if err != nil {
						continue
					}
					if name, ok := auName[uint(uid)]; ok {
						ub[name] = n
					}
				}
				row["used_by_usernames"] = ub
			}
		}
		out = append(out, row)
	}
	return out
}

func portableCardUseLogs(appIDs []uint, appCode map[uint]string, auName map[uint]string) []map[string]interface{} {
	var logs []models.CardUseLog
	database.DB.Where("app_id IN ?", appIDs).Order("id asc").Find(&logs)
	var cards []models.Card
	database.DB.Where("app_id IN ?", appIDs).Find(&cards)
	cardNoByID := make(map[uint]string, len(cards))
	for _, c := range cards {
		cardNoByID[c.ID] = c.CardNo
	}
	out := make([]map[string]interface{}, 0, len(logs))
	for _, l := range logs {
		out = append(out, map[string]interface{}{
			"app_code": appCode[l.AppID], "card_no": cardNoByID[l.CardID], "username": auName[l.AppUserID],
			"action": l.Action, "ip": l.IP, "feature": l.Feature, "client_id": l.ClientID, "client_os": l.ClientOS,
			"created_at": l.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out
}

func portableLicenses(lic []models.License, appCode map[uint]string) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(lic))
	for _, x := range lic {
		out = append(out, map[string]interface{}{
			"app_code": appCode[x.AppID], "name": x.Name, "certificate": x.Certificate, "encrypted_data": x.EncryptedData,
			"max_use": x.MaxUse, "used_count": x.UsedCount, "bind_feature": x.BindFeature, "remark": x.Remark,
			"status": x.Status, "expire_at": portableTimePtr(x.ExpireAt),
		})
	}
	return out
}

func portableBlacklists(bl []models.Blacklist, appCode map[uint]string) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(bl))
	for _, b := range bl {
		out = append(out, map[string]interface{}{
			"app_code": appCode[b.AppID], "type": b.Type, "value": b.Value, "remark": b.Remark,
			"expire_at": portableTimePtr(b.ExpireAt),
		})
	}
	return out
}

func portableActivities(acts []models.Activity, ref map[uint]string) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(acts))
	for _, a := range acts {
		out = append(out, map[string]interface{}{
			"activity_ref": ref[a.ID], "title": a.Title, "type": a.Type, "description": a.Description,
			"cover": a.Cover, "start_at": portableTimePtr(a.StartAt), "end_at": portableTimePtr(a.EndAt),
			"draw_at": portableTimePtr(a.DrawAt), "max_join": a.MaxJoin, "status": a.Status, "config": a.Config,
		})
	}
	return out
}

func portableActivityPrizes(prizes []models.ActivityPrize, actRef map[uint]string, ctRef map[uint]string) []map[string]interface{} {
	byAct := make(map[uint][]*models.ActivityPrize)
	for i := range prizes {
		p := &prizes[i]
		byAct[p.ActivityID] = append(byAct[p.ActivityID], p)
	}
	out := make([]map[string]interface{}, 0, len(prizes))
	for actID, list := range byAct {
		sort.Slice(list, func(i, j int) bool { return list[i].ID < list[j].ID })
		for idx, pr := range list {
			row := map[string]interface{}{
				"activity_ref": actRef[actID], "prize_index": idx, "name": pr.Name, "type": pr.Type,
				"content": pr.Content, "probability": pr.Probability, "stock": pr.Stock, "sort": pr.Sort,
			}
			if pr.CardTypeID != nil {
				row["card_type_ref"] = ctRef[*pr.CardTypeID]
			}
			out = append(out, row)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		ai := fmt.Sprint(out[i]["activity_ref"])
		aj := fmt.Sprint(out[j]["activity_ref"])
		if ai != aj {
			return ai < aj
		}
		pi, pj := 0.0, 0.0
		switch v := out[i]["prize_index"].(type) {
		case float64:
			pi = v
		case int:
			pi = float64(v)
		}
		switch v := out[j]["prize_index"].(type) {
		case float64:
			pj = v
		case int:
			pj = float64(v)
		}
		return pi < pj
	})
	return out
}

func portableActivityUsers(users []models.ActivityUser, actRef map[uint]string) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(users))
	for _, u := range users {
		out = append(out, map[string]interface{}{
			"activity_ref": actRef[u.ActivityID], "username": u.Username, "password": u.Password,
		})
	}
	return out
}

func portableActivityRecords(recs []models.ActivityRecord, actRef map[uint]string) []map[string]interface{} {
	if len(recs) == 0 {
		return nil
	}
	prizeIDs := make([]uint, 0, len(recs))
	auIDs := make([]uint, 0, len(recs))
	for _, r := range recs {
		prizeIDs = append(prizeIDs, r.PrizeID)
		auIDs = append(auIDs, r.ActivityUserID)
	}
	var prizes []models.ActivityPrize
	database.DB.Where("id IN ?", prizeIDs).Find(&prizes)
	prizeIdxByID := make(map[uint]int)
	byAct := make(map[uint][]models.ActivityPrize)
	for _, p := range prizes {
		byAct[p.ActivityID] = append(byAct[p.ActivityID], p)
	}
	for _, list := range byAct {
		sort.Slice(list, func(i, j int) bool { return list[i].ID < list[j].ID })
		for idx, pr := range list {
			prizeIdxByID[pr.ID] = idx
		}
	}
	var aus []models.ActivityUser
	database.DB.Where("id IN ?", auIDs).Find(&aus)
	auName := make(map[uint]string)
	for _, u := range aus {
		auName[u.ID] = u.Username
	}
	out := make([]map[string]interface{}, 0, len(recs))
	for _, r := range recs {
		out = append(out, map[string]interface{}{
			"activity_ref": actRef[r.ActivityID], "username": auName[r.ActivityUserID], "prize_index": prizeIdxByID[r.PrizeID],
			"prize_name": r.PrizeName, "prize_content": r.PrizeContent, "status": r.Status, "ip": r.IP,
			"created_at": r.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out
}

func portableWithdrawKeys(userID uint, appIDs []uint, appCode map[uint]string) []map[string]interface{} {
	var keys []models.WithdrawKey
	database.DB.Where("user_id = ? AND app_id IN ?", userID, appIDs).Order("id asc").Find(&keys)
	out := make([]map[string]interface{}, 0, len(keys))
	for _, k := range keys {
		out = append(out, map[string]interface{}{
			"app_code": appCode[k.AppID], "name": k.Name, "secret_key": k.SecretKey, "quota": k.Quota,
			"used_quota": k.UsedQuota, "status": k.Status, "remark": k.Remark,
		})
	}
	return out
}

func portableWithdrawLogs(userID uint, appIDs []uint, appCode map[uint]string, ctRef map[uint]string, auName map[uint]string) []map[string]interface{} {
	var logs []models.WithdrawLog
	database.DB.Where("withdraw_key_id IN (SELECT id FROM withdraw_keys WHERE user_id = ? AND app_id IN ?)", userID, appIDs).Order("id asc").Find(&logs)
	out := make([]map[string]interface{}, 0, len(logs))
	for _, l := range logs {
		var wk models.WithdrawKey
		if database.DB.Select("app_id", "secret_key").First(&wk, l.WithdrawKeyID).Error != nil {
			continue
		}
		row := map[string]interface{}{
			"app_code": appCode[wk.AppID], "withdraw_secret_key": wk.SecretKey,
			"card_type_ref": ctRef[l.CardTypeID], "card_no": "", "count": l.Count, "price": l.Price,
			"total_cost": l.TotalCost, "ip": l.IP, "remark": l.Remark, "created_at": l.CreatedAt.UTC().Format(time.RFC3339),
		}
		var card models.Card
		if database.DB.Select("card_no").First(&card, l.CardID).Error == nil {
			row["card_no"] = card.CardNo
		}
		_ = auName
		out = append(out, row)
	}
	return out
}

func portableRebateLogs(logs []models.RebateLog, appCode map[uint]string, auName map[uint]string) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(logs))
	for _, l := range logs {
		var au, fu models.AppUser
		appCodeStr := ""
		database.DB.Select("app_id", "username").First(&au, l.AppUserID)
		database.DB.Select("app_id", "username").First(&fu, l.FromUserID)
		if au.AppID != 0 {
			appCodeStr = appCode[au.AppID]
		}
		out = append(out, map[string]interface{}{
			"app_code": appCodeStr, "app_user_username": au.Username, "from_username": fu.Username,
			"type": l.Type, "amount": l.Amount, "source_value": l.SourceValue, "remark": l.Remark,
			"created_at": l.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out
}

func portableTrialLogs(logs []models.TrialFeatureLog, appCode map[uint]string, auName map[uint]string) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(logs))
	for _, l := range logs {
		out = append(out, map[string]interface{}{
			"app_code": appCode[l.AppID], "feature": l.Feature, "username": auName[l.AppUserID],
			"created_at": l.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out
}

func clearAppCachesForCodes(codes []string) {
	if !cache.Enabled {
		return
	}
	for _, code := range codes {
		cache.Del("app:" + code)
	}
}

// clearFirewallCachesForImportedApps 与 SaveFirewallConfig 一致，避免 Redis 中残留 fw:config（导入后应读到库里的新配置）
func clearFirewallCachesForImportedApps(userID uint, appCodes []string) {
	if !cache.Enabled || len(appCodes) == 0 {
		return
	}
	var ids []uint
	database.DB.Model(&models.App{}).Where("user_id = ? AND app_code IN ?", userID, appCodes).Pluck("id", &ids)
	for _, id := range ids {
		cache.Del(fmt.Sprintf("fw:config:%d", id))
	}
}
