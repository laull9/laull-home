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
| POST | /auth/revoke-others | Session | `{ success: true }`，撤销其他会话 |
| GET | /settings | Session | `{ revision, title, appearance }` |
| PUT | /settings | Session | 同上，成功返回递增后的 revision |

认证相关 mutation 通过 `useAuth()` 在浏览器调用；SSR 可以读取 `/auth/me` 和 `/settings`，不会在响应中设置登录 Cookie。SSR 客户端按请求创建，避免 Cookie 串用。

错误统一返回 `{ code, message }`。400 为参数或 JSON 错误；401 为未登录或凭据错误；403 为来源错误；404 为路径不存在；409 为设置版本冲突；429 为登录窗口耗尽；500 不返回内部异常内容。Eden 的全局错误钩子不保证每个错误响应都能推导出细分类型，UI 按 HTTP 状态处理，不能假设任意失败都含业务数据。

当前没有公开注册、书签、主题、附件或隐私空间 API。不要把后续规划接口当作已实现能力。
