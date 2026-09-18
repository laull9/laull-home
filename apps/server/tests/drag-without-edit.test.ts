import { afterEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { openDatabase, type AppDatabase } from '../src/db'
import { userSettings } from '../src/db/schema'
import { createUser } from '../src/modules/auth/service'

// 测试使用独立内存数据库，隔离持久化数据。
const databases: AppDatabase[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })

// 构造测试所需的独立 API 与账号上下文。
async function fixture() {
  const db = openDatabase(':memory:')
  databases.push(db)
  await createUser(db, 'drag-tester', 'test-password-123')
  const app = createApp(db, loadConfig({})).compile()

  // 构造标准 API 请求方法。
  async function request(path: string, method = 'GET', body?: unknown, cookie?: string) {
    const headers: Record<string, string> = {
      origin: 'http://localhost:3000',
    }
    if (body) headers['content-type'] = 'application/json'
    if (cookie) headers.cookie = cookie
    return app.handle(new Request(`http://localhost/api/v1${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }))
  }

  // 登录获取会话凭证。
  async function login() {
    const response = await request('/auth/login', 'POST', { username: 'drag-tester', password: 'test-password-123' })
    expect(response.status).toBe(200)
    return { cookie: response.headers.get('set-cookie')!.split(';')[0]! }
  }

  return { db, request, login }
}

describe('非编辑模式拖拽图标设置项持久化与行为验证', () => {
  // 未认证拦截测试。
  test('未登录读取与更新设置返回 401 拦截', async () => {
    const { request } = await fixture()
    expect((await request('/settings', 'GET')).status).toBe(401)
    expect((await request('/settings', 'PUT', { revision: 0, title: '主页', appearance: 'light', allowDragWithoutEdit: false })).status).toBe(401)
  })

  // 默认配置与读写持久化流程。
  test('初始默认开启，支持关闭持久化并可重新开启', async () => {
    const { db, request, login } = await fixture()
    const { cookie } = await login()

    // 1. 默认读取，allowDragWithoutEdit 必须为 true。
    const initialRes = await request('/settings', 'GET', undefined, cookie)
    expect(initialRes.status).toBe(200)
    const initialSettings = await initialRes.json()
    expect(initialSettings.allowDragWithoutEdit).toBe(true)

    // 2. 数据库底层默认列值验证为 1。
    const dbRow = db.select({
      allow: userSettings.allowDragWithoutEdit,
    }).from(userSettings).where(eq(userSettings.userId, 1)).get()
    expect(dbRow?.allow).toBe(1)

    // 3. 无效数据类型拒绝（非 boolean）。
    const invalidRes = await request('/settings', 'PUT', {
      ...initialSettings,
      allowDragWithoutEdit: 'invalid_boolean',
    }, cookie)
    expect(invalidRes.status).toBe(400)

    // 4. 用户关闭该配置。
    const updateRes = await request('/settings', 'PUT', {
      ...initialSettings,
      allowDragWithoutEdit: false,
    }, cookie)
    expect(updateRes.status).toBe(200)
    const updatedSettings = await updateRes.json()
    expect(updatedSettings.allowDragWithoutEdit).toBe(false)
    expect(updatedSettings.revision).toBe(initialSettings.revision + 1)

    // 5. 数据库底层验证已变为 0。
    const dbRowDisabled = db.select({
      allow: userSettings.allowDragWithoutEdit,
    }).from(userSettings).where(eq(userSettings.userId, 1)).get()
    expect(dbRowDisabled?.allow).toBe(0)

    // 6. 重新 GET 读取确认持久化值为 false。
    const reloadedRes = await request('/settings', 'GET', undefined, cookie)
    expect(reloadedRes.status).toBe(200)
    const reloadedSettings = await reloadedRes.json()
    expect(reloadedSettings.allowDragWithoutEdit).toBe(false)

    // 7. 再次开启该配置，验证可恢复为 true。
    const reEnableRes = await request('/settings', 'PUT', {
      ...reloadedSettings,
      allowDragWithoutEdit: true,
    }, cookie)
    expect(reEnableRes.status).toBe(200)
    const reEnabledSettings = await reEnableRes.json()
    expect(reEnabledSettings.allowDragWithoutEdit).toBe(true)

    const dbRowReEnabled = db.select({
      allow: userSettings.allowDragWithoutEdit,
    }).from(userSettings).where(eq(userSettings.userId, 1)).get()
    expect(dbRowReEnabled?.allow).toBe(1)
  })
})
