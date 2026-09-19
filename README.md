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

### 拉取与部署

克隆仓库并使用 Docker Compose 启动：

```sh
git clone -b main https://github.com/laull9/laull-home.git
cd laull-home
cp .env.example .env
docker compose up -d
```

服务启动后访问 `http://localhost:3000`。若数据库为空，容器会自动初始化，你可以在日志中查看初始管理员账密（默认 `admin` / `admin`）：

```sh
docker compose logs -f laull-home
```

登录后建议在设置界面修改初始密码。

### 示例 compose.yml

你可以直接使用项目自带的 `compose.yml`，也可以参考下面的配置编写自己的编排文件：

```yaml
services:
  laull-home:
    build:
      context: .
      dockerfile: Dockerfile
    image: laull-home:latest
    container_name: laull-home
    restart: unless-stopped
    ports:
      - "${APP_HOST:-0.0.0.0}:${APP_PORT:-3000}:3000"
    environment:
      - NODE_ENV=production
      - LAULL_HOME_ORIGIN=${LAULL_HOME_ORIGIN:-https://localhost:3000}
      - LAULL_HOME_SESSION_DAYS=${LAULL_HOME_SESSION_DAYS:-90}
      - LAULL_HOME_DATABASE_PATH=/app/data/laull-home.db
      - LAULL_HOME_DATA_DIR=/app/data
    volumes:
      - ${DATA_PATH:-./data}:/app/data
```

反向代理配置与持久化权限说明见 [Docker 部署指南](docker/README.md)；源码调试与发布包运行见 [快速上手文档](docs/QUICKSTART.md)。

## 文档

- [产品设计](docs/DESIGN.md)
- [需求约束](docs/REQUIREMENTS.md)
- [快速上手](docs/QUICKSTART.md)
- [基础架构](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [开发、测试与发布](docs/CI.md)
- [实施计划](TODO.md)

组件桌面与主题配置说明见 [docs/DESKTOP.md](docs/DESKTOP.md)。
