package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"jike-auth/database"
	"jike-auth/models"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type sdkLogResponseWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (w *sdkLogResponseWriter) Write(data []byte) (int, error) {
	w.body.Write(data)
	return w.ResponseWriter.Write(data)
}

func (w *sdkLogResponseWriter) WriteString(s string) (int, error) {
	w.body.WriteString(s)
	return w.ResponseWriter.WriteString(s)
}

// SDKInterfaceLogMiddleware records SDK HTTP traffic for apps with SDKLogEnabled enabled.
func SDKInterfaceLogMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		bodyBytes, _ := c.GetRawData()
		c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

		app, appCode := sdkLogResolveApp(bodyBytes)
		shouldLog := app != nil && app.SDKLogEnabled == 1
		writer := &sdkLogResponseWriter{ResponseWriter: c.Writer, body: bytes.NewBuffer(nil)}
		if shouldLog {
			c.Writer = writer
		}

		c.Next()

		if !shouldLog {
			return
		}

		log := models.SDKInterfaceLog{
			AppID:          app.ID,
			AppCode:        appCode,
			Method:         c.Request.Method,
			Path:           c.Request.URL.Path,
			ClientIP:       getClientIP(c),
			UserAgent:      c.Request.UserAgent(),
			Token:          c.GetHeader("X-Token"),
			RequestHeaders: sdkLogMarshalHeaders(c.Request.Header),
			RequestBody:    string(bodyBytes),
			ResponseStatus: c.Writer.Status(),
			ResponseBody:   writer.body.String(),
			DurationMs:     time.Since(start).Milliseconds(),
		}

		log.RequestData, log.DecryptError = sdkLogDecryptRequestData(app, bodyBytes)
		log.ResponseData, log.ResponseCode, log.ResponseMessage, log.ResponseError = sdkLogDecryptResponseData(app, writer.body.Bytes())

		go func(item models.SDKInterfaceLog) {
			database.DB.Create(&item)
		}(log)
	}
}

// StartSDKInterfaceLogCleaner clears SDK interface logs older than 72 hours every 5 minutes.
func StartSDKInterfaceLogCleaner() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()

		if isBackgroundTaskEnabled("sdk-interface-log-cleaner") {
			cleanExpiredSDKInterfaceLogs()
		}
		for range ticker.C {
			if !isBackgroundTaskEnabled("sdk-interface-log-cleaner") {
				continue
			}
			cleanExpiredSDKInterfaceLogs()
		}
	}()
	log.Println("SDK接口日志清理任务已启动")
}

func cleanExpiredSDKInterfaceLogs() {
	defer markBackgroundTaskRun("sdk-interface-log-cleaner")

	result := database.DB.Where("created_at < ?", time.Now().Add(-72*time.Hour)).Delete(&models.SDKInterfaceLog{})
	if result.Error != nil {
		log.Printf("清理SDK接口日志失败: %v", result.Error)
		return
	}
	if result.RowsAffected > 0 {
		log.Printf("清理了 %d 条超过3天的SDK接口日志", result.RowsAffected)
	}
}

func sdkLogResolveApp(bodyBytes []byte) (*models.App, string) {
	var req struct {
		AppCode string `json:"app_code"`
	}
	if err := json.Unmarshal(bodyBytes, &req); err != nil || strings.TrimSpace(req.AppCode) == "" {
		return nil, ""
	}
	var app models.App
	if err := database.DB.Where("app_code = ?", strings.TrimSpace(req.AppCode)).First(&app).Error; err != nil {
		return nil, strings.TrimSpace(req.AppCode)
	}
	return &app, strings.TrimSpace(req.AppCode)
}

func sdkLogMarshalHeaders(headers http.Header) string {
	data := make(map[string][]string, len(headers))
	for key, values := range headers {
		data[key] = values
	}
	b, _ := json.Marshal(data)
	return string(b)
}

func sdkLogDecryptRequestData(app *models.App, bodyBytes []byte) (string, string) {
	var req struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(bodyBytes, &req); err != nil || req.Data == "" {
		return "", ""
	}
	decrypted, err := sdkDecryptPayload(req.Data, app)
	if err != nil {
		return "", err.Error()
	}
	return decrypted, ""
}

func sdkLogDecryptResponseData(app *models.App, bodyBytes []byte) (string, int, string, string) {
	var resp struct {
		Data    interface{} `json:"data"`
		Code    *int        `json:"code"`
		Message string      `json:"message"`
	}
	if err := json.Unmarshal(bodyBytes, &resp); err != nil {
		return "", 0, "", "响应JSON解析失败: " + err.Error()
	}
	if resp.Code != nil {
		return string(bodyBytes), *resp.Code, resp.Message, ""
	}
	data, ok := resp.Data.(string)
	if !ok || data == "" {
		return "", 0, "", "响应不是加密格式"
	}
	decrypted, err := sdkDecryptPayload(data, app)
	if err != nil {
		return "", 0, "", err.Error()
	}
	var inner struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal([]byte(decrypted), &inner)
	return decrypted, inner.Code, inner.Message, ""
}

func ListSDKInterfaceLogs(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}
	appID := c.Query("app_id")
	path := c.Query("path")
	keyword := strings.TrimSpace(c.Query("keyword"))

	query := database.DB.Model(&models.SDKInterfaceLog{}).Joins("JOIN apps ON apps.id = sdk_interface_logs.app_id").Where("apps.user_id = ?", user.ID)
	if appID != "" {
		query = query.Where("sdk_interface_logs.app_id = ?", appID)
	}
	if path != "" {
		query = query.Where("sdk_interface_logs.path = ?", path)
	}
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("sdk_interface_logs.client_ip LIKE ? OR sdk_interface_logs.request_body LIKE ? OR sdk_interface_logs.request_data LIKE ? OR sdk_interface_logs.response_body LIKE ? OR sdk_interface_logs.response_data LIKE ?", kw, kw, kw, kw, kw)
	}

	var total int64
	query.Count(&total)
	var logs []models.SDKInterfaceLog
	query.Preload("App").Order("sdk_interface_logs.id desc").Offset((page - 1) * size).Limit(size).Find(&logs)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": logs, "total": total}})
}

func ClearSDKInterfaceLogs(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appID := c.Query("app_id")
	query := database.DB.Where("app_id IN (SELECT id FROM apps WHERE user_id = ?)", user.ID)
	if appID != "" {
		query = query.Where("app_id = ?", appID)
	}
	if err := query.Delete(&models.SDKInterfaceLog{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "清空失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "已清空"})
}
