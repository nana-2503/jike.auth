package handlers

import (
	"sync"
	"time"
)

type backgroundTaskStatus struct {
	Key         string     `json:"key"`
	Name        string     `json:"name"`
	Interval    string     `json:"interval"`
	Retention   string     `json:"retention"`
	Description string     `json:"description"`
	Enabled     bool       `json:"enabled"`
	Status      string     `json:"status"`
	LastRunAt   *time.Time `json:"last_run_at"`
}

var backgroundTasks = struct {
	sync.RWMutex
	items map[string]backgroundTaskStatus
}{
	items: map[string]backgroundTaskStatus{
		"session-expired-cleaner": {
			Key:         "session-expired-cleaner",
			Name:        "在线会话超时清理",
			Interval:    "每 30 秒",
			Retention:   "按应用心跳周期 x 3 判定超时",
			Description: "清理超过心跳容差仍未上报的在线会话，避免在线人数长期残留。",
			Enabled:     true,
			Status:      "运行中",
		},
		"session-idle-cleaner": {
			Key:         "session-idle-cleaner",
			Name:        "空闲会话清理",
			Interval:    "每 1 小时",
			Retention:   "超过 24 小时无心跳",
			Description: "兜底清理长时间无心跳的会话记录，防止异常断线造成数据堆积。",
			Enabled:     true,
			Status:      "运行中",
		},
		"sdk-interface-log-cleaner": {
			Key:         "sdk-interface-log-cleaner",
			Name:        "SDK接口日志清理",
			Interval:    "每 5 分钟",
			Retention:   "仅保留最近 3 天",
			Description: "清理超过 72 小时的客户端接口日志，避免每次写入日志时触发删除。",
			Enabled:     true,
			Status:      "运行中",
		},
	},
}

var startBackgroundTaskSchedulersOnce sync.Once

func StartBackgroundTaskSchedulers() {
	startBackgroundTaskSchedulersOnce.Do(func() {
		StartSessionCleaner()
		StartSDKInterfaceLogCleaner()
	})
}

func markBackgroundTaskRun(key string) {
	now := time.Now()
	backgroundTasks.Lock()
	defer backgroundTasks.Unlock()
	item, ok := backgroundTasks.items[key]
	if !ok {
		return
	}
	item.LastRunAt = &now
	backgroundTasks.items[key] = item
}

func isBackgroundTaskEnabled(key string) bool {
	backgroundTasks.RLock()
	defer backgroundTasks.RUnlock()
	item, ok := backgroundTasks.items[key]
	return ok && item.Enabled
}

func setBackgroundTaskEnabled(key string, enabled bool) (backgroundTaskStatus, bool) {
	backgroundTasks.Lock()
	defer backgroundTasks.Unlock()
	item, ok := backgroundTasks.items[key]
	if !ok {
		return backgroundTaskStatus{}, false
	}
	item.Enabled = enabled
	if enabled {
		item.Status = "运行中"
	} else {
		item.Status = "已关闭"
	}
	backgroundTasks.items[key] = item
	return item, true
}

func runBackgroundTaskNow(key string) bool {
	switch key {
	case "session-expired-cleaner":
		go cleanExpiredSessions()
	case "session-idle-cleaner":
		go cleanIdleSessions()
	case "sdk-interface-log-cleaner":
		go cleanExpiredSDKInterfaceLogs()
	default:
		return false
	}
	return true
}

func listBackgroundTasks() []backgroundTaskStatus {
	keys := []string{"session-expired-cleaner", "session-idle-cleaner", "sdk-interface-log-cleaner"}
	items := make([]backgroundTaskStatus, 0, len(keys))
	backgroundTasks.RLock()
	defer backgroundTasks.RUnlock()
	for _, key := range keys {
		items = append(items, backgroundTasks.items[key])
	}
	return items
}
