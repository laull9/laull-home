# Docker 生产部署与运行指南

## 1. 快速启动

复制环境配置并修改访问域名：

```sh
cp .env.example .env
```

在 `.env` 中配置真实的 HTTPS 域名：

```env
LAULL_HOME_ORIGIN=https://home.example.com
```

启动服务：

```sh
docker compose up -d
```

## 2. 初始化管理员账号

在容器内通过命令行创建唯一管理账号：

```sh
docker compose exec -it laull-home bun apps/server/dist/create-user.js admin
```

系统会通过标准输入提示输入密码。

## 3. HTTPS 反向代理

- **Caddy**：参考 `docker/Caddyfile`，将域名解析至服务器后自动配置并申请 HTTPS 证书。
- **Nginx**：参考 `docker/nginx.conf`，挂载已有的证书并反代至容器 `3000` 端口。

## 4. 数据备份

所有数据（包括 SQLite 数据库与缓存的站点图标）持久化保存在 `laull_data` 命名数据卷（容器内 `/app/data`）中。
