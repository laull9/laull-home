# Docker 生产部署与运行指南

## 1. 快速启动

复制环境配置文件：

```sh
cp .env.example .env
```

在 `.env` 中按需配置运行参数：

```env
# 必填：真实外部访问地址（必须为完整 HTTPS 来源，无末尾斜杠）
LAULL_HOME_ORIGIN=https://home.example.com

# 端口暴露：宿主机对外端口，默认 3000
APP_PORT=3000

# 绑定接口：默认 0.0.0.0；若配合本机 Nginx/Caddy，建议设为 127.0.0.1
APP_HOST=0.0.0.0

# 数据持久化目录：宿主机保存数据库与资源的路径，默认 ./data
DATA_PATH=./data
```

启动容器：

```sh
docker compose up -d
```

## 2. 端口暴露与 /api 自动转发

前后端对外完全共用单一端口，由前端服务统一接收所有流量。所有发往 `/api/*` 的请求均由前端服务端自动透明转发至内部后端，**外部反向代理与部署环境无需对 `/api` 编写任何分流或特殊配置**。

`compose.yml` 默认将宿主机 `${APP_HOST:-0.0.0.0}:${APP_PORT:-3000}` 映射到容器内部的统一服务端口 `3000`。

- **更改宿主机端口**：修改 `.env` 中的 `APP_PORT=8080`，即可通过宿主机 8080 端口访问整站与所有 API。
- **限制内网或本机访问**：配合本机反向代理时，设置 `APP_HOST=127.0.0.1`，避免未经过反代 TLS 终止的 HTTP 端口直接暴露到公网。
- **内部通信自动感知**：后端 API 仅在内部通过 `127.0.0.1:3001` 监听，内部通信地址由前端自动感知与推导，无需外部干预。


## 3. 数据库与持久化细节

项目使用 SQLite 与 Drizzle ORM，支持 WAL 模式，所有运行时数据集中保存在数据目录中。

- **数据目录挂载**：默认将宿主机 `${DATA_PATH:-./data}` 挂载至容器内 `/app/data`。
- **数据库路径**：通过环境变量 `LAULL_HOME_DATABASE_PATH` 控制，默认指向 `/app/data/laull-home.db`。
- **目录结构**：
  - `laull-home.db`：主数据库文件。
  - `laull-home.db-wal`、`laull-home.db-shm`：WAL 日志与共享内存文件（读写期间存在）。
  - `icons/`：站点图标缓存。
  - `wallpapers/`：壁纸存储目录。
- **权限说明**：容器内以非 root 用户（UID 1000）运行。在 Linux 宿主机使用目录挂载时，启动前需确保目录权限正常：
  ```sh
  mkdir -p data
  chown -R 1000:1000 data
  ```
- **备份建议**：完整归档宿主机的 `data/` 目录即可完成整站备份。停机备份更稳妥；在线备份时切忌遗漏 `-wal` 文件。

## 4. 管理员账号初始化

首次启动且数据库为空时，系统会自动在控制台输出初始管理员账号与密码（默认 `admin` / `admin`），可直接在终端日志中查看：

```sh
docker compose logs -f laull-home
```

登录后进入设置修改初始密码。如需通过命令行重置或创建账号：

```sh
docker compose exec -it laull-home bun apps/server/dist/create-user.js admin
```

## 5. HTTPS 反向代理

- **Caddy**：参考 `docker/Caddyfile`，自动申请与续期 TLS 证书。
- **Nginx**：参考 `docker/nginx.conf`，挂载证书并将流量反代至 `127.0.0.1:3000`。

