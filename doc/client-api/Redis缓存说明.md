# Redis 缓存说明

## 概述

系统支持可选的 Redis 缓存，用于减少数据库查询压力。未配置 Redis 时所有缓存逻辑自动跳过，不影响功能。

## 配置

在 `config.yaml` 中配置：

```yaml
redis:
  enable: true
  host: 127.0.0.1
  port: 6379
  password: ""
  db: 0
```

`enable: false` 或 Redis 连接失败时，防火墙的频率限制/重放检测等降级为内存缓存，其余接口直接查库。

---

## 第一优先级：热点查询（每个 SDK 请求都会触发）

| 缓存目标 | Redis Key | TTL | 说明 |
|---------|-----------|-----|------|
| 应用信息 | `app:{appCode}` | 60s | `validateApp()` 每个 SDK 请求必调，缓存 App 对象 |
| 防火墙配置 | `fw:config:{appID}` | 60s | 防火墙中间件每次请求查询 |
| IP黑名单 | `blacklist:ip:{appID}:{ip}` | 命中按封禁剩余时间，未命中10s | 防火墙中间件每次请求查询 |
| 特征码黑名单 | `blacklist:feat:{appID}:{feature}` | 同上 | 防火墙中间件每次请求查询 |

### 缓存清理触发点

| 操作 | 清理的 Key |
|------|-----------|
| 用户更新应用 `PUT /user/apps/:id` | `app:{appCode}` + `sdk:appinfo:{appID}` |
| 用户删除应用 `DELETE /user/apps/:id` | `app:{appCode}` + 全部 SDK 缓存 |
| 管理员更新应用 `PUT /admin/apps/:id` | `app:{appCode}` + `fw:config:{appID}` + `sdk:appinfo:{appID}` |
| 管理员删除应用 `DELETE /admin/apps/:id` | `app:{appCode}` + `fw:config:{appID}` + 全部 SDK 缓存 |
| 保存防火墙配置 | `fw:config:{appID}` |
| 黑名单变更 | 依赖短 TTL 自动过期（10-30s） |

---

## 第二优先级：SDK 只读接口（客户端高频调用）

| 接口 | Redis Key | TTL | 说明 |
|------|-----------|-----|------|
| `POST /sdk/app-info` | `sdk:appinfo:{appID}` | 120s | 应用信息 + 默认版本 |
| `POST /sdk/versions` | `sdk:versions:{appID}` | 120s | 版本列表 |
| `POST /sdk/announcements` | `sdk:announcements:{appID}` | 60s | 应用公告列表 |
| `POST /sdk/datapools` | `sdk:datapools:{appID}` | 60s | 数据池列表 |

### 缓存清理触发点

| 操作 | 清理的 Key |
|------|-----------|
| 创建/更新/删除版本（用户端） | `sdk:versions:{appID}` + `sdk:appinfo:{appID}` |
| 创建/更新/删除版本（管理员端） | 同上 |
| 创建/更新/删除应用公告 | `sdk:announcements:{appID}` |
| 创建/更新/删除数据池 | `sdk:datapools:{appID}` |
| 更新应用信息（名称/描述等） | `sdk:appinfo:{appID}` |
| 删除应用 | 全部 SDK 缓存 |

---

## 第三优先级：前台公共配置（每次打开页面请求）

| 接口 | Redis Key | TTL | 说明 |
|------|-----------|-----|------|
| `GET /config/site` | `config:site` | 300s | 站点名称/Logo/副标题等 |
| `GET /config/announcements` | `config:announcements` | 60s | 系统公告列表 |
| `GET /config/register` | `config:register` | 300s | 注册配置（是否需要邮箱/验证码） |
| `GET /config/security` | `config:security` | 300s | 安全配置（主题色/页面动画） |

### 缓存清理触发点

| 操作 | 清理的 Key |
|------|-----------|
| 管理员保存站点配置 | `config:site` |
| 管理员创建/更新/删除/批量保存系统公告 | `config:announcements` |
| 管理员保存注册配置 | `config:register` |
| 管理员保存安全配置 | `config:security` |

---

## 防火墙缓存（Redis / 内存双模式）

防火墙相关的计数器和检测在 Redis 启用时使用 Redis，未启用时降级为内存缓存。

| 功能 | Redis Key | TTL | 说明 |
|------|-----------|-----|------|
| IP 频率限制 | `fw:iprate:{appID}:{ip}` | 60s | 每分钟请求计数 |
| API 频率限制 | `fw:apirate:{appID}` | 60s | 每分钟调用计数 |
| 重放攻击检测 | `fw:replay:{uuid}` | 配置的窗口时间 | UUID 去重 |
| 登录失败计数 | `fw:loginfail:{appID}:{ip}` | 锁定时长 | 失败次数累计 |
| 登录失败锁定 | `fw:loginfail:{appID}:{ip}:lock` | 锁定时长 | 锁定标记 |

内存模式下由后台协程每 5 分钟清理过期数据。Redis 模式下由 Redis TTL 自动过期。

---

## Redis Key 前缀汇总

| 前缀 | 用途 |
|------|------|
| `app:` | 应用对象缓存 |
| `fw:config:` | 防火墙配置缓存 |
| `fw:iprate:` | IP 频率限制计数 |
| `fw:apirate:` | API 频率限制计数 |
| `fw:replay:` | 重放攻击 UUID 去重 |
| `fw:loginfail:` | 登录失败计数和锁定 |
| `blacklist:ip:` | IP 黑名单缓存 |
| `blacklist:feat:` | 特征码黑名单缓存 |
| `sdk:appinfo:` | SDK 应用信息缓存 |
| `sdk:versions:` | SDK 版本列表缓存 |
| `sdk:announcements:` | SDK 应用公告缓存 |
| `sdk:datapools:` | SDK 数据池列表缓存 |
| `config:site` | 站点配置缓存 |
| `config:announcements` | 系统公告缓存 |
| `config:register` | 注册配置缓存 |
| `config:security` | 安全配置缓存 |
