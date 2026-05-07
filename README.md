# BuBu Backend

一个基于 Node.js 原生 `http` 的轻量后端示例，支持：

- Apple ID 登录并签发业务 JWT
- MySQL 连通性与表自动建表（`users`、`categories`、`skins`、`books`）
- 皮肤图片上传（原图 + 缩略图）、`skins` 表入库与列表查询
- 本地上传目录的静态访问（`GET /uploads/...`）
- 用户须知、隐私协议与技术支持页面（`GET /notice`、`GET /privacy`、`GET /support`，浏览器直接打开链接即可）

## 目录结构

```text
.
├── index.js                  # 启动入口（仅负责启动和优雅退出）
├── public                    # 静态页面（用户须知、隐私协议、技术支持等 HTML）
├── src
│   ├── router.js             # 自动扫描 src/routes 并注册路由
│   ├── routes                # 每个接口一个文件
│   ├── services              # 业务服务层（DB/JWT/Apple）
│   └── utils                 # 通用工具
```

## 路由自动注册规则

`src/router.js` 会在启动时自动扫描 `src/routes/*.js`，并按文件名字典序加载。

每个路由文件需导出一个或多个以 `handle` 开头的函数，例如：

```js
async function handleDemo(req, res) {
  if (!(req.method === "GET" && req.url === "/demo")) return false;
  // ...处理逻辑
  return true;
}

module.exports = { handleDemo };
```

约定：

- 函数签名：`async function handleX(req, res)`
- 未命中当前路由时返回 `false`
- 命中并完成响应后返回 `true`
- 所有路由都不命中时，框架统一返回 `404`
- JSON 接口通过 `sendJson` 设置 `Content-Type: application/json`；图片等二进制响应由对应路由自行设置头信息

## 当前接口目录

- `GET /`：服务运行提示
- `GET /notice`：用户须知（HTML 页面，可直接在浏览器中打开）
- `GET /privacy`：隐私协议（HTML 页面，可直接在浏览器中打开）
- `GET /support`：技术支持（HTML 页面，可直接在浏览器中打开）
- `GET /health`：健康检查
- `POST /echo`：回显 JSON Body
- `GET /db/ping`：MySQL 连通性检查
- `POST /auth/apple`：苹果登录校验 + 用户入库/更新 + 返回 JWT
- `GET /categories`：获取当前用户类别列表（需 JWT）
- `POST /categories`：创建类别（需 JWT）
- `GET /books`：当前用户的册子列表（需 JWT，支持分页；可选按分类筛选）
- `POST /books`：上传册子（需 JWT，请求体 `title`、`category_name`、`skinId`）
- `POST /books/delete`：删除册子（需 JWT，请求体 `bookId`；软删除，仅创建者）
- `POST /books/update`：刷新册子更新时间（需 JWT，请求体 `bookId`；仅创建者）
- `POST /users/delete`：删除当前用户及关联数据（需 JWT）
- `GET /skins`：皮肤列表（可选查询参数，见下文）
- `GET /skins/system`：系统皮肤列表（仅系统预置皮肤，支持分页）
- `POST /skins`：上传皮肤（multipart，需 JWT）
- `POST /skins/delete`：删除皮肤（需 JWT，请求体 `skinId`；仅创建者可删；软删除）
- `POST /my/skins`：用户选择一款皮肤加入自己的图库（需 JWT）
- `GET /my/skins`：获取我的图库列表（需 JWT，支持分页）
- `POST /my/skins/delete`：从图库移除一条收藏（需 JWT，请求体 `userSkinId` 为 `user_skins.id`）
- `GET /uploads/...`：读取本地上传文件（原图、缩略图等；路径需落在 `UPLOAD_ROOT` 内）

### `GET /notice`

- **鉴权**：无。
- **行为**：返回 **`text/html`** 用户须知页面（内容由仓库内 `public/user-notice.html` 提供）。可直接在浏览器访问，例如：`http://<主机>:<端口>/notice`。

### `GET /privacy`

- **鉴权**：无。
- **行为**：返回 **`text/html`** 隐私协议页面（内容由仓库内 `public/privacy.html` 提供）。可直接在浏览器访问，例如：`http://<主机>:<端口>/privacy`。

### `POST /users/delete`

- **鉴权**：`Authorization: Bearer <JWT>`。
- **请求体**：无需（会根据 JWT `sub` 删除当前用户）。
- **行为**：删除当前用户及关联数据，包含：
  - `users` 当前用户记录
  - `categories` 中该用户创建的分类
  - `books` 中该用户创建的册子
  - `skins` 中该用户创建的皮肤
  - `user_skins` 中该用户收藏记录，以及引用了该用户皮肤的收藏记录
  - 同步尝试删除该用户皮肤对应的本地上传文件（原图/缩略图）
- **成功响应**：`{ "ok": true, "removed": { "users", "categories", "books", "skins", "userSkinsByUser", "userSkinsBySkin" } }`
- **常见错误**：`401` 未带或无效 token；`404` 用户不存在

### `GET /support`

- **鉴权**：无。
- **行为**：返回 **`text/html`** 技术支持页面（内容由仓库内 `public/support.html` 提供）。可直接在浏览器访问，例如：`http://<主机>:<端口>/support`。

### `GET /categories`

- **鉴权**：请求头 `Authorization: Bearer <JWT>`。
- **行为**：返回当前用户（JWT `sub`）在 `categories` 表中创建的所有记录，按 `id` 降序（新在前）。
- **成功响应**：`{ "categories": [ { "id", "name", "creatorUserId", "createdAt", "updatedAt" }, ... ] }`

### `POST /categories`

- **鉴权**：请求头 `Authorization: Bearer <JWT>`（与 `POST /auth/apple` 返回的 `token` 一致）。
- **请求体**：`application/json`，字段 `name`（字符串，非空）。
- **行为**：在表 **`categories`** 中插入 `name` 与 `creator_user_id`（来自 JWT 的 `sub`，即当前用户 `users.id`）。同一用户对同一类别名不可重复（唯一约束 `(creator_user_id, name)`）。
- **成功响应**：`{ "category": { "id", "name", "creatorUserId", "createdAt", "updatedAt" } }`
- **常见错误**：`401` 未带或无效 token；`400` 缺少 `name`；`409` 该用户已存在同名类别。

### `GET /books`

- **鉴权**：请求头 `Authorization: Bearer <JWT>`。仅返回 **JWT `sub` 对应用户**创建的、且 **`is_delete = 0`** 的册子（忽略查询参数中的创建者 ID，不可查看他人册子）。
- **排序**：按 **`updated_at` 降序**（接口 JSON 字段 **`updatedAt`** 最新更新的在前）；`updated_at` 相同时按 **`id` 降序**。
- **查询参数**（均可选）：
  - **`page`**：页码，正整数，默认 **`1`**。
  - **`pageSize`** 或 **`limit`**：每页条数，正整数，默认 **`20`**，最大 **`100`**。
  - **`categoryName`** 或 **`category_name`**：字符串，按 **`category_name`** 精确匹配（仍限定为当前用户）。
- **成功响应**：`{ "books": [ { "id", "creatorUserId", "title", "categoryName", "skinId", "coverUrl", "coverThumbUrl", "isDelete", "createdAt", "updatedAt", "deletedAt" }, ... ], "total", "page", "pageSize", "totalPages" }`
- **常见错误**：`401` 未带或无效 token

### `POST /books`

- **鉴权**：`Authorization: Bearer <JWT>`。
- **请求体**：`application/json`：
  - **`title`**（字符串，必填）
  - **`category_name`**（字符串，必填；也接受 **`categoryName`**）
  - **`skinId`**（正整数，必填）：引用 **`skins.id`**；**`cover_url`** 取该皮肤的 **`image_url`**（原图）；**`cover_thumb_url`** 取该皮肤的 **`thumb_url`**（无则回退为原图）。
- **行为**：在表 **`books`** 中写入一条册子，**同时保存 `skin_id` 与封面 URL 快照**；`creator_user_id` 为 JWT `sub`；新建时 **`is_delete` 为 0**，**`deleted_at` 为 `NULL`**。
- **成功响应**：`{ "book": { "id", "creatorUserId", "title", "categoryName", "skinId", "coverUrl", "coverThumbUrl", "isDelete", "createdAt", "updatedAt", "deletedAt" } }`（**`skinId`** 为引用 **`skins.id`**，与冗余存储的封面 URL 一致）
- **常见错误**：`401`；`400` 字段非法；`404` 皮肤不存在

### `POST /books/delete`

- **鉴权**：`Authorization: Bearer <JWT>`。
- **请求体**：`application/json`，字段 **`bookId`**（正整数），即 **`books.id`**。
- **行为**：**软删除**——将 **`is_delete` 置为 `1`**，并写入 **`deleted_at`**；仅 **`creator_user_id`** 为当前用户时可操作。
- **成功响应**：`{ "ok": true, "book": { ... } }`（`book` 为更新后的记录，`isDelete` 为 `true`）
- **常见错误**：`401`；`400` `bookId` 非法；`403` 非创建者；`404` 册子不存在；`409` 已删除过

### `POST /books/update`

- **鉴权**：`Authorization: Bearer <JWT>`。
- **请求体**：`application/json`，字段 **`bookId`**（正整数），即 **`books.id`**。
- **行为**：将对应册子的 **`updated_at`** 更新为当前时间（`NOW()`）；仅 **`creator_user_id`** 为当前用户时可操作；已删除册子不允许刷新。
- **成功响应**：`{ "ok": true, "book": { ... } }`（`book.updatedAt` 为最新时间）
- **常见错误**：`401`；`400` `bookId` 非法；`403` 非创建者；`404` 册子不存在；`409` 册子已删除

### 表 `books` 概要

| 列 | 说明 |
|----|------|
| `id` | 自增主键 |
| `creator_user_id` | 创建者 `users.id` |
| `title` | 标题 |
| `category_name` | 分类名称 |
| `skin_id` | 引用 **`skins.id`**（接口 JSON 为 **`skinId`**）；可与 `cover_*` 冗余并存，便于按皮肤反查或刷新链接 |
| `cover_url` | 封面原图 URL（来自对应皮肤的 `image_url`） |
| `cover_thumb_url` | 封面缩略图 URL（来自对应皮肤的 `thumb_url`；接口 JSON 字段名为 **`coverThumbUrl`**） |
| `is_delete` | 是否删除（`0`/`1`） |
| `created_at` | 创建时间（对应需求中的 create_at） |
| `updated_at` | 更新时间（对应 update_at） |
| `deleted_at` | 删除时间，未删为 `NULL`（对应 delete_at） |

### `GET /skins`

- **鉴权**：无（公开列表；按需可在路由层自行加鉴权）。
- **行为**：仅返回 `skins.is_delete = 0` 的皮肤。
- **查询参数**（均可选，可组合）：
  - **`type`**：`SMALLINT` 整数，范围 **-32768～32767**，按 `skins.type` 精确筛选；不传或空字符串表示不按类型筛选。
  - **`creatorUserId`**：不传则不过滤创建者；传空或字面量 `null` 表示只查 **`creator_user_id IS NULL`**；传正整数表示只查该用户创建的皮肤。
  - **分页**：
    - **`page`**：页码，从 **1** 开始，默认 **1**。
    - **`pageSize`** 或 **`limit`**：每页条数，**1～100**，默认 **20**；同时传 `pageSize` 与 `limit` 时以 **`pageSize`** 为准。
- **成功响应**：
  - `skins`：当前页数据数组（`creatorUserId` 可为 `null`）。
  - `total`：满足筛选条件的总条数。
  - `page`、`pageSize`：当前页码与每页条数。
  - `totalPages`：总页数（无数据时为 **0**）。
- **常见错误**：`400` 查询参数 `type`、`creatorUserId`、`page`、`pageSize` / `limit` 格式非法

### `GET /skins/system`

- **鉴权**：无。
- **行为**：返回系统皮肤列表。当前约定系统皮肤为 `skins.creator_user_id IS NULL` 且 `skins.is_delete = 0` 的记录。
- **查询参数**：
  - `type`：可选，`SMALLINT` 整数筛选。
  - `page`：页码，默认 `1`。
  - `pageSize` / `limit`：每页条数，`1~100`，默认 `20`。
- **成功响应**：与 `GET /skins` 一致（`skins`、`total`、`page`、`pageSize`、`totalPages`）。

### `POST /my/skins`

- **鉴权**：`Authorization: Bearer <JWT>`。
- **请求体**：`application/json`，字段 `skinId`（正整数）。
- **行为**：将指定皮肤加入当前登录用户的图库（写入 `user_skins` 表）；同一用户重复添加同一皮肤会被拒绝。
- **成功响应**：
  - `userSkin`：用户图库关联记录（`id`、`userId`、`skinId`、`createdAt`）
  - `skin`：被添加的皮肤详情
- **常见错误**：`401` 未登录；`400` `skinId` 非法；`404` 皮肤不存在；`409` 已添加过

### `GET /my/skins`

- **鉴权**：`Authorization: Bearer <JWT>`。
- **行为**：返回当前用户已加入图库的皮肤列表（基于 `user_skins` 关联 `skins`，且 `skins.is_delete = 0`）。
- **查询参数**（可选）：
  - `type`：`SMALLINT` 整数筛选（-32768 ~ 32767）
  - `page`：页码，默认 `1`
  - `pageSize` / `limit`：每页条数，`1~100`，默认 `20`
- **成功响应**：
  - `skins`：当前页数据，每项包含皮肤字段与 `userSkinId`、`addedAt`
  - `total`、`page`、`pageSize`、`totalPages`
- **常见错误**：`401` 未登录；`400` 参数非法

### `POST /my/skins/delete`

- **鉴权**：`Authorization: Bearer <JWT>`。
- **请求体**：`application/json`，字段 **`userSkinId`**（正整数），为 **`user_skins` 表主键 `id`**（与 `GET /my/skins` 返回项中的 `userSkinId` 一致），不是 `skins.id`。
- **行为**：删除当前用户图库中对应记录（`DELETE ... WHERE id = ? AND user_id = ?`）。
- **成功响应**：`{ "ok": true, "userSkinId": <number> }`
- **常见错误**：`401`；`400` `userSkinId` 非法；`404` 无此记录或不属于当前用户

### `POST /skins`

- **鉴权**：`Authorization: Bearer <JWT>`。
- **请求**：`multipart/form-data`。
- **字段**：

| 字段 | 说明 |
|------|------|
| `image` 或 `file` | 图片文件（必填），支持 jpeg / png / gif / webp，单文件约最大 10MB |
| `name` | 皮肤名称（必填） |
| `type` | 皮肤类型，**SMALLINT** 整数，**-32768～32767**；不传或空则默认为 **0** |
| `price` | 价格，非负数字；不传或空则默认为 **0** |
| `is_member_exclusive` | 是否会员专属：`1` / `true` / `yes` 为是，其它为否 |
| `creatorUserId` 或 `creator_user_id` | 可选；正整数写入 `creator_user_id`，不传 / 空 / `null` 则存数据库 `NULL` |

- **行为**：保存原图至 `UPLOAD_ROOT/skins/orig/`，生成缩略图至 `UPLOAD_ROOT/skins/thumb/`（JPEG）；写入表 **`skins`**，图片 URL 由 **`PUBLIC_BASE_URL`**（见环境变量）与固定路径拼接。
- **成功响应**：`{ "skin": { 同上字段 } }`
- **常见错误**：`401`；`400` 缺图、MIME 不支持、`type`（若提供）或 `price`（若提供）非法；`413` 文件过大

### `POST /skins/delete`

- **鉴权**：`Authorization: Bearer <JWT>`。
- **请求体**：`application/json`，字段 **`skinId`**（正整数），即 **`skins.id`**。
- **行为**：
  - 仅当 **`skins.creator_user_id`** 等于当前用户（JWT `sub`）时可删；**系统皮肤**（`creator_user_id IS NULL`）不能通过本接口删除，返回 **403**。
  - 软删除：将 **`skins.is_delete`** 置为 `1`。
- **成功响应**：`{ "ok": true, "skinId": <number> }`
- **常见错误**：`401`；`400` `skinId` 非法；`403` 无权限；`404` 皮肤不存在；`409` 皮肤已删除

### `GET /uploads/...`

- 从 **`UPLOAD_ROOT`**（默认项目下 `uploads`）映射子路径，仅允许落在该目录内的文件；用于访问上传的原图与缩略图链接。

### 表 `skins` 概要

| 列 | 说明 |
|----|------|
| `id` | 自增主键 |
| `name` | 名称 |
| `type` | **SMALLINT**，类型编码 |
| `price` | `DECIMAL(10,2)` |
| `is_member_exclusive` | 是否会员专属 |
| `image_url` / `thumb_url` | 原图与缩略图完整 URL |
| `creator_user_id` | 可选，创建者 `users.id` |
| `is_delete` | 软删除标记（`0`/`1`） |
| `created_at` | 创建时间 |

### 表 `user_skins` 概要

| 列 | 说明 |
|----|------|
| `id` | 自增主键 |
| `user_id` | 用户 ID（`users.id`） |
| `skin_id` | 皮肤 ID（`skins.id`） |
| `created_at` | 加入图库时间 |

约束：`(user_id, skin_id)` 唯一，避免重复收藏同一皮肤。

旧库若曾为 `type` 字符串类型，启动时会尝试迁移为 **`SMALLINT`**；若存在无法转为整数的旧数据，需先清理或手工迁移。

## 运行

```bash
# 1) 复制环境变量模板
cp .env.example .env

# 2) 按需修改 .env
# 例如：MYSQL_*、JWT_SECRET、APPLE_CLIENT_ID、PUBLIC_BASE_URL

# 3) 安装并启动
npm install
npm start
```

## 主要环境变量

### 服务

- `PORT`（默认 `3000`）

### MySQL

- `MYSQL_HOST`
- `MYSQL_PORT`（默认 `3306`）
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `MYSQL_CONNECTION_LIMIT`（默认 `10`）

### Apple 登录

- `APPLE_CLIENT_ID`（支持逗号分隔多个）

### JWT

- `JWT_SECRET`（必填）
- `JWT_EXPIRES_IN`（默认 `7d`）
- `JWT_ISSUER`（默认 `bubu-server`）
- `JWT_AUDIENCE`（默认 `bubu-client`）

### 皮肤上传与静态访问

- **`PUBLIC_BASE_URL`**：生成 `imageUrl` / `thumbUrl` 时使用的站点根地址，**不要末尾斜杠**。请改成真实域名（例如 `https://api.你的域名.com`），勿保留示例里的 **`your-domain.com`**。若未配置、或仍为占位域名，上传接口会按当前请求的 **`Host`** 与 **`X-Forwarded-Proto`**（常见于 Nginx 反代）拼链接；直连本机且无 `Host` 时回退 `http://127.0.0.1:<PORT>`。
- **`UPLOAD_ROOT`**：磁盘保存目录，相对进程当前工作目录，默认 `uploads`。对应 HTTP 路径前缀为 **`/uploads`**。

本地仓库中 **`uploads/`** 已加入 `.gitignore`，勿将用户上传文件提交到版本库。
