# 快速上手

本页介绍从源码启动、验证和构建项目。使用 GitHub Release 发布包时，参阅 [发布包运行方法](CI.md#使用发布包)。

## 开发

要求 Bun 1.4.2 或兼容版本。

```sh
bun install --frozen-lockfile
bun run hooks:install
cp .env.example .env
bun run db:migrate
```

在 zsh 中初始化唯一账号。密码输入不回显，随后通过标准输入传给命令：

```sh
read -s 'account_password?密码：'
printf '%s' "$account_password" | bun run auth:create owner
unset account_password
```

启动前后端：

```sh
bun run dev
```

浏览器访问 `http://localhost:3000`，API 监听 `127.0.0.1:3001`。浏览器通过 Nuxt 代理访问 `/api/v1`，不要直接访问后端端口。更换访问域名或端口时同步修改 `.env` 的来源配置。当前保留 Nuxt 起始页面，认证能力通过 API 和 `useAuth()` 提供。

## 验证与构建

```sh
bun run check
```

前端产物位于 `apps/web/.output`，后端产物位于 `apps/server/dist`。

生产启动示例从仓库根目录执行，先配置 `.env` 中的 HTTPS 来源：

```sh
NODE_ENV=production bun apps/server/dist/index.js
NODE_ENV=production HOST=127.0.0.1 PORT=3000 bun apps/web/.output/server/index.mjs
```

以上命令分别运行在两个终端。生产使用进程管理器托管，在 HTTPS 反向代理后运行；只公开入口端口。迁移与数据路径由后端管理，当前后端构建产物需保留仓库目录结构，不能单独移动 dist 文件。Docker 配置尚未实现。

## 文档

- [产品设计](DESIGN.md)
- [需求约束](REQUIREMENTS.md)
- [基础架构](ARCHITECTURE.md)
- [API](API.md)
- [实施计划](../TODO.md)

## 开发与发布

日常开发直接使用 `dev`，新克隆执行 `bun run hooks:install`。dev push 自动运行完整检查；正式发布只由已进入 main 的 `vX.Y.Z` 标签触发。详细约束、发布包运行方法和 GitHub 分支保护设置见 [开发与发布规则](CI.md)。
