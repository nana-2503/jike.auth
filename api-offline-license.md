# API 接口文档：离线授权签发与本地校验

> **说明**
> 本文是**可选的高级集成文档**，jike-auth 本身**不依赖也不校验任何授权码**，开箱即用。
> 如果你打算在自己的商业产品里实现「机器码绑定 / 离线授权」，本文可以作为**设计参考与实现模板**。
> 文中所有密钥、域名、产品编码均为占位符，需要你替换成自己的；签发服务也不在本仓库范围内。

## 目标

本文档用于把授权中心集成到其他项目。外部项目只需要调用一个接口签发离线授权码，然后在自己的程序里本地校验 `offlineCode`。

核心原则：

- 外部项目提交 `productCode`、`licenseKey`、`bindValue` 获取离线授权码。
- 签发接口不需要 HMAC 请求签名。
- `offlineCode` 由授权中心使用产品的 Ed25519 私钥签名。
- 外部项目只保存产品离线公钥，不能也不应该保存私钥。
- 不知道私钥时，无法伪造一个能通过公钥验签的 `offlineCode`。

## 接口信息

- API 前缀：`/api/v1`
- 接口：`POST /api/v1/licenses/offline`
- 请求格式：`application/json`
- 离线码格式：`payload.signature`
- 离线码签名算法：`Ed25519`
- 内置离线公钥：`<your-ed25519-public-key-base64url>`
- 公钥编码：Base64 RawURL，不带 `=`

## 接入流程

1. 后台创建产品。
2. 后台产品管理中获取 `productCode`。
3. 用户购买或由管理员发放产品订阅，系统生成 `licenseKey`。
4. 外部项目读取本机机器码、设备指纹或域名，作为 `bindValue`。
5. 外部项目调用 `POST /api/v1/licenses/offline` 获取 `offlineCode`。
6. 外部项目保存 `offlineCode`。
7. 外部项目离线运行时，使用内置离线公钥验签并校验 payload 字段。

## 签发离线授权

```http
POST /api/v1/licenses/offline
Content-Type: application/json
```

### 请求体

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `productCode` | string | 是 | 产品编码。 |
| `version` | string | 版本授权时必填 | 当前客户端版本号；全版本授权可不传。 |
| `licenseKey` | string | 是 | 用户已开通且未过期、未吊销的授权码。 |
| `bindType` | string | 否 | `machine` 或 `domain`。为空时使用产品配置的默认绑定方式。 |
| `bindValue` | string | 是 | 机器码、设备指纹、域名或其他外部项目可稳定读取的绑定值。 |

### 请求示例

```json
{
  "productCode": "demo",
  "version": "1.0.0",
  "licenseKey": "lic_xxxxxxxxxx",
  "bindType": "machine",
  "bindValue": "machine-fingerprint-001"
}
```

### 成功响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "offlineCode": "<payloadPart>.<signaturePart>",
    "expiresAt": "2026-07-04 12:00"
  }
}
```

### 响应字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | number | 业务码。`0` 表示成功，非 `0` 表示失败。 |
| `message` | string | 响应说明。成功时为 `ok`，失败时为错误说明。 |
| `data.offlineCode` | string | 离线授权码，格式为 `payloadPart.signaturePart`。 |
| `data.expiresAt` | string | 离线授权到期时间。取产品离线最大天数和订阅到期时间中更早的一个。 |

## 签发接口校验逻辑

服务端会校验：

- `licenseKey` 必须存在。
- `licenseKey` 必须属于 `productCode` 对应的产品。
- 授权状态必须是有效状态。
- 订阅授权未过期。
- 产品必须启用离线授权。
- `bindValue` 不能为空。
- 同一个授权的绑定值数量不能超过套餐配置的绑定上限。
- 相同 `bindType + bindValue` 重复签发不会重复占用绑定名额。

## offlineCode 格式

`offlineCode` 是两段字符串，用英文句号分隔：

```text
payloadPart.signaturePart
```

- `payloadPart`：Base64 RawURL 编码后的 JSON payload。
- `signaturePart`：使用 Ed25519 私钥对 `payloadPart` 原始字符串签名后的 Base64 RawURL 字符串。

注意：签名对象是 `payloadPart` 字符串，不是解码后的 JSON。

## payload 字段

解码 `payloadPart` 后得到 JSON：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `licenseKey` | string | 授权码。 |
| `productCode` | string | 产品编码。 |
| `versionScope` | string | `all` 或 `version`。`all` 表示全版本授权，`version` 表示指定版本授权。 |
| `version` | string | 指定版本授权对应的版本号；全版本授权为空。 |
| `userId` | number | 授权所属用户 ID。 |
| `bindType` | string | `machine` 或 `domain`。 |
| `bindValue` | string | 签发时绑定的机器码、设备指纹或域名。 |
| `issuedAt` | number | 签发时间，Unix 秒。 |
| `offlineExpiresAt` | number | 离线码到期时间，Unix 秒。 |
| `subscriptionExpiresAt` | number | 订阅授权到期时间，Unix 秒。`0` 表示买断或无订阅到期限制。 |
| `type` | string | `duration` 或 `lifetime`。 |
| `bindLimit` | number | 当前订阅允许同时使用的绑定值数量。 |
| `serial` | string | 离线授权签发流水号。 |

## 本地校验规则

外部项目本地必须校验：

1. `offlineCode` 必须能分成两段。
2. 使用内置离线公钥验证 `signaturePart`。
3. 验签输入必须是 `payloadPart` 原始字符串。
4. `payload.productCode` 必须等于当前项目的产品编码。
5. 如果 `payload.versionScope === "version"`，`payload.version` 必须等于当前客户端版本号。
6. `payload.bindType` 必须符合当前项目预期。
7. `payload.bindValue` 必须等于当前机器码、设备指纹或域名。
8. `payload.offlineExpiresAt` 必须大于当前时间。
9. 如果 `payload.subscriptionExpiresAt > 0`，它也必须大于当前时间。

只校验过期时间是不够的，必须先验签。否则攻击者可以自己修改 payload 里的时间。

## JavaScript 校验示例

下面是伪代码，实际项目可使用 `@noble/ed25519` 或其他 Ed25519 库。

```js
function base64urlDecode(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4)
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

async function verifyOfflineCode({
  offlineCode,
  expectedProductCode,
  expectedVersion,
  expectedBindType,
  currentBindValue,
}) {
  const parts = offlineCode.split(".")
  if (parts.length !== 2) throw new Error("离线授权格式无效")

  const [payloadPart, signaturePart] = parts
  const publicKeyBytes = base64urlDecode("<your-ed25519-public-key-base64url>")
  const signatureBytes = base64urlDecode(signaturePart)
  const messageBytes = new TextEncoder().encode(payloadPart)

  const ok = await ed25519Verify(signatureBytes, messageBytes, publicKeyBytes)
  if (!ok) throw new Error("离线授权签名无效")

  const payloadBytes = base64urlDecode(payloadPart)
  const payload = JSON.parse(new TextDecoder().decode(payloadBytes))
  const now = Math.floor(Date.now() / 1000)

  if (payload.productCode !== expectedProductCode) throw new Error("产品不匹配")
  if (payload.versionScope === "version" && payload.version !== expectedVersion) throw new Error("版本不匹配")
  if (payload.bindType !== expectedBindType) throw new Error("绑定类型不匹配")
  if (payload.bindValue !== currentBindValue) throw new Error("绑定值不匹配")
  if (payload.offlineExpiresAt <= now) throw new Error("离线授权已过期")
  if (payload.subscriptionExpiresAt > 0 && payload.subscriptionExpiresAt <= now) {
    throw new Error("订阅授权已过期")
  }

  return payload
}
```

## Go 校验示例

```go
package licenseverify

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type OfflinePayload struct {
	LicenseKey            string `json:"licenseKey"`
	ProductCode           string `json:"productCode"`
	VersionScope          string `json:"versionScope"`
	Version               string `json:"version"`
	UserID                uint   `json:"userId"`
	BindType              string `json:"bindType"`
	BindValue             string `json:"bindValue"`
	IssuedAt              int64  `json:"issuedAt"`
	OfflineExpiresAt      int64  `json:"offlineExpiresAt"`
	SubscriptionExpiresAt int64  `json:"subscriptionExpiresAt"`
	Type                  string `json:"type"`
	BindLimit             int    `json:"bindLimit"`
	Serial                string `json:"serial"`
}

func VerifyOfflineCode(offlineCode, expectedProductCode, expectedVersion, expectedBindType, currentBindValue string) (*OfflinePayload, error) {
	parts := strings.Split(offlineCode, ".")
	if len(parts) != 2 {
		return nil, errors.New("离线授权格式无效")
	}

	payloadPart := parts[0]
	signaturePart := parts[1]

	publicKeyBytes, err := base64.RawURLEncoding.DecodeString("<your-ed25519-public-key-base64url>")
	if err != nil {
		return nil, err
	}
	signatureBytes, err := base64.RawURLEncoding.DecodeString(signaturePart)
	if err != nil {
		return nil, err
	}

	if !ed25519.Verify(ed25519.PublicKey(publicKeyBytes), []byte(payloadPart), signatureBytes) {
		return nil, errors.New("离线授权签名无效")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(payloadPart)
	if err != nil {
		return nil, err
	}
	var payload OfflinePayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, err
	}

	now := time.Now().Unix()
	if payload.ProductCode != expectedProductCode {
		return nil, errors.New("产品不匹配")
	}
	if payload.VersionScope == "version" && payload.Version != expectedVersion {
		return nil, errors.New("版本不匹配")
	}
	if payload.BindType != expectedBindType {
		return nil, errors.New("绑定类型不匹配")
	}
	if payload.BindValue != currentBindValue {
		return nil, errors.New("绑定值不匹配")
	}
	if payload.OfflineExpiresAt <= now {
		return nil, errors.New("离线授权已过期")
	}
	if payload.SubscriptionExpiresAt > 0 && payload.SubscriptionExpiresAt <= now {
		return nil, errors.New("订阅授权已过期")
	}

	return &payload, nil
}
```

## 错误响应

接口错误也统一返回 JSON，并且一定包含 `code`：

```json
{
  "code": 103,
  "message": "签发离线授权失败",
  "data": null
}
```

业务码：

| code | 说明 |
| --- | --- |
| `0` | 成功。 |
| `101` | 请求参数无效。 |
| `102` | 绑定数量已达上限。 |
| `103` | 签发失败，通常是授权无效、授权过期、产品未启用离线授权或其他业务校验失败。 |

HTTP 状态：

| 状态码 | 场景 |
| --- | --- |
| `400` | 参数无效、授权无效、授权过期、绑定数量已达上限、产品未启用离线授权。 |
| `500` | 服务端异常。 |

## 安全说明

### 不知道私钥能否伪造签名？

不能。

`offlineCode` 使用 Ed25519 私钥签名。外部项目只有公钥，公钥只能验签，不能生成合法签名。攻击者即使修改了 payload，比如延长 `offlineExpiresAt`，也无法重新生成能通过验签的 `signaturePart`。

### 为什么不需要 HMAC 请求签名？

签发接口的安全边界是 `licenseKey`、产品归属、授权状态、绑定上限和最终的 Ed25519 离线码签名。

HMAC 请求签名需要外部项目保存 `API Secret`。如果外部项目是客户端软件、桌面软件或容易被反编译的环境，保存 `API Secret` 反而会扩大泄露面。因此当前签发接口只要求提交业务必要字段。

### 私钥应该放在哪里？

私钥只保存在授权中心后台数据库中，由授权中心签发 `offlineCode` 时使用。外部项目不要保存私钥，也不要把私钥写进客户端。

### 公钥可以公开吗？

可以。公钥用于验签，可以放在外部项目中。泄露公钥不会导致攻击者伪造授权码。

## 集成注意事项

- `bindValue` 必须稳定，否则用户每次机器码变化都可能占用新的绑定名额。
- 客户端本地时间会影响过期判断，建议对明显异常的系统时间做提示。
- 离线模式下无法实时知道授权是否已被后台吊销，只能依赖 `offlineExpiresAt` 到期后重新签发。
- 建议将 `offlineCode` 加密或混淆保存在本地，但不要把本地加密当作核心安全边界。
- 核心安全边界始终是 Ed25519 验签、产品编码校验、绑定值校验和过期时间校验。
