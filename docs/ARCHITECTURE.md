# 基础系统设计

本文件记录 v0.0.1 的实现边界。产品方向继续以 DESIGN.md、REQUIREMENTS.md 为准。

## 目录与依赖

```text
apps/web/                  Nuxt 页面、组合函数、同源代理
apps/server/src/
  app.ts                   Elysia 装配与 API 类型出口
  config.ts                环境变量校验
  db/                      SQLite 连接与顺序迁移
  modules/auth/            账号初始化、密码验证、Session
  modules/settings/        设置读取与版本写入
packages/shared/src/       可进入浏览器的 Schema 与类型
scripts/                   仓库开发命令
data/                      本地数据，不进 Git
```

Web 只以 `import type` 引用服务端 App。共享包不能导入文件系统、数据库、环境变量或 Secret。Elysia route 处理 HTTP 输入输出，service 处理规则及 SQL；目前每个模块仅几条查询，不额外增加 Repository 层。查询增长后再在模块内部拆 repository，禁止跨模块直接写表。

沿用独立后端设计，没有将 Elysia 嵌入 Nitro。Nuxt 提供同源 `/api/v1/*` 代理；浏览器不接触内部服务地址，不开启跨域认证。Eden Treaty 从 App 推导参数和响应，Nuxt 插件提供 `$api`，例如 `$api.settings.get()`。

## 配置分层

运行配置通过环境变量进入后端，包括来源、监听地址、数据库路径及 Session 有效期。启动时校验，错误即退出。`.env.example` 列出当前实际支持的配置。根目录运行 Bun 命令时自动加载 `.env`；统一开发命令把环境传入两个子进程。

用户设置保存到 SQLite，包括页面标题和外观模式。修改时带上读取到的 `revision`，数据库通过单条条件 UPDATE 比较并递增。409 表示其他设备已提交，调用方重新读取并让用户决定是否重试。

微服务凭据属于第三类配置，后续采用 AES-256-GCM 密文存储，主密钥从环境或 Secret 文件注入。当前没有 Secret API，也不提前创建未使用的主密钥配置。

## SQLite 与 Drizzle ORM

使用 Drizzle ORM 配合 Bun 原生 SQLite（`drizzle-orm/bun-sqlite`），单后端进程、单连接。禁止手写 SQL，由 Drizzle Schema 统一定义表结构、类型和索引。启用 WAL、外键与 5 秒 busy timeout；写事务保持短小，密码哈希和网络调用放在事务外。迁移在 IMMEDIATE 事务中执行，记录版本、SQL 摘要和时间。历史迁移被修改或数据库版本超前时拒绝启动。升级只追加迁移；回退程序前须确认数据库兼容。

当前表：

| 表 | 用途 | 约束与生命周期 |
| --- | --- | --- |
| users | 唯一管理账号和 Argon2id 摘要 | id 固定为 1，无公开注册 |
| sessions | 设备会话摘要与有效期 | 外键级联，过期索引，最多 20 条 |
| user_settings | 页面标题、外观、主题、壁纸和版本 | 每账号一条，条件更新 |
| login_throttle | 登录窗口计数 | 固定一条，15 分钟最多 10 次尝试 |
| spaces | 空间实体（普通与隐私） | 外键级联，默认空间保护 |
| space_credentials | 隐私空间独立 Argon2id 密码哈希 | 仅限隐私空间 |
| space_sessions | 短期空间授权会话 | 15 分钟短期有效，退出时级联销毁 |
| bookmark_groups | 书签分组 | 所属空间外键级联，组间排序 |
| bookmarks | 书签项 | 所属分组与空间外键级联，组内排序，协议校验 |
| search_engines | 搜索引擎与 Bang 配置 | 模板 %s 校验，至少保留一个默认引擎 |
| schema_migrations | 迁移版本及摘要 | 只追加 |

Session 固定到期，不滑动续期。每次认证检查到期时间；每次成功登录清理过期记录并限制会话数量。登录节流在重启后仍有效；单用户全局限制不依赖可伪造的转发 IP，但被恶意消耗时会让正常用户等待窗口结束，公网部署还应在入口限制请求频率和并发。

生产只运行一个 API 实例，不把 SQLite 放在网络文件系统上。后续书签、配置等常驻数据体量按个人场景设计；抓取缓存需设置配额，事件和审计记录需设置保留期，禁止无界增长。

在线备份使用 SQLite backup API 或 `VACUUM INTO` 生成一致快照。运行中禁止只复制 `.db` 而遗漏 WAL。附件与数据库快照需共同归档；恢复在停机后执行，并验证迁移版本。自动备份工具列入后续任务。

## 认证边界

通过 `auth:create` 在可信终端创建账号，密码从标准输入读取，不经命令参数，不设置默认密码。用户名限制字符与长度，密码 12 至 128 位，Argon2id 使用 64 MiB 内存和 3 次迭代。

登录生成 32 字节随机 Session，浏览器收到 HttpOnly、SameSite=Lax、Path=/ Cookie；HTTPS 来源再加 Secure。数据库仅保存 SHA-256 摘要。重登撤销该设备旧 Session，退出立即删库，撤销其他设备保留当前会话。

所有写请求（含登录）要求 Origin 与配置完全一致，缺失来源也拒绝。SSR 只转发当前请求 Cookie，登录、退出在浏览器执行。服务端不记录密码、Cookie 或完整请求体，错误响应不暴露异常细节。基础接口禁用缓存并发送 noindex；生产 TLS 由入口反向代理终止。

当前私有 API 全部要求登录，健康检查除外。UI 路由守卫拦截受保护页面（如设置和设备管理），引导至登录页并支持回跳。登录状态由服务端 Session 校验驱动。

## 空间与访客数据边界

普通主页对未登录访客开放严格受控的只读数据范围：
- 开放内容：主页标题、外观模式（系统、浅色、深色）、公开搜索引擎列表以及后续默认普通空间内标记为公开的书签与分组。
- 禁止内容：任何写操作（PUT 设置、书签变更）、设备会话列表、账号修改、微服务代理及隐私空间任何元数据与内容。未登录访客不可请求或获取隐私空间授权。
- 路由行为：未登录访问受保护页面重定向至 `/login?redirect=...`；普通主页根路径 `/` 渲染访客只读视图。

空间模型分为普通空间与隐私空间：
- `spaces`：保存空间记录，标记空间类型（`normal` 或 `privacy`）及默认状态；
- `space_credentials`：保存隐私空间的独立 Argon2id 密码摘要，独立于主登录密码；
- `space_sessions`：保存通过独立密码解锁签发的短期空间授权（有效期 15 分钟），请求通过专有 Cookie `lh_space_session` 携带。

隐私空间访问规则：
- 进入隐私空间必须通过独立密码校验签发短期授权；
- 空间查询、数据检索与后续附件访问严格检查短期授权，未授权返回 401/403；
- 主动锁定或退出时立即清除数据库会话与客户端 Cookie；
- 服务端响应附带 `Cache-Control: no-store` 与 `X-Robots-Tag: noindex, nofollow`，禁止浏览器本地保留持久缓存。

## 设备会话与账号恢复

设备会话管理：
- 会话表记录会话随机公开标识与客户端 User-Agent；
- 支持列出当前账号的全部有效会话，并标识当前设备；
- 支持单设备精准撤销，以及撤销除当前会话外的所有设备。
- 修改密码时验证旧密码，更新 Argon2id 摘要，并撤销全部旧会话，重新签发当前会话。

本地账号恢复：
- 提供本地 CLI 恢复脚本，通过标准输入传入新密码，直接重置账号密码、清理登录节流窗口并撤销全部会话，释放数据库连接。

## 后续数据边界

以下为后续版本规划，不表示表或接口已实现。

| 模块 | 计划实体与关系 | 约束 |
| --- | --- | --- |
| 书签 | bookmark_groups、bookmarks | space_id 外键、组内排序、URL 协议校验 |
| 搜索 | search_engines、search_bangs | 唯一 Bang、模板白名单与参数编码 |
| 资源 | assets | 文件随机命名、类型和配额、引用检查 |
| 主题 | themes、space_preferences | 版本化 Token，背景与主题分离 |
| 组件 | widgets、widget_layouts | 组件类型白名单、按断点存窗格跨度与位置、就地配置 JSON 校验 |
| 服务 | integrations、integration_secrets | URL 策略、密文凭据、请求超时 |

组件实体管理组件实例的所属空间、类型、标题及就地编辑的内容配置（JSON 文本）。布局表按桌面、便携本、平板和移动端四种断点分别记录组件占据的窗格跨度（col_span、row_span）与起始位置（col_start、row_start），并记录固定标记（pinned）。更新布局时采用批量更新事务，保证多设备读取到一致的窗格排布。

后续 Integration 与 favicon 抓取共用受控出站能力，但策略分开：公开图标拒绝内网地址，私人 Integration 只允许显式批准的主机和端口。两者均检查解析结果和每次重定向，限制响应大小、超时与并发。代理不能接受浏览器提供任意目标 URL。

SSE 在事务提交后发事件；事件仅提示客户端重新读取数据库。需要断线重读与授权过滤后才上线，不承诺第一版事件可靠投递。

## 验收与扩展规则

执行 `bun run check` 检查 lint、前后端类型、后端请求测试及构建。API 测试使用隔离数据库，验证身份、撤销、过期、来源、设置冲突及迁移持久化。新增 API 同时提供 Schema、授权边界和失败路径测试。

每个文件不超过 500 行。基础系统不引入业务 UI；先接通一个模块的持久化与权限，再开发交互。Docker、端到端浏览器用例和资源安全测试在对应功能实现时完成，不能用当前单元测试替代。

实现依据：[Eden Treaty 配置](https://elysiajs.com/eden/treaty/config)、[Bun SQLite](https://bun.sh/docs/runtime/sqlite)、[Bun 密码哈希](https://bun.sh/docs/runtime/hashing)。
