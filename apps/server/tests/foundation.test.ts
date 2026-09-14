import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'bun:sqlite'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { openDatabase } from '../src/db'
import { createUser, hashToken } from '../src/modules/auth/service'

// 测试使用独立内存数据库，绝不访问本地账号。
const databases: Database[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })

// 每个场景创建隔离的 API 与账号。
async function fixture() {
  const db = openDatabase(':memory:')
  databases.push(db)
  await createUser(db, 'owner', 'test-password-123')
  const app = createApp(db, loadConfig({})).compile()
  // 使用真实 Request 经过全部 Elysia 生命周期。
  async function request(path: string, method = 'GET', body?: unknown, cookie?: string, origin = 'http://localhost:3000') {
    return app.handle(new Request(`http://localhost/api/v1${path}`, {
      method,
      headers: { origin, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }))
  }
  // 从登录响应提取浏览器发送的 Cookie 部分。
  async function login() {
    const response = await request('/auth/login', 'POST', { username: 'owner', password: 'test-password-123' })
    expect(response.status).toBe(200)
    return { response, cookie: response.headers.get('set-cookie')!.split(';')[0]! }
  }
  return { db, request, login }
}

describe('配置与迁移', () => {
  test('拒绝错误端口、路径来源与生产 HTTP', () => {
    expect(() => loadConfig({ LAULL_HOME_PORT: '0' })).toThrow()
    expect(() => loadConfig({ LAULL_HOME_ORIGIN: 'https://home.test/path' })).toThrow()
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow()
    expect(loadConfig({ NODE_ENV: 'production', LAULL_HOME_ORIGIN: 'https://home.test' }).secureCookie).toBe(true)
  })

  test('重启持久化并拒绝改写历史迁移', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'laull-home-test-'))
    const path = join(dir, 'test.db')
    let db = openDatabase(path)
    try {
      await createUser(db, 'owner', 'test-password-123')
      db.close()
      db = openDatabase(path)
      expect(db.query('SELECT * FROM users').all()).toHaveLength(1)
      expect(db.query('SELECT * FROM schema_migrations').all()).toHaveLength(1)
      expect(() => db.query('INSERT INTO sessions VALUES (?, 2, 1, 2)').run('invalid')).toThrow()
      db.query('UPDATE schema_migrations SET checksum = ?').run('changed')
      expect(() => openDatabase(path)).toThrow('迁移内容')
    } finally { db.close(); rmSync(dir, { recursive: true }) }
  })
})

describe('认证与设置', () => {
  test('健康检查公开，身份与设置需要登录', async () => {
    const { request } = await fixture()
    expect((await request('/health')).status).toBe(200)
    expect((await request('/auth/me')).status).toBe(401)
    expect((await request('/settings')).status).toBe(401)
    expect((await request('/settings', 'PUT', { revision: 0, title: '主页', appearance: 'dark' })).status).toBe(401)
  })

  test('账号只能初始化一次，密码和 Session 均不存明文', async () => {
    const { db, login, request } = await fixture()
    await expect(createUser(db, 'second', 'test-password-123')).rejects.toThrow('已初始化')
    const { response, cookie } = await login()
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(response.headers.get('set-cookie')).toContain('SameSite=Lax')
    const token = cookie.split('=')[1]!
    expect(db.query<{ token_hash: string }, []>('SELECT token_hash FROM sessions').get()!.token_hash).toBe(hashToken(token))
    expect(db.query<{ password_hash: string }, []>('SELECT password_hash FROM users').get()!.password_hash).toStartWith('$argon2id$')
    expect(await (await request('/auth/me', 'GET', undefined, cookie)).json()).toEqual({ user: { id: 1, username: 'owner' } })
    expect((await request('/auth/logout', 'POST', undefined, cookie)).status).toBe(200)
    expect((await request('/auth/me', 'GET', undefined, cookie)).status).toBe(401)
  })

  test('撤销其他设备并拒绝过期 Session', async () => {
    const { db, request, login } = await fixture()
    const first = await login()
    const second = await login()
    expect((await request('/auth/revoke-others', 'POST', undefined, second.cookie)).status).toBe(200)
    expect((await request('/auth/me', 'GET', undefined, first.cookie)).status).toBe(401)
    expect((await request('/auth/me', 'GET', undefined, second.cookie)).status).toBe(200)
    db.query('UPDATE sessions SET expires_at = 0').run()
    expect((await request('/auth/me', 'GET', undefined, second.cookie)).status).toBe(401)
  })

  test('跨站和缺失 Origin 的写入被拒绝，包括登录', async () => {
    const { request, login } = await fixture()
    const { cookie } = await login()
    expect((await request('/auth/login', 'POST', { username: 'owner', password: 'test-password-123' }, undefined, 'https://evil.test')).status).toBe(403)
    expect((await request('/auth/logout', 'POST', undefined, cookie, '')).status).toBe(403)
    expect((await request('/auth/me', 'GET', undefined, cookie)).status).toBe(200)
  })

  test('验证字段并以版本号阻止设置覆盖', async () => {
    const { request, login } = await fixture()
    const { cookie } = await login()
    const setting = { revision: 0, title: '工作台', appearance: 'dark' }
    expect((await request('/settings', 'PUT', { ...setting, appearance: 'unknown' }, cookie)).status).toBe(400)
    const saved = await request('/settings', 'PUT', setting, cookie)
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ ...setting, revision: 1 })
    expect((await request('/settings', 'PUT', setting, cookie)).status).toBe(409)
    expect(await (await request('/settings', 'GET', undefined, cookie)).json()).toEqual({ ...setting, revision: 1 })
  })

  test('登录尝试计数持久化且窗口结束后恢复', async () => {
    const { db, request } = await fixture()
    db.query('INSERT INTO login_throttle VALUES (1, 10, ?)').run(Date.now() + 60_000)
    const body = { username: 'owner', password: 'wrong-password-123' }
    expect((await request('/auth/login', 'POST', body)).status).toBe(429)
    db.query('UPDATE login_throttle SET window_end = 0').run()
    expect((await request('/auth/login', 'POST', body)).status).toBe(401)
    expect(db.query<{ attempts: number }, []>('SELECT attempts FROM login_throttle').get()!.attempts).toBe(1)
  })
})
