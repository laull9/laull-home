# laull-home

> 一个高度自定义、私有化的个人浏览器主页方案

## 简介

`laull-home` 是一个面向个人使用的、自托管浏览器主页。

它可以部署在自己的服务器上，并作为浏览器主页或新标签页入口使用。项目重点不是做一个传统的“网址导航”，而是提供一个可长期扩展的个人 Web Portal：统一管理书签、搜索、主题、背景、状态卡片和私人微服务，并让所有设备访问同一份服务端数据。

项目默认以**单用户私人部署**为主要场景，优先考虑：

- 使用体验简单；
- 页面高度可定制；
- 所有数据由自己掌控；
- 多端天然同步；
- 微服务易接入；
- 主题和功能模块能够持续扩展；
- 部署和升级尽量简单。

---

## 功能特点

### 高度自定义

支持自由配置：

- 主页布局；
- 书签分组与排序；
- 自定义图标；
- 搜索引擎；
- 搜索 Bang / 快捷命令；
- Widget 卡片；
- 背景图片；
- 主题；
- CSS 覆盖；
- 微服务模块。

主页不应依赖固定布局，书签和 Widget 都应支持在浏览器页面中直接编辑。

### 隐私保护

所有核心数据均保存在自己的服务器中，包括：

- 用户配置；
- 书签；
- 布局；
- 主题；
- 背景；
- Widget 配置；
- 微服务连接信息。

项目不依赖浏览器厂商账号同步，也不要求第三方云服务保存个人数据。

### 多端同步

`laull-home` 本身就是一个 Web 应用。

只要访问同一个地址：

```text
https://home.example.com
```

手机、平板、Windows、macOS、Linux 等设备即可直接读取服务器上的同一份数据。

例如：

```text
Mac 添加书签
    ↓
写入服务器数据库
    ↓
Windows / 手机刷新后立即可见
```

后续可通过 SSE 实现打开页面之间的实时同步。

### 私人微服务入口

主页可以作为个人服务的统一入口，例如：

- LTrade；
- 服务器状态；
- OpenWrt；
- 下载器；
- Git 服务；
- HomeLab 服务；
- TODO；
- 私人 API；
- 其他 Bun / .NET / Rust 服务。

微服务可以以以下形式接入：

- 普通书签；
- 状态 Widget；
- API 数据卡片；
- Action 按钮；
- iframe；
- 完整 Web 应用入口。

---

# 技术栈

## 前端

- Vue.js
- Nuxt.js
- TypeScript

Nuxt 主要负责前端页面、组件组织、路由和构建。

前端不直接保存关键业务数据，服务器数据库是唯一真实数据源。

## 后端

- Bun
- Elysia
- SQLite

后端作为独立 API 服务运行。

Elysia 负责：

- 用户认证；
- Session；
- Bookmark CRUD；
- Theme 管理；
- Wallpaper 管理；
- Widget 管理；
- Integration 管理；
- Secret 管理；
- 微服务代理；
- SSE；
- 导入导出；
- 健康检查。

SQLite 用于存储所有个人配置与状态。

## 部署

- Docker
- Docker Compose
- Nginx / Caddy

推荐生产架构：

```text
Internet / Tailscale
        ↓
   Nginx / Caddy
        ↓
┌────────────────────┐
│     laull-home     │
│                    │
│ Nuxt Frontend      │
│ Elysia Backend     │
└─────────┬──────────┘
          │
          ▼
       SQLite
          │
          ▼
 Docker Private Network
          │
 ┌────────┼────────┐
 │        │        │
LTrade  Router   Tools
```

公网只需要暴露 `80 / 443`。

私人微服务默认只存在于 Docker 私有网络或局域网中。

---

# 项目架构

推荐前后端分离，但仍保持单仓库管理：

```text
laull-home/
├── apps/
│   ├── web/                 # Nuxt 前端
│   └── server/              # Bun + Elysia 后端
│
├── packages/
│   ├── shared/              # 前后端共享类型 / Schema
│   └── ui/                  # 可选：公共 UI 组件
│
├── data/                    # 本地运行数据，生产环境挂载
│   ├── laull-home.db
│   ├── icons/
│   ├── wallpapers/
│   ├── themes/
│   └── backups/
│
├── docs/                    # 项目文档
│   ├── DESIGN.md
│   ├── API.md
│   ├── INTEGRATION.md
│   └── THEME.md
│
├── docker/
│   └── ...
│
├── compose.yml
├── .env.example
├── package.json
└── README.md
```

---

# 核心模块

## 1. 用户与认证

项目默认以单用户模式为主。

功能：

- 用户名 + 密码登录；
- 长期 Session；
- HttpOnly Cookie；
- Session 管理；
- 主动退出；
- 撤销其他设备 Session。

建议密码使用 `Argon2id` 哈希。

Session Cookie：

```text
HttpOnly
Secure
SameSite=Lax
```

长期可信设备可设置较长有效期，例如 90 天或 365 天。

未来可以增加：

- Passkey；
- WebAuthn；
- OIDC。

---

## 2. 书签系统

书签必须支持直接在浏览器中动态管理，而不是依赖配置文件。

支持：

- 新增；
- 编辑；
- 删除；
- 排序；
- 分组；
- 拖拽；
- 自定义图标；
- 自动 favicon；
- 新标签页 / 当前页面打开；
- 单个书签视觉覆盖。

典型流程：

```text
点击 +
  ↓
输入名称和 URL
  ↓
自动发现 favicon
  ↓
保存
  ↓
写入 SQLite
  ↓
其他设备同步
```

---

## 3. 图标系统

图标来源：

```text
用户上传
>
用户指定 URL
>
网页 favicon
>
apple-touch-icon
>
/favicon.ico
>
内置图标
>
默认占位图标
```

推荐将远程 favicon 缓存到本地：

```text
data/icons/
```

避免每次打开主页请求第三方网站。

---

## 4. 搜索系统

主页提供统一搜索框。

支持：

- Google；
- Bing；
- DuckDuckGo；
- GitHub；
- YouTube；
- SearXNG；
- 自定义搜索模板。

同时支持 Bang：

```text
!gh rust orm
!yt bun tutorial
!so cpp reflection
```

以及 URL 自动识别：

```text
github.com/openai
```

可直接打开，而不是提交搜索。

未来可加入命令模式：

```text
> theme starry
> wallpaper next
> open ltrade
> lock
```

---

## 5. Widget 系统

Widget 是主页中的可视化卡片。

V1 建议内置有限的 Renderer：

```text
metric
metric-grid
status
progress
table
line-chart
bar-chart
image
markdown
buttons
iframe
```

Widget 负责展示数据，不直接包含具体微服务业务逻辑。

例如：

```text
┌────────────────────┐
│ LTrade             │
│                    │
│ Training           │
│ Epoch 4            │
│ ████████░░ 87%    │
│ Loss 0.169         │
└────────────────────┘
```

---

# 微服务接入系统

## 设计原则

私人微服务不直接控制主页 UI。

微服务提供：

```text
数据
动作
描述信息
```

`laull-home` 负责：

```text
认证
代理
渲染
布局
主题
```

因此：

> 微服务输出数据与动作，主页决定如何展示。

---

## Integration

每个外部服务在 `laull-home` 中保存为一个 Integration。

例如：

```json
{
  "name": "LTrade",
  "slug": "ltrade",
  "baseUrl": "http://ltrade:8080",
  "authType": "bearer"
}
```

真实 Token 不返回浏览器。

请求过程：

```text
Browser
   ↓
laull-home API
   ↓
Elysia Integration Proxy
   ↓
添加认证信息
   ↓
Docker Private Network
   ↓
LTrade
```

---

## Integration Manifest

推荐约定：

```text
GET /.well-known/laull-home.json
```

微服务可以返回：

```json
{
  "schemaVersion": 1,
  "id": "ltrade",
  "name": "LTrade",
  "icon": "/icon.svg",

  "widgets": [
    {
      "id": "training-status",
      "name": "Training Status",
      "renderer": "metric-grid",

      "data": {
        "method": "GET",
        "path": "/api/status",
        "refreshInterval": 10000
      },

      "fields": [
        {
          "key": "state",
          "label": "Status",
          "type": "status"
        },
        {
          "key": "epoch",
          "label": "Epoch",
          "type": "number"
        },
        {
          "key": "progress",
          "label": "Progress",
          "type": "progress"
        }
      ]
    }
  ],

  "actions": [
    {
      "id": "start",
      "label": "Start",
      "method": "POST",
      "path": "/api/start"
    }
  ]
}
```

添加服务时：

```text
Settings
→ Integrations
→ Add
→ 输入服务地址
→ Discover
→ 读取 Manifest
→ 选择 Widget
→ Save
```

第一版不支持微服务注入任意 JavaScript。

---

# 微服务 Secret

Secret 只能存在于后端。

错误：

```text
Browser
→ Bearer Token
→ Microservice
```

正确：

```text
Browser
→ Elysia
→ Secret Store
→ Microservice
```

需要动态保存的 Token 可以使用：

```text
AES-256-GCM
```

配合：

```env
LAULL_HOME_MASTER_KEY=...
```

数据库只保存加密后的 Secret。

---

# 主题系统

主题系统不是简单更换 CSS 文件，而是分为两层：

```text
Theme Tokens
+
CSS Override
```

## Theme Tokens

统一使用 CSS Variables，例如：

```css
--lh-bg;
--lh-surface;
--lh-surface-hover;

--lh-text;
--lh-text-secondary;

--lh-accent;
--lh-border;

--lh-radius-sm;
--lh-radius-md;
--lh-radius-lg;

--lh-shadow-card;
--lh-blur;

--lh-font-family;
```

组件只引用变量：

```css
.card {
  color: var(--lh-text);
  background: var(--lh-surface);
  border-radius: var(--lh-radius-lg);
}
```

避免组件内部写死主题颜色。

---

## Theme Manifest

主题可以包含：

```json
{
  "schemaVersion": 1,
  "id": "starry",
  "name": "Starry",
  "author": "laull",
  "mode": "dark",

  "tokens": {
    "bg": "#08192c",
    "surface": "rgba(255,255,255,.08)",
    "text": "#ffffff",
    "accent": "#80baf0",
    "radiusLg": "22px",
    "blur": "18px"
  }
}
```

主题切换时转换为 CSS Variables。

---

## CSS Override

复杂主题可以额外覆盖组件样式。

推荐使用：

```css
@layer reset, base, components, theme, user;
```

优先级：

```text
Core
<
Theme
<
User
```

用户最终始终能够通过 Custom CSS 覆盖主题。

---

## Theme Pack

未来可以定义：

```text
*.lhome-theme
```

本质为 ZIP：

```text
starry.lhome-theme
├── theme.json
├── theme.css
├── preview.webp
├── wallpaper.webp
└── assets/
```

主题禁止包含 JavaScript。

允许：

- Design Tokens；
- CSS；
- 图片；
- 字体；
- 图标。

---

# 背景系统

背景与主题分离。

支持：

- 本地上传；
- 远程 URL；
- 固定背景；
- 随机图库；
- 每日切换；
- 渐变；
- 纯色。

Theme 可以提供默认背景，但用户仍可以单独覆盖。

例如：

```text
Starry Theme
+
自定义城市壁纸
```

而不是为了不同背景复制整套主题。

---

# 布局系统

## Bookmark

书签使用自动 Grid：

```text
Auto Grid
+
sortOrder
```

不强制为每个书签保存：

```text
x
y
w
h
```

这样移动端适配更加简单。

## Widget

Widget 使用独立 Grid：

```text
Desktop 12 columns
Tablet   8 columns
Mobile   4 columns
```

Widget 保存：

```text
x
y
w
h
```

不同断点可以拥有不同布局。

---

# 多端同步

服务器数据库是唯一真实数据源。

关键数据不得只保存到 LocalStorage。

例如：

```text
Mac
POST /api/bookmarks
      ↓
SQLite
      ↓
SSE
      ↓
Windows / Phone
```

SSE 事件例如：

```text
bookmark.created
bookmark.updated
bookmark.deleted

widget.updated
layout.updated

theme.updated
wallpaper.updated
```

第一版不需要 WebSocket。

---

# API

统一：

```text
/api/v1
```

例如：

```text
POST   /api/v1/auth/login
POST   /api/v1/auth/logout

GET    /api/v1/bookmarks
POST   /api/v1/bookmarks
PATCH  /api/v1/bookmarks/:id
DELETE /api/v1/bookmarks/:id

GET    /api/v1/themes
POST   /api/v1/themes/import

GET    /api/v1/integrations
POST   /api/v1/integrations

POST   /api/v1/integrations/:id/actions/:action

GET    /api/v1/events
GET    /api/v1/health
```

API Schema 建议使用共享 TypeScript / Schema 定义，避免前后端类型漂移。

---

# 安全

项目虽然默认单用户，但因为通常会部署在公网，因此必须考虑基础安全。

## 必须保证

- 密码使用强哈希；
- Session 使用 HttpOnly Cookie；
- 全站 HTTPS；
- Secret 不进入浏览器；
- 防止任意开放代理；
- 防止 Integration SSRF；
- 防止 favicon 抓取 SSRF；
- Markdown / HTML Sanitization；
- API Mutation 做 Origin / CSRF 校验；
- 日志中隐藏 Token 和密码；
- 上传文件限制大小和类型；
- Theme ZIP 防止 Zip Slip；
- iframe 使用 Allowlist。

---

# 安装与运行

## 开发环境

```bash
bun install
bun run dev
```

推荐根目录统一启动 Web 和 Server。

例如：

```text
web     → http://localhost:3000
server  → http://localhost:3001
```

Nuxt 开发环境将：

```text
/api/*
```

代理到 Elysia。

---

## Docker

生产环境推荐：

```text
Nuxt Build
+
Elysia
+
SQLite
```

使用 Docker Compose 管理。

示意：

```yaml
services:
  laull-home:
    image: ghcr.io/your-name/laull-home:latest
    restart: unless-stopped

    environment:
      LAULL_HOME_MASTER_KEY: ${LAULL_HOME_MASTER_KEY}

    volumes:
      - ./data:/app/data

    ports:
      - "127.0.0.1:3000:3000"

    networks:
      - home

networks:
  home:
    name: home
```

反向代理：

```text
https://home.example.com
        ↓
Nginx / Caddy
        ↓
127.0.0.1:3000
```

---

# 数据备份

推荐所有持久化内容位于：

```text
data/
```

因此备份主要包括：

```text
laull-home.db
icons/
wallpapers/
themes/
```

后续提供：

```text
Settings
→ Backup
→ Export
```

导出：

```text
laull-home-backup.zip
```

默认不包含 Secret 明文。

---

# 项目结构

```text
docs/
```

文档目录，存放项目相关设计和说明。

推荐：

```text
docs/
├── DESIGN.md
├── API.md
├── INTEGRATION.md
├── THEME.md
└── DEPLOYMENT.md
```

其中：

- `DESIGN.md`：整体产品与架构设计；
- `API.md`：HTTP API；
- `INTEGRATION.md`：微服务接入协议；
- `THEME.md`：主题系统规范；
- `DEPLOYMENT.md`：Docker 与反向代理部署。

---

# 开发阶段

## V0.1

实现真正可用的私人主页：

- 登录；
- Bookmark CRUD；
- 分组；
- 搜索；
- favicon；
- 壁纸；
- 基础主题；
- SQLite；
- Docker。

## V0.2

完善浏览器主页体验：

- 拖拽排序；
- 搜索 Bang；
- 图标上传；
- 背景图库；
- PWA；
- SSE；
- 移动端优化。

## V0.3

加入 Dashboard：

- Widget Grid；
- Widget resize；
- Integration；
- API Proxy；
- Secret Store；
- Action。

## V0.4

完善扩展体系：

- Theme Pack；
- Integration Manifest；
- iframe；
- Session Manager；
- Backup / Restore。

## V1.0

稳定：

- API v1；
- Integration Manifest v1；
- Theme Manifest v1；
- 完整响应式；
- 安全审查；
- 自动迁移；
- E2E；
- 正式 Docker Release。

---

# 设计原则

项目长期遵循以下原则：

1. **服务器是唯一真实数据源。**
2. **主页不包含微服务业务逻辑。**
3. **微服务只提供数据和动作。**
4. **Integration 不允许任意 JavaScript 注入。**
5. **Theme 不允许执行 JavaScript。**
6. **Secret 永远只存在于后端。**
7. **优先解决个人使用体验，不为通用场景过度设计。**
8. **简单功能优先，复杂能力按实际需求逐步加入。**

---

## 一句话定义

> `laull-home` 是一个基于 Nuxt + Bun + Elysia + SQLite 的、自托管、高度可定制的私人浏览器主页，并通过统一的 Widget、Integration 和 Theme 系统逐步扩展为个人 Web Portal。
