package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"jike-auth/cache"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ========== 内存缓存（Redis 未启用时的降级方案） ==========
// 单实例部署可以使用这些内存缓存；多实例部署必须启用 Redis，否则频控/重放/锁定状态无法共享。

var ipRateCache = struct {
	sync.RWMutex
	data map[string]*rateBucket
}{data: make(map[string]*rateBucket)}

type rateBucket struct {
	Count   int
	ResetAt time.Time
}

var apiRateCache = struct {
	sync.RWMutex
	data map[string]*rateBucket
}{data: make(map[string]*rateBucket)}

var replayCache = struct {
	sync.RWMutex
	data map[string]time.Time
}{data: make(map[string]time.Time)}

var sdkLoginFailCache = struct {
	sync.RWMutex
	data map[string]*loginFailBucket
}{data: make(map[string]*loginFailBucket)}

type loginFailBucket struct {
	Count  int
	LockAt time.Time
}

// 单IP并发连接数计数器
var ipConcurrentCache = struct {
	sync.Mutex
	data map[string]int
}{data: make(map[string]int)}

// ========== 辅助函数 ==========

func getClientIP(c *gin.Context) string {
	// 如果前面有 Nginx/CDN，需要确保可信代理正确透传 X-Forwarded-For 或 X-Real-IP。
	xff := c.GetHeader("X-Forwarded-For")
	if xff != "" {
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}
	xri := c.GetHeader("X-Real-IP")
	if xri != "" {
		return xri
	}
	return c.ClientIP()
}

func extractAppKey(c *gin.Context) string {
	// 防火墙在 handler 之前运行，只能从 query 或原始 body 中预读取 app_code。
	// 读取后必须把 Body 填回去，否则后续 handler 无法再次读取请求体。
	appCode := c.Query("app_code")
	if appCode != "" {
		return appCode
	}
	bodyBytes, err := c.GetRawData()
	if err != nil || len(bodyBytes) == 0 {
		return ""
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	var req struct {
		AppCode string `json:"app_code"`
	}
	json.Unmarshal(bodyBytes, &req)
	return req.AppCode
}

func extractUUID(c *gin.Context) string {
	// 重放检测使用明文请求体中的 uuid；加密请求的 uuid 在 data 内，无法在中间件阶段读取。
	// 因此加密 SDK 的更细粒度重放防护需要在解密后的业务层补充。
	bodyBytes, err := c.GetRawData()
	if err != nil || len(bodyBytes) == 0 {
		return ""
	}
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	var req struct {
		UUID string `json:"uuid"`
		Data string `json:"data"`
	}
	json.Unmarshal(bodyBytes, &req)
	return req.UUID
}

func resolveAppID(c *gin.Context) uint {
	// 优先通过 app_code 定位应用；登录后接口也可以通过 X-Token 找到 OnlineSession.AppID。
	if appID, exists := c.Get("fw_app_id"); exists {
		return appID.(uint)
	}
	appCode := extractAppKey(c)
	if appCode != "" {
		var app models.App
		if err := database.DB.Where("app_code = ? AND status = 1", appCode).First(&app).Error; err == nil {
			c.Set("fw_app_id", app.ID)
			return app.ID
		}
	}
	token := c.GetHeader("X-Token")
	if token != "" {
		var session models.OnlineSession
		if err := database.DB.Where("token = ?", token).First(&session).Error; err == nil {
			c.Set("fw_app_id", session.AppID)
			return session.AppID
		}
	}
	return 0
}

func logFirewall(appID uint, logType, ip, feature, username, action, detail string) {
	// 防火墙日志用于后台安全日志页面展示，写入失败不阻断请求流程。
	log := &models.FirewallLog{
		AppID: appID, Type: logType, IP: ip, Feature: feature,
		Username: username, Action: action, Detail: detail,
	}
	database.DB.Create(log)
}

func autoBanIP(appID uint, ip string, duration int, reason string) {
	// 自动封禁会写入黑名单表，并清理 Redis 中该 IP 的黑名单缓存。
	var app models.App
	if err := database.DB.First(&app, appID).Error; err != nil {
		return
	}
	expireAt := time.Now().Add(time.Duration(duration) * time.Minute)
	database.DB.Create(&models.Blacklist{
		UserID: app.UserID, AppID: appID, Type: 1, Value: ip,
		Remark: fmt.Sprintf("防火墙自动封禁: %s", reason), ExpireAt: &expireAt,
	})
	// 清除该 IP 的黑名单缓存，使封禁立即生效
	if cache.Enabled {
		cache.Del(fmt.Sprintf("blacklist:ip:%d:%s", appID, ip))
	}
}

// ========== 防火墙中间件 ==========

func SDKFirewallMiddleware() gin.HandlerFunc {
	if !cache.Enabled {
		// 内存缓存需要后台清理过期项；Redis 模式由 Redis TTL 自己负责。
		go cleanupCaches()
	}

	return func(c *gin.Context) {
		appID := resolveAppID(c)
		if appID == 0 {
			c.Next()
			return
		}

		clientIP := getClientIP(c)

		// 先加载防火墙配置。Redis 模式缓存 60 秒，避免每个 SDK 请求都查数据库。
		var fwConfig models.FirewallConfig
		fwLoaded := false
		if cache.Enabled {
			cacheKey := fmt.Sprintf("fw:config:%d", appID)
			if cache.GetJSON(cacheKey, &fwConfig) {
				fwLoaded = true
			}
		}
		if !fwLoaded {
			database.DB.Where("app_id = ?", appID).First(&fwConfig)
			if cache.Enabled && fwConfig.ID > 0 {
				cache.SetJSON(fmt.Sprintf("fw:config:%d", appID), &fwConfig, 60*time.Second)
			}
		}

		// 白名单 IP 跳过所有检查（包括黑名单），用于可信服务器或自家测试环境。
		isWhitelisted := false
		if fwConfig.ID > 0 && fwConfig.Enable == 1 && fwConfig.IPWhitelistEnable == 1 && fwConfig.IPWhitelist != "" {
			if isIPInWhitelist(clientIP, fwConfig.IPWhitelist) {
				isWhitelisted = true
			}
		}

		// 黑名单检查（白名单 IP 跳过）。包含 IP 黑名单和明文请求中的 feature 黑名单。
		if !isWhitelisted {
			if blocked, reason := checkBlacklist(appID, clientIP, c); blocked {
				logFirewall(appID, "blacklist", clientIP, "", "", "block", reason)
				c.JSON(http.StatusForbidden, gin.H{"code": 403, "message": reason})
				c.Abort()
				return
			}
		}

		if fwConfig.ID == 0 || fwConfig.Enable != 1 {
			c.Next()
			return
		}

		// IP 白名单模式：开启后只有白名单内 IP 能继续访问，后续频控也直接跳过。
		if fwConfig.IPWhitelistEnable == 1 {
			if fwConfig.IPWhitelist == "" || !isWhitelisted {
				logFirewall(appID, "ip_block", clientIP, "", "", "block", "IP不在白名单中")
				c.JSON(http.StatusForbidden, gin.H{"code": 403, "message": "IP不在白名单中"})
				c.Abort()
				return
			}
			// 白名单IP跳过后续所有频率限制等检查
			c.Set("fw_config", &fwConfig)
			c.Next()
			return
		}

		// IP 频率限制：按应用+IP 统计一分钟内请求次数。
		if fwConfig.IPRateLimitEnable == 1 && fwConfig.IPRateLimit > 0 {
			cacheKey := fmt.Sprintf("fw:iprate:%d:%s", appID, clientIP)
			if exceeded := checkIPRateLimit(cacheKey, fwConfig.IPRateLimit); exceeded {
				detail := fmt.Sprintf("IP请求频率超限(%d/分钟)", fwConfig.IPRateLimit)
				logFirewall(appID, "rate_limit", clientIP, "", "", "block", detail)
				if fwConfig.AutoBanEnable == 1 && fwConfig.AutoBanIPOnRate == 1 {
					autoBanIP(appID, clientIP, fwConfig.AutoBanDuration, "请求频率超限")
					logFirewall(appID, "auto_ban", clientIP, "", "", "ban", fmt.Sprintf("频率超限自动封禁%d分钟", fwConfig.AutoBanDuration))
				}
				c.JSON(http.StatusTooManyRequests, gin.H{"code": 429, "message": "请求过于频繁，请稍后再试"})
				c.Abort()
				return
			}
		}

		// 单 IP 并发连接数限制：这里只能做进程内计数，多实例时不能跨实例同步。
		concurrentKey := ""
		if fwConfig.IPConcurrentLimit > 0 {
			concurrentKey = fmt.Sprintf("fw:concurrent:%d:%s", appID, clientIP)
			ipConcurrentCache.Lock()
			current := ipConcurrentCache.data[concurrentKey]
			if current >= fwConfig.IPConcurrentLimit {
				ipConcurrentCache.Unlock()
				logFirewall(appID, "rate_limit", clientIP, "", "", "block", fmt.Sprintf("IP并发连接数超限(%d)", fwConfig.IPConcurrentLimit))
				c.JSON(http.StatusTooManyRequests, gin.H{"code": 429, "message": "并发连接数超限"})
				c.Abort()
				return
			}
			ipConcurrentCache.data[concurrentKey] = current + 1
			ipConcurrentCache.Unlock()
			defer func() {
				ipConcurrentCache.Lock()
				ipConcurrentCache.data[concurrentKey]--
				if ipConcurrentCache.data[concurrentKey] <= 0 {
					delete(ipConcurrentCache.data, concurrentKey)
				}
				ipConcurrentCache.Unlock()
			}()
		}

		// API 频率限制：按应用统计一分钟内总调用次数。
		if fwConfig.APIRateLimitEnable == 1 && fwConfig.APIRateLimit > 0 {
			cacheKey := fmt.Sprintf("fw:apirate:%d", appID)
			if exceeded := checkAPIRateLimit(cacheKey, fwConfig.APIRateLimit); exceeded {
				logFirewall(appID, "rate_limit", clientIP, "", "", "block", fmt.Sprintf("API调用频率超限(%d/分钟)", fwConfig.APIRateLimit))
				c.JSON(http.StatusTooManyRequests, gin.H{"code": 429, "message": "API调用过于频繁"})
				c.Abort()
				return
			}
		}

		// 重放攻击防护：同一个 uuid 在 ReplayWindow 内重复出现就拦截。
		if fwConfig.ReplayCheckEnable == 1 {
			uuid := extractUUID(c)
			if uuid != "" {
				if isDuplicate := checkReplay(uuid, fwConfig.ReplayWindow); isDuplicate {
					logFirewall(appID, "replay", clientIP, "", "", "block", fmt.Sprintf("重复请求UUID: %s", uuid))
					c.JSON(http.StatusForbidden, gin.H{"code": 403, "message": "重复请求"})
					c.Abort()
					return
				}
			}
		}

		c.Set("fw_config", &fwConfig)
		c.Next()
	}
}

// ========== 检查函数（Redis / 内存双模式） ==========

func checkBlacklist(appID uint, clientIP string, c *gin.Context) (bool, string) {
	now := time.Now()

	// Redis 缓存黑名单 IP 查询结果。命中空结果也短暂缓存，降低高频请求下的数据库压力。
	if cache.Enabled {
		cacheKey := fmt.Sprintf("blacklist:ip:%d:%s", appID, clientIP)
		val, err := cache.Get(cacheKey)
		if err == nil {
			if val == "1" {
				return true, "IP已被封禁"
			}
			// val == "0" 表示缓存了空结果，IP不在黑名单
		} else {
			// 缓存未命中，查数据库
			var ipBlacklist models.Blacklist
			if database.DB.Where("app_id = ? AND type = 1 AND value = ? AND (expire_at IS NULL OR expire_at > ?)",
				appID, clientIP, now).First(&ipBlacklist).Error == nil {
				// 计算剩余封禁时间作为缓存 TTL
				ttl := 30 * time.Second
				if ipBlacklist.ExpireAt != nil {
					remaining := time.Until(*ipBlacklist.ExpireAt)
					if remaining > 0 && remaining < 24*time.Hour {
						ttl = remaining
					}
				}
				cache.Set(cacheKey, "1", ttl)
				return true, "IP已被封禁"
			}
			// IP 不在黑名单，缓存空结果（短 TTL 防止频繁查库）
			cache.Set(cacheKey, "0", 10*time.Second)
		}
	} else {
		var ipBlacklist models.Blacklist
		if database.DB.Where("app_id = ? AND type = 1 AND value = ? AND (expire_at IS NULL OR expire_at > ?)",
			appID, clientIP, now).First(&ipBlacklist).Error == nil {
			return true, "IP已被封禁"
		}
	}

	// 特征码黑名单检查。这里只能读取明文 feature；加密请求里的 feature 由 SDK 解密层处理。
	bodyBytes, _ := c.GetRawData()
	if len(bodyBytes) > 0 {
		c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
		var req struct {
			Feature string `json:"feature"`
		}
		json.Unmarshal(bodyBytes, &req)
		if req.Feature != "" {
			if cache.Enabled {
				cacheKey := fmt.Sprintf("blacklist:feat:%d:%s", appID, req.Feature)
				val, err := cache.Get(cacheKey)
				if err == nil {
					if val == "1" {
						return true, "设备已被封禁"
					}
					// val == "0" 表示缓存了空结果
					return false, ""
				}
				var featureBlacklist models.Blacklist
				if database.DB.Where("app_id = ? AND type = 2 AND value = ? AND (expire_at IS NULL OR expire_at > ?)",
					appID, req.Feature, now).First(&featureBlacklist).Error == nil {
					ttl := 30 * time.Second
					if featureBlacklist.ExpireAt != nil {
						remaining := time.Until(*featureBlacklist.ExpireAt)
						if remaining > 0 && remaining < 24*time.Hour {
							ttl = remaining
						}
					}
					cache.Set(cacheKey, "1", ttl)
					return true, "设备已被封禁"
				}
				cache.Set(cacheKey, "0", 10*time.Second)
			} else {
				var featureBlacklist models.Blacklist
				if database.DB.Where("app_id = ? AND type = 2 AND value = ? AND (expire_at IS NULL OR expire_at > ?)",
					appID, req.Feature, now).First(&featureBlacklist).Error == nil {
					return true, "设备已被封禁"
				}
			}
		}
	}
	return false, ""
}

func isIPInWhitelist(ip, whitelist string) bool {
	lines := strings.Split(whitelist, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if line == ip {
			return true
		}
		if strings.HasSuffix(line, "*") {
			prefix := strings.TrimSuffix(line, "*")
			if strings.HasPrefix(ip, prefix) {
				return true
			}
		}
		if strings.HasSuffix(line, ".") && strings.HasPrefix(ip, line) {
			return true
		}
	}
	return false
}

func checkIPRateLimit(key string, limit int) bool {
	// 返回 true 表示超限。Redis 模式使用 INCR + TTL，内存模式使用本进程 map。
	if cache.Enabled {
		val, err := cache.IncrWithExpire(key, time.Minute)
		if err != nil {
			return false
		}
		return val > int64(limit)
	}
	// 内存降级
	ipRateCache.Lock()
	defer ipRateCache.Unlock()
	now := time.Now()
	bucket, exists := ipRateCache.data[key]
	if !exists || now.After(bucket.ResetAt) {
		ipRateCache.data[key] = &rateBucket{Count: 1, ResetAt: now.Add(time.Minute)}
		return false
	}
	bucket.Count++
	return bucket.Count > limit
}

func checkAPIRateLimit(key string, limit int) bool {
	// 与 IP 频率限制不同，这里统计整个应用的总 API 请求量。
	if cache.Enabled {
		val, err := cache.IncrWithExpire(key, time.Minute)
		if err != nil {
			return false
		}
		return val > int64(limit)
	}
	// 内存降级
	apiRateCache.Lock()
	defer apiRateCache.Unlock()
	now := time.Now()
	bucket, exists := apiRateCache.data[key]
	if !exists || now.After(bucket.ResetAt) {
		apiRateCache.data[key] = &rateBucket{Count: 1, ResetAt: now.Add(time.Minute)}
		return false
	}
	bucket.Count++
	return bucket.Count > limit
}

func checkReplay(uuid string, windowSeconds int) bool {
	// 返回 true 表示重复请求。windowSeconds 来自应用防火墙配置。
	if cache.Enabled {
		key := "fw:replay:" + uuid
		if cache.Exists(key) {
			return true
		}
		cache.Set(key, "1", time.Duration(windowSeconds)*time.Second)
		return false
	}
	// 内存降级
	replayCache.Lock()
	defer replayCache.Unlock()
	now := time.Now()
	if t, exists := replayCache.data[uuid]; exists {
		if now.Sub(t) < time.Duration(windowSeconds)*time.Second {
			return true
		}
	}
	replayCache.data[uuid] = now
	return false
}

// ========== SDK登录失败检查 ==========

func CheckSDKLoginFail(appID uint, clientIP string, fwConfig *models.FirewallConfig) (locked bool, failCount int) {
	// 登录前调用，用于判断当前 IP 是否已经被登录失败策略锁定。
	if fwConfig == nil || fwConfig.LoginFailLimit <= 0 {
		return false, 0
	}
	key := fmt.Sprintf("fw:loginfail:%d:%s", appID, clientIP)

	if cache.Enabled {
		// 检查锁定
		lockKey := key + ":lock"
		if cache.Exists(lockKey) {
			return true, fwConfig.LoginFailLimit
		}
		// 获取失败次数
		val, err := cache.Get(key)
		if err != nil {
			return false, 0
		}
		count, _ := strconv.Atoi(val)
		return false, count
	}

	// 内存降级
	sdkLoginFailCache.RLock()
	bucket, exists := sdkLoginFailCache.data[key]
	sdkLoginFailCache.RUnlock()
	if !exists {
		return false, 0
	}
	if !bucket.LockAt.IsZero() && time.Now().Before(bucket.LockAt) {
		return true, bucket.Count
	}
	if !bucket.LockAt.IsZero() && time.Now().After(bucket.LockAt) {
		sdkLoginFailCache.Lock()
		delete(sdkLoginFailCache.data, key)
		sdkLoginFailCache.Unlock()
		return false, 0
	}
	return false, bucket.Count
}

func RecordSDKLoginFail(appID uint, clientIP string, fwConfig *models.FirewallConfig) {
	// 登录失败后调用；达到阈值后设置锁定标记，必要时自动写入 IP 黑名单。
	if fwConfig == nil || fwConfig.LoginFailLimit <= 0 {
		return
	}
	key := fmt.Sprintf("fw:loginfail:%d:%s", appID, clientIP)

	if cache.Enabled {
		lockDuration := time.Duration(fwConfig.LoginFailLockTime) * time.Minute
		val, err := cache.IncrWithExpire(key, lockDuration)
		if err != nil {
			return
		}
		if int(val) >= fwConfig.LoginFailLimit {
			// 设置锁定标记
			cache.Set(key+":lock", "1", lockDuration)
			// 自动封禁
			if fwConfig.AutoBanEnable == 1 && fwConfig.AutoBanIPOnFail == 1 {
				go autoBanIP(appID, clientIP, fwConfig.AutoBanDuration, "登录失败次数超限")
				go logFirewall(appID, "auto_ban", clientIP, "", "", "ban",
					fmt.Sprintf("登录失败%d次自动封禁%d分钟", val, fwConfig.AutoBanDuration))
			}
		}
		return
	}

	// 内存降级
	sdkLoginFailCache.Lock()
	defer sdkLoginFailCache.Unlock()
	bucket, exists := sdkLoginFailCache.data[key]
	if !exists {
		bucket = &loginFailBucket{}
		sdkLoginFailCache.data[key] = bucket
	}
	bucket.Count++
	if bucket.Count >= fwConfig.LoginFailLimit {
		bucket.LockAt = time.Now().Add(time.Duration(fwConfig.LoginFailLockTime) * time.Minute)
		if fwConfig.AutoBanEnable == 1 && fwConfig.AutoBanIPOnFail == 1 {
			go autoBanIP(appID, clientIP, fwConfig.AutoBanDuration, "登录失败次数超限")
			go logFirewall(appID, "auto_ban", clientIP, "", "", "ban",
				fmt.Sprintf("登录失败%d次自动封禁%d分钟", bucket.Count, fwConfig.AutoBanDuration))
		}
	}
}

func ClearSDKLoginFail(appID uint, clientIP string) {
	// 登录成功后调用，清理失败次数和锁定标记。
	key := fmt.Sprintf("fw:loginfail:%d:%s", appID, clientIP)
	if cache.Enabled {
		cache.Del(key)
		cache.Del(key + ":lock")
		return
	}
	sdkLoginFailCache.Lock()
	delete(sdkLoginFailCache.data, key)
	sdkLoginFailCache.Unlock()
}

// LoginLockInfo 登录锁定信息
type LoginLockInfo struct {
	IP        string `json:"ip"`
	FailCount int    `json:"fail_count"`
	Locked    bool   `json:"locked"`
}

// ListSDKLoginLocks 列出指定应用的登录锁定IP
func ListSDKLoginLocks(appID uint) []LoginLockInfo {
	prefix := fmt.Sprintf("fw:loginfail:%d:", appID)
	var result []LoginLockInfo

	if cache.Enabled {
		iter := cache.RDB.Scan(context.Background(), 0, prefix+"*", 500).Iterator()
		seen := make(map[string]bool)
		for iter.Next(context.Background()) {
			key := iter.Val()
			// 跳过 :lock 后缀的key，只处理计数key
			if strings.HasSuffix(key, ":lock") {
				continue
			}
			ip := strings.TrimPrefix(key, prefix)
			if seen[ip] {
				continue
			}
			seen[ip] = true
			val, _ := cache.Get(key)
			count, _ := strconv.Atoi(val)
			locked := cache.Exists(key + ":lock")
			if count > 0 || locked {
				result = append(result, LoginLockInfo{IP: ip, FailCount: count, Locked: locked})
			}
		}
		return result
	}

	// 内存降级
	sdkLoginFailCache.RLock()
	defer sdkLoginFailCache.RUnlock()
	for key, bucket := range sdkLoginFailCache.data {
		if !strings.HasPrefix(key, prefix) {
			continue
		}
		ip := strings.TrimPrefix(key, prefix)
		locked := !bucket.LockAt.IsZero() && time.Now().Before(bucket.LockAt)
		if bucket.Count > 0 || locked {
			result = append(result, LoginLockInfo{IP: ip, FailCount: bucket.Count, Locked: locked})
		}
	}
	return result
}

// ========== WS 防火墙检查（供 handlers 包调用） ==========

// WSFirewallCheck 对 WS 请求执行防火墙检查，返回 (blocked, message)
func WSFirewallCheck(appID uint, clientIP string) (bool, string) {
	// 加载防火墙配置
	var fwConfig models.FirewallConfig
	fwLoaded := false
	if cache.Enabled {
		cacheKey := fmt.Sprintf("fw:config:%d", appID)
		if cache.GetJSON(cacheKey, &fwConfig) {
			fwLoaded = true
		}
	}
	if !fwLoaded {
		database.DB.Where("app_id = ?", appID).First(&fwConfig)
		if cache.Enabled && fwConfig.ID > 0 {
			cache.SetJSON(fmt.Sprintf("fw:config:%d", appID), &fwConfig, 60*time.Second)
		}
	}

	// 白名单IP跳过所有检查
	if fwConfig.ID > 0 && fwConfig.Enable == 1 && fwConfig.IPWhitelistEnable == 1 && fwConfig.IPWhitelist != "" {
		if isIPInWhitelist(clientIP, fwConfig.IPWhitelist) {
			return false, ""
		}
	}

	// 黑名单检查（不依赖 gin.Context 的简化版）
	if blocked, reason := checkBlacklistSimple(appID, clientIP); blocked {
		logFirewall(appID, "blacklist", clientIP, "", "", "block", reason)
		return true, reason
	}

	if fwConfig.ID == 0 || fwConfig.Enable != 1 {
		return false, ""
	}

	// IP白名单模式：不在白名单中则拦截
	if fwConfig.IPWhitelistEnable == 1 {
		if fwConfig.IPWhitelist == "" || !isIPInWhitelist(clientIP, fwConfig.IPWhitelist) {
			logFirewall(appID, "ip_block", clientIP, "", "", "block", "IP不在白名单中")
			return true, "IP不在白名单中"
		}
	}

	// IP频率限制
	if fwConfig.IPRateLimitEnable == 1 && fwConfig.IPRateLimit > 0 {
		cacheKey := fmt.Sprintf("fw:iprate:%d:%s", appID, clientIP)
		if checkIPRateLimit(cacheKey, fwConfig.IPRateLimit) {
			detail := fmt.Sprintf("IP请求频率超限(%d/分钟)", fwConfig.IPRateLimit)
			logFirewall(appID, "rate_limit", clientIP, "", "", "block", detail)
			if fwConfig.AutoBanEnable == 1 && fwConfig.AutoBanIPOnRate == 1 {
				go autoBanIP(appID, clientIP, fwConfig.AutoBanDuration, "请求频率超限")
				go logFirewall(appID, "auto_ban", clientIP, "", "", "ban",
					fmt.Sprintf("频率超限自动封禁%d分钟", fwConfig.AutoBanDuration))
			}
			return true, "请求过于频繁，请稍后再试"
		}
	}

	// API频率限制
	if fwConfig.APIRateLimitEnable == 1 && fwConfig.APIRateLimit > 0 {
		cacheKey := fmt.Sprintf("fw:apirate:%d", appID)
		if checkAPIRateLimit(cacheKey, fwConfig.APIRateLimit) {
			logFirewall(appID, "rate_limit", clientIP, "", "", "block",
				fmt.Sprintf("API调用频率超限(%d/分钟)", fwConfig.APIRateLimit))
			return true, "API调用过于频繁"
		}
	}

	return false, ""
}

// GetFirewallConfig 获取防火墙配置（供 handlers 包调用）
func GetFirewallConfig(appID uint) *models.FirewallConfig {
	var fwConfig models.FirewallConfig
	if cache.Enabled {
		cacheKey := fmt.Sprintf("fw:config:%d", appID)
		if cache.GetJSON(cacheKey, &fwConfig) {
			return &fwConfig
		}
	}
	database.DB.Where("app_id = ?", appID).First(&fwConfig)
	if fwConfig.ID == 0 {
		return nil
	}
	if cache.Enabled {
		cache.SetJSON(fmt.Sprintf("fw:config:%d", appID), &fwConfig, 60*time.Second)
	}
	return &fwConfig
}

// checkBlacklistSimple 不依赖 gin.Context 的黑名单检查（仅检查IP）
func checkBlacklistSimple(appID uint, clientIP string) (bool, string) {
	now := time.Now()
	if cache.Enabled {
		cacheKey := fmt.Sprintf("blacklist:ip:%d:%s", appID, clientIP)
		val, err := cache.Get(cacheKey)
		if err == nil {
			if val == "1" {
				return true, "IP已被封禁"
			}
			return false, ""
		}
		var ipBlacklist models.Blacklist
		if database.DB.Where("app_id = ? AND type = 1 AND value = ? AND (expire_at IS NULL OR expire_at > ?)",
			appID, clientIP, now).First(&ipBlacklist).Error == nil {
			ttl := 30 * time.Second
			if ipBlacklist.ExpireAt != nil {
				remaining := time.Until(*ipBlacklist.ExpireAt)
				if remaining > 0 && remaining < 24*time.Hour {
					ttl = remaining
				}
			}
			cache.Set(cacheKey, "1", ttl)
			return true, "IP已被封禁"
		}
		cache.Set(cacheKey, "0", 10*time.Second)
	} else {
		var ipBlacklist models.Blacklist
		if database.DB.Where("app_id = ? AND type = 1 AND value = ? AND (expire_at IS NULL OR expire_at > ?)",
			appID, clientIP, now).First(&ipBlacklist).Error == nil {
			return true, "IP已被封禁"
		}
	}
	return false, ""
}

// ========== 内存缓存清理（仅 Redis 未启用时） ==========

func cleanupCaches() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		ipRateCache.Lock()
		for k, v := range ipRateCache.data {
			if now.After(v.ResetAt) {
				delete(ipRateCache.data, k)
			}
		}
		ipRateCache.Unlock()

		apiRateCache.Lock()
		for k, v := range apiRateCache.data {
			if now.After(v.ResetAt) {
				delete(apiRateCache.data, k)
			}
		}
		apiRateCache.Unlock()

		replayCache.Lock()
		for k, v := range replayCache.data {
			if now.Sub(v) > 5*time.Minute {
				delete(replayCache.data, k)
			}
		}
		replayCache.Unlock()

		sdkLoginFailCache.Lock()
		for k, v := range sdkLoginFailCache.data {
			if !v.LockAt.IsZero() && now.After(v.LockAt) {
				delete(sdkLoginFailCache.data, k)
			}
		}
		sdkLoginFailCache.Unlock()
	}
}
