package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"jike-auth/config"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	RDB     *redis.Client
	Enabled bool
	ctx     = context.Background()
)

// Init 初始化 Redis 连接
func Init() error {
	// Redis 是可选能力。未启用时调用方会走内存降级逻辑，但多实例部署建议必须启用。
	cfg := config.Cfg.Redis
	if !cfg.Enable {
		Enabled = false
		return nil
	}

	RDB = redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	if err := RDB.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("Redis 连接失败: %w", err)
	}

	Enabled = true
	return nil
}

func TestConnection(cfg config.RedisConfig) error {
	// 安装向导使用：只测试连接，不修改全局 RDB/Enabled 状态。
	if !cfg.Enable {
		return nil
	}

	client := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Password: cfg.Password,
		DB:       cfg.DB,
	})
	defer client.Close()

	if err := client.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("Redis 连接失败: %w", err)
	}
	return nil
}

// Set 设置键值（带过期时间）
func Set(key string, value string, expiration time.Duration) error {
	return RDB.Set(ctx, key, value, expiration).Err()
}

// Get 获取值
func Get(key string) (string, error) {
	return RDB.Get(ctx, key).Result()
}

// Exists 检查键是否存在
func Exists(key string) bool {
	n, _ := RDB.Exists(ctx, key).Result()
	return n > 0
}

// Incr 自增并设置过期时间（如果是新键）
func IncrWithExpire(key string, expiration time.Duration) (int64, error) {
	// 防火墙频控使用：第一次 INCR 时设置 TTL，后续请求沿用同一个窗口。
	val, err := RDB.Incr(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	// 只在第一次自增时设置过期
	if val == 1 {
		RDB.Expire(ctx, key, expiration)
	}
	return val, nil
}

// Del 删除键
func Del(key string) error {
	return RDB.Del(ctx, key).Err()
}

// DelPattern 按前缀删除键
func DelPattern(pattern string) error {
	// 注意 pattern 是 Redis SCAN 模式，不是 SQL LIKE；例如 "fw:config:*"。
	iter := RDB.Scan(ctx, 0, pattern, 100).Iterator()
	for iter.Next(ctx) {
		RDB.Del(ctx, iter.Val())
	}
	return iter.Err()
}

// SetJSON 序列化对象并缓存
func SetJSON(key string, value interface{}, expiration time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return RDB.Set(ctx, key, data, expiration).Err()
}

// GetJSON 获取并反序列化对象，返回是否命中
func GetJSON(key string, dest interface{}) bool {
	data, err := RDB.Get(ctx, key).Bytes()
	if err != nil {
		return false
	}
	return json.Unmarshal(data, dest) == nil
}

// ClearSDKCache 清除指定应用的 SDK 只读缓存
func ClearSDKCache(appID uint, types ...string) {
	// 应用版本、公告、数据池等配置变更后调用，避免客户端继续读旧缓存。
	if !Enabled {
		return
	}
	for _, t := range types {
		Del(fmt.Sprintf("sdk:%s:%d", t, appID))
	}
}

// ClearAllSDKCache 清除指定应用的所有 SDK 只读缓存
func ClearAllSDKCache(appID uint) {
	ClearSDKCache(appID, "appinfo", "versions", "announcements", "datapools")
}
