package handlers

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"jike-auth/database"
	"jike-auth/models"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ========== 易支付工具函数 ==========

func getEpayConfig() map[string]string {
	var configs []models.RechargeConfig
	database.DB.Find(&configs)
	m := make(map[string]string)
	for _, c := range configs {
		m[c.Key] = c.Value
	}
	return m
}

func generateEpaySign(params map[string]string, key string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		if k != "sign" && k != "sign_type" && params[k] != "" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteString("&")
		}
		b.WriteString(k + "=" + params[k])
	}
	b.WriteString(key)
	hash := md5.Sum([]byte(b.String()))
	return hex.EncodeToString(hash[:])
}

// ========== 公开接口 ==========

// GetRechargePackages 获取充值套餐（公开）
func GetRechargePackages(c *gin.Context) {
	var packages []models.RechargePackage
	database.DB.Where("status = ?", 1).Order("sort ASC, id ASC").Find(&packages)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": packages})
}

// EpayNotify 易支付异步回调
func EpayNotify(c *gin.Context) {
	params := make(map[string]string)
	for k, v := range c.Request.URL.Query() {
		if len(v) > 0 {
			params[k] = v[0]
		}
	}
	if c.Request.Method == "POST" {
		c.Request.ParseForm()
		for k, v := range c.Request.PostForm {
			if len(v) > 0 {
				params[k] = v[0]
			}
		}
	}

	cfg := getEpayConfig()
	epayKey := cfg["epay_key"]
	if epayKey == "" {
		c.String(http.StatusBadRequest, "fail")
		return
	}

	sign := params["sign"]
	if sign == "" || sign != generateEpaySign(params, epayKey) {
		c.String(http.StatusBadRequest, "fail")
		return
	}

	orderNo := params["out_trade_no"]
	tradeNo := params["trade_no"]
	tradeStatus := params["trade_status"]

	var order models.RechargeOrder
	if err := database.DB.Where("order_no = ?", orderNo).First(&order).Error; err != nil {
		c.String(http.StatusOK, "fail")
		return
	}
	if order.Status == 1 {
		c.String(http.StatusOK, "success")
		return
	}

	if tradeStatus == "TRADE_SUCCESS" {
		tx := database.DB.Begin()

		// 行级锁防并发
		var lockedOrder models.RechargeOrder
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("order_no = ?", orderNo).First(&lockedOrder).Error; err != nil {
			tx.Rollback()
			c.String(http.StatusOK, "fail")
			return
		}
		if lockedOrder.Status == 1 {
			tx.Rollback()
			c.String(http.StatusOK, "success")
			return
		}

		now := time.Now()
		lockedOrder.Status = 1
		lockedOrder.TradeNo = tradeNo
		lockedOrder.PaidAt = &now
		if err := tx.Save(&lockedOrder).Error; err != nil {
			tx.Rollback()
			c.String(http.StatusOK, "fail")
			return
		}

		// 更新用户余额
		var user models.User
		if err := tx.First(&user, lockedOrder.UserID).Error; err != nil {
			tx.Rollback()
			c.String(http.StatusOK, "fail")
			return
		}
		user.Balance = math.Round((user.Balance+lockedOrder.BalanceAmount)*100) / 100
		if err := tx.Save(&user).Error; err != nil {
			tx.Rollback()
			c.String(http.StatusOK, "fail")
			return
		}

		tx.Commit()
		c.String(http.StatusOK, "success")
		return
	}

	c.String(http.StatusOK, "fail")
}

// EpayReturn 易支付同步回调（重定向到前端结果页）
func EpayReturn(c *gin.Context) {
	orderNo := c.Query("out_trade_no")
	c.Redirect(http.StatusFound, fmt.Sprintf("/recharge/result?order_no=%s", orderNo))
}

// ========== 用户接口（需登录） ==========

// CreateRechargeOrder 创建充值订单
func CreateRechargeOrder(c *gin.Context) {
	userID := c.GetUint("userID")
	var req struct {
		PackageID uint   `json:"package_id" binding:"required"`
		PayType   string `json:"pay_type" binding:"required,oneof=alipay wxpay"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	var pkg models.RechargePackage
	if err := database.DB.First(&pkg, req.PackageID).Error; err != nil || pkg.Status != 1 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "套餐不存在或已下架"})
		return
	}

	orderNo := fmt.Sprintf("R%d%d", time.Now().Unix(), userID)
	order := models.RechargeOrder{
		OrderNo: orderNo, UserID: userID, PackageID: pkg.ID,
		Amount: pkg.Amount, BalanceAmount: pkg.BalanceAmount, PayType: req.PayType,
	}
	if err := database.DB.Create(&order).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "创建订单失败"})
		return
	}

	cfg := getEpayConfig()
	if cfg["epay_url"] == "" || cfg["epay_pid"] == "" || cfg["epay_key"] == "" {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "支付未配置"})
		return
	}

	params := map[string]string{
		"pid": cfg["epay_pid"], "type": req.PayType,
		"out_trade_no": orderNo, "notify_url": cfg["notify_url"],
		"return_url": cfg["return_url"], "name": pkg.Name,
		"money": fmt.Sprintf("%.2f", pkg.Amount),
	}
	params["sign"] = generateEpaySign(params, cfg["epay_key"])
	params["sign_type"] = "MD5"

	values := url.Values{}
	for k, v := range params {
		values.Add(k, v)
	}
	payURL := cfg["epay_url"] + "/submit.php?" + values.Encode()

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"order_no": orderNo, "pay_url": payURL}})
}

// GetRechargeOrderStatus 查询订单状态
func GetRechargeOrderStatus(c *gin.Context) {
	userID := c.GetUint("userID")
	orderNo := c.Query("order_no")
	if orderNo == "" {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "缺少订单号"})
		return
	}
	var order models.RechargeOrder
	if err := database.DB.Where("order_no = ? AND user_id = ?", orderNo, userID).First(&order).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "订单不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": order})
}

// GetRechargeOrders 用户充值记录
func GetRechargeOrders(c *gin.Context) {
	userID := c.GetUint("userID")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	var orders []models.RechargeOrder
	var total int64
	query := database.DB.Where("user_id = ?", userID)
	query.Model(&models.RechargeOrder{}).Count(&total)
	query.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&orders)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": orders, "total": total}})
}

// ========== 管理员接口 ==========

func AdminGetRechargeConfig(c *gin.Context) {
	m := getEpayConfig()
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": m})
}

func AdminSaveRechargeConfig(c *gin.Context) {
	var req map[string]string
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	descs := map[string]string{
		"epay_url": "易支付API地址", "epay_pid": "易支付商户ID", "epay_key": "易支付商户密钥",
		"notify_url": "异步回调地址", "return_url": "同步回调地址",
	}
	for key, value := range req {
		var cfg models.RechargeConfig
		if err := database.DB.Where("`key` = ?", key).First(&cfg).Error; err != nil {
			database.DB.Create(&models.RechargeConfig{Key: key, Value: value, Desc: descs[key]})
		} else {
			cfg.Value = value
			database.DB.Save(&cfg)
		}
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "保存成功"})
}

func AdminGetRechargePackages(c *gin.Context) {
	var packages []models.RechargePackage
	database.DB.Order("sort ASC, id ASC").Find(&packages)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": packages})
}

func AdminCreateRechargePackage(c *gin.Context) {
	var pkg models.RechargePackage
	if err := c.ShouldBindJSON(&pkg); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	database.DB.Create(&pkg)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": pkg})
}

func AdminUpdateRechargePackage(c *gin.Context) {
	id := c.Param("id")
	var pkg models.RechargePackage
	if err := database.DB.First(&pkg, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "套餐不存在"})
		return
	}
	if err := c.ShouldBindJSON(&pkg); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误"})
		return
	}
	database.DB.Save(&pkg)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func AdminDeleteRechargePackage(c *gin.Context) {
	id := c.Param("id")
	database.DB.Delete(&models.RechargePackage{}, id)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

func AdminGetRechargeOrders(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	status := c.Query("status")
	var orders []models.RechargeOrder
	var total int64
	query := database.DB.Model(&models.RechargeOrder{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	query.Count(&total)
	query.Preload("User").Preload("Package").Order("id DESC").Offset((page-1)*size).Limit(size).Find(&orders)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": orders, "total": total}})
}

func AdminCompleteRechargeOrder(c *gin.Context) {
	id := c.Param("id")
	var order models.RechargeOrder
	if err := database.DB.First(&order, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "订单不存在"})
		return
	}
	if order.Status == 1 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "订单已完成"})
		return
	}
	tx := database.DB.Begin()
	now := time.Now()
	order.Status = 1
	order.PaidAt = &now
	if err := tx.Save(&order).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "更新订单失败"})
		return
	}
	var user models.User
	if err := tx.First(&user, order.UserID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "用户不存在"})
		return
	}
	user.Balance = math.Round((user.Balance+order.BalanceAmount)*100) / 100
	if err := tx.Save(&user).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "更新余额失败"})
		return
	}
	tx.Commit()
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "补单成功"})
}
