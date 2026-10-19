package handlers

import (
	"jike-auth/database"
	"jike-auth/models"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ========== 管理后台套餐管理 ==========

func AdminListPackages(c *gin.Context) {
	var list []models.Package
	database.DB.Order("sort desc, id desc").Find(&list)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": list})
}

func AdminCreatePackage(c *gin.Context) {
	var req struct {
		Name           string  `json:"name" binding:"required"`
		Icon           string  `json:"icon"`
		Description    string  `json:"description"`
		Price          float64 `json:"price"`
		Duration       int     `json:"duration"`
		ExtraApps      int     `json:"extra_apps"`
		ExtraUsers     int     `json:"extra_users"`
		ExtraCardTypes int     `json:"extra_card_types"`
		ExtraCards     int     `json:"extra_cards"`
		Sort           int     `json:"sort"`
		Status         int     `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	pkg := models.Package{
		Name:           req.Name,
		Icon:           req.Icon,
		Description:    req.Description,
		Price:          req.Price,
		Duration:       req.Duration,
		ExtraApps:      req.ExtraApps,
		ExtraUsers:     req.ExtraUsers,
		ExtraCardTypes: req.ExtraCardTypes,
		ExtraCards:     req.ExtraCards,
		Sort:           req.Sort,
		Status:         req.Status,
	}
	database.DB.Create(&pkg)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "创建成功", "data": pkg})
}

func AdminUpdatePackage(c *gin.Context) {
	id := c.Param("id")
	var pkg models.Package
	if err := database.DB.First(&pkg, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "套餐不存在"})
		return
	}

	var req struct {
		Name           string  `json:"name"`
		Icon           string  `json:"icon"`
		Description    string  `json:"description"`
		Price          float64 `json:"price"`
		Duration       int     `json:"duration"`
		ExtraApps      int     `json:"extra_apps"`
		ExtraUsers     int     `json:"extra_users"`
		ExtraCardTypes int     `json:"extra_card_types"`
		ExtraCards     int     `json:"extra_cards"`
		Sort           int     `json:"sort"`
		Status         int     `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	database.DB.Model(&pkg).Updates(map[string]interface{}{
		"name":             req.Name,
		"icon":             req.Icon,
		"description":      req.Description,
		"price":            req.Price,
		"duration":         req.Duration,
		"extra_apps":       req.ExtraApps,
		"extra_users":      req.ExtraUsers,
		"extra_card_types": req.ExtraCardTypes,
		"extra_cards":      req.ExtraCards,
		"sort":             req.Sort,
		"status":           req.Status,
	})
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func AdminDeletePackage(c *gin.Context) {
	id := c.Param("id")
	database.DB.Delete(&models.Package{}, id)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// 上传套餐图标
func AdminUploadPackageIcon(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请选择文件"})
		return
	}

	// 检查文件类型
	if file.Header.Get("Content-Type") != "image/png" {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "只支持PNG格式"})
		return
	}

	// 生成文件名
	filename := fmt.Sprintf("package_%d.png", time.Now().UnixNano())
	savePath := "uploads/packages/" + filename

	// 确保目录存在
	os.MkdirAll("uploads/packages", 0755)

	if err := c.SaveUploadedFile(file, savePath); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "保存失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": "/" + savePath})
}

// ========== 用户套餐接口 ==========

// 获取可购买的套餐列表
func ListPackages(c *gin.Context) {
	var list []models.Package
	database.DB.Where("status = 1").Order("sort desc, id desc").Find(&list)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": list})
}

// 获取用户当前有效套餐列表
func GetUserPackage(c *gin.Context) {
	user := c.MustGet("user").(*models.User)

	var userPkgs []models.UserPackage
	database.DB.Preload("Package").Where("user_id = ? AND expire_at > ?", user.ID, time.Now()).
		Order("expire_at desc").Find(&userPkgs)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": userPkgs})
}

// 购买套餐
func BuyPackage(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	pkgID := c.Param("id")

	var pkg models.Package
	if err := database.DB.First(&pkg, pkgID).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "套餐不存在"})
		return
	}

	if pkg.Status != 1 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "套餐已下架"})
		return
	}

	// 重新获取用户信息（确保余额是最新的）
	var currentUser models.User
	database.DB.First(&currentUser, user.ID)

	// 检查余额
	if currentUser.Balance < pkg.Price {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "余额不足"})
		return
	}

	// 原子扣除余额（WHERE balance >= price 确保并发安全）
	result := database.DB.Model(&models.User{}).Where("id = ? AND balance >= ?", user.ID, pkg.Price).
		UpdateColumn("balance", gorm.Expr("balance - ?", pkg.Price))
	if result.RowsAffected == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "余额不足"})
		return
	}

	// 增加累计消费金额
	database.DB.Model(&models.User{}).Where("id = ?", user.ID).
		UpdateColumn("total_spent", gorm.Expr("total_spent + ?", pkg.Price))

	// 检查是否有未过期的同类套餐，如果有则续期
	var existingPkg models.UserPackage
	database.DB.Where("user_id = ? AND package_id = ? AND expire_at > ?", user.ID, pkg.ID, time.Now()).First(&existingPkg)

	if existingPkg.ID > 0 {
		// 续期
		newExpireAt := existingPkg.ExpireAt.AddDate(0, 0, pkg.Duration)
		database.DB.Model(&existingPkg).Update("expire_at", newExpireAt)

		// 发送TG套餐续期通知
		NotifyPackagePurchase(user.Username, pkg.Name+"(续期)", pkg.Price)

		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "续期成功", "data": gin.H{"expire_at": newExpireAt}})
		return
	}

	// 新购买
	userPkg := models.UserPackage{
		UserID:         user.ID,
		PackageID:      pkg.ID,
		ExtraApps:      pkg.ExtraApps,
		ExtraUsers:     pkg.ExtraUsers,
		ExtraCardTypes: pkg.ExtraCardTypes,
		ExtraCards:     pkg.ExtraCards,
		ExpireAt:       time.Now().AddDate(0, 0, pkg.Duration),
	}
	database.DB.Create(&userPkg)

	// 发送TG套餐开通通知
	NotifyPackagePurchase(user.Username, pkg.Name, pkg.Price)

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "购买成功", "data": userPkg})
}

// 获取用户套餐历史
func ListUserPackages(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var list []models.UserPackage
	var total int64

	query := database.DB.Model(&models.UserPackage{}).Preload("Package").Where("user_id = ?", user.ID)
	query.Count(&total)
	query.Offset((page - 1) * size).Limit(size).Order("id desc").Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}
