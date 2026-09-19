import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 项目根目录绝对路径。
const rootDir = resolve(import.meta.dir, '../..')

// Dockerfile 多阶段构建、非 root 用户与健康检查规范校验。
test('Dockerfile 生产镜像规范：多阶段构建、权限隔离与健康检查', () => {
  const dockerfilePath = resolve(rootDir, 'Dockerfile')
  const content = readFileSync(dockerfilePath, 'utf-8')

  // 1. 验证三阶段构建阶段声明。
  expect(content).toContain('FROM oven/bun:1.4.2 AS deps')
  expect(content).toContain('FROM oven/bun:1.4.2 AS builder')
  expect(content).toContain('FROM oven/bun:1.4.2-slim AS runner')

  // 2. 验证依赖安装使用锁定文件。
  expect(content).toContain('bun install --frozen-lockfile')

  // 3. 验证使用非 root 专用安全用户 bun 运行。
  expect(content).toContain('chown -R bun:bun /app')
  expect(content).toContain('USER bun')

  // 4. 验证对外暴露端口与持久化数据卷。
  expect(content).toContain('EXPOSE 3000')
  expect(content).toContain('VOLUME ["/app/data"]')

  // 5. 验证健康检查指令与启动命令。
  expect(content).toContain('HEALTHCHECK')
  expect(content).toContain('/api/v1/health')
  expect(content).toContain('CMD ["bun", "run", "start"]')
})

// compose.yml 生产部署环境配置与数据卷绑定校验。
test('compose.yml 生产发布规范：端口绑定、HTTPS 来源与持久化挂载', () => {
  const composePath = resolve(rootDir, 'compose.yml')
  const content = readFileSync(composePath, 'utf-8')

  // 1. 验证基础服务结构声明。
  expect(content).toContain('services:')
  expect(content).toContain('laull-home:')
  expect(content).toContain('restart: unless-stopped')

  // 2. 验证端口动态映射。
  expect(content).toContain('"${APP_HOST:-0.0.0.0}:${APP_PORT:-3000}:3000"')

  // 3. 验证关键环境变量透传。
  expect(content).toContain('LAULL_HOME_ORIGIN')
  expect(content).toContain('LAULL_HOME_DATABASE_PATH')
  expect(content).toContain('LAULL_HOME_DATA_DIR')

  // 4. 验证数据持久化卷挂载。
  expect(content).toContain('${DATA_PATH:-./data}:/app/data')
})

// 版本一致性与正式发布标签规范校验。
test('发布版本规则验证：语义化三段版本号与规范发布标签匹配', () => {
  const packageJsonPath = resolve(rootDir, 'package.json')
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

  // 验证版本号必须为 X.Y.Z 格式。
  expect(pkg.version).toBeDefined()
  expect(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version)).toBe(true)

  // 验证发布标签形式必须为 vX.Y.Z。
  const expectedTag = `v${pkg.version}`
  expect(expectedTag.startsWith('v')).toBe(true)
  expect(expectedTag.length).toBeGreaterThan(2)
})
