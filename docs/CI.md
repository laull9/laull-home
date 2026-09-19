# 开发、测试与发布

## 分支规则

全部开发直接使用 `dev`。`main` 保存合并后的发布代码，通过同仓库 `dev → main` PR 更新。发布版本号也先在 dev 修改，完整检查通过后合并。

本仓库提供 `.githooks/pre-commit` 阻止其他分支的本地提交。每个新克隆执行 `bun run hooks:install`。本地 hook 可以被绕过，GitHub 分支保护负责远端约束，不能用 hook 替代。

## 触发矩阵

| 事件 | 执行内容 | 发布 |
| --- | --- | --- |
| dev push | lint、类型检查、测试、生产构建、产物联调 | 否 |
| PR → dev | 同上 | 否 |
| 同仓库 dev PR → main | 来源检查和完整门禁 | 否 |
| 其他来源 PR → main | 来源检查失败 | 否 |
| main push | 重新检查合并结果 | 否 |
| vX.Y.Z tag push | 校验版本和 main 归属，完整门禁、打包、创建 Release | 是 |
| 不合法的 v 前缀标签 | 发布校验失败 | 否 |
| 其他标签或其他分支 push | 不运行 | 否 |

GitHub 的 branch 和 tag 过滤不能表达“标签所属分支”。Release 用 `git merge-base --is-ancestor` 检查标签提交已进入 origin/main，并检查 HEAD 与标签解析后的提交一致。允许发布 main 的历史提交，不要求标签永远指向最新 main；只在 dev 上的提交会失败。附注标签和轻量标签都受同一检查约束。

规则依据：[GitHub 工作流触发语法](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)。

## 测试与构建

```sh
bun install --frozen-lockfile
bun run check
```

`check` 的顺序：lint → Web、Server 和 scripts 类型检查 → 行为测试 → Nuxt 与 Elysia 构建 → 启动生产产物联调。

`test` 包含认证、数据库迁移、配置、设置冲突及发布标签规则。`test:smoke` 使用临时数据库，通过构建后的命令创建测试账号，再启动两个生产进程，检查首页 SSR、Cookie 转发、身份隔离、设置写入、版本冲突、跨站拦截和退出。测试结束清理进程和数据，不占用日常 3000/3001 端口。

认证和发布规则的改动必须带失败场景；Bug 修复补充复现用例。UI 开发后再增加浏览器交互测试，当前产物联调不代表浏览器点击流程已覆盖。禁止将测试改为跳过或放宽断言来掩盖失败。

工作流改动另行运行 `actionlint .github/workflows/*.yml`。Action 固定完整 SHA，Bun 固定版本；升级在 dev 中进行并重新验证。

## 发布步骤

1. 在 dev 修改根 package.json 的 version，按需更新文档，运行完整检查并提交。
2. 推送 dev，等待 CI，通过同仓库 PR 合并到 main。
3. 获取远端 main，为选定提交创建标签；例如版本 0.0.1：

```sh
git fetch origin main
git tag -a v0.0.1 origin/main -m 'v0.0.1'
git push origin v0.0.1
```

只有用户明确要求发布时才执行这些命令。创建标签不需要切换离开 dev。不能把 tag 推到尚未进入 main 的提交。

Release 生成 `laull-home-vX.Y.Z.tar.gz` 和对应 `.sha256`，包含 Web `.output`、Server `dist`、配置示例、文档和 `release.json`。同时通过 Docker Buildx 构建 `linux/amd64` 与 `linux/arm64` 双架构容器镜像并推送到 GitHub Packages（`ghcr.io/laull9/laull-home`）。

同一标签重复发布会失败，禁止覆盖已有 Release；网络中断后先检查 GitHub 上的实际状态，不盲目重建标签或删除资产。新版本的修复走 dev 和新标签。

## 使用发布包

在解压目录中复制 `.env.example` 为 `.env`，配置真实 HTTPS 来源。服务器上的 Bun 会加载根目录 `.env`。初始化账号时使用 zsh：

```sh
read -s 'account_password?密码：'
printf '%s' "$account_password" | bun apps/server/dist/create-user.js owner
unset account_password
```

分别启动两个进程，并交由进程管理器托管：

```sh
NODE_ENV=production bun apps/server/dist/index.js
NODE_ENV=production HOST=127.0.0.1 PORT=3000 bun apps/web/.output/server/index.mjs
```

保留完整目录结构，数据默认写入解压根目录的 `data/`。升级时通过绝对路径 `LAULL_HOME_DATABASE_PATH` 指向持久化数据位置，避免每个版本使用一份新库。入口负责 HTTPS，后端保持只监听本机。

## 远程仓库配置

工作流随代码推送生效；本地文件不能自动启用 GitHub 仓库规则。仓库管理员需要配置：

- main：必须走 PR，必须通过 `verify` 状态检查，要求分支为最新状态，禁止强推、删除和绕过规则。首次提交为仓库初始化例外，后续只接受 dev 的 PR。
- dev：禁止强推和删除，允许正常 push，以便推送后触发 CI。
- v* 标签：禁止更新和删除，保留正常创建权限。
- 默认分支设为 main，启用 Actions，允许指定 Action 和发布任务写入 Release。

首次创建仓库时先提交 dev，再用同一初始提交建立远端 main 和 dev，随后启用上述保护。必须先有一次 CI 运行，才能在 GitHub 选择 `verify` 为必需检查。

当前仓库已配置远端 origin 并关联 dev 分支。推送到 GitHub 时需确保远端 main 和 dev 的分支保护及 Actions 权限已按上述要求生效。
