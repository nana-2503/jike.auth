<div align="center">

# 极客验证 · JikeAuth

**一站式软件授权验证平台**

开箱即用的 SaaS 授权系统，为独立开发者与小型团队提供应用管理、用户授权、卡密充值、在线会话、防火墙与 SDK 接入能力。

[License](LICENSE) · [Issues](https://github.com/nana-2503/jike-auth/issues) · [Discussions](https://github.com/nana-2503/jike-auth/discussions)

</div>

---

## 这是什么

如果你开发了一款桌面软件或工具，并想把它卖给用户，你大概率需要解决这些问题：

- **用户能登录吗？** —— 注册、登录、找回密码
- **付了钱怎么给他用？** —— 卡密激活、时长扣减、到期提醒
- **怎么防止白嫖和爆破？** —— 设备绑定、频率限制、图形验证码
- **客户端怎么调接口？** —— 要一套稳定的 SDK，最好别让 AppKey 裸奔
- **能不能卖给别人代理？** —— 代理制卡、分成结算

这个项目把这些打包成了一套系统。你只需要一个数据库和十几分钟，就能跑起一个自己的授权平台。

**本项目完全开源免费，采用 MIT 协议，不设任何授权码、域名绑定或使用限制。**

## 功能

| 模块 | 说明 |
| --- | --- |
| 应用管理 | 多应用隔离，每个应用独立配置密钥、签名算法与功能开关 |
| 用户体系 | 注册、登录、验证码、找回密码、社交登录、封禁黑名单 |
| 卡密系统 | 卡种卡号管理、充值激活、扣点扣时、设备解绑 |
| 在线会话 | 实时在线用户查看、心跳保活、强制下线 |
| 防火墙 | IP 黑白名单、频率限制、重放检测、请求特征绑定 |
| 代理中心 | 代理制卡、余额、提现、推广返利 |
| 版本管理 | 版本发布、强制更新、指定版本下发 |
| 活动运营 | 签到、工单、公告、积分商城 |
| 数据池 | 云端键值数据，多应用共享的远程配置 |
| 开放 API | 带 API Key 的开放接口，方便对接自有系统 |
| 网盘 | 内置网盘模块，支持分享链接与直链 |
| SDK | Go HTTP SDK、Node.js WebSocket SDK，支持加解密与签名 |

## 技术栈

**后端** — Go 1.23 · Gin · GORM · MySQL / MariaDB / PostgreSQL · Redis（可选）· JWT · bcrypt · Gorilla WebSocket

**前端** — React 18 · TypeScript · Vite · HeroUI · Ant Design · Tailwind CSS v4 · Zustand · Axios

**安全** — bcrypt 密码哈希 · AES-CBC 通讯加密 · SHA-256 请求签名 · 图形验证码 · 应用级防火墙 · 重放保护

前端产物会通过 `go:embed` 打进单个二进制，部署时只需要一个可执行文件。

## 快速开始

### 方式一：Docker Compose（推荐）

```bash
git clone https://github.com/nana-2503/jike-auth.git
cd jike-auth

# 准备一个空数据库（MySQL / MariaDB / PostgreSQL）
docker compose up -d --build
```

启动后访问 `http://localhost:5174`，按安装向导依次完成 **数据库 → Redis（可选）→ 管理员账号** 三步配置。

> 数据库和 Redis 需要你自己准备好，`docker-compose.yml` 只负责构建前后端。

### 方式二：本地构建

需要 Go 1.23+、Node.js 18+。

```bash
# 1. 构建前端（产物自动复制到 backend/dist）
cd frontend
npm install
npm run build

# 2. 编译后端
cd ../backend
go build -o jike-auth .

# 3. 启动（首次启动会引导你完成配置）
./jike-auth
```

Windows 用户可以直接跑仓库根目录的 `build.bat`，它会交叉编译出 Windows / Linux amd64 / Linux arm64 三个平台的二进制到 `release/`。

### 方式三：仅后端开发模式

带 `-tags dev` 编译时后端不会嵌入前端静态文件，便于前后端分离调试：

```bash
cd backend
go run -tags dev .
```

此时后端监听 `:8081`，前端另开终端 `cd frontend && npm run dev` 跑在 `:5173`，通过 Vite 代理访问 API。

## 配置说明

后端配置文件是 `backend/config.yaml`，首次启动时由安装向导自动生成。**它包含数据库密码和 JWT 密钥，已被 `.gitignore` 排除，请勿提交到版本库。**

```yaml
initialized: 1
server:
  port: 8081
  mode: release        # debug 模式需要额外设置环境变量 ALLOW_DEBUG=true
database:
  type: mysql          # mysql | mariadb | postgres
  mysql:
    host: 127.0.0.1
    port: 3306
    user: root
    password: ""
    dbname: jike-auth
redis:
  enable: false        # 关闭时自动降级为内存缓存
  host: 127.0.0.1
  port: 6379
  password: ""
  db: 0
jwt:
  secret: ""           # 留空则首次启动自动生成 64 位随机密钥并回写
  expire: 168h
site:
  name: 极客验证
```

几点说明：

- **没有默认管理员账号。** 管理员由安装向导创建，请使用强密码。
- **JWT 密钥自动生成**，不会用固定弱密钥兜底。丢失该密钥会导致所有已登录会话失效。
- **PostgreSQL 的 `sslmode` 默认是 `disable`**，公网部署请改为 `require`。
- **多实例部署请务必启用 Redis**，否则频控、重放检测、登录锁等内存状态无法跨实例共享。

## SDK

### Go HTTP SDK

```go
import jkauth "jkauth-sdk"

client := jkauth.NewClient(jkauth.Config{
    BaseURL:   "https://your-domain.com/api/sdk",
    AppCode:   "<your-app-code>",
    AppKey:    "<your-app-key>",
    AppSecret: "<your-app-secret>",
    // 签名算法模板从后台应用管理页复制
})
```

### Node.js WebSocket SDK

```js
const WSClient = require('./ws-client')

const client = new WSClient(WS_URL, APP_CODE, APP_SECRET, APP_KEY, SERVER_SIGN_ALGO, SIGN_ALGO)
```

> 完整示例见 [`sdk/go/example/main.go`](sdk/go/example/main.go) 与 [`sdk/ws/nodejs/example.js`](sdk/ws/nodejs/example.js)。
> 示例中的凭证均为占位符，需要你从后台应用管理页获取真实值。

## 项目结构

```
jike-auth/
├── backend/           Go + Gin 后端（配置、模型、路由、处理器、中间件）
├── frontend/          React + TypeScript 管理前端
├── sdk/               客户端 SDK：Go HTTP / Node.js WebSocket
├── doc/               接口文档：客户端 API、后台接口、开放 API
├── docker-compose.yml
├── build.bat          Windows 交叉编译脚本
└── backup.bat         源码备份脚本
```

## 文档

| 文档 | 内容 |
| --- | --- |
| [项目总结.md](项目总结.md) | 项目定位、架构、启动流程、维护要点 |
| [二次开发指南.md](二次开发指南.md) | 模块划分、路由分组、扩展建议 |
| [doc/client-api/](doc/client-api/) | 面向客户端开发者的 SDK 接口文档 |
| [doc/backend-interface/](doc/backend-interface/) | 后台各业务模块的接口说明 |
| [api-offline-license.md](api-offline-license.md) | 离线授权签发与验签的**设计参考**（可选功能，本项目本身不使用） |
| [免费开放公告.md](免费开放公告.md) | 开源说明与免责声明 |

## 安全提示

如果你在生产环境使用本项目，请注意：

- **务必修改数据库密码**，不要用 root 空密码直连生产库
- **公网部署时前端走 HTTPS**，SDK 的 AppSecret 与签名算法只在 HTTPS 下有意义
- **`config.yaml` 权限设为 `600`**，不要进版本库
- **定期备份数据库**，本项目的 `backup.bat` 只备份源码，不含数据
- 本项目按「原样」提供，不提供任何担保。请自行评估、测试并对数据做好备份后再用于生产环境。

## 免责声明

本项目基于 MIT 许可证开源，仅供学习与商业参考使用。使用者应自行评估并承担全部风险，开发者不对任何直接或间接损失承担责任。使用本项目即视为同意上述条款。

## 贡献

欢迎提交 Issue 和 Pull Request。涉及代码的改动请先确认：

- `backend` 通过 `go vet ./...` 与 `go test ./...`
- `frontend` 通过 `npm run build`
- 不要提交 `config.yaml`、`backend/.license/`、`release/` 等敏感或构建产物

## 许可

[MIT](LICENSE) © 2024-2026 jike-auth contributors