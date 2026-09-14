import { resolve } from 'node:path'

// 服务配置只在后端读取，不向 Nuxt public 配置透传。
export interface ServerConfig {
  // 后端监听地址。
  host: string
  // 后端监听端口。
  port: number
  // SQLite 文件的绝对路径。
  databasePath: string
  // 浏览器访问应用的唯一来源。
  origin: string
  // HTTPS 环境启用安全 Cookie。
  secureCookie: boolean
  // Session 的固定有效时长。
  sessionDays: number
}

// 仓库目录不受启动命令所在目录影响。
const projectRoot = resolve(import.meta.dir, '../../..')

// 校验整数配置，错误配置应阻止启动。
function integer(value: string | undefined, fallback: number, max: number): number {
  const result = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(result) || result < 1 || result > max) throw new Error('整数配置超出范围')
  return result
}

// 从环境读取配置，并拒绝带路径或非 HTTPS 的生产来源。
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const origin = env.LAULL_HOME_ORIGIN ?? 'http://localhost:3000'
  const url = new URL(origin)
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
    throw new Error('LAULL_HOME_ORIGIN 必须为完整来源，不能包含路径或末尾斜杠')
  }
  if (env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('生产环境必须配置 HTTPS 来源')
  }
  return {
    host: env.LAULL_HOME_HOST ?? '127.0.0.1',
    port: integer(env.LAULL_HOME_PORT, 3001, 65535),
    databasePath: resolve(projectRoot, env.LAULL_HOME_DATABASE_PATH ?? 'data/laull-home.db'),
    origin,
    secureCookie: url.protocol === 'https:',
    sessionDays: integer(env.LAULL_HOME_SESSION_DAYS, 90, 365),
  }
}
