import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 仓库根目录定位。
const projectRoot = resolve(import.meta.dir, '../..')

// 校验 compose.yml 端口暴露与数据库细节配置。
test('compose.yml 包含正确的端口暴露与数据库细节声明', () => {
  const composePath = resolve(projectRoot, 'compose.yml')
  const content = readFileSync(composePath, 'utf-8')

  // 校验端口暴露支持宿主机地址与端口动态配置。
  expect(content).toContain('"${APP_HOST:-0.0.0.0}:${APP_PORT:-3000}:3000"')

  // 校验显式包含数据库路径与数据目录环境变量。
  expect(content).toContain('LAULL_HOME_DATABASE_PATH=${LAULL_HOME_DATABASE_PATH:-/app/data/laull-home.db}')
  expect(content).toContain('LAULL_HOME_DATA_DIR=${LAULL_HOME_DATA_DIR:-/app/data}')

  // 校验数据持久化挂载路径支持配置。
  expect(content).toContain('${DATA_PATH:-./data}:/app/data')
})

// 校验 .env.example 包含 Docker 部署关键配置与中文说明。
test('.env.example 包含完整的端口暴露与持久化配置项', () => {
  const envExamplePath = resolve(projectRoot, '.env.example')
  const content = readFileSync(envExamplePath, 'utf-8')

  expect(content).toContain('APP_PORT=3000')
  expect(content).toContain('APP_HOST=0.0.0.0')
  expect(content).toContain('DATA_PATH=./data')
  expect(content).toContain('LAULL_HOME_DATA_DIR=data')
})

// 校验前端支持自动推导后端地址并自动转发所有 /api 请求。
test('前端支持后端内部地址自动推导与无配置转发', () => {
  const nuxtConfigPath = resolve(projectRoot, 'apps/web/nuxt.config.ts')
  const nuxtContent = readFileSync(nuxtConfigPath, 'utf-8')
  // 校验自动根据 LAULL_HOME_HOST 和 LAULL_HOME_PORT 拼接默认通信地址。
  expect(nuxtContent).toContain('LAULL_HOME_HOST')
  expect(nuxtContent).toContain('LAULL_HOME_PORT')

  const proxyPath = resolve(projectRoot, 'apps/web/server/api/[...path].ts')
  const proxyContent = readFileSync(proxyPath, 'utf-8')
  // 校验自动转发，不再硬编码仅限特定子路径。
  expect(proxyContent).toContain('proxyRequest(event, target.href)')
  expect(proxyContent).not.toContain("!path.startsWith('/api/v1/')")
})

