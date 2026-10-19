package models

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID           uint           `json:"id" gorm:"primaryKey"`
	Username     string         `json:"username" gorm:"uniqueIndex;size:50"`
	Email        string         `json:"email" gorm:"uniqueIndex;size:100"`
	Password     string         `json:"-" gorm:"size:100"`
	Nickname     string         `json:"nickname" gorm:"size:50"`
	Avatar       string         `json:"avatar" gorm:"size:255"`
	Role         int            `json:"role" gorm:"default:0"`                    // 0: 普通用户, 1: 管理员
	Status       int            `json:"status" gorm:"default:1"`                  // 0: 禁用, 1: 正常
	Balance      float64        `json:"balance" gorm:"default:0"`                 // 余额
	TotalSpent   float64        `json:"total_spent" gorm:"default:0"`             // 累计消费金额
	TokenVersion uint           `json:"token_version" gorm:"default:0"`           // Token版本号，修改密码时递增
	MaxApps      int            `json:"max_apps" gorm:"default:-1"`               // 最大应用数 -1无限制
	MaxUsers     int            `json:"max_users" gorm:"default:-1"`              // 最大用户数 -1无限制
	MaxCardTypes int            `json:"max_card_types" gorm:"default:-1"`         // 最大卡种数 -1无限制
	MaxCards     int            `json:"max_cards" gorm:"default:-1"`              // 最大卡号数 -1无限制
	ActivityCode string         `json:"activity_code" gorm:"size:20;uniqueIndex"` // 活动频道码
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
}

type Announcement struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	Title     string         `json:"title" gorm:"size:200"`
	Content   string         `json:"content" gorm:"type:text"`
	Color     string         `json:"color" gorm:"size:20;default:primary"` // default, primary, success, warning, danger
	Popup     int            `json:"popup" gorm:"default:0"`               // 0: 不弹窗, 1: 弹窗显示
	Status    int            `json:"status" gorm:"default:1"`              // 0: 禁用, 1: 启用
	Sort      int            `json:"sort" gorm:"default:0"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

type SiteConfig struct {
	ID           uint   `json:"id" gorm:"primaryKey"`
	SiteName     string `json:"site_name" gorm:"size:100"`
	SiteSubtitle string `json:"site_subtitle" gorm:"size:200"`
	SiteLogo     string `json:"site_logo" gorm:"size:500"`
	SiteLogoDark string `json:"site_logo_dark" gorm:"size:500"`
	SiteFavicon  string `json:"site_favicon" gorm:"size:500"`
	ServiceQQ    string `json:"service_qq" gorm:"size:50"`
}

type App struct {
	ID             uint           `json:"id" gorm:"primaryKey"`
	UserID         uint           `json:"user_id" gorm:"index"`
	User           *User          `json:"user,omitempty" gorm:"foreignKey:UserID"`
	AppName        string         `json:"app_name" gorm:"size:100"`
	AppKey         string         `json:"app_key" gorm:"uniqueIndex;size:32"`
	AppCode        string         `json:"app_code" gorm:"uniqueIndex;size:13"`
	AppSecret      string         `json:"app_secret" gorm:"size:64"`
	Description    string         `json:"description" gorm:"size:500"`
	LoginMode      int            `json:"login_mode" gorm:"default:1"`                    // 1: 账号登录, 2: 卡密登录, 3: 两者都支持
	BillingMode    int            `json:"billing_mode" gorm:"default:1"`                  // 1: 完全免费, 2: 计时收费, 3: 计点收费
	Heartbeat      int            `json:"heartbeat" gorm:"default:60"`                    // 心跳周期(秒)
	CryptoMode     string         `json:"crypto_mode" gorm:"size:50;default:aes-256-cbc"` // 通讯加密模式
	SignAlgo       string         `json:"sign_algo" gorm:"size:500;default:''"`           // 客户端签名算法
	ServerSignAlgo string         `json:"server_sign_algo" gorm:"size:500;default:''"`    // 服务端签名算法
	CustomFields   string         `json:"custom_fields" gorm:"type:text"`                 // 应用自定义字段(JSON对象)，提供给自定义通讯算法读取
	BindDevice     int            `json:"bind_device" gorm:"default:0"`                   // 是否绑定设备特征 0:否 1:是
	ChannelMode    int            `json:"channel_mode" gorm:"default:1"`                  // 1: 单绑定通道, 2: 账户总通道
	LoginKick      int            `json:"login_kick" gorm:"default:0"`                    // 登录顶号 0:关闭(通道满拒绝登录) 1:开启(踢掉最早的会话)
	RegMode        int            `json:"reg_mode" gorm:"default:1"`                      // 1: 关闭注册, 2: 开放注册(无限制), 3: 开放注册(需充值卡), 4: 开放注册(限制次数)
	RegLimit       int            `json:"reg_limit" gorm:"default:1"`                     // 特征限制注册次数(reg_mode=4时有效)
	RegChannels    int            `json:"reg_channels" gorm:"default:1"`                  // 注册默认通道数
	RegFeatures    int            `json:"reg_features" gorm:"default:1"`                  // 注册默认特征数
	RegDuration    int            `json:"reg_duration" gorm:"default:0"`                  // 注册赠送时长(分钟) 0=不赠送
	RegPoints      int            `json:"reg_points" gorm:"default:0"`                    // 注册赠送点数 0=不赠送
	TrialDuration  int            `json:"trial_duration" gorm:"default:0"`                // 试用时长(分钟) 0=不试用
	TrialPoints    int            `json:"trial_points" gorm:"default:0"`                  // 试用点数
	TrialLimit     int            `json:"trial_limit" gorm:"default:0"`                   // 特征试用限制次数 0=不限制
	SDKLogEnabled  int            `json:"sdk_log_enabled" gorm:"default:0"`               // SDK接口日志 0:关闭 1:开启
	Maintenance    int            `json:"maintenance" gorm:"default:0"`                   // 维护模式 0:关闭 1:开启(禁止登录并踢下线)
	Status         int            `json:"status" gorm:"default:1"`                        // 0: 禁用, 1: 正常
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `json:"-" gorm:"index"`
}

// SDKInterfaceLog 记录客户端HTTP SDK接口请求和响应，按应用开关控制，仅保留最近3天。
type SDKInterfaceLog struct {
	ID              uint      `json:"id" gorm:"primaryKey"`
	AppID           uint      `json:"app_id" gorm:"index"`
	App             *App      `json:"app,omitempty" gorm:"foreignKey:AppID"`
	AppCode         string    `json:"app_code" gorm:"size:32;index"`
	Method          string    `json:"method" gorm:"size:10"`
	Path            string    `json:"path" gorm:"size:200;index"`
	ClientIP        string    `json:"client_ip" gorm:"size:50;index"`
	UserAgent       string    `json:"user_agent" gorm:"size:500"`
	Token           string    `json:"token" gorm:"type:text"`
	RequestHeaders  string    `json:"request_headers" gorm:"type:text"`
	RequestBody     string    `json:"request_body" gorm:"type:text"`
	RequestData     string    `json:"request_data" gorm:"type:text"`
	ResponseStatus  int       `json:"response_status" gorm:"index"`
	ResponseBody    string    `json:"response_body" gorm:"type:text"`
	ResponseData    string    `json:"response_data" gorm:"type:text"`
	ResponseCode    int       `json:"response_code" gorm:"index"`
	ResponseMessage string    `json:"response_message" gorm:"size:500"`
	DurationMs      int64     `json:"duration_ms"`
	DecryptError    string    `json:"decrypt_error" gorm:"size:500"`
	ResponseError   string    `json:"response_error" gorm:"size:500"`
	CreatedAt       time.Time `json:"created_at" gorm:"index"`
}

// 软件用户 - 按应用独立，每个应用有独立的用户
type AppUser struct {
	ID             uint           `json:"id" gorm:"primaryKey"`
	AppID          uint           `json:"app_id" gorm:"index"`                   // 所属应用ID
	App            *App           `json:"app,omitempty" gorm:"foreignKey:AppID"` // 所属应用
	AgentID        *uint          `json:"agent_id" gorm:"index"`                 // 代理ID(NULL表示非代理用户)
	Agent          *Agent         `json:"agent,omitempty" gorm:"foreignKey:AgentID"`
	Username       string         `json:"username" gorm:"size:50;index"`                       // 用户名
	Avatar         string         `json:"avatar" gorm:"size:500"`                              // 头像
	Password       string         `json:"-" gorm:"size:100"`                                   // 密码
	Status         int            `json:"status" gorm:"default:1"`                             // 1: 正常, 2: 封停, 3: 冻结
	IsPaid         int            `json:"is_paid" gorm:"default:0"`                            // 是否收费账户 0:否 1:是
	IsTester       int            `json:"is_tester" gorm:"default:0"`                          // 是否内测账户 0:否 1:是
	ExpireAt       *time.Time     `json:"expire_at"`                                           // 到期时间
	Points         int            `json:"points" gorm:"default:0"`                             // 点数余额
	Channels       int            `json:"channels" gorm:"default:1"`                           // 通道数量
	Features       int            `json:"features" gorm:"default:1"`                           // 特征数量
	UnbindDay      int            `json:"unbind_day" gorm:"default:-1"`                        // 解绑次数-天 -1无限
	UnbindWeek     int            `json:"unbind_week" gorm:"default:-1"`                       // 解绑次数-周
	UnbindMonth    int            `json:"unbind_month" gorm:"default:-1"`                      // 解绑次数-月
	UnbindQuarter  int            `json:"unbind_quarter" gorm:"default:-1"`                    // 解绑次数-季
	UnbindHalfY    int            `json:"unbind_halfy" gorm:"column:unbind_half_y;default:-1"` // 解绑次数-半年
	UnbindYear     int            `json:"unbind_year" gorm:"default:-1"`                       // 解绑次数-年
	UnbindTotal    int            `json:"unbind_total" gorm:"default:-1"`                      // 解绑次数-总
	ExtraData      string         `json:"extra_data" gorm:"type:text"`                         // 附加数据
	CloudData      string         `json:"cloud_data" gorm:"type:text"`                         // 云端数据
	RegFeature     string         `json:"reg_feature" gorm:"size:500"`                         // 注册特征
	InviteCode     string         `json:"invite_code" gorm:"size:20;index"`                    // 推广码
	InviterID      *uint          `json:"inviter_id" gorm:"index"`                             // 上级推广人ID(NULL表示无推广人)
	Inviter        *AppUser       `json:"inviter,omitempty" gorm:"foreignKey:InviterID"`
	InviteCount    int            `json:"invite_count" gorm:"default:0"`  // 直接推广人数
	RebatePoints   int            `json:"rebate_points" gorm:"default:0"` // 返利积分余额（用于积分商城）
	TotalRebate    int            `json:"total_rebate" gorm:"default:0"`  // 累计获得返利积分
	QQ             string         `json:"qq" gorm:"size:20"`              // QQ
	Wechat         string         `json:"wechat" gorm:"size:50"`          // 微信
	Phone          string         `json:"phone" gorm:"size:20"`           // 手机
	Email          string         `json:"email" gorm:"size:100"`          // 邮箱
	IsCardUser     int            `json:"is_card_user" gorm:"default:0"`  // 是否卡号用户 0:否 1:是
	IsTrial        int            `json:"is_trial" gorm:"default:0"`      // 是否试用用户 0:否 1:是
	RegIP          string         `json:"reg_ip" gorm:"size:50"`          // 注册IP
	RegAddress     string         `json:"reg_address" gorm:"size:200"`    // 注册地址
	LastRechargeAt *time.Time     `json:"last_recharge_at"`               // 最后充值时间
	FrozenAt       *time.Time     `json:"frozen_at"`                      // 冻结开始时间
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `json:"-" gorm:"index"`
}

// 用户标识（自定义键值数据）- 按用户存储
type AppUserData struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	AppUserID uint           `json:"app_user_id" gorm:"index"` // 关联到用户
	AppUser   *AppUser       `json:"app_user,omitempty" gorm:"foreignKey:AppUserID"`
	Key       string         `json:"key" gorm:"size:100;index"` // 标识键名
	Value     string         `json:"value" gorm:"type:text"`    // 标识值
	Remark    string         `json:"remark" gorm:"size:200"`    // 备注
	ExpireAt  *time.Time     `json:"expire_at"`                 // 过期时间
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// 用户特征码（设备绑定）- 按用户存储
type AppUserDevice struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	AppUserID uint           `json:"app_user_id" gorm:"index"` // 关联到用户
	AppUser   *AppUser       `json:"app_user,omitempty" gorm:"foreignKey:AppUserID"`
	Feature   string         `json:"feature" gorm:"size:500;index"` // 特征码
	Remark    string         `json:"remark" gorm:"size:200"`        // 备注
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// 卡种
type CardType struct {
	ID            uint           `json:"id" gorm:"primaryKey"`
	AppID         uint           `json:"app_id" gorm:"index"`
	App           *App           `json:"app,omitempty" gorm:"foreignKey:AppID"`
	Category      int            `json:"category" gorm:"default:1"`                           // 卡种分类 1:充值卡 2:登录卡
	Name          string         `json:"name" gorm:"size:100"`                                // 卡种名称
	Prefix        string         `json:"prefix" gorm:"size:20"`                               // 附加卡头
	Points        int            `json:"points" gorm:"default:0"`                             // 充值点数
	RebatePoints  int            `json:"rebate_points" gorm:"default:0"`                      // 消费返利积分
	Duration      int            `json:"duration" gorm:"default:0"`                           // 充值时间(分钟) 0=不充值 -1=永久
	GenRule       int            `json:"gen_rule" gorm:"default:1"`                           // 制卡规则 1:小写 2:大写 3:大小写 4:小写+数字 5:大写+数字 6:大小写+数字
	MaxUse        int            `json:"max_use" gorm:"default:1"`                            // 可充值次数
	MaxUserUse    int            `json:"max_user_use" gorm:"default:1"`                       // 每用户可充值次数
	Channels      int            `json:"channels" gorm:"default:1"`                           // 通道数量
	Features      int            `json:"features" gorm:"default:1"`                           // 特征数量
	UnbindDay     int            `json:"unbind_day" gorm:"default:-1"`                        // 解绑次数-天
	UnbindWeek    int            `json:"unbind_week" gorm:"default:-1"`                       // 解绑次数-周
	UnbindMonth   int            `json:"unbind_month" gorm:"default:-1"`                      // 解绑次数-月
	UnbindQuarter int            `json:"unbind_quarter" gorm:"default:-1"`                    // 解绑次数-季
	UnbindHalfY   int            `json:"unbind_halfy" gorm:"column:unbind_half_y;default:-1"` // 解绑次数-半年
	UnbindYear    int            `json:"unbind_year" gorm:"default:-1"`                       // 解绑次数-年
	UnbindTotal   int            `json:"unbind_total" gorm:"default:-1"`                      // 解绑次数-总
	CardLength    int            `json:"card_length" gorm:"default:16"`                       // 卡号长度
	ExtraData     string         `json:"extra_data" gorm:"type:text"`                         // 附加数据
	Remark        string         `json:"remark" gorm:"size:500"`                              // 备注
	WithdrawPrice float64        `json:"withdraw_price" gorm:"default:0"`                     // 提卡单价
	StockWarn     int            `json:"stock_warn" gorm:"default:0"`                         // 未使用库存预警阈值 0=关闭
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `json:"-" gorm:"index"`
}

// 卡号
type Card struct {
	ID         uint           `json:"id" gorm:"primaryKey"`
	AppID      uint           `json:"app_id" gorm:"index"`
	App        *App           `json:"app,omitempty" gorm:"foreignKey:AppID"`
	CardTypeID uint           `json:"card_type_id" gorm:"index"`
	CardType   *CardType      `json:"card_type,omitempty" gorm:"foreignKey:CardTypeID"`
	AgentID    *uint          `json:"agent_id" gorm:"index"` // 代理ID(NULL表示非代理制卡)
	Agent      *Agent         `json:"agent,omitempty" gorm:"foreignKey:AgentID"`
	CardNo     string         `json:"card_no" gorm:"uniqueIndex;size:100"` // 卡号
	BatchNo    string         `json:"batch_no" gorm:"index;size:50"`       // 批次号
	Status     int            `json:"status" gorm:"default:1"`             // 1:未使用 2:已使用 3:已禁用
	UsedCount  int            `json:"used_count" gorm:"default:0"`         // 已使用次数
	UsedBy     string         `json:"used_by" gorm:"size:500"`             // 使用者(JSON数组存储用户ID和使用次数)
	Remark     string         `json:"remark" gorm:"size:500"`              // 备注
	UsedAt     *time.Time     `json:"used_at"`                             // 最后使用时间
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	DeletedAt  gorm.DeletedAt `json:"-" gorm:"index"`
}

// 卡号使用记录
type CardUseLog struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	CardID    uint      `json:"card_id" gorm:"index"` // 卡号ID
	Card      *Card     `json:"card,omitempty" gorm:"foreignKey:CardID"`
	AppID     uint      `json:"app_id" gorm:"index"`      // 应用ID
	AppUserID uint      `json:"app_user_id" gorm:"index"` // 使用者ID
	AppUser   *AppUser  `json:"app_user,omitempty" gorm:"foreignKey:AppUserID"`
	Username  string    `json:"username" gorm:"size:50"`                // 使用者用户名(冗余)
	Action    string    `json:"action" gorm:"size:20;default:recharge"` // 操作类型: recharge=充值, login=卡号登录
	IP        string    `json:"ip" gorm:"size:50"`                      // 客户端IP
	Feature   string    `json:"feature" gorm:"size:500"`                // 特征码
	ClientID  string    `json:"client_id" gorm:"size:100"`              // 客户端ID
	ClientOS  string    `json:"client_os" gorm:"size:100"`              // 客户端操作系统
	CreatedAt time.Time `json:"created_at"`
}

// 应用公告
type AppAnnouncement struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	AppID     uint           `json:"app_id" gorm:"index"`
	App       *App           `json:"app,omitempty" gorm:"foreignKey:AppID"`
	Title     string         `json:"title" gorm:"size:200"`
	Content   string         `json:"content" gorm:"type:text"`
	Status    int            `json:"status" gorm:"default:1"` // 0:禁用 1:启用
	Sort      int            `json:"sort" gorm:"default:0"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// 应用版本
type AppVersion struct {
	ID           uint           `json:"id" gorm:"primaryKey"`
	AppID        uint           `json:"app_id" gorm:"index"`
	App          *App           `json:"app,omitempty" gorm:"foreignKey:AppID"`
	Version      string         `json:"version" gorm:"size:50"`         // 版本号
	CheckMD5     int            `json:"check_md5" gorm:"default:0"`     // 是否校验MD5 0:否 1:是
	MD5Value     string         `json:"md5_value" gorm:"size:64"`       // MD5值
	IsBeta       int            `json:"is_beta" gorm:"default:0"`       // 是否内测版本 0:否 1:是
	IsDefault    int            `json:"is_default" gorm:"default:0"`    // 是否默认版本 0:否 1:是
	MinRequired  int            `json:"min_required" gorm:"default:0"`  // 最低可用版本 0:否 1:是
	ForceUpdate  int            `json:"force_update" gorm:"default:0"`  // 强制更新版本 0:否 1:是
	GrayEnabled  int            `json:"gray_enabled" gorm:"default:0"`  // 灰度测试 0:关闭 1:开启
	GrayFeatures string         `json:"gray_features" gorm:"type:text"` // 灰度特征码白名单，逗号/换行分隔
	Status       int            `json:"status" gorm:"default:1"`        // 0:禁用 1:启用
	DownloadURL  string         `json:"download_url" gorm:"size:500"`   // 下载链接
	Changelog    string         `json:"changelog" gorm:"type:text"`     // 更新日志(Markdown)
	PublishedAt  *time.Time     `json:"published_at"`                   // 发布时间
	Remark       string         `json:"remark" gorm:"size:500"`         // 备注
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
}

// 作者通知
type UserNotification struct {
	ID        uint       `json:"id" gorm:"primaryKey"`
	UserID    uint       `json:"user_id" gorm:"index"`
	Type      string     `json:"type" gorm:"size:50;index"` // system, stock, version, ticket
	Level     string     `json:"level" gorm:"size:20;default:info"`
	Title     string     `json:"title" gorm:"size:200"`
	Content   string     `json:"content" gorm:"type:text"`
	RefType   string     `json:"ref_type" gorm:"size:50"`
	RefID     uint       `json:"ref_id" gorm:"default:0"`
	ReadAt    *time.Time `json:"read_at"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// 试用特征记录
type TrialFeatureLog struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	AppID     uint      `json:"app_id" gorm:"index"`
	Feature   string    `json:"feature" gorm:"size:500;index"`
	AppUserID uint      `json:"app_user_id"`
	CreatedAt time.Time `json:"created_at"`
}

// 在线会话
type OnlineSession struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	AppID       uint           `json:"app_id" gorm:"index"`
	App         *App           `json:"app,omitempty" gorm:"foreignKey:AppID"`
	AppUserID   uint           `json:"app_user_id" gorm:"index"`
	AppUser     *AppUser       `json:"app_user,omitempty" gorm:"foreignKey:AppUserID"`
	Token       string         `json:"token" gorm:"uniqueIndex;size:64"` // 令牌UUID
	Version     string         `json:"version" gorm:"size:50"`           // 登录版本
	ClientID    string         `json:"client_id" gorm:"size:100"`        // 客户端ID
	ClientOS    string         `json:"client_os" gorm:"size:100"`        // 客户端操作系统
	ClientIP    string         `json:"client_ip" gorm:"size:50"`         // 客户端IP
	Feature     string         `json:"feature" gorm:"size:500"`          // 特征信息
	LoginAt     time.Time      `json:"login_at"`                         // 登录时间
	HeartbeatAt time.Time      `json:"heartbeat_at"`                     // 最后心跳时间
	ExpireAt    *time.Time     `json:"expire_at"`                        // 用户到期时间(冗余)
	Points      int            `json:"points" gorm:"default:0"`          // 点数余额(冗余)
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"` // 软删除
}

// SDK验证码
type SDKCaptcha struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	CaptchaID string    `json:"captcha_id" gorm:"uniqueIndex;size:64"` // 验证码ID
	Type      string    `json:"type" gorm:"size:20;index"`             // login/register/recharge/changepwd
	Answer    string    `json:"answer" gorm:"size:20"`                 // 验证码答案
	Used      int       `json:"used" gorm:"default:0"`                 // 0:未使用 1:已使用
	ExpireAt  time.Time `json:"expire_at"`                             // 过期时间
	CreatedAt time.Time `json:"created_at"`
}

// 代理账户
type Agent struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	UserID    uint           `json:"user_id" gorm:"index"` // 所属用户
	User      *User          `json:"user,omitempty" gorm:"foreignKey:UserID"`
	AppID     uint           `json:"app_id" gorm:"index"` // 所属应用
	App       *App           `json:"app,omitempty" gorm:"foreignKey:AppID"`
	ParentID  *uint          `json:"parent_id" gorm:"index"` // 上级代理ID(NULL表示一级代理)
	Parent    *Agent         `json:"parent,omitempty" gorm:"foreignKey:ParentID"`
	Username  string         `json:"username" gorm:"size:50;index"` // 代理账号
	Password  string         `json:"-" gorm:"size:100"`             // 密码
	Nickname  string         `json:"nickname" gorm:"size:50"`       // 昵称
	Avatar    string         `json:"avatar" gorm:"size:255"`        // 头像
	Balance   float64        `json:"balance" gorm:"default:0"`      // 余额
	QQ        string         `json:"qq" gorm:"size:20"`             // QQ
	Phone     string         `json:"phone" gorm:"size:20"`          // 手机
	Status    int            `json:"status" gorm:"default:1"`       // 1:正常 2:禁用
	Remark    string         `json:"remark" gorm:"size:500"`        // 备注
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// 代理卡种权限
type AgentCardType struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	AgentID    uint      `json:"agent_id" gorm:"index;uniqueIndex:idx_agent_cardtype"` // 代理ID
	Agent      *Agent    `json:"agent,omitempty" gorm:"foreignKey:AgentID"`
	CardTypeID uint      `json:"card_type_id" gorm:"index;uniqueIndex:idx_agent_cardtype"` // 卡种ID
	CardType   *CardType `json:"card_type,omitempty" gorm:"foreignKey:CardTypeID"`
	Price      float64   `json:"price" gorm:"default:0"` // 制卡单价
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// 代理制卡记录
type AgentCardLog struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	AgentID    uint      `json:"agent_id" gorm:"index"`
	Agent      *Agent    `json:"agent,omitempty" gorm:"foreignKey:AgentID"`
	CardTypeID uint      `json:"card_type_id" gorm:"index"`
	CardType   *CardType `json:"card_type,omitempty" gorm:"foreignKey:CardTypeID"`
	BatchNo    string    `json:"batch_no" gorm:"index;size:50"` // 批次号
	Count      int       `json:"count" gorm:"default:0"`        // 制卡数量
	Price      float64   `json:"price" gorm:"default:0"`        // 单价
	TotalCost  float64   `json:"total_cost" gorm:"default:0"`   // 总花费
	CreatedAt  time.Time `json:"created_at"`
}

// 代理余额流水（站长充值、制卡扣款等）
type AgentBalanceLog struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	AgentID      uint      `json:"agent_id" gorm:"index"`
	Kind         string    `json:"kind" gorm:"size:24;index"` // recharge, generate_card
	Amount       float64   `json:"amount"`                    // 正数为入账，负数为支出
	BalanceAfter float64   `json:"balance_after"`
	Ref          string    `json:"ref" gorm:"size:120"` // 如批次号、备注关键字
	Remark       string    `json:"remark" gorm:"size:500"`
	CreatedAt    time.Time `json:"created_at"`
}

// 代理库存卡包
type AgentStockPackage struct {
	ID              uint                    `json:"id" gorm:"primaryKey"`
	AppID           uint                    `json:"app_id" gorm:"index"`
	App             *App                    `json:"app,omitempty" gorm:"foreignKey:AppID"`
	OwnerAgentID    uint                    `json:"owner_agent_id" gorm:"index"` // 创建并扣费的代理
	OwnerAgent      *Agent                  `json:"owner_agent,omitempty" gorm:"foreignKey:OwnerAgentID"`
	AssignedAgentID *uint                   `json:"assigned_agent_id" gorm:"index"` // 使用卡包的下级代理(NULL表示未发放)
	AssignedAgent   *Agent                  `json:"assigned_agent,omitempty" gorm:"foreignKey:AssignedAgentID"`
	Name            string                  `json:"name" gorm:"size:100"`
	TotalCost       float64                 `json:"total_cost" gorm:"default:0"`
	Status          int                     `json:"status" gorm:"default:1"` // 1:正常 2:禁用
	Remark          string                  `json:"remark" gorm:"size:500"`
	Items           []AgentStockPackageItem `json:"items,omitempty" gorm:"foreignKey:PackageID"`
	CreatedAt       time.Time               `json:"created_at"`
	UpdatedAt       time.Time               `json:"updated_at"`
	DeletedAt       gorm.DeletedAt          `json:"-" gorm:"index"`
}

// 代理库存卡包卡种次数
type AgentStockPackageItem struct {
	ID         uint               `json:"id" gorm:"primaryKey"`
	PackageID  uint               `json:"package_id" gorm:"index;uniqueIndex:idx_agent_stock_pkg_cardtype"`
	Package    *AgentStockPackage `json:"package,omitempty" gorm:"foreignKey:PackageID"`
	CardTypeID uint               `json:"card_type_id" gorm:"index;uniqueIndex:idx_agent_stock_pkg_cardtype"`
	CardType   *CardType          `json:"card_type,omitempty" gorm:"foreignKey:CardTypeID"`
	TotalCount int                `json:"total_count" gorm:"default:0"`
	UsedCount  int                `json:"used_count" gorm:"default:0"`
	Price      float64            `json:"price" gorm:"default:0"`
	CreatedAt  time.Time          `json:"created_at"`
	UpdatedAt  time.Time          `json:"updated_at"`
}

// 数据池
type DataPool struct {
	ID           uint           `json:"id" gorm:"primaryKey"`
	AppID        uint           `json:"app_id" gorm:"index"`
	App          *App           `json:"app,omitempty" gorm:"foreignKey:AppID"`
	Name         string         `json:"name" gorm:"size:100"`           // 数据池名称
	Code         string         `json:"code" gorm:"size:50;index"`      // 数据池编码
	Sort         int            `json:"sort" gorm:"default:0"`          // 排序号
	RequireLogin int            `json:"require_login" gorm:"default:0"` // 客户端添加数据需登录 0:否 1:是
	Remark       string         `json:"remark" gorm:"size:500"`         // 备注
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
}

// 数据池数据项
type DataItem struct {
	ID            uint           `json:"id" gorm:"primaryKey"`
	DataPoolID    uint           `json:"data_pool_id" gorm:"index"`
	DataPool      *DataPool      `json:"data_pool,omitempty" gorm:"foreignKey:DataPoolID"`
	Name          string         `json:"name" gorm:"size:100"`            // 数据名称
	Code          string         `json:"code" gorm:"size:50;index"`       // 数据编号
	Content       string         `json:"content" gorm:"type:text"`        // 数据内容(长数据)
	ModifyCount   int            `json:"modify_count" gorm:"default:-1"`  // 可修改次数 -1=无限
	ModifiedCount int            `json:"modified_count" gorm:"default:0"` // 已修改次数
	ExpireAt      *time.Time     `json:"expire_at"`                       // 过期时间
	RequireLogin  int            `json:"require_login" gorm:"default:0"`  // 验证登录 0:否 1:是
	RequirePaid   int            `json:"require_paid" gorm:"default:0"`   // 需要付费用户 0:否 1:是
	AllowDelete   int            `json:"allow_delete" gorm:"default:0"`   // 允许删除 0:否 1:是
	AllowModify   int            `json:"allow_modify" gorm:"default:0"`   // 允许修改 0:否 1:是
	AllowExpire   int            `json:"allow_expire" gorm:"default:0"`   // 允许过期修改 0:否 1:是
	Remark        string         `json:"remark" gorm:"size:500"`          // 备注
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `json:"-" gorm:"index"`
}

// 邮箱配置
type EmailConfig struct {
	ID           uint   `json:"id" gorm:"primaryKey"`
	UserID       uint   `json:"user_id" gorm:"index"`           // 所属用户ID（0为全局配置）
	SMTPHost     string `json:"smtp_host" gorm:"size:100"`      // SMTP服务器
	SMTPPort     int    `json:"smtp_port" gorm:"default:465"`   // SMTP端口
	SMTPUser     string `json:"smtp_user" gorm:"size:100"`      // 发信邮箱
	SMTPPass     string `json:"smtp_pass" gorm:"size:200"`      // 邮箱密码/授权码
	SMTPSSL      int    `json:"smtp_ssl" gorm:"default:1"`      // 是否SSL 0:否 1:是
	FromName     string `json:"from_name" gorm:"size:100"`      // 发件人名称
	CodeTemplate string `json:"code_template" gorm:"type:text"` // 验证码邮件模板
}

// 注册登录配置
type RegisterConfig struct {
	ID               uint `json:"id" gorm:"primaryKey"`
	MaxApps          int  `json:"max_apps" gorm:"default:-1"`          // 默认可创建应用数 -1无限制
	MaxUsers         int  `json:"max_users" gorm:"default:-1"`         // 默认可创建用户数 -1无限制
	MaxCardTypes     int  `json:"max_card_types" gorm:"default:-1"`    // 默认可创建卡种数 -1无限制
	MaxCards         int  `json:"max_cards" gorm:"default:-1"`         // 默认可创建卡号数 -1无限制
	RegisterEnabled  int  `json:"register_enabled" gorm:"default:1"`   // 是否开放注册 0:否 1:是
	RequireEmailCode int  `json:"require_email_code" gorm:"default:0"` // 注册需邮箱验证码 0:否 1:是
	RequireCaptcha   int  `json:"require_captcha" gorm:"default:0"`    // 注册需图形验证码 0:否 1:是
	RegRateLimit     int  `json:"reg_rate_limit" gorm:"default:5"`     // 同IP每小时最大注册次数 0:不限制
	RegIPMaxTotal    int  `json:"reg_ip_max_total" gorm:"default:0"`   // 同IP最多注册总次数 0:不限制
}

// 邮箱验证码
type EmailCode struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	AppID     uint      `json:"app_id" gorm:"index;default:0"` // 所属应用ID
	Email     string    `json:"email" gorm:"size:100;index"`   // 邮箱
	Code      string    `json:"code" gorm:"size:10"`           // 验证码
	Type      int       `json:"type" gorm:"default:1"`         // 类型 1:注册 2:找回密码
	Used      int       `json:"used" gorm:"default:0"`         // 是否已使用 0:否 1:是
	IP        string    `json:"ip" gorm:"size:50;index"`       // 请求IP
	ExpireAt  time.Time `json:"expire_at"`                     // 过期时间
	CreatedAt time.Time `json:"created_at"`
}

// 套餐
type Package struct {
	ID             uint           `json:"id" gorm:"primaryKey"`
	Name           string         `json:"name" gorm:"size:100"`        // 套餐名称
	Icon           string         `json:"icon" gorm:"size:500"`        // 套餐图标
	Description    string         `json:"description" gorm:"size:500"` // 套餐描述
	Price          float64        `json:"price" gorm:"default:0"`      // 价格
	Duration       int            `json:"duration" gorm:"default:30"`  // 有效期(天)
	ExtraApps      int            `json:"extra_apps" gorm:"default:0"` // 额外应用数
	ExtraUsers     int            `json:"extra_users" gorm:"default:0"`
	ExtraCardTypes int            `json:"extra_card_types" gorm:"default:0"`
	ExtraCards     int            `json:"extra_cards" gorm:"default:0"`
	Sort           int            `json:"sort" gorm:"default:0"`   // 排序
	Status         int            `json:"status" gorm:"default:1"` // 1:启用 0:禁用
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `json:"-" gorm:"index"`
}

// 用户套餐
type UserPackage struct {
	ID             uint      `json:"id" gorm:"primaryKey"`
	UserID         uint      `json:"user_id" gorm:"index"`
	User           *User     `json:"user,omitempty" gorm:"foreignKey:UserID"`
	PackageID      uint      `json:"package_id" gorm:"index"`
	Package        *Package  `json:"package,omitempty" gorm:"foreignKey:PackageID"`
	ExtraApps      int       `json:"extra_apps" gorm:"default:0"`
	ExtraUsers     int       `json:"extra_users" gorm:"default:0"`
	ExtraCardTypes int       `json:"extra_card_types" gorm:"default:0"`
	ExtraCards     int       `json:"extra_cards" gorm:"default:0"`
	ExpireAt       time.Time `json:"expire_at"` // 到期时间
	CreatedAt      time.Time `json:"created_at"`
}

// 授权证书
type License struct {
	ID            uint           `json:"id" gorm:"primaryKey"`
	AppID         uint           `json:"app_id" gorm:"index"`
	App           *App           `json:"app,omitempty" gorm:"foreignKey:AppID"`
	Name          string         `json:"name" gorm:"size:100"`            // 证书名称
	Certificate   string         `json:"certificate" gorm:"size:500"`     // 证书码(含混淆密钥)
	EncryptedData string         `json:"encrypted_data" gorm:"type:text"` // 加密后的附加内容
	MaxUse        int            `json:"max_use" gorm:"default:0"`        // 最大使用次数 0=不限
	UsedCount     int            `json:"used_count" gorm:"default:0"`     // 已使用次数
	BindFeature   string         `json:"bind_feature" gorm:"size:500"`    // 绑定特征码(空=不绑定)
	Remark        string         `json:"remark" gorm:"size:500"`          // 备注
	Status        int            `json:"status" gorm:"default:1"`         // 1:启用 0:禁用
	ExpireAt      *time.Time     `json:"expire_at"`                       // 过期时间
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `json:"-" gorm:"index"`
}

// TG通知配置
type TelegramConfig struct {
	ID             uint   `json:"id" gorm:"primaryKey"`
	BotToken       string `json:"bot_token" gorm:"size:200"`        // Bot Token
	ChatID         string `json:"chat_id" gorm:"size:100"`          // Chat ID
	ProxyURL       string `json:"proxy_url" gorm:"size:200"`        // 代理地址
	NotifyRegister int    `json:"notify_register" gorm:"default:0"` // 注册通知 0:关闭 1:开启
	NotifyPackage  int    `json:"notify_package" gorm:"default:0"`  // 套餐通知 0:关闭 1:开启
}

// 应用用户操作日志
type AppUserLog struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	AppID     uint      `json:"app_id" gorm:"index"`
	AppUserID uint      `json:"app_user_id" gorm:"index"`
	Action    string    `json:"action" gorm:"size:20;index"` // login, bind, unbind, recharge
	Detail    string    `json:"detail" gorm:"size:500"`      // 操作详情
	IP        string    `json:"ip" gorm:"size:50"`           // IP地址
	CreatedAt time.Time `json:"created_at"`
}

// 客户端异常/崩溃日志
type ClientErrorLog struct {
	ID         uint           `json:"id" gorm:"primaryKey"`
	AppID      uint           `json:"app_id" gorm:"index"`
	App        *App           `json:"app,omitempty" gorm:"foreignKey:AppID"`
	AppUserID  *uint          `json:"app_user_id" gorm:"index"`
	AppUser    *AppUser       `json:"app_user,omitempty" gorm:"foreignKey:AppUserID"`
	Username   string         `json:"username" gorm:"size:50;index"`
	Severity   string         `json:"severity" gorm:"size:20;index"` // info, warning, error, fatal
	ErrorType  string         `json:"error_type" gorm:"size:100;index"`
	Message    string         `json:"message" gorm:"size:1000"`
	Stack      string         `json:"stack" gorm:"type:text"`
	Context    string         `json:"context" gorm:"type:text"`
	Version    string         `json:"version" gorm:"size:50;index"`
	ClientID   string         `json:"client_id" gorm:"size:100;index"`
	ClientOS   string         `json:"client_os" gorm:"size:100"`
	ClientIP   string         `json:"client_ip" gorm:"size:50;index"`
	Feature    string         `json:"feature" gorm:"size:500;index"`
	OccurredAt *time.Time     `json:"occurred_at"`
	CreatedAt  time.Time      `json:"created_at"`
	DeletedAt  gorm.DeletedAt `json:"-" gorm:"index"`
}

// 操作日志
type OperationLog struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    uint      `json:"user_id" gorm:"index"`
	User      *User     `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Action    string    `json:"action" gorm:"size:50"`      // 操作类型: login, logout, create, update, delete
	Module    string    `json:"module" gorm:"size:50"`      // 模块: app, appuser, card, cardtype, etc
	TargetID  uint      `json:"target_id" gorm:"default:0"` // 操作对象ID
	Detail    string    `json:"detail" gorm:"size:500"`     // 操作详情
	IP        string    `json:"ip" gorm:"size:50"`          // IP地址
	UserAgent string    `json:"user_agent" gorm:"size:500"` // 浏览器UA
	CreatedAt time.Time `json:"created_at"`
}

// 签到配置
type CheckinConfig struct {
	ID        uint    `json:"id" gorm:"primaryKey"`
	MinReward float64 `json:"min_reward" gorm:"default:3"` // 最小奖励
	MaxReward float64 `json:"max_reward" gorm:"default:8"` // 最大奖励
	Enabled   int     `json:"enabled" gorm:"default:1"`    // 是否启用 0:否 1:是
}

// 连续签到奖励规则
type CheckinStreakReward struct {
	ID          uint    `json:"id" gorm:"primaryKey"`
	StreakDays  int     `json:"streak_days" gorm:"default:3"`  // 连续天数
	ExtraReward float64 `json:"extra_reward" gorm:"default:1"` // 额外奖励
}

// 签到记录
type CheckinLog struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	UserID      uint      `json:"user_id" gorm:"index"`
	User        *User     `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Reward      float64   `json:"reward" gorm:"default:0"`       // 基础奖励
	ExtraReward float64   `json:"extra_reward" gorm:"default:0"` // 额外奖励(连续签到)
	Streak      int       `json:"streak" gorm:"default:1"`       // 连续签到天数
	CheckinAt   time.Time `json:"checkin_at"`                    // 签到时间
	CreatedAt   time.Time `json:"created_at"`
}

// 登录失败记录
type LoginFailure struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	IP        string    `json:"ip" gorm:"size:50;index"`        // IP地址
	Username  string    `json:"username" gorm:"size:100;index"` // 尝试的用户名
	CreatedAt time.Time `json:"created_at"`
}

// 安全配置
type SecurityConfig struct {
	ID                uint   `json:"id" gorm:"primaryKey"`
	EnableCaptcha     int    `json:"enable_captcha" gorm:"default:1"`               // 启用图形验证码 0:否 1:是
	CaptchaAfterFails int    `json:"captcha_after_fails" gorm:"default:3"`          // 失败多少次后显示验证码
	MaxLoginFails     int    `json:"max_login_fails" gorm:"default:5"`              // 最大登录失败次数
	LockDuration      int    `json:"lock_duration" gorm:"default:30"`               // 锁定时长(分钟)
	PrimaryColor      string `json:"primary_color" gorm:"size:20"`                  // 主题色
	PageAnimation     string `json:"page_animation" gorm:"size:30;default:blur-in"` // 页面动画效果
}

// 社交登录配置（彩虹聚合登录）
type SocialLoginConfig struct {
	ID       uint   `json:"id" gorm:"primaryKey"`
	Enable   int    `json:"enable" gorm:"default:0"`   // 0:关闭 1:开启
	AppID    string `json:"app_id" gorm:"size:100"`    // 彩虹聚合登录 AppID
	AppKey   string `json:"app_key" gorm:"size:200"`   // 彩虹聚合登录 AppKey
	LoginURL string `json:"login_url" gorm:"size:500"` // 聚合登录接口地址
}

// 社交账号绑定
type SocialAccount struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    uint      `json:"user_id" gorm:"index"`
	User      *User     `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Type      string    `json:"type" gorm:"size:20;index"`        // qq, github, wx, weibo 等
	SocialUID string    `json:"social_uid" gorm:"size:100;index"` // 第三方唯一ID
	Nickname  string    `json:"nickname" gorm:"size:100"`
	Avatar    string    `json:"avatar" gorm:"size:500"`
	CreatedAt time.Time `json:"created_at"`
}

// 工单
type Ticket struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	UserID    uint           `json:"user_id" gorm:"index"`
	User      *User          `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Title     string         `json:"title" gorm:"size:200"`     // 工单标题
	Category  string         `json:"category" gorm:"size:50"`   // 分类: bug, feature, question, other
	Status    int            `json:"status" gorm:"default:1"`   // 1:待处理 2:处理中 3:已解决 4:已关闭
	Priority  int            `json:"priority" gorm:"default:1"` // 1:低 2:中 3:高
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// 工单消息
type TicketMessage struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	TicketID  uint      `json:"ticket_id" gorm:"index"`
	Ticket    *Ticket   `json:"ticket,omitempty" gorm:"foreignKey:TicketID"`
	UserID    uint      `json:"user_id" gorm:"index"`
	User      *User     `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Content   string    `json:"content" gorm:"type:text"`  // Markdown内容
	IsAdmin   int       `json:"is_admin" gorm:"default:0"` // 是否管理员回复 0:否 1:是
	CreatedAt time.Time `json:"created_at"`
}

// 活动
type Activity struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	UserID      uint           `json:"user_id" gorm:"index"` // 创建者（作者）
	User        *User          `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Title       string         `json:"title" gorm:"size:200"`        // 活动标题
	Type        int            `json:"type" gorm:"default:1"`        // 1:转盘抽奖 2:定时抽奖 3:发放卡号
	Description string         `json:"description" gorm:"type:text"` // 活动描述(Markdown)
	Cover       string         `json:"cover" gorm:"size:500"`        // 封面图
	StartAt     *time.Time     `json:"start_at"`                     // 开始时间
	EndAt       *time.Time     `json:"end_at"`                       // 结束时间
	DrawAt      *time.Time     `json:"draw_at"`                      // 开奖时间(定时抽奖用)
	MaxJoin     int            `json:"max_join" gorm:"default:-1"`   // 最大参与次数 -1无限
	Status      int            `json:"status" gorm:"default:1"`      // 0:禁用 1:启用 2:已开奖
	Config      string         `json:"config" gorm:"type:text"`      // 活动配置JSON
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

// 活动参与用户（独立于应用用户，每个活动独立注册）
type ActivityUser struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	AuthorID   uint      `json:"author_id" gorm:"index;uniqueIndex:idx_author_username"`  // 作者ID
	ActivityID uint      `json:"activity_id" gorm:"index"`                                // 首次参与的活动
	Username   string    `json:"username" gorm:"size:50;uniqueIndex:idx_author_username"` // 用户名
	Password   string    `json:"-" gorm:"size:100"`                                       // 密码(bcrypt)
	CreatedAt  time.Time `json:"created_at"`
}

// 活动奖品
type ActivityPrize struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	ActivityID  uint           `json:"activity_id" gorm:"index"`
	Name        string         `json:"name" gorm:"size:100"`      // 奖品名称
	Type        int            `json:"type" gorm:"default:1"`     // 1:自定义文本 2:谢谢参与 3:卡种(自动发卡)
	Content     string         `json:"content" gorm:"size:500"`   // 奖品内容（自定义文本）
	CardTypeID  *uint          `json:"card_type_id" gorm:"index"` // 关联卡种ID(type=3时)
	CardType    *CardType      `json:"card_type,omitempty" gorm:"foreignKey:CardTypeID"`
	Probability int            `json:"probability" gorm:"default:0"` // 中奖概率(万分比)
	Stock       int            `json:"stock" gorm:"default:-1"`      // 库存 -1无限
	Sort        int            `json:"sort" gorm:"default:0"`        // 排序
	CreatedAt   time.Time      `json:"created_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

// 活动参与记录
type ActivityRecord struct {
	ID             uint           `json:"id" gorm:"primaryKey"`
	ActivityID     uint           `json:"activity_id" gorm:"index"`
	Activity       *Activity      `json:"activity,omitempty" gorm:"foreignKey:ActivityID"`
	ActivityUserID uint           `json:"activity_user_id" gorm:"index"`
	ActivityUser   *ActivityUser  `json:"activity_user,omitempty" gorm:"foreignKey:ActivityUserID"`
	PrizeID        uint           `json:"prize_id" gorm:"index"`
	Prize          *ActivityPrize `json:"prize,omitempty" gorm:"foreignKey:PrizeID"`
	PrizeName      string         `json:"prize_name" gorm:"size:100"`
	PrizeContent   string         `json:"prize_content" gorm:"size:500"` // 中奖内容
	Status         int            `json:"status" gorm:"default:1"`       // 1:已参与 2:已中奖 3:未中奖
	IP             string         `json:"ip" gorm:"size:50"`
	CreatedAt      time.Time      `json:"created_at"`
}

// 推广返利配置（按作者配置）
type RebateConfig struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    uint      `json:"user_id" gorm:"uniqueIndex"` // 作者ID
	User      *User     `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Enabled   int       `json:"enabled" gorm:"default:0"`    // 是否启用 0:否 1:是
	Rate      int       `json:"rate" gorm:"default:10"`      // 返利比例(%)
	RegReward int       `json:"reg_reward" gorm:"default:0"` // 注册奖励积分
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// 返利记录
type RebateLog struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	UserID      uint      `json:"user_id" gorm:"index"`     // 作者ID
	AppUserID   uint      `json:"app_user_id" gorm:"index"` // 获得返利的用户ID
	AppUser     *AppUser  `json:"app_user,omitempty" gorm:"foreignKey:AppUserID"`
	FromUserID  uint      `json:"from_user_id" gorm:"index"` // 来源用户ID(谁产生的)
	FromUser    *AppUser  `json:"from_user,omitempty" gorm:"foreignKey:FromUserID"`
	Type        int       `json:"type" gorm:"default:1"`         // 1:注册奖励 2:消费返利
	Amount      int       `json:"amount" gorm:"default:0"`       // 返利积分
	SourceValue int       `json:"source_value" gorm:"default:0"` // 来源值(消费的积分/时长)
	Remark      string    `json:"remark" gorm:"size:200"`        // 备注
	CreatedAt   time.Time `json:"created_at"`
}

// 积分商城商品（使用 AppUser.RebatePoints 兑换）
type PointShopItem struct {
	ID             uint           `json:"id" gorm:"primaryKey"`
	UserID         uint           `json:"user_id" gorm:"index"` // 作者ID
	User           *User          `json:"user,omitempty" gorm:"foreignKey:UserID"`
	AppID          uint           `json:"app_id" gorm:"index"`
	App            *App           `json:"app,omitempty" gorm:"foreignKey:AppID"`
	Name           string         `json:"name" gorm:"size:100"`
	Description    string         `json:"description" gorm:"size:500"`
	Cost           int            `json:"cost" gorm:"default:0"`        // 消耗返利积分
	RewardType     int            `json:"reward_type" gorm:"default:1"` // 1:点数 2:时长 3:卡密
	RewardPoints   int            `json:"reward_points" gorm:"default:0"`
	RewardDuration int            `json:"reward_duration" gorm:"default:0"` // 分钟，-1=永久
	CardTypeID     *uint          `json:"card_type_id" gorm:"index"`
	CardType       *CardType      `json:"card_type,omitempty" gorm:"foreignKey:CardTypeID"`
	Stock          int            `json:"stock" gorm:"default:-1"` // -1=不限
	ExchangedCount int            `json:"exchanged_count" gorm:"default:0"`
	Status         int            `json:"status" gorm:"default:1"` // 1:上架 0:下架
	Sort           int            `json:"sort" gorm:"default:0"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `json:"-" gorm:"index"`
}

// 积分商城兑换记录
type PointShopExchangeLog struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	UserID      uint           `json:"user_id" gorm:"index"` // 作者ID
	AppID       uint           `json:"app_id" gorm:"index"`
	App         *App           `json:"app,omitempty" gorm:"foreignKey:AppID"`
	AppUserID   uint           `json:"app_user_id" gorm:"index"`
	AppUser     *AppUser       `json:"app_user,omitempty" gorm:"foreignKey:AppUserID"`
	ItemID      uint           `json:"item_id" gorm:"index"`
	Item        *PointShopItem `json:"item,omitempty" gorm:"foreignKey:ItemID"`
	ItemName    string         `json:"item_name" gorm:"size:100"`
	Cost        int            `json:"cost"`
	RewardType  int            `json:"reward_type"`
	RewardValue string         `json:"reward_value" gorm:"size:500"`
	CardID      *uint          `json:"card_id" gorm:"index"`
	CardNo      string         `json:"card_no" gorm:"size:100"`
	IP          string         `json:"ip" gorm:"size:50"`
	CreatedAt   time.Time      `json:"created_at"`
}

// Webhook配置
type WebhookConfig struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	UserID     uint      `json:"user_id" gorm:"uniqueIndex"` // 作者ID
	User       *User     `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Enabled    int       `json:"enabled" gorm:"default:0"`     // 是否启用
	URL        string    `json:"url" gorm:"size:500"`          // 回调URL
	Secret     string    `json:"secret" gorm:"size:100"`       // 签名密钥
	Events     string    `json:"events" gorm:"type:text"`      // 启用的事件JSON
	RetryCount int       `json:"retry_count" gorm:"default:3"` // 重试次数
	Timeout    int       `json:"timeout" gorm:"default:10"`    // 超时时间(秒)
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// Webhook日志
type WebhookLog struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	UserID     uint      `json:"user_id" gorm:"index"`
	Event      string    `json:"event" gorm:"size:50"`         // 事件类型
	URL        string    `json:"url" gorm:"size:500"`          // 请求URL
	Payload    string    `json:"payload" gorm:"type:text"`     // 请求内容
	StatusCode int       `json:"status_code" gorm:"default:0"` // 响应状态码
	Response   string    `json:"response" gorm:"type:text"`    // 响应内容
	Success    int       `json:"success" gorm:"default:0"`     // 是否成功
	CreatedAt  time.Time `json:"created_at"`
}

// 黑名单
type Blacklist struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	UserID    uint           `json:"user_id" gorm:"index"` // 所属作者
	User      *User          `json:"user,omitempty" gorm:"foreignKey:UserID"`
	AppID     uint           `json:"app_id" gorm:"index"` // 所属应用
	App       *App           `json:"app,omitempty" gorm:"foreignKey:AppID"`
	Type      int            `json:"type" gorm:"default:1"`  // 1:IP 2:特征码
	Value     string         `json:"value" gorm:"size:500"`  // 封禁值
	Remark    string         `json:"remark" gorm:"size:200"` // 备注
	ExpireAt  *time.Time     `json:"expire_at"`              // 过期时间(null=永久)
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// 防火墙配置
type FirewallConfig struct {
	ID                     uint      `json:"id" gorm:"primaryKey"`
	AppID                  uint      `json:"app_id" gorm:"uniqueIndex"` // 应用ID
	App                    *App      `json:"app,omitempty" gorm:"foreignKey:AppID"`
	Enable                 int       `json:"enable" gorm:"default:0"`                   // 是否启用
	IPWhitelistEnable      int       `json:"ip_whitelist_enable" gorm:"default:0"`      // IP白名单启用
	IPWhitelist            string    `json:"ip_whitelist" gorm:"type:text"`             // IP白名单
	IPConcurrentLimit      int       `json:"ip_concurrent_limit" gorm:"default:0"`      // 单IP并发限制
	IPRateLimitEnable      int       `json:"ip_rate_limit_enable" gorm:"default:0"`     // IP频率限制启用
	IPRateLimit            int       `json:"ip_rate_limit" gorm:"default:60"`           // 每分钟最大请求数
	IPRegionEnable         int       `json:"ip_region_enable" gorm:"default:0"`         // IP地区限制启用
	IPRegionMode           int       `json:"ip_region_mode" gorm:"default:1"`           // 1:白名单 2:黑名单
	IPRegionList           string    `json:"ip_region_list" gorm:"type:text"`           // 地区列表
	LoginFailLimit         int       `json:"login_fail_limit" gorm:"default:0"`         // 登录失败次数限制
	LoginFailLockTime      int       `json:"login_fail_lock_time" gorm:"default:30"`    // 锁定时长(分钟)
	CaptchaLoginEnable     int       `json:"captcha_login_enable" gorm:"default:0"`     // 登录验证码
	CaptchaLoginAfter      int       `json:"captcha_login_after" gorm:"default:3"`      // 登录失败N次后要求验证码
	CaptchaRegEnable       int       `json:"captcha_reg_enable" gorm:"default:0"`       // 注册验证码
	CaptchaRechargeEnable  int       `json:"captcha_recharge_enable" gorm:"default:0"`  // 充值验证码
	CaptchaChangePwdEnable int       `json:"captcha_changepwd_enable" gorm:"default:0"` // 修改密码验证码
	APIRateLimitEnable     int       `json:"api_rate_limit_enable" gorm:"default:0"`    // API频率限制启用
	APIRateLimit           int       `json:"api_rate_limit" gorm:"default:100"`         // 每分钟最大调用数
	HeartbeatCheckEnable   int       `json:"heartbeat_check_enable" gorm:"default:0"`   // 心跳检测启用
	HeartbeatTolerance     int       `json:"heartbeat_tolerance" gorm:"default:30"`     // 心跳容差(秒)
	ReplayCheckEnable      int       `json:"replay_check_enable" gorm:"default:0"`      // 重放攻击防护启用
	ReplayWindow           int       `json:"replay_window" gorm:"default:60"`           // 检测窗口(秒)
	AutoBanEnable          int       `json:"auto_ban_enable" gorm:"default:0"`          // 自动封禁启用
	AutoBanDuration        int       `json:"auto_ban_duration" gorm:"default:1440"`     // 封禁时长(分钟)
	AutoBanIPOnFail        int       `json:"auto_ban_ip_on_fail" gorm:"default:0"`      // 登录失败超限封禁IP
	AutoBanIPOnRate        int       `json:"auto_ban_ip_on_rate" gorm:"default:0"`      // 频率超限封禁IP
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
}

// SDK 通讯加解密全局配置
type SDKCryptoConfig struct {
	ID            uint      `json:"id" gorm:"primaryKey"`
	Enabled       int       `json:"enabled" gorm:"default:0"`             // 0:使用内置AES 1:启用自定义
	Type          string    `json:"type" gorm:"size:20;default:pipeline"` // pipeline/js
	Config        string    `json:"config" gorm:"type:text"`              // 内置步骤组合配置(JSON)
	EncryptScript string    `json:"encrypt_script" gorm:"type:text"`      // JS自定义加密脚本
	DecryptScript string    `json:"decrypt_script" gorm:"type:text"`      // JS自定义解密脚本
	UpdatedAt     time.Time `json:"updated_at"`
	CreatedAt     time.Time `json:"created_at"`
}

// 防火墙日志
type FirewallLog struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	AppID     uint      `json:"app_id" gorm:"index"`
	App       *App      `json:"app,omitempty" gorm:"foreignKey:AppID"`
	Type      string    `json:"type" gorm:"size:50;index"` // ip_block, rate_limit, login_fail, blacklist, replay, auto_ban
	IP        string    `json:"ip" gorm:"size:50"`
	Feature   string    `json:"feature" gorm:"size:500"`
	Username  string    `json:"username" gorm:"size:100"`
	Action    string    `json:"action" gorm:"size:50"`
	Detail    string    `json:"detail" gorm:"size:500"`
	CreatedAt time.Time `json:"created_at"`
}

// 提卡Key
type WithdrawKey struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	UserID    uint           `json:"user_id" gorm:"index"` // 所属作者
	User      *User          `json:"user,omitempty" gorm:"foreignKey:UserID"`
	AppID     uint           `json:"app_id" gorm:"index"` // 所属应用
	App       *App           `json:"app,omitempty" gorm:"foreignKey:AppID"`
	Name      string         `json:"name" gorm:"size:100"`                  // Key名称
	SecretKey string         `json:"secret_key" gorm:"uniqueIndex;size:64"` // 提卡密钥
	Quota     float64        `json:"quota" gorm:"default:0"`                // 提卡额度
	UsedQuota float64        `json:"used_quota" gorm:"default:0"`           // 已使用额度
	Status    int            `json:"status" gorm:"default:1"`               // 1:启用 0:禁用
	Remark    string         `json:"remark" gorm:"size:500"`                // 备注
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// 提卡记录
type WithdrawLog struct {
	ID            uint         `json:"id" gorm:"primaryKey"`
	WithdrawKeyID uint         `json:"withdraw_key_id" gorm:"index"` // 提卡Key ID
	WithdrawKey   *WithdrawKey `json:"withdraw_key,omitempty" gorm:"foreignKey:WithdrawKeyID"`
	CardTypeID    uint         `json:"card_type_id" gorm:"index"` // 卡种ID
	CardType      *CardType    `json:"card_type,omitempty" gorm:"foreignKey:CardTypeID"`
	CardID        uint         `json:"card_id" gorm:"index"` // 卡号ID
	Card          *Card        `json:"card,omitempty" gorm:"foreignKey:CardID"`
	CardNo        string       `json:"card_no" gorm:"size:100"`     // 卡号(冗余)
	Count         int          `json:"count" gorm:"default:1"`      // 提取数量
	Price         float64      `json:"price" gorm:"default:0"`      // 单价
	TotalCost     float64      `json:"total_cost" gorm:"default:0"` // 总花费
	IP            string       `json:"ip" gorm:"size:50"`           // 提取IP
	Remark        string       `json:"remark" gorm:"size:500"`      // 备注
	CreatedAt     time.Time    `json:"created_at"`
}

// 用户解绑记录
type AppUserUnbindLog struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	AppUserID uint      `json:"app_user_id" gorm:"index"` // 用户ID
	DeviceID  uint      `json:"device_id"`                // 被解绑的设备ID
	Feature   string    `json:"feature" gorm:"size:500"`  // 被解绑的特征码
	CreatedAt time.Time `json:"created_at"`
}

// 开放API密钥
type OpenApiKey struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	UserID      uint           `json:"user_id" gorm:"index"`
	User        *User          `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Name        string         `json:"name" gorm:"size:100"`                   // 密钥名称
	SecretKey   string         `json:"secret_key" gorm:"uniqueIndex;size:128"` // 密钥
	Permissions string         `json:"permissions" gorm:"size:500"`            // 权限列表(逗号分隔)
	Status      int            `json:"status" gorm:"default:1"`                // 1:启用 0:禁用
	LastUsedAt  *time.Time     `json:"last_used_at"`                           // 最后使用时间
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

// 充值配置（易支付）
type RechargeConfig struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Key       string    `json:"key" gorm:"uniqueIndex;size:50"`
	Value     string    `json:"value" gorm:"size:500"`
	Desc      string    `json:"desc" gorm:"size:200"`
	UpdatedAt time.Time `json:"updated_at"`
}

// 充值套餐
type RechargePackage struct {
	ID            uint      `json:"id" gorm:"primaryKey"`
	Name          string    `json:"name" gorm:"size:100"`
	Amount        float64   `json:"amount"`                // 充值金额（元）
	BalanceAmount float64   `json:"balance_amount"`        // 到账余额
	Bonus         string    `json:"bonus" gorm:"size:200"` // 额外赠送说明
	Sort          int       `json:"sort" gorm:"default:0"`
	Status        int       `json:"status" gorm:"default:1"` // 0:禁用 1:启用
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// 充值订单
type RechargeOrder struct {
	ID            uint             `json:"id" gorm:"primaryKey"`
	OrderNo       string           `json:"order_no" gorm:"uniqueIndex;size:50"`
	UserID        uint             `json:"user_id" gorm:"index"`
	PackageID     uint             `json:"package_id"`
	Amount        float64          `json:"amount"`                         // 支付金额
	BalanceAmount float64          `json:"balance_amount"`                 // 到账余额
	PayType       string           `json:"pay_type" gorm:"size:20"`        // alipay, wxpay
	TradeNo       string           `json:"trade_no" gorm:"size:100;index"` // 易支付交易号
	Status        int              `json:"status" gorm:"default:0;index"`  // 0:待支付 1:已支付 2:已取消
	PaidAt        *time.Time       `json:"paid_at"`
	CreatedAt     time.Time        `json:"created_at"`
	UpdatedAt     time.Time        `json:"updated_at"`
	User          *User            `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Package       *RechargePackage `json:"package,omitempty" gorm:"foreignKey:PackageID"`
}
