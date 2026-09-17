# API v1

浏览器统一访问同源 `/api/v1`。Nuxt 已注入 Eden Treaty：

```ts
const { $api } = useNuxtApp()
const { data, error } = await $api.settings.get()
```

必须检查 `error` 后使用 `data`。写入必须携带与 `LAULL_HOME_ORIGIN` 一致的 Origin；浏览器自动添加。所有认证由 HttpOnly Cookie 完成，前端不读取或保存 Token。

| 方法 | 路径 | 认证 | 请求与响应 |
| --- | --- | --- | --- |
| GET | /health | 公开 | `{ status: 'ok' }`，检查数据库连接 |
| POST | /auth/login | 公开 | `{ username, password }` → `{ user: { id, username } }` 和 Cookie |
| GET | /auth/me | Session | `{ user: { id, username } }` |
| POST | /auth/logout | Session | `{ success: true }`，删除当前 Session 和 Cookie |
| POST | /auth/change-password | Session | `{ oldPassword, newPassword }` → `{ success: true }`，撤销旧会话并更新 Cookie |
| POST | /auth/change-username | Session | `{ newUsername }` → `{ success: true, username }`，修改当前用户名 |
| GET | /auth/sessions | Session | `{ sessions: [{ id, createdAt, expiresAt, isCurrent, userAgent }] }` |
| DELETE | /auth/sessions/:id | Session | `{ success: true }`，撤销指定设备会话 |
| POST | /auth/revoke-others | Session | `{ success: true }`，撤销其他会话 |
| GET | /settings | Session | `{ revision, title, appearance }` |
| PUT | /settings | Session | 同上，成功返回递增后的 revision |
| GET | /spaces | Session | `{ spaces: [{ id, name, type, isDefault, hasPassword, isUnlocked }] }` |
| POST | /spaces/privacy/setup | Session | `{ password }` → `{ success: true }`，设置独立隐私密码 |
| POST | /spaces/privacy/unlock | Session | `{ password }` → `{ success: true, expiresAt }` 并写入短期 Cookie |
| POST | /spaces/privacy/lock | Session | `{ success: true }`，销毁短期空间授权并清空 Cookie |
| GET | /bookmarks/groups | 公开/访客自适应 | `{ groups: [{ id, spaceId, name, sortOrder, isPublic, createdAt, updatedAt }] }` |
| POST | /bookmarks/groups | Session/空间授权 | `{ spaceId, name, isPublic }` → `{ group }` |
| PUT | /bookmarks/groups/:id | Session/空间授权 | `{ name, sortOrder, isPublic }` → `{ group }` |
| DELETE | /bookmarks/groups/:id | Session/空间授权 | `{ success: true }`，级联删除分组下所有书签 |
| POST | /bookmarks/groups/reorder | Session/空间授权 | `{ groupIds }` → `{ success: true }` |
| GET | /bookmarks | 公开/访客自适应 | `{ bookmarks: [{ id, groupId, spaceId, title, url, iconUrl, sortOrder, isPublic, ... }] }` |
| POST | /bookmarks | Session/空间授权 | `{ groupId, title, url, iconUrl, isPublic }` → `{ bookmark }` |
| PUT | /bookmarks/:id | Session/空间授权 | `{ groupId, title, url, iconUrl, sortOrder, isPublic }` → `{ bookmark }` |
| DELETE | /bookmarks/:id | Session/空间授权 | `{ success: true }` |
| POST | /bookmarks/reorder | Session/空间授权 | `{ groupId, bookmarkIds }` → `{ success: true }` |
| GET | /search/engines | 公开 | `{ engines: [{ id, name, urlTemplate, bang, isDefault, sortOrder, ... }] }` |
| POST | /search/engines | Session | `{ name, urlTemplate, bang, isDefault }` → `{ engine }` |
| PUT | /search/engines/:id | Session | `{ name, urlTemplate, bang, isDefault, sortOrder }` → `{ engine }` |
| DELETE | /search/engines/:id | Session | `{ success: true }`，至少保留一个默认引擎 |
| GET | /icons/:filename | 公开 | 返回已缓存图标的二进制响应及 Content-Type |
| POST | /favicon/fetch | Session | `{ url }` → `{ iconUrl }`，受控出站探测并缓存图标 |

认证相关 mutation 通过 `useAuth()` 在浏览器调用；SSR 可以读取 `/auth/me` 和 `/settings`，不会在响应中设置登录 Cookie。SSR 客户端按请求创建，避免 Cookie 串用。

错误统一返回 `{ code, message }`。400 为参数或 JSON 错误；401 为未登录或凭据错误；403 为来源或未解锁错误；404 为路径或资源不存在；409 为设置版本冲突；429 为登录窗口耗尽；500 不返回内部异常内容。Eden 的全局错误钩子不保证每个错误响应都能推导出细分类型，UI 按 HTTP 状态处理，不能假设任意失败都含业务数据。

当前没有公开注册、微服务接入或附件导出 API。不要把后续规划接口当作已实现能力。


## 组件画布

GET /api/v1/desktop/:spaceId 读取空间画布。PUT 同一路径提交 revision、nodes、templates，成功返回递增版本与完整快照。未登录返回 401，空间不存在或隐私授权失效返回 403，字段无效返回 400，版本冲突返回 409。

POST /api/v1/desktop/:spaceId/merge 接收 desktop、sourceId、targetId，将两个书签节点合并成真实分组。创建分组、移动书签与保存画布在同一事务内执行，过期版本不产生任何写入。

节点类型白名单、四档坐标与局部样式结构见 packages/shared/src/desktop.ts。单空间最多 120 个节点和 40 个模板，总快照限制 512 KiB。所有响应禁止缓存，模板不跨空间开放。

设置接口新增可选 themeConfig，包含版本、种子色、明暗语义覆盖、玻璃质感和壁纸滤镜。旧客户端省略该字段时保留服务端现值。自定义 CSS 使用展示属性与简单选择器白名单，非法规则返回 400。

## Model Context Protocol (MCP)

| 方法 | 路径 | 认证 | 请求与响应 |
| --- | --- | --- | --- |
| GET | /mcp/sse | Bearer <mcp-key> | 建立远程 MCP SSE 通道，下发 endpoint 事件 |
| POST | /mcp/messages | Bearer <mcp-key> | JSON-RPC 请求，通过 query 携带 sessionId，返回 202 |
| GET | /desktop/events | Session / 浏览器 | 建立轻量 SSE 广播流，接收 theme.updated / widget.updated / layout.updated |
| GET | /mcp/key | Session | `{ hasKey, keyMask, createdAt, updatedAt }` 脱敏元数据 |
| POST | /mcp/key/refresh | Session | `{ key, keyMask, createdAt }` 单向刷新并下发唯一一次明文密钥 |
| DELETE | /mcp/key | Session | `{ success: true }` 停用并吊销密钥 |

本地标准输入输出模式直接运行 `bun run mcp`，与外部 AI 客户端（如 Claude Desktop）零网络延迟直接交互。

