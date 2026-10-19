package handlers

import (
	"jike-auth/database"
	"jike-auth/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// ========== 用户工单接口 ==========

// 获取工单列表
func ListTickets(c *gin.Context) {
	userID := c.GetUint("userID")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	status := c.Query("status")

	var tickets []models.Ticket
	var total int64

	query := database.DB.Model(&models.Ticket{}).Where("user_id = ?", userID)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	query.Count(&total)
	query.Order("updated_at desc").Offset((page - 1) * size).Limit(size).Find(&tickets)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": tickets, "total": total}})
}

// 创建工单
func CreateTicket(c *gin.Context) {
	userID := c.GetUint("userID")

	var req struct {
		Title    string `json:"title" binding:"required"`
		Category string `json:"category" binding:"required"`
		Content  string `json:"content" binding:"required"`
		Priority int    `json:"priority"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	if req.Priority == 0 {
		req.Priority = 1
	}

	ticket := models.Ticket{
		UserID:   userID,
		Title:    req.Title,
		Category: req.Category,
		Status:   1,
		Priority: req.Priority,
	}
	if err := database.DB.Create(&ticket).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "创建失败"})
		return
	}

	// 创建第一条消息
	message := models.TicketMessage{
		TicketID: ticket.ID,
		UserID:   userID,
		Content:  req.Content,
		IsAdmin:  0,
	}
	database.DB.Create(&message)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": ticket})
}

// 获取工单详情
func GetTicket(c *gin.Context) {
	userID := c.GetUint("userID")
	id, _ := strconv.Atoi(c.Param("id"))

	var ticket models.Ticket
	if err := database.DB.First(&ticket, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "工单不存在"})
		return
	}

	if ticket.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": ticket})
}

// 获取工单消息列表
func ListTicketMessages(c *gin.Context) {
	userID := c.GetUint("userID")
	ticketID, _ := strconv.Atoi(c.Param("id"))

	var ticket models.Ticket
	if err := database.DB.First(&ticket, ticketID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "工单不存在"})
		return
	}

	if ticket.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	var messages []models.TicketMessage
	database.DB.Preload("User").Where("ticket_id = ?", ticketID).Order("created_at asc").Find(&messages)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": messages})
}

// 发送工单消息
func SendTicketMessage(c *gin.Context) {
	userID := c.GetUint("userID")
	ticketID, _ := strconv.Atoi(c.Param("id"))

	var ticket models.Ticket
	if err := database.DB.First(&ticket, ticketID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "工单不存在"})
		return
	}

	if ticket.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	if ticket.Status == 4 {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "工单已关闭"})
		return
	}

	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "请输入消息内容"})
		return
	}

	message := models.TicketMessage{
		TicketID: ticket.ID,
		UserID:   userID,
		Content:  req.Content,
		IsAdmin:  0,
	}
	database.DB.Create(&message)

	// 更新工单时间
	database.DB.Model(&ticket).Update("updated_at", message.CreatedAt)

	// 加载用户信息
	database.DB.Preload("User").First(&message, message.ID)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": message})
}

// 关闭工单
func CloseTicket(c *gin.Context) {
	userID := c.GetUint("userID")
	id, _ := strconv.Atoi(c.Param("id"))

	var ticket models.Ticket
	if err := database.DB.First(&ticket, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "工单不存在"})
		return
	}

	if ticket.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"code": 1, "message": "无权访问"})
		return
	}

	database.DB.Model(&ticket).Update("status", 4)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "工单已关闭"})
}

// ========== 管理员工单接口 ==========

// 管理员获取工单列表
func AdminListTickets(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	status := c.Query("status")
	keyword := c.Query("keyword")

	var tickets []models.Ticket
	var total int64

	query := database.DB.Model(&models.Ticket{}).Preload("User")
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if keyword != "" {
		query = query.Where("title LIKE ?", "%"+database.EscapeLike(keyword)+"%")
	}
	query.Count(&total)
	query.Order("updated_at desc").Offset((page - 1) * size).Limit(size).Find(&tickets)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"list": tickets, "total": total}})
}

// 管理员获取工单详情
func AdminGetTicket(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	var ticket models.Ticket
	if err := database.DB.Preload("User").First(&ticket, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "工单不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": ticket})
}

// 管理员获取工单消息
func AdminListTicketMessages(c *gin.Context) {
	ticketID, _ := strconv.Atoi(c.Param("id"))

	var messages []models.TicketMessage
	database.DB.Preload("User").Where("ticket_id = ?", ticketID).Order("created_at asc").Find(&messages)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": messages})
}

// 管理员回复工单
func AdminSendTicketMessage(c *gin.Context) {
	user := c.MustGet("user").(*models.User)
	ticketID, _ := strconv.Atoi(c.Param("id"))

	var ticket models.Ticket
	if err := database.DB.First(&ticket, ticketID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 1, "message": "工单不存在"})
		return
	}

	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "请输入消息内容"})
		return
	}

	message := models.TicketMessage{
		TicketID: ticket.ID,
		UserID:   user.ID,
		Content:  req.Content,
		IsAdmin:  1,
	}
	database.DB.Create(&message)

	// 更新工单状态为处理中
	if ticket.Status == 1 {
		database.DB.Model(&ticket).Update("status", 2)
	}
	database.DB.Model(&ticket).Update("updated_at", message.CreatedAt)

	// 加载用户信息
	database.DB.Preload("User").First(&message, message.ID)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": message})
}

// 管理员更新工单状态
func AdminUpdateTicketStatus(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	var req struct {
		Status int `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1, "message": "参数错误"})
		return
	}

	database.DB.Model(&models.Ticket{}).Where("id = ?", id).Update("status", req.Status)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// 管理员删除工单
func AdminDeleteTicket(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	// 删除消息
	database.DB.Where("ticket_id = ?", id).Delete(&models.TicketMessage{})
	// 删除工单
	database.DB.Delete(&models.Ticket{}, id)

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}
