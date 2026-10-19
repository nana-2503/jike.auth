# WebSocket 接口文档

## 基本信息

- 连接地址: `ws://域名/ws`
- 协议: WebSocket (RFC 6455)
- 消息格式: JSON
- 最大消息: 4KB
- 全局最大连接数: 5000
- 消息频率限制: 每秒30条

## 连接保活机制

- 服务端每60秒发送协议层 Ping，客户端 WebSocket 库自动回复 Pong
- 收到 Pong 或任何业务消息后，服务端重置5分钟读超时
- 5分钟内无任何通信（无消息、无 Pong），服务端断开连接
- 客户端也可主动发送 `ping` action 确认连接状态（同样刷新超时）

## 通讯加密说明

WebSocket 接口与 HTTP SDK 接口使用完全相同的加密方式，详见 [签名流程](签名流程.md) 和 [通讯加密说明](通讯加密说明.md)。

## 请求格式

```json
{
  "action": "操作名称",
  "req_id": "请求标识（可选，原样返回，最长64字符）",
  "app_code": "应用编码（明文）",
  "data": "AES-CBC加密后的Base64字符串",
  "sign": "签名字符串"
}
```

> `data` 加密前为 JSON 字符串，包含业务参数和公共参数。

## 响应格式

```json
{
  "action": "操作名称",
  "req_id": "请求标识",
  "code": 0,
  "message": "success",
  "data": "AES-CBC加密后的Base64字符串",
  "sign": "签名字符串",
  "time": 1704067200
}
```

> `code` 为 0 表示成功，非 0 表示失败。

## 公共参数

所有操作的 `data` 解密后可包含以下公共参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| feature | string | 是 | 设备特征码 |
| version | string | 是 | 客户端版本号 |
| client_id | string | 是 | 客户端ID（每次启动固定） |
| client_os | string | 否 | 客户端操作系统 |
| md5 | string | 否 | 应用版本MD5值 |
| uuid | string | 是 | 随机UUID（每次请求随机生成，用于匹配响应） |

## 认证模型

- **公开操作**：无需登录即可调用，需要传 `app_code` 标识应用
- **认证操作**：必须先执行 `login` 成功后才能调用，否则返回 `code: 401`；所有认证操作均需传 `app_code`
- `get_devices` 和 `unbind_device` 不使用 WS 登录态，但会在接口内部通过 `user/password` 或 `card_no` 验证身份

---

## 公开操作

### ping — 保活

客户端主动保活，刷新服务端读超时。无需加密，无需 `app_code`。

**请求示例**

```json
{ "action": "ping", "req_id": "1" }
```

**响应示例**

```json
{ "action": "ping", "req_id": "1", "code": 0, "message": "success", "time": 1704067200 }
```

---

### register — 用户注册

请求参数和响应与 HTTP 接口一致，详见 [用户注册.md](用户注册.md)。

**请求示例**

```json
{
  "action": "register",
  "req_id": "1",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"user":"testuser","password":"abc123","feature":"DEVICE-XXXX","invite_code":"INV123","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### login — 用户登录

请求参数和响应与 HTTP 接口一致，详见 [用户登录.md](用户登录.md)。

**请求示例**

```json
{
  "action": "login",
  "req_id": "2",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"user":"testuser","password":"abc123","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### card_login — 卡号登录

请求参数和响应与 HTTP 接口一致，详见 [卡号登录.md](卡号登录.md)。登录成功后连接进入认证状态，可调用认证操作。

**请求示例**

```json
{
  "action": "card_login",
  "req_id": "2",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"card_no":"CARD-XXXX-XXXX","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### trial — 试用登录

请求参数和响应与 HTTP 接口一致，详见 [试用登录.md](试用登录.md)。登录成功后连接进入认证状态，可调用认证操作。

**请求示例**

```json
{
  "action": "trial",
  "req_id": "2-1",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### recharge_offline — 离线充值

请求参数和响应与 HTTP 接口一致，详见 [离线充值.md](离线充值.md)。

**请求示例**

```json
{
  "action": "recharge_offline",
  "req_id": "3",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"user":"testuser","password":"abc123","card_no":"CARD-XXXX-XXXX","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### get_app_info — 获取应用信息

请求参数和响应与 HTTP 接口一致，详见 [获取应用信息.md](获取应用信息.md)。

**请求示例**

```json
{
  "action": "get_app_info",
  "req_id": "4",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### get_version — 获取默认版本

请求参数和响应与 HTTP 接口一致，详见 [获取指定版本.md](获取指定版本.md)。

**请求示例**

```json
{
  "action": "get_version",
  "req_id": "4",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### get_versions — 获取版本列表

请求参数和响应与 HTTP 接口一致，详见 [获取版本列表.md](获取版本列表.md)。

**请求示例**

```json
{
  "action": "get_versions",
  "req_id": "5",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### get_datapools — 获取数据池

请求参数和响应与 HTTP 接口一致，详见 [获取数据池列表.md](获取数据池列表.md)。

**请求示例**

```json
{
  "action": "get_datapools",
  "req_id": "6",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### get_dataitem — 获取数据项

请求参数和响应与 HTTP 接口一致，详见 [获取数据项.md](获取数据项.md)。

**请求示例**

```json
{
  "action": "get_dataitem",
  "req_id": "7",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"pool_code":"notice","item_code":"title","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### create_datapool — 新增数据池

请求参数和响应与 HTTP 接口一致，详见 [新增数据池.md](新增数据池.md)。

**请求示例**

```json
{
  "action": "create_datapool",
  "req_id": "7",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"name":"公告池","code":"notice","remark":"备注","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### create_dataitem — 新增数据项

请求参数和响应与 HTTP 接口一致，详见 [新增数据项.md](新增数据项.md)。

**请求示例**

```json
{
  "action": "create_dataitem",
  "req_id": "7",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"pool_code":"notice","name":"标题","code":"title","content":"内容","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### delete_dataitem — 删除数据项

请求参数和响应与 HTTP 接口一致，详见 [删除数据项.md](删除数据项.md)。

**请求示例**

```json
{
  "action": "delete_dataitem",
  "req_id": "7",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"pool_code":"notice","item_code":"title","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### update_dataitem — 修改数据项

请求参数和响应与 HTTP 接口一致，详见 [修改数据项.md](修改数据项.md)。

**请求示例**

```json
{
  "action": "update_dataitem",
  "req_id": "7",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"pool_code":"notice","item_code":"title","content":"更新后的内容","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### get_announcements — 获取应用公告列表

请求参数和响应与 HTTP 接口一致，详见 [获取应用公告列表.md](获取应用公告列表.md)。

**请求示例**

```json
{
  "action": "get_announcements",
  "req_id": "7",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### forgot_password — 找回密码

请求参数和响应与 HTTP 接口一致（两步流程），详见 [找回密码.md](找回密码.md)。

**请求示例（第一步：发送验证码）**

```json
{
  "action": "forgot_password",
  "req_id": "8",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"user":"testuser","email":"user@example.com","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

**请求示例（第二步：重置密码）**

```json
{
  "action": "forgot_password",
  "req_id": "9",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"user":"testuser","email":"user@example.com","code":"123456","new_password":"newPass78","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### verify_license — 验证授权证书（已下线）

请求参数和响应与 HTTP 接口一致，详见 [验证授权证书.md](验证授权证书.md)。

**请求示例**

```json
{
  "action": "verify_license",
  "req_id": "10",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"certificate":"256位证书码字符串...","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### captcha — 获取验证码

请求参数和响应与 HTTP 接口一致，详见 [获取验证码.md](获取验证码.md)。

**请求示例**

```json
{
  "action": "captcha",
  "req_id": "10",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"type":"login","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### send_email_code — 发送邮箱验证码

请求参数和响应与 HTTP 接口一致，详见 [发送邮箱验证码.md](发送邮箱验证码.md)。

**请求示例**

```json
{
  "action": "send_email_code",
  "req_id": "10",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"email":"user@example.com","type":1,"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### report_error — 上报异常日志

请求参数和响应与 HTTP 接口一致，详见 [上报异常日志.md](上报异常日志.md)。如果当前连接已登录，会自动关联当前软件用户；未登录时可通过 `username` 传入用户名。

**请求示例**

```json
{
  "action": "report_error",
  "req_id": "10-1",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"severity":"error","error_type":"crash","message":"空指针异常","stack":"stack trace...","context":{"page":"login"},"occurred_at":"2026-05-11 12:00:00","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

## 认证操作

> 以下操作需先执行 `login` 成功。未登录调用返回 `code: 401, message: "未登录，请先执行login"`。
> 所有操作均需传 `app_code`，与 HTTP 接口保持一致。

### heartbeat — 心跳

请求参数和响应与 HTTP 接口一致，详见 [心跳.md](心跳.md)。

**请求示例**

```json
{
  "action": "heartbeat",
  "req_id": "11",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### logout — 注销登录

请求参数和响应与 HTTP 接口一致，详见 [注销登录.md](注销登录.md)。注销后连接回到未认证状态，可重新 login。

**请求示例**

```json
{
  "action": "logout",
  "req_id": "12",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### get_user_info — 获取用户信息

请求参数和响应与 HTTP 接口一致，详见 [获取用户信息.md](获取用户信息.md)。

> 返回字段包含 `avatar`，用于客户端显示用户头像地址。

**请求示例**

```json
{
  "action": "get_user_info",
  "req_id": "13",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### get_extra_data — 获取附加数据

请求参数和响应与 HTTP 接口一致，详见 [获取附加数据.md](获取附加数据.md)。

**请求示例**

```json
{
  "action": "get_extra_data",
  "req_id": "14",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### change_password — 修改密码

请求参数和响应与 HTTP 接口一致，详见 [修改密码.md](修改密码.md)。

**请求示例**

```json
{
  "action": "change_password",
  "req_id": "15",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"old_password":"abc123","new_password":"newPass78","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### recharge — 卡密充值

请求参数和响应与 HTTP 接口一致，详见 [卡密充值.md](卡密充值.md)。

**请求示例**

```json
{
  "action": "recharge",
  "req_id": "16",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"card_no":"CARD-XXXX-XXXX","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### deduct_points — 扣点

请求参数和响应与 HTTP 接口一致，详见 [扣点.md](扣点.md)。

**请求示例**

```json
{
  "action": "deduct_points",
  "req_id": "17",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"points":100,"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### deduct_time — 扣时

请求参数和响应与 HTTP 接口一致，详见 [扣时.md](扣时.md)。

**请求示例**

```json
{
  "action": "deduct_time",
  "req_id": "18",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"minutes":60,"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### get_data — 获取标识数据

请求参数和响应与 HTTP 接口一致，详见 [获取标识数据.md](获取标识数据.md)。

**请求示例**

```json
{
  "action": "get_data",
  "req_id": "19",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"key":"config","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### set_data — 设置标识数据

请求参数和响应与 HTTP 接口一致，详见 [设置标识数据.md](设置标识数据.md)。

**请求示例**

```json
{
  "action": "set_data",
  "req_id": "20",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"key":"config","value":"new value","expire_at":"2025-12-31 23:59:59","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### get_devices — 获取设备列表

请求参数和响应与 HTTP 接口一致，详见 [获取设备列表.md](获取设备列表.md)。该接口不需要先执行 WS 登录，但必须在 `data` 中提供 `user/password` 或 `card_no` 进行一次性身份验证。

**请求示例**

```json
{
  "action": "get_devices",
  "req_id": "21",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后（账号密码验证）：`{"user":"testuser","password":"123456","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

> `data` 解密后（卡号验证）：`{"card_no":"LOGIN-CARD-XXXX","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### unbind_device — 按序列号解绑设备

请求参数和响应与 HTTP 接口一致，详见 [解绑设备.md](解绑设备.md)。该接口不需要先执行 WS 登录，但必须在 `data` 中提供 `user/password` 或 `card_no` 进行一次性身份验证。

**请求示例**

```json
{
  "action": "unbind_device",
  "req_id": "22",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后（账号密码验证）：`{"device_id":1,"user":"testuser","password":"123456","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

> `data` 解密后（卡号验证）：`{"device_id":1,"card_no":"LOGIN-CARD-XXXX","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### get_cloud_data — 获取云端数据

请求参数和响应与 HTTP 接口一致，详见 [获取云端数据.md](获取云端数据.md)。

**请求示例**

```json
{
  "action": "get_cloud_data",
  "req_id": "23",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### set_cloud_data — 设置云端数据

请求参数和响应与 HTTP 接口一致，详见 [设置云端数据.md](设置云端数据.md)。

**请求示例**

```json
{
  "action": "set_cloud_data",
  "req_id": "24",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"cloud_data":"your data here","feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### get_point_shop_items — 获取积分商城商品

请求参数和响应与 HTTP 接口一致，详见 [获取积分商城商品.md](获取积分商城商品.md)。

**请求示例**

```json
{
  "action": "get_point_shop_items",
  "req_id": "25",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### exchange_point_shop_item — 兑换积分商城商品

请求参数和响应与 HTTP 接口一致，详见 [兑换积分商城商品.md](兑换积分商城商品.md)。

**请求示例**

```json
{
  "action": "exchange_point_shop_item",
  "req_id": "26",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"item_id":1,"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

### get_point_shop_exchanges — 获取积分商城兑换记录

请求参数和响应与 HTTP 接口一致，详见 [获取积分商城兑换记录.md](获取积分商城兑换记录.md)。

**请求示例**

```json
{
  "action": "get_point_shop_exchanges",
  "req_id": "27",
  "app_code": "your-app-code",
  "data": "Base64加密字符串...",
  "sign": "签名字符串..."
}
```

> `data` 解密后：`{"feature":"DEVICE-XXXX","version":"1.0.0","client_id":"client-uuid-001","client_os":"Windows 10","md5":"abc123def456","uuid":"550e8400-e29b-41d4-a716-446655440000"}`

---

## 服务端推送

### kicked — 被踢下线

当管理员踢下线时，会收到此推送后断开。

```json
{
  "action": "kicked",
  "req_id": "",
  "code": 0,
  "message": "您已被管理员踢下线",
  "time": 1704067200
}
```
