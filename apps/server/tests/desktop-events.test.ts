import { afterEach, describe, expect, test } from 'bun:test'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { openDatabase, type AppDatabase } from '../src/db'
import { createUser } from '../src/modules/auth/service'
import { clearActiveClients, getActiveClientsCount } from '../src/modules/mcp/events'

// 数据库与长连接测试隔离集合。
const databases: AppDatabase[] = []
afterEach(() => {
  clearActiveClients()
  for (const db of databases.splice(0)) db.close()
})

// 创建测试用例脚手架。
async function fixture() {
  const db = openDatabase(':memory:')
  databases.push(db)
  await createUser(db, 'owner', 'test-password-123')
  const app = createApp(db, loadConfig({})).compile()

  async function request(path: string, method = 'GET', body?: unknown, cookie?: string, origin = 'http://localhost:3000') {
    return app.handle(new Request('http://localhost/api/v1' + path, {
      method,
      headers: {
        origin,
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }))
  }

  async function login() {
    const response = await request('/auth/login', 'POST', { username: 'owner', password: 'test-password-123' })
    expect(response.status).toBe(200)
    return { response, cookie: response.headers.get('set-cookie')!.split(';')[0]! }
  }

  return { db, request, login }
}

describe('SSE 授权、事务后通知、心跳保活与连接释放', () => {
  test('未登录访问长连接返回 401，且不计入活跃客户端', async () => {
    const { request } = await fixture()
    const anonRes = await request('/desktop/events')
    expect(anonRes.status).toBe(401)
    expect(getActiveClientsCount()).toBe(0)
  })

  test('已登录用户可建立 SSE 连接，接收首帧 keepalive 并成功释放连接', async () => {
    const { request, login } = await fixture()
    const { cookie } = await login()

    const sseRes = await request('/desktop/events', 'GET', undefined, cookie)
    expect(sseRes.status).toBe(200)
    expect(sseRes.headers.get('content-type')).toContain('text/event-stream')
    expect(getActiveClientsCount()).toBe(1)

    // 读取首个注释帧。
    const reader = sseRes.body!.getReader()
    const { value: firstChunk } = await reader.read()
    const text = new TextDecoder().decode(firstChunk)
    expect(text).toContain(': keepalive\n\n')

    // 取消读取模拟客户端正常关闭或断开连接。
    await reader.cancel()
    // 等待流 cancel 异步回调完成。
    await new Promise((r) => setTimeout(r, 20))
    expect(getActiveClientsCount()).toBe(0)
  })

  test('写操作事务成功后向已连接的客户端广播对应事件', async () => {
    const { request, login } = await fixture()
    const { cookie } = await login()

    const sseRes = await request('/desktop/events', 'GET', undefined, cookie)
    expect(sseRes.status).toBe(200)
    const reader = sseRes.body!.getReader()

    // 消耗首个保活帧。
    await reader.read()

    // 1. 更新设置触发 theme.updated。
    const setRes = await request('/settings', 'PUT', { revision: 0, title: '新主页标题', appearance: 'dark' }, cookie)
    expect(setRes.status).toBe(200)
    const { value: chunk1 } = await reader.read()
    const msg1 = new TextDecoder().decode(chunk1)
    expect(msg1).toContain('event: theme.updated')
    expect(msg1).toContain('新主页标题')

    // 2. 新增书签分组触发 widget.updated。
    await request('/bookmarks/groups', 'POST', { spaceId: 'default', name: '常用' }, cookie)
    const { value: chunk2 } = await reader.read()
    const msg2 = new TextDecoder().decode(chunk2)
    expect(msg2).toContain('event: widget.updated')

    // 3. 保存桌面布局触发 layout.updated。
    const curDesktopRes = await request('/desktop/default', 'GET', undefined, cookie)
    expect(curDesktopRes.status).toBe(200)
    const curDesktop = await curDesktopRes.json()
    const saveRes = await request('/desktop/default', 'PUT', curDesktop, cookie)
    expect(saveRes.status).toBe(200)
    const { value: chunk3 } = await reader.read()
    const msg3 = new TextDecoder().decode(chunk3)
    expect(msg3).toContain('event: layout.updated')

    await reader.cancel()
    await new Promise((r) => setTimeout(r, 20))
    expect(getActiveClientsCount()).toBe(0)
  })
})
