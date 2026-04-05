# BuBu Backend

一个基于 Node.js 原生 `http` 的轻量后端示例，支持：

- Apple ID 登录并签发业务 JWT
- MySQL 连通性与表自动建表（`users`、`categories`）

## 目录结构

```text
.
├── index.js                  # 启动入口（仅负责启动和优雅退出）
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

## 当前接口目录

- `GET /`：服务运行提示
- `GET /health`：健康检查
- `POST /echo`：回显 JSON Body
- `GET /db/ping`：MySQL 连通性检查
- `POST /auth/apple`：苹果登录校验 + 用户入库/更新 + 返回 JWT
- `GET /categories`：获取当前用户类别列表（需 JWT，见下方说明）
- `POST /categories`：创建类别（需 JWT，见下方说明）

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

## 运行

```bash
# 1) 复制环境变量模板
cp .env.example .env

# 2) 按需修改 .env
# 例如：MYSQL_*、JWT_SECRET、APPLE_CLIENT_ID

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
