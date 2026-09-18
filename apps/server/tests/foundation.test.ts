import { DEFAULT_THEME } from '@laull-home/shared'
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { openDatabase, type AppDatabase } from '../src/db'
import { loginThrottle, schemaMigrations, sessions, users } from '../src/db/schema'
import { migrations } from '../src/db/migrations'
import { createUser, ensureInitialUser, hashToken } from '../src/modules/auth/service'

// 测试使用独立内存数据库，绝不访问本地账号。
const databases: AppDatabase[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })

// 每个场景创建隔离的 API 与账号。
async function fixture() {
  const db = openDatabase(':memory:')
  databases.push(db)
  await createUser(db, 'owner', 'test-password-123')
  const app = createApp(db, loadConfig({})).compile()
  // 使用真实 Request 经过全部 Elysia 生命周期。
  async function request(path: string, method = 'GET', body?: unknown, cookie?: string, origin?: string, referer?: string) {
    const headers: Record<string, string> = {}
    if (origin !== undefined) headers.origin = origin
    else headers.origin = 'http://localhost:3000'
    if (referer !== undefined) headers.referer = referer
    if (body) headers['content-type'] = 'application/json'
    if (cookie) headers.cookie = cookie
    return app.handle(new Request(`http://localhost/api/v1${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }))
  }
  // 从登录响应提取浏览器发送的 Cookie 部分。
  async function login(customOrigin = 'http://localhost:3000') {
    const response = await request('/auth/login', 'POST', { username: 'owner', password: 'test-password-123' }, undefined, customOrigin)
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
      expect(db.select().from(users).all()).toHaveLength(1)
      expect(db.select().from(schemaMigrations).all()).toHaveLength(migrations.length)
      expect(() => db.insert(sessions).values({ tokenHash: 'invalid', userId: 999, createdAt: 1, expiresAt: 2 }).run()).toThrow()
      db.update(schemaMigrations).set({ checksum: 'changed' }).run()
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
    expect(db.select({ tokenHash: sessions.tokenHash }).from(sessions).get()!.tokenHash).toBe(hashToken(token))
    expect(db.select({ passwordHash: users.passwordHash }).from(users).get()!.passwordHash).toStartWith('$argon2id$')
    expect(await (await request('/auth/me', 'GET', undefined, cookie)).json()).toEqual({ user: { id: 1, username: 'owner', isDefaultPassword: false } })
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
    db.update(sessions).set({ expiresAt: 0 }).run()
    expect((await request('/auth/me', 'GET', undefined, second.cookie)).status).toBe(401)
  })

  test('来源安全校验：兼容 127.0.0.1 与 localhost 回环，阻断跨站与伪造端口', async () => {
    const { request, login } = await fixture()
    // 1. 跨站恶意域名必须被坚决拦截 (403)
    const evilRes = await request('/auth/login', 'POST', { username: 'owner', password: 'test-password-123' }, undefined, 'https://evil.test')
    expect(evilRes.status).toBe(403)

    // 2. 伪造错误端口来源必须被拦截 (403)
    const wrongPortRes = await request('/auth/login', 'POST', { username: 'owner', password: 'test-password-123' }, undefined, 'http://127.0.0.1:9999')
    expect(wrongPortRes.status).toBe(403)

    // 3. 兼容 127.0.0.1:3000 本地开发来源登录成功 (200)
    const loopbackRes = await request('/auth/login', 'POST', { username: 'owner', password: 'test-password-123' }, undefined, 'http://127.0.0.1:3000')
    expect(loopbackRes.status).toBe(200)

    // 4. 兼容 localhost:3000 登录成功 (200)
    const { cookie } = await login('http://localhost:3000')

    // 5. 使用 127.0.0.1:3000 执行受保护写入成功 (200)
    const updateRes = await request('/settings', 'PUT', { revision: 0, title: '测试127', appearance: 'light' }, cookie, 'http://127.0.0.1:3000')
    expect(updateRes.status).toBe(200)

    // 6. 无 Origin 但携带受信任 Referer 登录成功 (200)
    const refererRes = await request('/auth/login', 'POST', { username: 'owner', password: 'test-password-123' }, undefined, '', 'http://127.0.0.1:3000/login')
    expect(refererRes.status).toBe(200)

    // 7. GET 请求不受 Origin 限制 (200)
    expect((await request('/auth/me', 'GET', undefined, cookie, 'https://evil.test')).status).toBe(200)
  })

  test('验证字段并以版本号阻止设置覆盖', async () => {
    const { request, login } = await fixture()
    const { cookie } = await login()
    const setting = { revision: 0, title: '工作台', appearance: 'dark', themeId: 'default', wallpaperType: 'none', wallpaperValue: '', wallpaperAutoRotate: false, wallpaperRotateInterval: 60, activeWallpaperPoolId: null, wallpaperFitMode: 'cover', customCss: 'body { font-size: 14px; }', allowDragWithoutEdit: true }
    expect((await request('/settings', 'PUT', { ...setting, appearance: 'unknown' }, cookie)).status).toBe(400)
    expect((await request('/settings', 'PUT', { ...setting, customCss: 'a'.repeat(32769) }, cookie)).status).toBe(400)
    const saved = await request('/settings', 'PUT', setting, cookie)
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({ ...setting, revision: 1, themeConfig: DEFAULT_THEME })
    expect((await request('/settings', 'PUT', setting, cookie)).status).toBe(409)
    expect(await (await request('/settings', 'GET', undefined, cookie)).json()).toEqual({ ...setting, revision: 1, themeConfig: DEFAULT_THEME })

    // 支持关闭非编辑模式拖动并递增版本保存
    const disabledDragRes = await request('/settings', 'PUT', { ...setting, revision: 1, allowDragWithoutEdit: false }, cookie)
    expect(disabledDragRes.status).toBe(200)
    const disabledJson = await disabledDragRes.json()
    expect(disabledJson.allowDragWithoutEdit).toBe(false)
    expect(disabledJson.revision).toBe(2)
    const reloaded = await (await request('/settings', 'GET', undefined, cookie)).json()
    expect(reloaded.allowDragWithoutEdit).toBe(false)
  })

  test('登录尝试计数持久化且窗口结束后恢复', async () => {
    const { db, request } = await fixture()
    db.insert(loginThrottle).values({ ip: '127.0.0.1', attempts: 10, windowEnd: Date.now() + 60_000 })
      .onConflictDoUpdate({ target: loginThrottle.ip, set: { attempts: 10, windowEnd: Date.now() + 60_000 } }).run()
    const body = { username: 'owner', password: 'wrong-password-123' }
    expect((await request('/auth/login', 'POST', body)).status).toBe(429)
    db.update(loginThrottle).set({ windowEnd: 0 }).where(eq(loginThrottle.ip, '127.0.0.1')).run()
    expect((await request('/auth/login', 'POST', body)).status).toBe(401)
    expect(db.select({ attempts: loginThrottle.attempts }).from(loginThrottle).where(eq(loginThrottle.ip, '127.0.0.1')).get()!.attempts).toBe(1)
  })

  test('空数据库自动生成初始 admin/admin 账号、登录与初始密码提示', async () => {
    const memDb = openDatabase(':memory:')
    databases.push(memDb)
    expect(memDb.select().from(users).all()).toHaveLength(0)

    const first = await ensureInitialUser(memDb)
    expect(first.created).toBe(true)
    expect(first.username).toBe('admin')
    expect(first.password).toBe('admin')

    const userList = memDb.select().from(users).all()
    expect(userList).toHaveLength(1)
    expect(userList[0]!.username).toBe('admin')

    const second = await ensureInitialUser(memDb)
    expect(second.created).toBe(false)

    // 使用初始凭据登录
    const app = createApp(memDb, loadConfig({})).compile()
    const loginRes = await app.handle(new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    }))
    expect(loginRes.status).toBe(200)
    const loginData = await loginRes.json() as { user: { id: number; username: string; isDefaultPassword?: boolean } }
    expect(loginData.user.isDefaultPassword).toBe(true)
    const cookie = loginRes.headers.get('set-cookie')!.split(';')[0]!

    // /auth/me 也携带 isDefaultPassword: true
    const meRes = await app.handle(new Request('http://localhost/api/v1/auth/me', {
      method: 'GET',
      headers: { origin: 'http://localhost:3000', cookie },
    }))
    expect(meRes.status).toBe(200)
    expect((await meRes.json() as { user: { isDefaultPassword: boolean } }).user.isDefaultPassword).toBe(true)

    // 少于 5 位的新密码被校验拦截 (400)
    const tooShortRes = await app.handle(new Request('http://localhost/api/v1/auth/change-password', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', cookie },
      body: JSON.stringify({ oldPassword: 'admin', newPassword: '1234' }),
    }))
    expect(tooShortRes.status).toBe(400)
    const tooShortData = await tooShortRes.json() as { code: string; message: string }
    expect(tooShortData.code).toBe('REQUEST_ERROR')
    expect(tooShortData.message).toContain('5')

    // 5 位有效新密码支持正常修改 (200)，且修改后 isDefaultPassword 变为 false
    const changeRes = await app.handle(new Request('http://localhost/api/v1/auth/change-password', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', cookie },
      body: JSON.stringify({ oldPassword: 'admin', newPassword: '12345' }),
    }))
    expect(changeRes.status).toBe(200)
    const newCookie = changeRes.headers.get('set-cookie')!.split(';')[0]!

    const meAfterRes = await app.handle(new Request('http://localhost/api/v1/auth/me', {
      method: 'GET',
      headers: { origin: 'http://localhost:3000', cookie: newCookie },
    }))
    expect(meAfterRes.status).toBe(200)
    expect((await meAfterRes.json() as { user: { isDefaultPassword: boolean } }).user.isDefaultPassword).toBe(false)
  })

  test('修改用户名成功与校验拦截', async () => {
    const { request, login } = await fixture()
    // 未登录时拒绝修改
    expect((await request('/auth/change-username', 'POST', { newUsername: 'valid_user' })).status).toBe(401)

    const { cookie } = await login()
    // 格式不合法拒绝
    expect((await request('/auth/change-username', 'POST', { newUsername: 'invalid user!' }, cookie)).status).toBe(400)
    expect((await request('/auth/change-username', 'POST', { newUsername: '' }, cookie)).status).toBe(400)

    // 成功修改
    const okRes = await request('/auth/change-username', 'POST', { newUsername: 'my_new_name' }, cookie)
    expect(okRes.status).toBe(200)

    // 查询当前身份已更新
    const meRes = await request('/auth/me', 'GET', undefined, cookie)
    expect(meRes.status).toBe(200)
    expect((await meRes.json() as { user: { username: string } }).user.username).toBe('my_new_name')
  })
})
