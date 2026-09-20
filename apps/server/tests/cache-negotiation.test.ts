import { afterEach, describe, expect, test } from 'bun:test'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { openDatabase, type AppDatabase } from '../src/db'
import { createUser } from '../src/modules/auth/service'

// 测试使用独立内存数据库。
const databases: AppDatabase[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })

// 初始化独立测试固定装置。
async function fixture() {
  const db = openDatabase(':memory:')
  databases.push(db)
  await createUser(db, 'owner', 'test-password-123')
  const app = createApp(db, loadConfig({})).compile()

  // 发起真实请求经过生命周期与响应头拦截。
  async function request(path: string, method = 'GET', body?: unknown, cookie?: string, extraHeaders?: Record<string, string>) {
    const headers: Record<string, string> = {
      origin: 'http://localhost:3000',
      ...extraHeaders,
    }
    if (body) headers['content-type'] = 'application/json'
    if (cookie) headers.cookie = cookie
    return app.handle(new Request(`http://localhost/api/v1${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }))
  }

  // 登录获取会话凭据。
  async function login() {
    const res = await request('/auth/login', 'POST', { username: 'owner', password: 'test-password-123' })
    expect(res.status).toBe(200)
    return res.headers.get('set-cookie')!.split(';')[0]!
  }

  return { db, request, login }
}

describe('全功能本地缓存能力与协商缓存验证', () => {
  test('普通空间桌面接口支持 ETag 与 304 协商缓存，隐私空间严格 no-store', async () => {
    const { request, login } = await fixture()
    const sessionCookie = await login()

    // 1. 普通空间首次读取：应返回 200，并带上 ETag 与 private, no-cache 缓存标头
    const resDefault = await request('/desktop/default', 'GET', undefined, sessionCookie)
    expect(resDefault.status).toBe(200)
    const etag = resDefault.headers.get('etag')
    expect(etag).toBeTruthy()
    expect(etag?.startsWith('W/"desktop-default-')).toBe(true)
    expect(resDefault.headers.get('cache-control')).toBe('private, no-cache')

    // 2. 带上相同 ETag 发起条件请求：应直接返回 304 Not Modified 且响应体为空
    const res304 = await request('/desktop/default', 'GET', undefined, sessionCookie, { 'if-none-match': etag! })
    expect(res304.status).toBe(304)
    expect(await res304.text()).toBe('')

    // 3. 隐私空间初始化密码并解锁后读取：必须返回 no-store，绝不提供持久或协商缓存
    await request('/spaces/privacy/setup', 'POST', { password: 'privacy-pass-123' }, sessionCookie)
    const unlockRes = await request('/spaces/privacy/unlock', 'POST', { password: 'privacy-pass-123' }, sessionCookie)
    const spaceCookie = unlockRes.headers.get('set-cookie')!.split(';')[0]!
    const combinedCookie = `${sessionCookie}; ${spaceCookie}`

    const resPrivacy = await request('/desktop/privacy', 'GET', undefined, combinedCookie)
    expect(resPrivacy.status).toBe(200)
    expect(resPrivacy.headers.get('cache-control')).toBe('no-store')
  })

  test('外观设置接口支持 ETag 协商缓存', async () => {
    const { request, login } = await fixture()
    const sessionCookie = await login()

    // 首次获取设置
    const res = await request('/settings', 'GET', undefined, sessionCookie)
    expect(res.status).toBe(200)
    const etag = res.headers.get('etag')
    expect(etag).toBeTruthy()
    expect(etag?.startsWith('W/"settings-')).toBe(true)
    expect(res.headers.get('cache-control')).toBe('private, no-cache')

    // 条件请求命中 304
    const res304 = await request('/settings', 'GET', undefined, sessionCookie, { 'if-none-match': etag! })
    expect(res304.status).toBe(304)
  })

  test('搜索引擎列表接口支持 ETag 协商缓存', async () => {
    const { request, login } = await fixture()
    const sessionCookie = await login()

    // 首次读取搜索引擎列表
    const res = await request('/search/engines', 'GET', undefined, sessionCookie)
    expect(res.status).toBe(200)
    const etag = res.headers.get('etag')
    expect(etag).toBeTruthy()
    expect(etag?.startsWith('W/"engines-')).toBe(true)

    // 条件请求命中 304
    const res304 = await request('/search/engines', 'GET', undefined, sessionCookie, { 'if-none-match': etag! })
    expect(res304.status).toBe(304)
  })

  test('普通空间书签与分组支持 ETag 协商，隐私空间书签强制 no-store', async () => {
    const { request, login } = await fixture()
    const sessionCookie = await login()

    // 1. 普通空间书签与分组
    const groupsRes = await request('/bookmarks/groups?spaceId=default', 'GET', undefined, sessionCookie)
    expect(groupsRes.status).toBe(200)
    const groupsEtag = groupsRes.headers.get('etag')
    expect(groupsEtag).toBeTruthy()
    expect(groupsRes.headers.get('cache-control')).toBe('private, no-cache')

    const groups304 = await request('/bookmarks/groups?spaceId=default', 'GET', undefined, sessionCookie, { 'if-none-match': groupsEtag! })
    expect(groups304.status).toBe(304)

    const bmRes = await request('/bookmarks?spaceId=default', 'GET', undefined, sessionCookie)
    expect(bmRes.status).toBe(200)
    const bmEtag = bmRes.headers.get('etag')
    expect(bmEtag).toBeTruthy()

    const bm304 = await request('/bookmarks?spaceId=default', 'GET', undefined, sessionCookie, { 'if-none-match': bmEtag! })
    expect(bm304.status).toBe(304)

    // 2. 隐私空间书签必须返回 no-store
    await request('/spaces/privacy/setup', 'POST', { password: 'privacy-pass-123' }, sessionCookie)
    const unlockRes = await request('/spaces/privacy/unlock', 'POST', { password: 'privacy-pass-123' }, sessionCookie)
    const spaceCookie = unlockRes.headers.get('set-cookie')!.split(';')[0]!
    const combinedCookie = `${sessionCookie}; ${spaceCookie}`

    const privacyGroupsRes = await request('/bookmarks/groups?spaceId=privacy', 'GET', undefined, combinedCookie)
    expect(privacyGroupsRes.status).toBe(200)
    expect(privacyGroupsRes.headers.get('cache-control')).toBe('no-store')

    const privacyBmRes = await request('/bookmarks?spaceId=privacy', 'GET', undefined, combinedCookie)
    expect(privacyBmRes.status).toBe(200)
    expect(privacyBmRes.headers.get('cache-control')).toBe('no-store')
  })
})
