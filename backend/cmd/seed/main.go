package main

import (
	"jike-auth/config"
	"jike-auth/database"
	"jike-auth/models"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"
)

func generateToken() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func main() {
	config.Load("config.yaml")
	database.Init()
	db := database.DB

	// 获取第一个 app
	var app models.App
	db.First(&app)
	if app.ID == 0 {
		fmt.Println("没有找到应用，请先创建应用")
		return
	}

	// 获取该应用下的用户
	var users []models.AppUser
	db.Where("app_id = ?", app.ID).Limit(10).Find(&users)
	if len(users) == 0 {
		fmt.Println("没有找到用户，请先创建用户")
		return
	}

	now := time.Now()
	sessions := []models.OnlineSession{}

	// 生成最近7天的数据
	for dayOffset := 6; dayOffset >= 0; dayOffset-- {
		day := now.AddDate(0, 0, -dayOffset)
		dayStart := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, day.Location())

		// 每天随机生成一些登录
		loginCount := 3 + dayOffset%5 // 3-7个登录
		for i := 0; i < loginCount; i++ {
			user := users[i%len(users)]
			loginHour := 8 + i*2 // 8点、10点、12点...
			loginAt := dayStart.Add(time.Duration(loginHour) * time.Hour)

			// 心跳时间：有些当天就下线，有些持续到后面几天
			heartbeatAt := loginAt.Add(time.Duration(2+i) * time.Hour)
			if dayOffset > 0 && i%3 == 0 {
				// 部分会话持续到今天
				heartbeatAt = now.Add(-time.Duration(i*10) * time.Minute)
			}

			sessions = append(sessions, models.OnlineSession{
				AppID:       app.ID,
				AppUserID:   user.ID,
				Token:       generateToken(),
				Version:     "1.0.0",
				ClientID:    fmt.Sprintf("client_%d_%d", dayOffset, i),
				ClientOS:    "Windows 10",
				ClientIP:    fmt.Sprintf("192.168.1.%d", 100+i),
				Feature:     fmt.Sprintf("feature_%d", i),
				LoginAt:     loginAt,
				HeartbeatAt: heartbeatAt,
				CreatedAt:   loginAt,
				UpdatedAt:   heartbeatAt,
			})
		}
	}

	// 清除旧的测试数据
	db.Exec("DELETE FROM online_sessions WHERE client_id LIKE 'client_%'")

	// 插入新数据
	for _, s := range sessions {
		db.Create(&s)
	}

	fmt.Printf("成功生成 %d 条在线会话数据\n", len(sessions))
}
