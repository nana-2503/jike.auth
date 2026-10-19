# 开放API接口文档

## 概述

开放API允许作者通过密钥（API Key）查询自己名下的应用、卡种、卡号、用户等数据，适用于对接第三方系统、自建面板等场景。

## 认证方式

所有接口需要通过 `X-Api-Key` Header 或 `api_key` 查询参数传递密钥。

```
Header: X-Api-Key: osk_xxxxxxxxxxxxxxxx
```

或

```
GET /api/open/apps?api_key=osk_xxxxxxxxxxxxxxxx
```

## 密钥管理

在作者后台「拓展 > 密钥管理」中创建和管理密钥，每个密钥可以独立设置权限。

## 权限列表

| 权限标识 | 说明 |
|----------|------|
| apps:list | 查询应用列表 |
| apps:get | 查询指定应用 |
| apps:create | 新增应用 |
| apps:update | 编辑应用 |
| cardtypes:list | 查询卡种列表 |
| cardtypes:get | 查询指定卡种 |
| cardtypes:create | 新增卡种 |
| cardtypes:update | 编辑卡种 |
| cards:list | 查询卡号列表 |
| cards:get | 查询指定卡号 |
| cards:create | 新增卡号 |
| cards:update | 编辑卡号 |
| users:list | 查询用户列表 |
| users:get | 查询指定用户 |
| users:create | 新增用户 |
| users:update | 编辑用户 |

## 通用响应格式

```json
{
  "code": 0,
  "data": { ... }
}
```

## 通用错误码

| 错误码 | 说明 |
|--------|------|
| 401 | 缺少API密钥 / 密钥无效或已禁用 |
| 403 | 无此接口权限 |
| 1 | 业务错误（资源不存在/无权访问等） |

## 列表分页

以下列表接口均支持 `page`、`size` 查询参数：

| 参数 | 说明 |
|------|------|
| page | 页码，从 1 开始，默认 1；小于 1 时按 1 处理 |
| size | 每页条数，默认 20；**最大 100**，超过时服务端会按 100 条返回；小于 1 时按 20 处理 |

涉及接口：[查询应用列表](查询应用列表.md)、[查询卡种列表](查询卡种列表.md)、[查询卡号列表](查询卡号列表.md)、[查询用户列表](查询用户列表.md)。

## 接口列表

- [查询应用列表](查询应用列表.md)
- [查询指定应用](查询指定应用.md) — `GET /api/open/apps/:id`
- [新增应用](新增应用.md) — `POST /api/open/apps`
- [编辑应用](编辑应用.md) — `PUT /api/open/apps/:id`
- [查询卡种列表](查询卡种列表.md)
- [查询指定卡种](查询指定卡种.md) — `GET /api/open/cardtype?app_code=xxx&name=xxx`
- [新增卡种](新增卡种.md) — `POST /api/open/cardtypes`
- [编辑卡种](编辑卡种.md) — `PUT /api/open/cardtypes/:id`
- [查询卡号列表](查询卡号列表.md)
- [查询指定卡号](查询指定卡号.md) — `GET /api/open/cards/:card_no`
- [新增卡号](新增卡号.md) — `POST /api/open/cards`
- [编辑卡号](编辑卡号.md) — `PUT /api/open/cards/:id`
- [查询用户列表](查询用户列表.md)
- [查询指定用户](查询指定用户.md) — `GET /api/open/user?app_code=xxx&username=xxx`
- [新增用户](新增用户.md) — `POST /api/open/users`
- [编辑用户](编辑用户.md) — `PUT /api/open/users/:id`

## 数据隔离

所有接口只能查询密钥所属作者名下的数据，无法跨作者访问。
