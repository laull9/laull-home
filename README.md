# laull-home 一个高度自定义、私有化的个人浏览器主页方案

## 简介

laull-home 是一个高度自定义、私有化的个人浏览器方案，你可以把它部署在你自己的服务器上，作为你个人的浏览器主页。它提供了丰富的功能和灵活的配置选项，让你可以根据自己的需求进行个性化定制。

## 功能特点

- **高度自定义**：自由配置主页的布局、主题、功能模块等。
- **隐私保护**：所有数据都存储在你的服务器上--无需依赖第三方服务。
- **多端同步**：它本身就是网页，直接在你的手机、平板、电脑上任意同步。

## 技术栈

- 前端：Vue.js、Nuxt.js
- 后端：Bun.js、Elysia、Sqlite
- 部署：Docker、Nginx/Caddy

## 快速上手

你无需克隆源码仓库，只需准备一个 `compose.yml` 文件即可直接拉取并运行 GitHub Packages 的多架构容器镜像（支持 linux/amd64 与 linux/arm64）。

### 1. 准备 compose.yml

在一个目录中创建 `compose.yml` 文件：

```yaml
services:
  laull-home:
    image: ghcr.io/laull9/laull-home:latest
    container_name: laull-home
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      # 必填：真实外部访问地址（建议配置 HTTPS 来源，无末尾斜杠）
      - LAULL_HOME_ORIGIN=https://home.example.com
      - LAULL_HOME_SESSION_DAYS=90
      - LAULL_HOME_DATABASE_PATH=/app/data/laull-home.db
      - LAULL_HOME_DATA_DIR=/app/data
    volumes:
      # 持久化数据目录，保存 SQLite 数据库、壁纸与图标文件
      - ./data:/app/data
```

### 2. 启动服务

在包含 `compose.yml` 的目录下执行：

```sh
docker compose up -d
```

### 3. 查看初始管理员账号

首次启动若数据库为空，容器会自动初始化管理员账密并在控制台输出（默认 `admin` / `admin`）：

```sh
docker compose logs -f laull-home
```

登录后进入设置界面修改初始密码。

反向代理配置与持久化权限说明见 [Docker 部署指南](docker/README.md)；源码调试与独立发布包运行见 [快速上手文档](docs/QUICKSTART.md)。

## 文档

- [产品设计](docs/DESIGN.md)
- [需求约束](docs/REQUIREMENTS.md)
- [快速上手](docs/QUICKSTART.md)
- [基础架构](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [开发、测试与发布](docs/CI.md)
- [实施计划](TODO.md)

组件桌面与主题配置说明见 [docs/DESKTOP.md](docs/DESKTOP.md)。
