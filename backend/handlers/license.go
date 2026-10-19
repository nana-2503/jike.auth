package handlers

import (
	"bytes"
	"jike-auth/database"
	"jike-auth/models"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// 生成随机证书码（含混淆密钥）
// 证书格式: 256字符，其中包含：
// - 64字符AES密钥（随机位置）
// - 4字符种子（固定位置：64,128,192,255）
// - 188字符随机填充
func generateCertificate() (certificate string, aesKey string) {
	// 生成32字节AES密钥
	keyBytes := make([]byte, 32)
	rand.Read(keyBytes)
	aesKey = hex.EncodeToString(keyBytes)

	// 生成2字节种子（用于确定位置）
	seedBytes := make([]byte, 2)
	rand.Read(seedBytes)
	seed := int(seedBytes[0])<<8 | int(seedBytes[1])
	seedHex := hex.EncodeToString(seedBytes)

	// 种子位置（固定）
	seedPositions := []int{32, 128, 185, 213}

	// 生成64个不重复的随机位置（排除种子位置）用于放置密钥字符
	positions := generatePositions(seed, 256, 64, seedPositions)

	// 生成随机填充数据
	fillBytes := make([]byte, 128)
	rand.Read(fillBytes)
	fillHex := hex.EncodeToString(fillBytes)

	// 创建256字符的证书
	certData := make([]byte, 256)
	// 先填充随机数据
	copy(certData, fillHex)

	// 在固定位置放置种子
	for i, pos := range seedPositions {
		certData[pos] = seedHex[i]
	}

	// 在随机位置放置密钥字符
	for i, pos := range positions {
		certData[pos] = aesKey[i]
	}

	certificate = string(certData)
	return certificate, aesKey
}

// 根据种子生成n个不重复的随机位置（排除指定位置）
func generatePositions(seed int, total int, count int, exclude []int) []int {
	// 创建可用位置列表（排除种子位置）
	excludeMap := make(map[int]bool)
	for _, pos := range exclude {
		excludeMap[pos] = true
	}

	available := make([]int, 0, total-len(exclude))
	for i := 0; i < total; i++ {
		if !excludeMap[i] {
			available = append(available, i)
		}
	}

	// Fisher-Yates 洗牌算法（使用种子）
	s := seed
	for i := len(available) - 1; i > 0; i-- {
		s = (s*1103515245 + 12345) & 0x7fffffff // LCG伪随机
		j := s % (i + 1)
		available[i], available[j] = available[j], available[i]
	}

	// 取前count个位置
	return available[:count]
}

// 从证书码提取AES密钥
func extractKeyFromCertificate(certificate string) string {
	if len(certificate) != 256 {
		return ""
	}

	// 从固定位置提取种子
	seedPositions := []int{32, 128, 185, 213}
	seedHex := ""
	for _, pos := range seedPositions {
		seedHex += string(certificate[pos])
	}

	seedBytes, err := hex.DecodeString(seedHex)
	if err != nil || len(seedBytes) != 2 {
		return ""
	}
	seed := int(seedBytes[0])<<8 | int(seedBytes[1])

	// 根据种子生成位置序列
	positions := generatePositions(seed, 256, 64, seedPositions)

	// 从对应位置提取密钥字符
	keyBytes := make([]byte, 64)
	for i, pos := range positions {
		keyBytes[i] = certificate[pos]
	}

	return string(keyBytes)
}

// AES-256-CBC 加密
func aesEncrypt(plaintext string, keyHex string) (string, error) {
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	// PKCS7 填充
	plainBytes := []byte(plaintext)
	padding := aes.BlockSize - len(plainBytes)%aes.BlockSize
	padtext := bytes.Repeat([]byte{byte(padding)}, padding)
	plainBytes = append(plainBytes, padtext...)

	// 生成随机IV
	iv := make([]byte, aes.BlockSize)
	rand.Read(iv)

	// 加密
	ciphertext := make([]byte, len(plainBytes))
	mode := cipher.NewCBCEncrypter(block, iv)
	mode.CryptBlocks(ciphertext, plainBytes)

	// IV + 密文
	result := append(iv, ciphertext...)
	return base64.StdEncoding.EncodeToString(result), nil
}

// AES-256-CBC 解密
func aesDecrypt(ciphertextB64 string, keyHex string) (string, error) {
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return "", err
	}

	ciphertext, err := base64.StdEncoding.DecodeString(ciphertextB64)
	if err != nil {
		return "", err
	}

	if len(ciphertext) < aes.BlockSize {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	// 提取IV
	iv := ciphertext[:aes.BlockSize]
	ciphertext = ciphertext[aes.BlockSize:]

	// 解密
	mode := cipher.NewCBCDecrypter(block, iv)
	mode.CryptBlocks(ciphertext, ciphertext)

	// 去除PKCS7填充
	padding := int(ciphertext[len(ciphertext)-1])
	if padding > aes.BlockSize || padding == 0 {
		return string(ciphertext), nil
	}
	return string(ciphertext[:len(ciphertext)-padding]), nil
}

// 生成新证书
func GenerateCertificate(c *gin.Context) {
	certificate, _ := generateCertificate()
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"certificate": certificate}})
}

// 加密预览
func EncryptPreview(c *gin.Context) {
	var req struct {
		Certificate string `json:"certificate" binding:"required"`
		Content     string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	aesKey := extractKeyFromCertificate(req.Certificate)
	if aesKey == "" {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "证书格式错误"})
		return
	}

	encrypted, err := aesEncrypt(req.Content, aesKey)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "加密失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"encrypted": encrypted}})
}

// 解密内容
func DecryptContent(c *gin.Context) {
	var req struct {
		Certificate string `json:"certificate" binding:"required"`
		Encrypted   string `json:"encrypted" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	aesKey := extractKeyFromCertificate(req.Certificate)
	if aesKey == "" {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "证书格式错误"})
		return
	}

	decrypted, err := aesDecrypt(req.Encrypted, aesKey)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "解密失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"content": decrypted}})
}

// 获取应用的授权证书列表
func ListLicenses(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appID, _ := strconv.Atoi(c.Query("app_id"))

	var licenses []models.License
	query := database.DB.Model(&models.License{}).
		Joins("JOIN apps ON apps.id = licenses.app_id").
		Where("apps.user_id = ?", user.ID)

	if appID > 0 {
		query = query.Where("licenses.app_id = ?", appID)
	}

	query.Preload("App").Order("licenses.id desc").Find(&licenses)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": licenses})
}

// 获取单个证书详情（解密内容）
func GetLicense(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var license models.License
	if err := database.DB.Preload("App").First(&license, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "证书不存在"})
		return
	}

	// 验证所有权
	var app models.App
	database.DB.First(&app, license.AppID)
	if app.UserID != user.ID {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	// 解密附加内容
	decryptedContent := ""
	if license.EncryptedData != "" {
		aesKey := extractKeyFromCertificate(license.Certificate)
		if aesKey != "" {
			decrypted, err := aesDecrypt(license.EncryptedData, aesKey)
			if err == nil {
				decryptedContent = decrypted
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{
		"id":           license.ID,
		"app_id":       license.AppID,
		"app":          license.App,
		"name":         license.Name,
		"certificate":  license.Certificate,
		"content":      decryptedContent,
		"max_use":      license.MaxUse,
		"used_count":   license.UsedCount,
		"bind_feature": license.BindFeature,
		"remark":       license.Remark,
		"status":       license.Status,
		"expire_at":    license.ExpireAt,
		"created_at":   license.CreatedAt,
		"updated_at":   license.UpdatedAt,
	}})
}

// 创建授权证书
func CreateLicense(c *gin.Context) {
	user := c.MustGet("user").(*models.User)

	var req struct {
		AppID       uint   `json:"app_id" binding:"required"`
		Name        string `json:"name" binding:"required"`
		Certificate string `json:"certificate" binding:"required"`
		Content     string `json:"content"`
		Remark      string `json:"remark"`
		Status      int    `json:"status"`
		MaxUse      int    `json:"max_use"`
		BindFeature string `json:"bind_feature"`
		ExpireAt    string `json:"expire_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 验证应用所有权
	var app models.App
	if err := database.DB.First(&app, req.AppID).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "应用不存在"})
		return
	}
	if app.UserID != user.ID {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "无权操作"})
		return
	}

	// 加密附加内容
	encryptedData := ""
	if req.Content != "" {
		aesKey := extractKeyFromCertificate(req.Certificate)
		if aesKey == "" {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "证书格式错误"})
			return
		}
		encrypted, err := aesEncrypt(req.Content, aesKey)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"code": 1, "message": "加密失败"})
			return
		}
		encryptedData = encrypted
	}

	license := models.License{
		AppID:         req.AppID,
		Name:          req.Name,
		Certificate:   req.Certificate,
		EncryptedData: encryptedData,
		Remark:        req.Remark,
		Status:        req.Status,
		MaxUse:        req.MaxUse,
		BindFeature:   req.BindFeature,
	}

	// 解析过期时间
	if req.ExpireAt != "" {
		expireAt, err := time.Parse("2006-01-02T15:04", req.ExpireAt)
		if err == nil {
			license.ExpireAt = &expireAt
		}
	}

	database.DB.Create(&license)

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "创建成功", "data": license})
}

// 更新授权证书
func UpdateLicense(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var license models.License
	if err := database.DB.First(&license, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "证书不存在"})
		return
	}

	// 验证所有权
	var app models.App
	database.DB.First(&app, license.AppID)
	if app.UserID != user.ID {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "无权操作"})
		return
	}

	var req struct {
		Name        string `json:"name"`
		Content     string `json:"content"`
		Remark      string `json:"remark"`
		Status      *int   `json:"status"`
		MaxUse      *int   `json:"max_use"`
		BindFeature *string `json:"bind_feature"`
		ExpireAt    string `json:"expire_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Remark != "" {
		updates["remark"] = req.Remark
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.MaxUse != nil {
		updates["max_use"] = *req.MaxUse
	}
	if req.BindFeature != nil {
		updates["bind_feature"] = *req.BindFeature
	}

	// 解析过期时间
	if req.ExpireAt != "" {
		expireAt, err := time.Parse("2006-01-02T15:04", req.ExpireAt)
		if err == nil {
			updates["expire_at"] = &expireAt
		}
	}

	// 如果有新内容，重新加密
	if req.Content != "" {
		aesKey := extractKeyFromCertificate(license.Certificate)
		if aesKey != "" {
			encrypted, err := aesEncrypt(req.Content, aesKey)
			if err == nil {
				updates["encrypted_data"] = encrypted
			}
		}
	}

	database.DB.Model(&license).Updates(updates)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 删除授权证书
func DeleteLicense(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var license models.License
	if err := database.DB.First(&license, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "证书不存在"})
		return
	}

	// 验证所有权
	var app models.App
	database.DB.First(&app, license.AppID)
	if app.UserID != user.ID {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "无权操作"})
		return
	}

	database.DB.Delete(&license)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}
