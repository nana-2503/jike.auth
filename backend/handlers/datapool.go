package handlers

import (
	"jike-auth/cache"
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// ========== 用户端数据池管理 ==========

// 获取数据池列表
func ListDataPools(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	appIDStr := c.Query("app_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	var list []models.DataPool
	var total int64

	query := database.DB.Model(&models.DataPool{}).
		Joins("JOIN apps ON apps.id = data_pools.app_id").
		Where("apps.user_id = ? AND apps.deleted_at IS NULL", user.ID)

	if appIDStr != "" {
		query = query.Where("data_pools.app_id = ?", appIDStr)
	}

	query.Count(&total)
	query.Preload("App").Order("data_pools.sort asc, data_pools.id desc").
		Offset((page - 1) * size).Limit(size).Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 获取单个数据池
func GetDataPool(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var pool models.DataPool
	if err := database.DB.Preload("App").First(&pool, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "数据池不存在"})
		return
	}

	// 验证归属
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", pool.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": pool})
}

// 创建数据池
func CreateDataPool(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	var req struct {
		AppID        uint   `json:"app_id" binding:"required"`
		Name         string `json:"name" binding:"required"`
		Code         string `json:"code" binding:"required"`
		Sort         int    `json:"sort"`
		RequireLogin int    `json:"require_login"`
		Remark       string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 验证APP归属
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", req.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问此应用"})
		return
	}

	// 检查编码唯一性
	var count int64
	database.DB.Model(&models.DataPool{}).Where("app_id = ? AND code = ?", req.AppID, req.Code).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "数据池编码已存在"})
		return
	}

	pool := models.DataPool{
		AppID:        req.AppID,
		Name:         req.Name,
		Code:         req.Code,
		Sort:         req.Sort,
		RequireLogin: req.RequireLogin,
		Remark:       req.Remark,
	}
	if err := database.DB.Create(&pool).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	cache.ClearSDKCache(req.AppID, "datapools")
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": pool})
}

// 更新数据池
func UpdateDataPool(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var pool models.DataPool
	if err := database.DB.First(&pool, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "数据池不存在"})
		return
	}

	// 验证归属
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", pool.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Name         *string `json:"name"`
		Code         *string `json:"code"`
		Sort         *int    `json:"sort"`
		RequireLogin *int    `json:"require_login"`
		Remark       *string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Code != nil {
		// 检查编码唯一性
		var count int64
		database.DB.Model(&models.DataPool{}).Where("app_id = ? AND code = ? AND id != ?", pool.AppID, *req.Code, pool.ID).Count(&count)
		if count > 0 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "数据池编码已存在"})
			return
		}
		updates["code"] = *req.Code
	}
	if req.Sort != nil {
		updates["sort"] = *req.Sort
	}
	if req.RequireLogin != nil {
		updates["require_login"] = *req.RequireLogin
	}
	if req.Remark != nil {
		updates["remark"] = *req.Remark
	}

	database.DB.Model(&pool).Updates(updates)
	cache.ClearSDKCache(pool.AppID, "datapools")
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 删除数据池
func DeleteDataPool(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	id := c.Param("id")

	var pool models.DataPool
	if err := database.DB.First(&pool, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "数据池不存在"})
		return
	}

	// 验证归属
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", pool.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	// 删除数据池及其数据项
	database.DB.Where("data_pool_id = ?", pool.ID).Delete(&models.DataItem{})
	database.DB.Delete(&pool)

	cache.ClearSDKCache(pool.AppID, "datapools")
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// ========== 数据项管理 ==========

// 获取数据项列表
func ListDataItems(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	poolID := c.Param("poolId")
	keyword := c.Query("keyword")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	// 验证数据池归属
	var pool models.DataPool
	if err := database.DB.First(&pool, poolID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "数据池不存在"})
		return
	}
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", pool.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var list []models.DataItem
	var total int64

	query := database.DB.Model(&models.DataItem{}).Where("data_pool_id = ?", poolID)
	if keyword != "" {
		kw := "%" + database.EscapeLike(keyword) + "%"
		query = query.Where("name LIKE ? OR code LIKE ?", kw, kw)
	}

	query.Count(&total)
	query.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&list)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": list, "total": total}})
}

// 获取单个数据项
func GetDataItem(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	poolID := c.Param("poolId")
	itemID := c.Param("itemId")

	// 验证数据池归属
	var pool models.DataPool
	if err := database.DB.First(&pool, poolID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "数据池不存在"})
		return
	}
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", pool.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var item models.DataItem
	if err := database.DB.Where("id = ? AND data_pool_id = ?", itemID, poolID).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "数据项不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": item})
}

// 创建数据项
func CreateDataItem(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	poolID := c.Param("poolId")

	// 验证数据池归属
	var pool models.DataPool
	if err := database.DB.First(&pool, poolID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "数据池不存在"})
		return
	}
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", pool.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var req struct {
		Name         string `json:"name" binding:"required"`
		Code         string `json:"code" binding:"required"`
		Content      string `json:"content"`
		ModifyCount  int    `json:"modify_count"`
		ExpireAt     string `json:"expire_at"`
		RequireLogin int    `json:"require_login"`
		RequirePaid  int    `json:"require_paid"`
		AllowDelete  int    `json:"allow_delete"`
		AllowModify  int    `json:"allow_modify"`
		AllowExpire  int    `json:"allow_expire"`
		Remark       string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	// 检查编码唯一性
	var count int64
	database.DB.Model(&models.DataItem{}).Where("data_pool_id = ? AND code = ?", pool.ID, req.Code).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "数据编号已存在"})
		return
	}

	item := models.DataItem{
		DataPoolID:   pool.ID,
		Name:         req.Name,
		Code:         req.Code,
		Content:      req.Content,
		ModifyCount:  req.ModifyCount,
		RequireLogin: req.RequireLogin,
		RequirePaid:  req.RequirePaid,
		AllowDelete:  req.AllowDelete,
		AllowModify:  req.AllowModify,
		AllowExpire:  req.AllowExpire,
		Remark:       req.Remark,
	}

	if req.ExpireAt != "" {
		t, err := parseTime(req.ExpireAt)
		if err == nil {
			item.ExpireAt = &t
		}
	}

	if err := database.DB.Create(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": item})
}

// 更新数据项
func UpdateDataItem(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	poolID := c.Param("poolId")
	itemID := c.Param("itemId")

	// 验证数据池归属
	var pool models.DataPool
	if err := database.DB.First(&pool, poolID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "数据池不存在"})
		return
	}
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", pool.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var item models.DataItem
	if err := database.DB.Where("id = ? AND data_pool_id = ?", itemID, poolID).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "数据项不存在"})
		return
	}

	var req struct {
		Name         *string `json:"name"`
		Code         *string `json:"code"`
		Content      *string `json:"content"`
		ModifyCount  *int    `json:"modify_count"`
		ExpireAt     *string `json:"expire_at"`
		RequireLogin *int    `json:"require_login"`
		RequirePaid  *int    `json:"require_paid"`
		AllowDelete  *int    `json:"allow_delete"`
		AllowModify  *int    `json:"allow_modify"`
		AllowExpire  *int    `json:"allow_expire"`
		Remark       *string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	updates := make(map[string]interface{})
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Code != nil {
		// 检查编码唯一性
		var count int64
		database.DB.Model(&models.DataItem{}).Where("data_pool_id = ? AND code = ? AND id != ?", pool.ID, *req.Code, item.ID).Count(&count)
		if count > 0 {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "数据编号已存在"})
			return
		}
		updates["code"] = *req.Code
	}
	if req.Content != nil {
		updates["content"] = *req.Content
	}
	if req.ModifyCount != nil {
		updates["modify_count"] = *req.ModifyCount
	}
	if req.ExpireAt != nil {
		if *req.ExpireAt == "" {
			updates["expire_at"] = nil
		} else {
			t, err := parseTime(*req.ExpireAt)
			if err == nil {
				updates["expire_at"] = t
			}
		}
	}
	if req.RequireLogin != nil {
		updates["require_login"] = *req.RequireLogin
	}
	if req.RequirePaid != nil {
		updates["require_paid"] = *req.RequirePaid
	}
	if req.AllowDelete != nil {
		updates["allow_delete"] = *req.AllowDelete
	}
	if req.AllowModify != nil {
		updates["allow_modify"] = *req.AllowModify
	}
	if req.AllowExpire != nil {
		updates["allow_expire"] = *req.AllowExpire
	}
	if req.Remark != nil {
		updates["remark"] = *req.Remark
	}

	database.DB.Model(&item).Updates(updates)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 删除数据项
func DeleteDataItem(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	poolID := c.Param("poolId")
	itemID := c.Param("itemId")

	// 验证数据池归属
	var pool models.DataPool
	if err := database.DB.First(&pool, poolID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "数据池不存在"})
		return
	}
	var app models.App
	if err := database.DB.Where("id = ? AND user_id = ?", pool.AppID, user.ID).First(&app).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var item models.DataItem
	if err := database.DB.Where("id = ? AND data_pool_id = ?", itemID, poolID).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "数据项不存在"})
		return
	}

	database.DB.Delete(&item)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}
