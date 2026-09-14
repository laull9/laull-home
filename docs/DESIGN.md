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

主页提供居中搜索框。

支持：

- Google；
- Bing；
- 百度；
- DuckDuckGo；
- GitHub；
- YouTube；
- 自定义搜索模板。

### 搜索引擎图形化选择与下拉面板

搜索栏左侧展示当前活动搜索引擎的图标与下拉指示器：

- 点击左侧图标区域，在输入框下方呼出平铺下拉选择卡片；
- 面板内列出所有配置的搜索引擎，点击任意引擎即可切换当前查询使用的目标；
- 面板底部提供快捷添加自定义引擎入口，可直接输入名称、包含 `%s` 的 URL 模板以及 Bang 指令，保存后立即在列表中可用。

```text
┌──────────────────────────────────────────────────────────────┐
│ [G ▾]  输入搜索内容或网址...                          [🔍]   │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│  [B] Bing       [G] Google      [度] 百度     [🦆] DuckDuckGo │
│  [🐙] GitHub     [▶] YouTube     ...                           │
│  ──────────────────────────────────────────────────────────  │
│  + 添加自定义搜索引擎                                         │
└──────────────────────────────────────────────────────────────┘
```

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

## 5. 组件系统

主页把所有可见元素抽象为组件节点（Widget Component Node）。搜索条、书签托盘、时钟天气、系统指标与微服务看板均为组件，直接安放在主页面板上。

### 组件类型与形态库

组件库提供多种尺寸和用途的构件：

1. 搜索组件：提供单行紧凑搜索条（2x1）与多引擎搜索中枢（4x2），可在面板直接切换搜索引擎；
2. 书签组件：提供单个独立图标（1x1）、书签应用托盘（2x1）与分组分类卡片（2x2、4x2）；
3. 个人工具：包含便签记事本（2x2、4x2）、番茄钟与倒计时（2x1）、本地时钟与日历（2x1、2x2）；
4. 微服务与状态：包含单个微服务指示灯（1x1）、负载胶囊（2x1）、指标监控图表（2x2、4x2）与操作按钮组（2x1）；
5. 容器：包含通用的 iframe 嵌入窗格（4x3、6x4）与文本卡片。

```text
┌──────────────┐  ┌───────────────────────────┐
│ CPU   42%    │  │ [G ▾]  输入搜索内容或网址... │
│ 3.2GHz 48°C  │  └───────────────────────────┘
└──────────────┘  ┌──────────┐  ┌─────────────┐
┌──────────────┐  │  GitHub  │  │  HomeLab    │
│ 便签备忘     │  └──────────┘  └─────────────┘
│ 部署 v0.2    │  ┌───────────────────────────┐
│ 检查备份脚本 │  │ LTrade Training   87%     │
└──────────────┘  └───────────────────────────┘
```

组件各自携带配置数据与展示逻辑，微服务组件通过后端代理读取数据，不包含外部业务私有逻辑。

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

使用小粒度的 CSS Variables 贯穿全站组件：

```css
/* 背景与表面 */
--lh-bg: #f8fafc;
--lh-surface: rgba(255, 255, 255, 0.9);
--lh-surface-hover: rgba(241, 245, 249, 0.95);
--lh-surface-active: rgba(226, 232, 240, 0.95);

/* 输入框与控件 */
--lh-input-bg: rgba(255, 255, 255, 0.85);
--lh-input-border: rgba(226, 232, 240, 0.9);

/* 文字层级 */
--lh-text: #0f172a;
--lh-text-secondary: #64748b;
--lh-text-muted: #94a3b8;

/* 品牌与强调色 */
--lh-accent: #2563eb;
--lh-accent-hover: #1d4ed8;
--lh-accent-text: #ffffff;

/* 边框与分割线 */
--lh-border: #e2e8f0;
--lh-border-hover: #cbd5e1;

/* 圆角几何 */
--lh-radius-sm: 6px;
--lh-radius-md: 10px;
--lh-radius-lg: 16px;
--lh-radius-full: 9999px;

/* 阴影与光效 */
--lh-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
--lh-shadow-card: 0 4px 16px rgba(0, 0, 0, 0.06);
--lh-shadow-dropdown: 0 12px 32px rgba(0, 0, 0, 0.12);
--lh-blur: 16px;

/* 字体 */
--lh-font-family: system-ui, -apple-system, sans-serif;
```

组件只引用上述变量，避免组件内部写死十六进制颜色。

---

## 白天与黑夜模式自适应

系统支持三种外观偏好：

- `system`：自动监听操作系统的 `(prefers-color-scheme: dark)` 媒体查询变化，系统切换暗黑模式时页面无需刷新即时响应；
- `light`：固定使用浅色变量；
- `dark`：固定使用深色变量。

每个预设主题均分别提供对应明暗两种模式下的色彩取值，保证可读性与协调对比度。

---

## CSS Override

用户可以编写自定义 CSS 规则，用以微调字体、卡片透明度、自定样式：

- 后端在 `user_settings` 表增加 `custom_css` 字段持久化存储；
- 前端通过 `<style id="lh-custom-css">` 注入页面头部；
- 结合 CSS 级联规则，用户样式处于最高优先级：

```text
Core Base
<
Theme Preset
<
User Custom CSS
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

## 组件化桌面画布

主页采用组件化桌面画布，取消固定的上下堆叠结构。页面上每个元素均表现为一个独立的组件节点，包括搜索条、单图标书签、书签托盘、时钟天气、系统指标与微服务卡片。

桌面在非编辑模式下保持干净，用户可直接点击使用各个组件。右下角悬浮操作按钮提供进入编辑模式的入口。

```text
┌──────────────────────────────────────────────────────────────┐
│ [CPU 42%]  ┌────────────────────────────────────┐ [21°C 晴]   │
│ 3.2GHz     │ [G ▾]  输入搜索内容或网址... [🔍]    │ 北京      │
│            └────────────────────────────────────┘            │
│ ┌────────┐  ┌────────┐  ┌──────────────────────────────────┐ │
│ │ GitHub │  │ MDN    │  │ 常用服务                         │ │
│ └────────┘  └────────┘  │ [NAS]  [Router]  [HomeLab]       │ │
│ ┌────────────────────┐  └──────────────────────────────────┘ │
│ │ 便签               │  ┌──────────────────────────────────┐ │
│ │ 检查本地备份任务   │  │ LTrade Training            87%   │ │
│ └────────────────────┘  └──────────────────────────────────┘ │
│                                                     ┌──────┐ │
│                                                     │ [⚙]  │ │
│                                                     └──────┘ │
└──────────────────────────────────────────────────────────────┘
```

## 微窗格响应式网格锚点

主页布局建立在微窗格网格之上。网格以统一的基础单元格（Cell Unit，基准宽高约 96px）作为空间对齐的锚点。

### 断点与列数划分

网格根据屏幕宽度自适应列数：

1. 宽屏与大显示器（宽度 >= 1440px）：12 列窗格；
2. 常规桌面与笔记本（宽度 >= 1024px）：8 至 10 列窗格；
3. 平板设备（宽度 >= 640px）：6 列窗格；
4. 移动端手机（宽度 < 640px）：4 列窗格，单元格基准尺寸缩减至 76px 左右。

### 组件大小梯队

组件库提供多种尺寸规格，占用不同数量的窗格：

1. 1x1 窗格：单个书签图标、微服务指示灯、极简天气温度气泡；
2. 2x1 窗格：快捷胶囊、紧凑搜索栏、单行时钟日期、开关按钮组；
3. 2x2 窗格：方形卡片、书签九宫格托盘、便签备忘卡、单主机资源监视器；
4. 4x1 窗格：横向状态条、宽幅输入框；
5. 4x2 窗格：多引擎全功能搜索中枢、书签分类展开托盘、微服务走势图、待办清单；
6. 4x3 与 6x4 窗格：iframe 嵌入页面、复合数据大看板。

## 组件固定与流式排布

画布上的组件拥有两种定位属性：

### 固定锚点组件（Pinned）

用户可将特定组件（例如主搜索栏或顶部状态条）锁定在网格的特定行、列位置。固定后的组件优先占据指定窗格，周围其他组件环绕避让，屏幕尺寸变动时固定锚点保持在指定相对位置。

### 自由流动组件（Flowing）

未固定的组件遵循网格稠密排布规则（Dense Grid Flow）。系统计算网格空闲单元，按顺序将组件填入符合尺寸的空位，减少桌面空隙。

## 宽高变化自适应机制

当用户缩放浏览器窗口或在不同设备上打开主页时，布局通过三重规则进行平滑适配：

### 1. 自动换行

屏幕列数减少或当前行剩余单元格不足以容纳组件宽度时，网格引擎将组件沉降至下一行可用空位，避免内容溢出裁剪。

### 2. 窗格弹性缩放

单元格采用 `minmax(76px, 1fr)` 约束。在同一断点区间内（例如 1024px 到 1366px），窗格跟随容器宽度在一定比例内略微变大或变小，填满整行宽度，不留多余边距白边。

### 3. 组件内部形态自适应与自动折叠

组件内部通过 CSS 容器查询（Container Queries）监听自身宽高，在窗格被压缩或尺寸降级时自动折叠次要内容：

1. 搜索组件：空间充足时平铺展开常用搜索引擎图标与快捷 Bang；宽度受限时自动折叠图标，仅显示主输入框与下拉选择器；
2. 书签托盘：横向空间压缩时，自动折叠超出数量的书签为“+N”浮动展开泡，保持卡片轮廓规整；
3. 监控卡片：高度或宽度受限时，自动折叠隐藏历史折线图走势，仅保留即时数值与状态指示点；
4. 便签组件：小窗格状态下折叠文本格式栏，正文超出时限制行高并启用平滑内部滚动。

## 编辑模式与就地内容编辑

用户点击悬浮菜单的“编辑主页”按钮进入编辑态。

### 编辑态视觉反馈

1. 画布背景浮现细微的点阵参考网格，清晰标出微窗格边界；
2. 组件卡片边缘显现 1px 强调细线与四角调整手柄；
3. 卡片右上角显示图钉固定图标、设置菜单与移除按钮。

```text
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  微网格点阵背景 (Edit Mode)
  ┌───────────────────────────[📌][⚙][×]┐  ┌───────[📌][⚙][×]┐
  │ [G ▾]  输入搜索内容或网址...         │  │ 常用书签       │
  │                                     │  │ [Git] [V2] [Bili] │
  │ 尺寸调节: [ 2x1 ] [ 4x1 ] [ 4x2 ]   │  │                 │
  └───────────────────────────────────[⌟]  └───────────────[⌟]
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

### 就地内容编辑（In-place Direct Editing）

编辑模式下，用户无需跳转到独立设置页，直接在组件当前位置编辑内容：

1. 便签与备忘录：直接点击卡片打字输入文本，失焦即自动保存；
2. 书签托盘：直接拖动卡片内部的图标调整顺序，点击空位追加网址；
3. 搜索与工具组件：点击右上角齿轮唤出原地浮动面板，配置默认搜索引擎、城市代码或时钟制式；
4. 微服务组件：直接在原地浮层中绑定后端 Integration 数据源与刷新频率；
5. 尺寸切换：拖动右下角调整手柄，组件按窗格步长吸附放大或缩小，也可在尺寸快捷药丸中点击切换预设规格。

## 组件库抽屉（Widget Palette）

进入编辑模式后，屏幕底部展开组件库抽屉。组件库收录不同类别、规格各异的现成组件。

```text
┌──────────────────────────────────────────────────────────────┐
│  组件库                                            [× 收起]  │
│  [全部]  [搜索]  [书签]  [效率工具]  [系统状态]  [微服务]     │
│  ──────────────────────────────────────────────────────────  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ 极简搜索 │  │ 便签速记 │  │ CPU 胶囊 │  │ 多引擎中枢   │  │
│  │  [ 2x1 ] │  │  [ 2x2 ] │  │  [ 2x1 ] │  │   [ 4x2 ]    │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

用户可以浏览组件缩略预览，点击“添加”自动填充到画布首个可用网格位置，也可以直接按住组件拖拽到目标窗格放下。

## 视觉规范与设计系统

主页采用冷青海墨与极简工业微光调色风格，强调物理器具手感与数字刻度秩序。

### 色彩基准（Theme Palette）

系统定义具体的颜色取值：

1. 深色主背景：`#0F172A`（深夜海渊蓝黑）；
2. 深色卡片表面：`#1E293B`（半透深岩青板，配合 12px 物理毛玻璃）；
3. 浅色主背景：`#F8FAFC`（淡雾石板灰）；
4. 浅色卡片表面：`#FFFFFF`（高纯度表面白）；
5. 交互强调色（Accent）：`#0D9488`（海青绿，悬停为 `#0F766E`）；
6. 锚点与固定焦点（Pin & Focus）：`#D97706`（暖金琥珀，用于固定图钉与活动边框）；
7. 边框细线：浅色 `#E2E8F0`，深色 `#334155`（1px 微雕刻度感）；
8. 次级文字：`#64748B`（平整石青灰）。

### 字体排印与尺寸对齐

标题和常规正文采用系统无衬线字体（Inter、PingFang SC、system-ui）。微服务监控指标、时间数值和端口数据采用等宽数字排版（tabular-nums），保证数字在动态刷新或尺寸变动时不产生横向颤动。

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
