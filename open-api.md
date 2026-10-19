# 网盘开放接口对接文档

> **说明**
> 本文描述的 `/api/v1/open` 接口属于**独立的网盘服务**，不由本仓库的 jike-auth 后端提供
> （本仓库的实际网盘路由是 `/api/pan` 与 `/api/open`，见 `doc/` 目录）。
> 保留本文作为**接口设计参考**。如果你要接入的是本仓库的网盘能力，请以 `doc/` 下的文档为准。

本文档面向需要把网盘能力接入自有客户端的第三方系统。开放接口统一使用 `/api/v1/open` 前缀，鉴权使用后台生成的 API Key。

## 1. 基础约定

### 1.1 API 根地址

示例：

```text
https://pan.example.com/api/v1
```

文档中的 `{baseUrl}` 均指 API 根地址，例如：

```text
{baseUrl}=https://pan.example.com/api/v1
```

### 1.2 鉴权

开放接口需要携带 API Key，推荐使用 `X-API-Key` 请求头：

```http
X-API-Key: <api_key>
```

也兼容 Bearer 写法：

```http
Authorization: Bearer <api_key>
```

API Key 由用户登录后台后在“开放接口 API Key”区域生成。Key 只在创建成功时显示一次，请妥善保存；删除后立即失效。

API Key 与创建它的用户绑定，开放接口只能访问该用户自己的文件、目录、存储桶和分享链接。管理员身份不会让某个 API Key 直接访问其他用户的数据。

### 1.3 开放接口统一响应

除文件内容下载类接口外，所有 `/api/v1/open/*` 接口都会返回统一结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | number | `0` 表示成功，非 `0` 表示失败 |
| `message` | string | 成功时为 `ok`，失败时为错误说明 |
| `data` | object/null | 成功时为业务数据，失败时为 `null` |

失败示例：

```json
{
  "code": 1200,
  "message": "请填写目录名称",
  "data": null
}
```

建议客户端以 `code` 判断业务是否成功，HTTP 状态码只作为辅助判断。

### 1.4 请求格式

普通接口使用 JSON：

```http
Content-Type: application/json
```

上传文件接口使用 `multipart/form-data`。

文件内容下载接口直接返回原始文件流，支持 `Range` 请求，不会包裹统一响应结构。

时间字段约定：

- 请求里的过期时间使用 RFC3339，例如 `2026-06-30T23:59:59+08:00`。
- 文件列表和分享列表中的部分展示时间会按服务端格式返回，例如 `2026-06-08 10:00`。
- 搜索日期支持 `YYYY-MM-DD` 或 RFC3339。

分页约定：

- `page` 小于等于 `0` 或不是数字时按默认值处理。
- `pageSize` 小于等于 `0` 或不是数字时按默认值处理。
- 当前接口没有强制固定最大 `pageSize`，客户端建议控制在 `20` 到 `100` 之间，避免一次拉取过多数据。

### 1.5 错误码表

| code | 说明 |
| --- | --- |
| `0` | 成功 |
| `1000` | 通用参数错误或业务限制 |
| `1001` | API Key 缺失、无效或已过期 |
| `1003` | 账号停用、无权限或不存在 |
| `1004` | 资源不存在 |
| `1005` | 请求过于频繁 |
| `1200` | 文件或文件夹操作失败 |
| `1300` | 分享操作失败 |
| `1400` | 上传失败 |
| `1401` | 上传文件超过限制 |
| `1500` | 服务端异常 |

说明：

- 客户端应优先判断 `code`。
- `message` 是可展示给用户或写入日志的错误说明。
- HTTP 状态码仍保留，例如鉴权失败同时会返回 HTTP `401` 和业务 `code=1001`。

### 1.6 权限点

创建 API Key 时可以勾选权限。后端按接口校验权限，缺少权限会返回 HTTP `403` 和业务 `code=1003`。

| 权限值 | 说明 | 关联接口 |
| --- | --- | --- |
| `files.list` | 文件列表 | `GET /open/files` |
| `files.read` | 读取文件内容 | `GET /open/files/{fileId}/content` |
| `files.upload` | 上传文件 | `POST /open/files`、`POST /open/uploads`、`GET /open/uploads/{uploadId}`、`POST /open/uploads/{uploadId}/chunks/{index}`、`POST /open/uploads/{uploadId}/complete`、`DELETE /open/uploads/{uploadId}` |
| `files.delete` | 删除文件 | `DELETE /open/files/{fileId}` |
| `folders.create` | 创建目录 | `POST /open/folders` |
| `folders.delete` | 删除目录 | `DELETE /open/folders/{folderId}` |
| `storage.read` | 读取存储对象 | `GET /open/storage/objects/content` |
| `storage.write` | 写入存储对象 | `POST /open/storage/objects` |
| `storage.delete` | 删除存储对象 | `DELETE /open/storage/objects` |
| `shares.list` | 分享列表 | `GET /open/shares` |
| `shares.create` | 创建分享和直连 | `POST /open/files/{fileId}/share`、`POST /open/shares`、`POST/GET /open/files/{fileId}/direct-link` |
| `shares.update` | 更新分享 | `PUT /open/shares/{token}` |
| `shares.delete` | 删除分享 | `DELETE /open/shares/{token}` |

说明：服务端也识别 `*` 作为全权限值；Web 后台默认通过勾选具体权限创建 Key。

### 1.7 数据模型

文件条目：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 文件公开 ID，后续下载、删除、分享、直连都使用该值 |
| `kind` | string | 固定为 `file` |
| `name` | string | 文件名 |
| `sizeBytes` | number | 文件大小，单位字节 |
| `contentType` | string | MIME 类型 |
| `bucketName` | string | 存储桶名称 |
| `path` | string | 搜索结果中可能返回的路径 |
| `createdAt` | string | 创建时间 |
| `tags` | string[] | 标签 |
| `favorite` | boolean | 是否收藏 |

目录条目：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 文件夹公开 ID |
| `kind` | string | 固定为 `folder` |
| `name` | string | 文件夹名称 |
| `bucketName` | string | 存储桶名称 |
| `path` | string | 搜索结果中可能返回的路径 |
| `createdAt` | string | 创建时间 |
| `sizeBytes` | number | 目录统计大小，可能依赖后台统计刷新 |
| `fileCount` | number | 目录内文件数量统计，可能依赖后台统计刷新 |
| `tags` | string[] | 标签 |
| `favorite` | boolean | 是否收藏 |

分享条目：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 分享 ID，目前等于 `token` |
| `token` | string | 分享 Token，用于公开分享页、直链和更新/删除接口 |
| `kind` | string | `direct` 表示单文件分享，`bundle` 表示多文件/目录分享 |
| `autoUpdate` | boolean | 目录分享是否自动更新 |
| `name` | string | 分享名称 |
| `fileCount` | number | 分享包含的文件数量 |
| `createdAt` | string | 创建时间 |
| `maxDownloads` | number | 最大下载次数，`0` 表示不限 |
| `downloadCount` | number | 已下载次数 |
| `expiresAt` | string | 过期时间，空字符串表示不过期 |
| `hasPassword` | boolean | 是否设置了访问密码 |
| `description` | string | 分享说明 |
| `themePreset` | string | 分享页面配色 |
| `url` | string | 公开分享页面地址 |
| `directUrl` | string | 单文件直链地址，仅 `direct` 分享返回 |

## 2. 获取 API Key

### 2.1 后台生成

用户登录 Web 后台，进入“开放接口 API Key”区域，填写名称、可选过期时间并勾选权限，点击“生成”。

生成成功后会返回完整 Key，例如：

```text
jkp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

完整 Key 只显示一次。列表里只展示 Key 前缀、创建时间、最近使用时间、过期时间和权限列表。

生成建议：

- 给不同系统分别创建不同 Key，便于审计和撤销。
- 只勾选业务需要的最小权限。
- 有明确项目周期时设置过期时间。
- Key 泄漏后应立即删除旧 Key 并重新生成。

### 2.2 调用开放接口

后续开放接口均使用：

```http
X-API-Key: jkp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

curl 示例：

```bash
curl -H "X-API-Key: <api_key>" \
  "https://pan.example.com/api/v1/open/files"
```

## 3. 文件列表

### 3.1 读取文件列表

```http
GET {baseUrl}/open/files
```

所需权限：`files.list`

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `bucketName` | string | 否 | 存储桶名称；也兼容 `bucket` |
| `folderId` | string | 否 | 文件夹 ID；也兼容 `folder`；不传表示根目录 |
| `q` | string | 否 | 搜索关键词；也兼容 `keyword` |
| `page` | number | 否 | 页码，默认 `1` |
| `pageSize` | number | 否 | 每页数量，默认 `20` |
| `kind` | string | 否 | 条目类型，可选 `file` 或 `folder` |
| `fileType` | string | 否 | 文件类型筛选，可选 `image`、`video`、`audio`、`document`、`archive` |
| `filterBucket` | string | 否 | 搜索/筛选时限定存储桶 |
| `tag` | string | 否 | 按标签筛选 |
| `favorite` | string | 否 | `true` 或 `1` 表示只看收藏 |
| `minSize` | number | 否 | 最小文件大小，单位字节 |
| `maxSize` | number | 否 | 最大文件大小，单位字节 |
| `dateFrom` | string | 否 | 开始日期，支持 `YYYY-MM-DD` 或 RFC3339 |
| `dateTo` | string | 否 | 结束日期，支持 `YYYY-MM-DD` 或 RFC3339 |

请求示例：

```bash
curl -H "X-API-Key: <api_key>" \
  "https://pan.example.com/api/v1/open/files?folderId=<folderId>&page=1&pageSize=20"
```

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "currentBucket": "local",
    "currentFolder": null,
    "buckets": [
      {
        "name": "local",
        "displayName": "本地存储"
      }
    ],
    "entries": [
      {
        "id": "file_public_id",
        "kind": "file",
        "name": "demo.txt",
        "sizeBytes": 128,
        "contentType": "text/plain",
        "bucketName": "local",
        "createdAt": "2026-06-08 10:00",
        "tags": [],
        "favorite": false
      },
      {
        "id": "folder_public_id",
        "kind": "folder",
        "name": "docs",
        "bucketName": "local",
        "createdAt": "2026-06-08 10:00",
        "sizeBytes": 0,
        "fileCount": 0,
        "tags": [],
        "favorite": false
      }
    ],
    "total": 2,
    "page": 1,
    "pageSize": 20
  }
}
```

说明：

- `data.entries[].id` 是后续删除、分享、获取直连等接口使用的文件或文件夹 ID。
- 删除文件使用 `kind=file` 条目的 ID。
- 删除文件夹使用 `kind=folder` 条目的 ID。
- 只传 `bucketName`/`bucket` 时读取该存储桶根目录。
- 传 `folderId`/`folder` 时会按文件夹所属存储桶读取目录，即使 `bucketName` 为空也可以正常进入目录。
- 传 `q` 或任一筛选条件时进入搜索模式，结果中的 `path` 字段可能出现，用于展示命中的完整路径。
- `minSize`、`maxSize` 必须是非负整数，否则返回参数错误。
- `dateTo` 按传入时间点比较；如果传 `YYYY-MM-DD`，表示当天 `00:00:00`，需要包含整天时建议传 RFC3339 的当天结束时间。

## 4. 文件夹

### 4.1 创建文件夹

```http
POST {baseUrl}/open/folders
```

所需权限：`folders.create`

请求体：

```json
{
  "name": "客户资料",
  "bucketName": "local",
  "parentId": "",
  "inherit": false
}
```

参数说明：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 文件夹名称 |
| `bucketName` | string | 否 | 存储桶名称，不传使用默认存储桶 |
| `parentId` | string | 否 | 父级文件夹 ID，不传表示根目录 |
| `inherit` | boolean | 否 | 是否继承父目录存储桶 |

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "folder_public_id",
    "kind": "folder",
    "name": "客户资料",
    "bucketName": "local",
    "createdAt": "2026-06-08 10:00",
    "sizeBytes": 0,
    "fileCount": 0,
    "tags": [],
    "favorite": false
  }
}
```

HTTP 状态码：`201 Created`

说明：

- `parentId` 为空时在目标存储桶根目录创建。
- `inherit=true` 时优先继承父目录所属存储桶，适合客户端不知道父目录实际存储桶的场景。
- 同名目录、无权访问存储桶或父目录不存在时会返回 `code=1200`。

### 4.2 删除文件夹

```http
DELETE {baseUrl}/open/folders/{folderId}
```

所需权限：`folders.delete`

路径参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `folderId` | string | 文件夹公开 ID，来自文件列表的 `kind=folder` 条目 |

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "ok": true
  }
}
```

说明：

- 删除文件夹会移入回收站，不会立即永久清除物理文件。
- 删除目录会影响目录下文件和子目录的可见性。
- 目录不存在、已删除或不属于当前 API Key 用户时返回 `code=1200` 或 `code=1004`。

## 5. 文件

### 5.1 上传文件

```http
POST {baseUrl}/open/files
```

所需权限：`files.upload`

请求类型：

```http
Content-Type: multipart/form-data
```

表单字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | file | 是 | 要上传的文件 |
| `bucketName` | string | 否 | 存储桶名称；也兼容 `bucket` |
| `folderId` | string | 否 | 目标文件夹 ID；也兼容 `folder`；不传表示根目录 |

请求示例：

```bash
curl -X POST "https://pan.example.com/api/v1/open/files" \
  -H "X-API-Key: <api_key>" \
  -F "file=@/path/to/demo.txt" \
  -F "bucketName=local" \
  -F "folderId=<folderId>"
```

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "file_public_id",
    "kind": "file",
    "name": "demo.txt",
    "sizeBytes": 128,
    "contentType": "text/plain",
    "bucketName": "local",
    "createdAt": "2026-06-08 10:00",
    "tags": [],
    "favorite": false
  }
}
```

HTTP 状态码：`201 Created`

说明：

- 文件名取上传表单中文件本身的文件名。
- 上传会校验用户容量、单文件大小、上传策略和禁用文件类型。
- 超出请求体/上传大小限制时返回 HTTP `413` 和业务 `code=1401`。
- 上传到对象存储、WebDAV、SFTP、同系统等不同存储桶时，开放接口统一使用该接口，底层写入方式由服务端决定。

### 5.2 删除文件

```http
DELETE {baseUrl}/open/files/{fileId}
```

所需权限：`files.delete`

路径参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `fileId` | string | 文件公开 ID，来自文件列表的 `kind=file` 条目 |

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "ok": true
  }
}
```

说明：

- 删除文件会移入回收站，不会立即永久清除物理文件。
- 文件不存在、已删除或不属于当前 API Key 用户时返回 `code=1200` 或 `code=1004`。

### 5.3 下载文件内容

```http
GET {baseUrl}/open/files/{fileId}/content
```

所需权限：`files.read`

该接口直接返回文件原始内容，不使用统一响应结构。响应头包含 `Content-Type`、`Content-Length`、`Content-Disposition` 和 `Accept-Ranges: bytes`。

路径参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `fileId` | string | 文件公开 ID |

响应：

| HTTP 状态码 | 说明 |
| --- | --- |
| `200` | 返回完整文件内容 |
| `206` | 返回 Range 指定的部分内容 |
| `416` | Range 不合法或超出文件范围 |
| `404` | 文件不存在或不可访问 |

请求示例：

```bash
curl -L -H "X-API-Key: <api_key>" \
  -o demo.txt \
  "https://pan.example.com/api/v1/open/files/<fileId>/content"
```

断点请求示例：

```bash
curl -H "X-API-Key: <api_key>" \
  -H "Range: bytes=0-1023" \
  "https://pan.example.com/api/v1/open/files/<fileId>/content"
```

说明：

- 该接口始终返回原始文件，不会返回图片预览图。
- `Content-Disposition` 为 `attachment`，适合客户端下载保存。
- 仅支持单段 Range，不支持多段 Range。

## 6. 分片上传

分片上传适合大文件、弱网络、需要暂停/恢复的客户端。开放接口分片上传复用站点上传策略，会自动根据目标存储桶选择上传模式。

所需权限：本章所有接口均需要 `files.upload`。

上传模式：

| `uploadMode` | 说明 | 客户端行为 |
| --- | --- | --- |
| `relay` | 分片上传到当前服务端，服务端合并后写入存储 | 调用 `/open/uploads/{uploadId}/chunks/{index}` 上传每个分片 |
| `relay-onedrive` | 分片上传到当前服务端，服务端转发到 OneDrive Upload Session | 调用 `/open/uploads/{uploadId}/chunks/{index}` 上传每个分片 |
| `relay-googledrive` | 分片上传到当前服务端，服务端转发到 Google Drive Resumable Upload | 调用 `/open/uploads/{uploadId}/chunks/{index}` 上传每个分片 |
| `direct-object` | 浏览器/客户端直接 PUT 到对象存储分片预签名地址 | 使用 `directParts[].url` 直传，完成时提交 ETag |
| `direct-onedrive` | 浏览器/客户端直接 PUT 到 OneDrive Upload Session 地址 | 使用 `directParts[].url` 直传，PUT 时带 `Content-Range` |

### 6.1 创建上传会话

```http
POST {baseUrl}/open/uploads
```

请求体：

```json
{
  "name": "large-video.mp4",
  "sizeBytes": 104857600,
  "contentType": "video/mp4",
  "bucketName": "local",
  "folderId": ""
}
```

参数说明：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 文件名 |
| `sizeBytes` | number | 是 | 文件总大小，单位字节，必须大于 `0` |
| `contentType` | string | 否 | MIME 类型，留空按 `application/octet-stream` |
| `bucketName` | string | 否 | 存储桶名称；也兼容 `bucket` |
| `folderId` | string | 否 | 目标文件夹 ID；也兼容 `folder`；不传表示根目录 |
| `storagePath` | string | 否 | 存储对象路径；也兼容 `path`；服务端对服务端同步使用，普通客户端一般不需要传 |
| `chunkSize` | number | 否 | 当前由服务端站点配置决定，客户端传入值会被忽略 |

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "U-1780000000000000000",
    "name": "large-video.mp4",
    "sizeBytes": 104857600,
    "chunkSize": 8388608,
    "totalChunks": 13,
    "uploadedChunks": [],
    "status": "uploading",
    "uploadMode": "relay",
    "directParts": [],
    "expiresAt": ""
  }
}
```

HTTP 状态码：`201 Created`

说明：

- `id` 是上传会话 ID，后续接口中的 `{uploadId}` 使用该值。
- `chunkSize`、`totalChunks` 以服务端返回为准。
- 分片序号从 `0` 开始，到 `totalChunks - 1` 结束。
- 上传会话会占用用户容量预留；取消或过期清理后释放。
- 上传会话有效期约为 `24` 小时，过期任务会由清理任务回收。
- 传 `storagePath` 时服务端会按该路径创建目录并写入对象，行为与 `POST /open/storage/objects` 的 `path` 一致。该字段主要用于同系统存储桶，不建议普通客户端依赖。

### 6.2 查询上传会话

```http
GET {baseUrl}/open/uploads/{uploadId}
```

路径参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `uploadId` | string | 上传会话 ID |

成功响应与创建上传会话一致。

说明：

- 客户端恢复上传时先查询会话。
- `uploadedChunks` 表示服务端已确认的分片序号。
- `directParts` 可能包含新的预签名地址，客户端恢复直传时应优先使用最新返回值。

### 6.3 上传服务端中转分片

```http
POST {baseUrl}/open/uploads/{uploadId}/chunks/{index}
```

请求类型：

```http
Content-Type: multipart/form-data
```

路径参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `uploadId` | string | 上传会话 ID |
| `index` | number | 分片序号，从 `0` 开始 |

表单字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `chunk` | file | 是 | 当前分片二进制内容 |

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "uploadedChunks": [0, 1]
  }
}
```

说明：

- 仅 `relay`、`relay-onedrive`、`relay-googledrive` 模式使用该接口。
- 每个分片大小必须严格等于服务端期望大小；最后一个分片等于剩余大小。
- 重传已上传分片是允许的，会覆盖该分片并返回最新 `uploadedChunks`。
- `direct-object` 和 `direct-onedrive` 模式不要调用该接口，应使用 `directParts` 直传。

curl 示例：

```bash
curl -sS -X POST "$BASE_URL/open/uploads/<uploadId>/chunks/0" \
  -H "X-API-Key: $API_KEY" \
  -F "chunk=@/tmp/chunk-0.bin"
```

### 6.4 直传对象存储分片

当创建会话返回 `uploadMode=direct-object` 时，服务端会返回 `directParts`：

```json
{
  "index": 0,
  "partNo": 1,
  "url": "https://object-storage.example.com/bucket/key?partNumber=1&uploadId=...",
  "expiresAt": "2026-06-30T10:15:00Z",
  "start": 0,
  "end": 8388607,
  "total": 104857600
}
```

客户端需要按 `directParts` 把对应字节范围 PUT 到 `url`：

```bash
curl -X PUT "<directParts[0].url>" \
  -H "Content-Length: 8388608" \
  --data-binary "@/tmp/chunk-0.bin" \
  -D /tmp/headers-0.txt
```

上传成功后读取响应头里的 `ETag`，完成上传时提交：

```json
{
  "parts": [
    {
      "index": 0,
      "partNo": 1,
      "etag": "\"etag-value\""
    }
  ]
}
```

说明：

- 对象存储直传要求对象存储 CORS 允许 `PUT`，并暴露 `ETag` 响应头。
- `partNo` 必须等于 `index + 1`。
- 所有分片都必须提交 ETag，否则完成上传会失败。
- 预签名地址过期后，重新查询上传会话获取新的 `directParts`。

### 6.5 直传 OneDrive 分片

当创建会话返回 `uploadMode=direct-onedrive` 时，`directParts[].url` 是 OneDrive Upload Session 地址。客户端 PUT 分片时必须设置 `Content-Range`：

```bash
curl -X PUT "<directParts[0].url>" \
  -H "Content-Length: 8388608" \
  -H "Content-Range: bytes 0-8388607/104857600" \
  --data-binary "@/tmp/chunk-0.bin"
```

完成上传时可以提交空请求体或 `{}`，服务端会校验远端文件大小并创建文件记录。

说明：

- OneDrive 直传不需要 ETag。
- `Content-Range` 使用 `directParts[].start`、`directParts[].end`、`directParts[].total`。
- OneDrive Upload Session 地址通常有效时间较短，过期后建议重新创建上传会话。

### 6.6 完成上传

```http
POST {baseUrl}/open/uploads/{uploadId}/complete
```

路径参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `uploadId` | string | 上传会话 ID |

请求体：

```json
{}
```

对象存储直传完成请求体：

```json
{
  "parts": [
    {
      "index": 0,
      "partNo": 1,
      "etag": "\"etag-value\""
    }
  ]
}
```

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "file_public_id",
    "name": "large-video.mp4",
    "sizeBytes": 104857600,
    "contentType": "video/mp4",
    "createdAt": "2026-06-08 10:00",
    "tags": [],
    "favorite": false
  }
}
```

HTTP 状态码：`201 Created`

说明：

- 服务端会校验分片完整性、最终文件大小、用户容量和禁用文件类型。
- 中转模式缺少任一分片会返回上传失败。
- `direct-object` 模式必须提交全部 `parts`。
- 重复调用完成接口时，如果会话已完成，会返回已创建的文件信息。

### 6.7 取消上传

```http
DELETE {baseUrl}/open/uploads/{uploadId}
```

路径参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `uploadId` | string | 上传会话 ID |

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

说明：

- 取消上传会清理服务端临时分片和上传会话。
- 对象存储直传会尝试中止 multipart upload。
- 已完成的上传会话不能再取消。

### 6.8 分片上传最小流程

服务端中转模式：

```text
1. POST /api/v1/open/uploads 创建上传会话
2. 按 data.chunkSize 切分文件
3. POST /api/v1/open/uploads/{uploadId}/chunks/0 上传第 0 片
4. 重复上传到 totalChunks - 1
5. POST /api/v1/open/uploads/{uploadId}/complete 完成上传
```

对象存储直传模式：

```text
1. POST /api/v1/open/uploads 创建上传会话
2. 使用 data.directParts 中每个 url PUT 对应分片
3. 记录每个 PUT 响应头 ETag
4. POST /api/v1/open/uploads/{uploadId}/complete 提交 parts
```

## 7. 存储对象接口

存储对象接口面向同系统存储桶对接使用。调用方通过 `path` 指定远端可见路径，服务端会将路径中的目录映射为文件夹记录，文件的实际存储键与 `path` 一致。配置同系统存储桶时，目标路径为“本地存储桶基础路径 + 写入文件的存储键”。

### 7.1 写入存储对象

```http
POST {baseUrl}/open/storage/objects
```

所需权限：`storage.write`

请求类型：

```http
Content-Type: multipart/form-data
```

表单字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | file | 是 | 要写入的文件 |
| `path` | string | 是 | 存储对象路径，例如 `remote/app/demo.txt` |
| `bucketName` | string | 否 | 目标存储桶名称；也兼容 `bucket`；不传使用默认存储桶 |

请求示例：

```bash
curl -X POST "https://pan.example.com/api/v1/open/storage/objects" \
  -H "X-API-Key: <api_key>" \
  -F "path=remote/app/demo.txt" \
  -F "bucketName=local" \
  -F "file=@/path/to/demo.txt"
```

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "file_public_id",
    "kind": "file",
    "name": "demo.txt",
    "sizeBytes": 128,
    "contentType": "text/plain",
    "bucketName": "local",
    "createdAt": "2026-06-08 10:00",
    "tags": [],
    "favorite": false
  }
}
```

HTTP 状态码：`201 Created`

说明：

- `path` 必须是相对路径，不能包含 `..`。
- `path` 使用 `/` 作为路径分隔符，不要以 `/` 开头。
- `path` 的最后一段会作为文件名；如果最后一段为空，则回退使用上传文件名。
- 重复写入同一个 `path` 会覆盖该对象，并更新对应文件记录。
- 覆盖已有对象时会复用原文件公开 ID，便于调用方保持引用稳定。
- 如果旧对象在回收站中，覆盖写入会把该文件恢复为正常可见状态。
- 该接口会校验上传大小、容量和禁用文件类型。
- 该接口主要用于“同系统”存储桶和服务端对服务端同步；普通业务上传文件优先使用 `POST /open/files`。

### 7.2 读取存储对象内容

```http
GET {baseUrl}/open/storage/objects/content?path=remote/app/demo.txt&bucketName=local
```

所需权限：`storage.read`

该接口直接返回文件原始内容，不使用统一响应结构，支持 `Range` 请求。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `path` | string | 是 | 存储对象路径 |
| `bucketName` | string | 否 | 目标存储桶名称；也兼容 `bucket`；不传使用默认存储桶 |

响应：

| HTTP 状态码 | 说明 |
| --- | --- |
| `200` | 返回完整对象内容 |
| `206` | 返回 Range 指定的部分内容 |
| `416` | Range 不合法或超出对象范围 |
| `404` | 对象不存在或不可访问 |

请求示例：

```bash
curl -L -H "X-API-Key: <api_key>" \
  -o demo.txt \
  "https://pan.example.com/api/v1/open/storage/objects/content?path=remote/app/demo.txt&bucketName=local"
```

说明：

- `path` 必须和写入对象时传入的路径一致。
- 该接口返回 `attachment` 下载响应。
- 仅支持单段 Range，不支持多段 Range。

### 7.3 删除存储对象

```http
DELETE {baseUrl}/open/storage/objects?path=remote/app/demo.txt&bucketName=local
```

所需权限：`storage.delete`

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `path` | string | 是 | 存储对象路径 |
| `bucketName` | string | 否 | 目标存储桶名称；也兼容 `bucket`；不传使用默认存储桶 |

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "ok": true
  }
}
```

说明：

- 存储对象删除会删除对应文件记录，并请求底层存储删除实际对象。
- 对象不存在时按成功处理，便于同步任务做幂等删除。
- 如果只想让用户侧不可见、仍保留回收站行为，请使用 `DELETE /open/files/{fileId}`。

## 8. 同系统存储桶

后台新增存储桶时可选择“同系统”，用于把当前系统的文件实际写入另一个同系统实例。

配置项：

| 配置项 | 说明 |
| --- | --- |
| API 根地址 | 目标系统 API 根地址，例如 `https://pan.example.com/api/v1`；也兼容填写到 `/api/v1/open` |
| 远端存储桶 | 目标系统存储桶名称，留空使用目标用户默认存储桶 |
| API Key | 目标系统用户生成的开放接口 API Key |
| 远端根路径 | 当前存储桶基础路径，最终远端可见路径为 `远端根路径 + 当前文件 storageKey` |

注意事项：

- API Key 只保存在当前系统服务端，浏览器不会直接接触目标系统密钥。
- 文件上传仍由当前系统管理上传会话和容量校验，完成后通过目标系统开放接口写入远端。
- 目标系统会在开放接口用户的网盘中看到 `远端根路径 + storageKey` 对应的目录和文件。
- 目标系统必须启用并可访问本章的存储对象接口。
- 目标 API Key 至少需要 `storage.write`、`storage.read`、`storage.delete` 和 `files.upload` 权限；`files.upload` 用于同系统大文件分片写入。
- 两套系统的容量、禁用文件类型和上传大小限制都会生效，任一侧限制不满足都会导致写入失败。
- 同系统小文件会走 `POST /open/storage/objects` 整文件写入；大文件会走 `POST /open/uploads`、`POST /open/uploads/{uploadId}/chunks/{index}`、`POST /open/uploads/{uploadId}/complete` 分片写入。
- 同系统分片写入使用服务端中转分片模式，不使用远端对象存储或 OneDrive 的直传 URL。

## 9. 分享

文件列表“创建分享”弹窗可配置：

| 配置项 | 开放接口字段 | 说明 |
| --- | --- | --- |
| 分享名称 | `name` | 留空时自动生成 |
| 分享密码 | `password` | 留空表示无需密码 |
| 下载次数限制 | `maxDownloads` | `0` 表示不限 |
| 过期时间 | `expiresAt` | RFC3339 格式；留空表示不过期 |
| 分享目录自动更新 | `autoUpdate` | 仅多文件/目录分享可用；选中目录时生效 |
| 分享页面配色 | `themePreset` | 可选值：`zinc`、`sky`、`emerald`、`rose`、`violet`、`indigo`、`orange`、`stone` |

另外，分享管理页里的“分享介绍”对应 `description` 字段，开放接口创建和更新分享时也支持。

### 9.1 创建单文件分享

```http
POST {baseUrl}/open/files/{fileId}/share
```

所需权限：`shares.create`

路径参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `fileId` | string | 文件公开 ID |

请求体：

```json
{
  "name": "演示文件",
  "password": "",
  "maxDownloads": 0,
  "expiresAt": "",
  "description": "客户可通过分享链接访问",
  "themePreset": "zinc"
}
```

参数说明：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 否 | 分享名称，不传时使用文件名 |
| `password` | string | 否 | 分享密码，不传表示无密码 |
| `maxDownloads` | number | 否 | 最大下载次数，`0` 表示不限 |
| `expiresAt` | string | 否 | 过期时间，RFC3339 格式，例如 `2026-06-30T23:59:59+08:00` |
| `description` | string | 否 | 分享说明 |
| `themePreset` | string | 否 | 分享页面配色，可选 `zinc`、`sky`、`emerald`、`rose`、`violet`、`indigo`、`orange`、`stone`，默认 `zinc` |

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "token": "share_token",
    "kind": "direct",
    "url": "https://pan.example.com/p/share_token",
    "directUrl": "https://pan.example.com/i/share_token"
  }
}
```

说明：

- `data.url` 是公开分享页面地址。
- `data.directUrl` 是单文件分享直链地址，和文件列表中的“直连”功能一致。
- 对同一个文件重复创建分享时，如果已有分享，接口返回已有分享 Token。
- 创建分享时可设置 `name`、`password`、`maxDownloads`、`expiresAt`、`description` 和 `themePreset`。
- 单文件分享没有目录自动更新能力，`autoUpdate` 只用于多文件/目录分享。
- `expiresAt` 为空字符串或不传表示不过期。
- `maxDownloads` 为 `0` 或不传表示不限下载次数。
- 创建分享失败通常是文件不存在、文件不属于当前用户、分享策略限制或参数格式错误。

### 9.2 创建多文件分享

```http
POST {baseUrl}/open/shares
```

所需权限：`shares.create`

请求体：

```json
{
  "fileIds": ["file_id_1", "file_id_2"],
  "name": "资料包",
  "password": "",
  "maxDownloads": 0,
  "expiresAt": "",
  "description": "多文件分享",
  "autoUpdate": false,
  "themePreset": "zinc"
}
```

参数说明：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `fileIds` | string[] | 是 | 文件或目录公开 ID 列表 |
| `name` | string | 否 | 分享名称，不传时自动生成 |
| `password` | string | 否 | 分享密码，不传表示无密码 |
| `maxDownloads` | number | 否 | 最大下载次数，`0` 表示不限 |
| `expiresAt` | string | 否 | 过期时间，RFC3339 格式，例如 `2026-06-30T23:59:59+08:00` |
| `description` | string | 否 | 分享说明 |
| `autoUpdate` | boolean | 否 | 分享目录自动更新；仅选中的目录会自动更新，选中的文件保持创建时的固定内容 |
| `themePreset` | string | 否 | 分享页面配色，可选 `zinc`、`sky`、`emerald`、`rose`、`violet`、`indigo`、`orange`、`stone`，默认 `zinc` |

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "token": "share_token",
    "kind": "bundle",
    "url": "https://pan.example.com/p/share_token"
  }
}
```

说明：

- `fileIds` 可以同时包含文件 ID 和文件夹 ID。
- 多文件/目录分享返回公开分享页面地址 `url`，不会返回 `directUrl`。
- `autoUpdate=true` 时，选中的目录会在访问分享时按当前目录内容动态展开；选中的单个文件仍保持创建分享时的固定选择。
- 如果分享内包含目录，最终可下载内容受公开分享页和服务端打包策略限制。

### 9.3 获取分享列表

```http
GET {baseUrl}/open/shares
```

所需权限：`shares.list`

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | number | 否 | 页码，默认 `1` |
| `pageSize` | number | 否 | 每页数量，默认 `20` |

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [
      {
        "id": "share_token",
        "token": "share_token",
        "kind": "direct",
        "autoUpdate": false,
        "name": "演示文件",
        "fileCount": 1,
        "createdAt": "2026-06-08 10:00",
        "maxDownloads": 0,
        "downloadCount": 0,
        "expiresAt": "",
        "hasPassword": false,
        "description": "客户下载",
        "themePreset": "zinc",
        "url": "https://pan.example.com/p/share_token",
        "directUrl": "https://pan.example.com/i/share_token"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

说明：

- 列表只返回当前 API Key 所属用户创建的分享。
- `kind=direct` 的条目会返回 `directUrl`。
- `kind=bundle` 的条目只返回公开分享页面 `url`。

### 9.4 更新分享设置

```http
PUT {baseUrl}/open/shares/{token}
```

所需权限：`shares.update`

路径参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `token` | string | 分享 Token，来自创建分享、获取直连或分享列表 |

请求体：

```json
{
  "name": "新的分享名称",
  "password": "123456",
  "maxDownloads": 20,
  "expiresAt": "2026-06-30T23:59:59+08:00",
  "description": "新的分享说明",
  "themePreset": "stone"
}
```

参数说明：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string/null | 否 | 分享名称；不传保持当前名称 |
| `password` | string/null | 否 | 分享密码；传空字符串表示清除密码，不传保持当前密码 |
| `maxDownloads` | number/null | 否 | 最大下载次数，`0` 表示不限；不传保持当前设置 |
| `expiresAt` | string/null | 否 | 过期时间，RFC3339 格式；传空字符串表示清除过期时间，不传保持当前设置 |
| `description` | string/null | 否 | 分享说明；传空字符串表示清空，不传保持当前说明 |
| `themePreset` | string/null | 否 | 分享页面配色，可选 `zinc`、`sky`、`emerald`、`rose`、`violet`、`indigo`、`orange`、`stone`；不传保持当前设置 |

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "share_token",
    "token": "share_token",
    "kind": "direct",
    "autoUpdate": false,
    "name": "新的分享名称",
    "fileCount": 1,
    "createdAt": "2026-06-08 10:00",
    "maxDownloads": 20,
    "downloadCount": 0,
    "expiresAt": "2026-06-30 23:59",
    "hasPassword": true,
    "description": "新的分享说明",
    "themePreset": "stone",
    "url": "https://pan.example.com/p/share_token",
    "directUrl": "https://pan.example.com/i/share_token"
  }
}
```

说明：

- 单文件分享和多文件分享都使用该接口更新设置。
- 如果需要清除密码，传 `"password": ""`。
- 如果需要清除过期时间，传 `"expiresAt": ""`。
- 如果需要清空分享说明，传 `"description": ""`。
- 目录自动更新是创建目录分享时的设置，当前更新接口不修改 `autoUpdate`。
- 请求体只需要传要修改的字段；没有传的字段保持不变。
- `expiresAt` 只接受 RFC3339 格式或空字符串。

### 9.5 删除分享

```http
DELETE {baseUrl}/open/shares/{token}
```

所需权限：`shares.delete`

路径参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `token` | string | 分享 Token |

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "ok": true
  }
}
```

说明：

- 删除分享后，原公开分享链接和直链立即失效。
- 删除分享不会删除原始文件。

## 10. 文件直连

### 10.1 获取文件永久直连

```http
POST {baseUrl}/open/files/{fileId}/direct-link
```

也支持：

```http
GET {baseUrl}/open/files/{fileId}/direct-link
```

所需权限：`shares.create`

路径参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `fileId` | string | 文件公开 ID |

请求体：

```json
{}
```

该接口会为文件创建或复用已有的单文件分享，并返回和文件列表“直连”功能一致的永久直连地址。

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "fileId": "file_public_id",
    "name": "demo.txt",
    "contentType": "text/plain",
    "sizeBytes": 128,
    "token": "share_token",
    "kind": "direct",
    "url": "https://pan.example.com/i/share_token",
    "shareUrl": "https://pan.example.com/p/share_token"
  }
}
```

说明：

- `data.url` 是永久直连地址，格式为 `/i/{share_token}`。
- `data.shareUrl` 是公开分享页面地址，格式为 `/p/{share_token}`。
- 直连是否可用仍受分享状态影响：文件被删除、分享被删除、分享过期或达到下载次数限制后会失效。
- 对同一个文件重复获取直连时，如果已有单文件分享，接口返回同一个分享 Token。
- 该接口也支持 `GET {baseUrl}/open/files/{fileId}/direct-link`，推荐使用 `POST`。

直连地址行为：

| 地址 | 说明 |
| --- | --- |
| `/i/{token}` | 单文件直连。图片、音频、视频在站点允许内联时会以 `inline` 返回 |
| `/i/{token}?raw=1` | 强制返回原始文件，适合需要拿原图或原始二进制的客户端 |
| `/i/{token}?download=1` | 强制走原始文件下载语义 |
| `/it/{token}` | 图片预览图地址，图片会返回 JPEG 预览图 |

图片直连说明：

- `/i/{token}` 对小图返回原图；当图片任意一边超过 `4096px` 时返回服务端生成的 JPEG 预览图，避免浏览器解码超大图失败。
- `/i/{token}?raw=1` 始终返回原始文件，不做预览图替换。
- `/it/{token}` 始终返回图片预览图，主要给前端预览或缩略展示使用。
- 预览图当前最大边为 `2560px`，格式为 JPEG。

## 11. 客户端接入建议

1. 客户端保存 API Key；开放接口返回 `code=1001` 时，检查 Key 是否缺失、被删除或已过期。
2. 客户端本地只保存开放接口返回的公开 ID，不要依赖数据库自增 ID。
3. 上传大文件时注意服务端上传大小、用户容量和文件类型限制，失败时读取 `message` 字段展示给用户。
4. 直连地址是永久分享直链，可以长期保存；如需让直连失效，调用删除分享接口删除对应 `token`。
5. 分享页面地址适合给用户浏览，直连地址适合客户端直接下载或播放单个文件。
6. 删除文件和文件夹默认移入回收站，如需永久清理，应由站点后台统一处理。

## 12. 完整接入示例

下面示例演示一个典型流程：创建目录、上传文件、获取直连、创建分享、更新分享、删除分享、删除文件。

为了便于复制，先准备变量：

```bash
BASE_URL="https://pan.example.com/api/v1"
API_KEY="<api_key>"
```

### 12.1 创建目录

```bash
curl -sS -X POST "$BASE_URL/open/folders" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "客户资料",
    "bucketName": "local"
  }'
```

从响应中取出：

```text
data.id => folderId
```

### 12.2 上传文件到目录

```bash
curl -sS -X POST "$BASE_URL/open/files" \
  -H "X-API-Key: $API_KEY" \
  -F "folderId=<folderId>" \
  -F "file=@/path/to/demo.pdf"
```

从响应中取出：

```text
data.id => fileId
```

### 12.3 下载文件

```bash
curl -L -H "X-API-Key: $API_KEY" \
  -o demo.pdf \
  "$BASE_URL/open/files/<fileId>/content"
```

### 12.4 获取永久直连

```bash
curl -sS -X POST "$BASE_URL/open/files/<fileId>/direct-link" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

响应里的 `data.url` 可以直接给播放器、下载器或图片组件使用。

### 12.5 创建带密码分享

```bash
curl -sS -X POST "$BASE_URL/open/files/<fileId>/share" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "客户资料下载",
    "password": "123456",
    "maxDownloads": 10,
    "expiresAt": "2026-06-30T23:59:59+08:00",
    "description": "请在有效期内下载",
    "themePreset": "zinc"
  }'
```

从响应中取出：

```text
data.token => shareToken
```

### 12.6 更新分享设置

```bash
curl -sS -X PUT "$BASE_URL/open/shares/<shareToken>" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "",
    "maxDownloads": 0,
    "description": "已取消密码和下载次数限制"
  }'
```

### 12.7 删除分享

```bash
curl -sS -X DELETE "$BASE_URL/open/shares/<shareToken>" \
  -H "X-API-Key: $API_KEY"
```

### 12.8 删除文件

```bash
curl -sS -X DELETE "$BASE_URL/open/files/<fileId>" \
  -H "X-API-Key: $API_KEY"
```

## 13. 常见错误排查

### 13.1 返回 `code=1001`

通常是 API Key 缺失、写错、被删除或已过期。检查：

- 是否传了 `X-API-Key`。
- Key 是否包含多余空格。
- 是否使用了完整 Key，而不是列表中展示的 Key 前缀。
- 后台里该 Key 是否仍然存在且未过期。

### 13.2 返回 `code=1003`

通常是账号停用或 Key 权限不足。检查：

- 创建 Key 的用户是否仍是正常状态。
- Key 是否勾选了当前接口需要的权限。
- 例如上传文件需要 `files.upload`，获取直连需要 `shares.create`。

### 13.3 上传返回 `code=1400` 或 `code=1401`

常见原因：

- 文件超过站点上传大小限制。
- 用户容量不足。
- 文件类型被后台策略禁用。
- 反向代理或网关的请求体限制小于应用限制。

### 13.4 下载接口返回 JSON 而不是文件

文件内容接口正常情况下直接返回文件流。如果返回 JSON，通常说明请求失败了，例如鉴权失败或文件不存在。检查 HTTP 状态码和响应体中的 `message`。

### 13.5 直连图片不是原图

`/i/{token}` 为了兼容浏览器预览超大图片，会在图片任意一边超过 `4096px` 时返回 JPEG 预览图。需要原图时使用：

```text
/i/{token}?raw=1
```

### 13.6 同系统存储桶写入失败

检查：

- 目标系统 API 根地址是否能从当前系统服务器访问。
- 目标 API Key 是否具备 `storage.write` 权限。
- 目标用户容量是否足够。
- 目标系统上传大小和禁用文件类型策略是否允许该文件。
- 远端根路径和 `path` 拼接后是否仍是合法相对路径。

## 14. 最小接入流程

```text
1. 后台生成 API Key
2. GET /api/v1/open/files 读取根目录
3. POST /api/v1/open/folders 创建目录
4. POST /api/v1/open/files 上传文件
5. POST /api/v1/open/files/{fileId}/direct-link 获取永久直连
6. POST /api/v1/open/files/{fileId}/share 创建公开分享
7. PUT /api/v1/open/shares/{token} 更新分享密码、过期时间等设置
8. GET /api/v1/open/shares 读取分享列表
9. DELETE /api/v1/open/shares/{token} 删除分享
10. DELETE /api/v1/open/files/{fileId} 删除文件
```
