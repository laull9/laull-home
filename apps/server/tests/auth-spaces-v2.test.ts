import { afterEach, describe, expect, test } from 'bun:test'
import type { SessionItem, SpaceItem } from '@laull-home/shared'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { openDatabase, type AppDatabase } from '../src/db'
import { loginThrottle } from '../src/db/schema'
import { createUser, resetPassword } from '../src/modules/auth/service'

// 测试使用独立内存数据库。
const databases: AppDatabase[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })

// 创建隔离的测试上下文。
async function fixture() {
  const db = openDatabase(':memory:')
  databases.push(db)
  await createUser(db, 'owner', 'init-password-123')
  const app = createApp(db, loadConfig({})).compile()
  // 发送模拟 HTTP 请求。
  async function request(path: string, method = 'GET', body?: unknown, cookie?: string, origin = 'http://localhost:3000', userAgent = 'test-agent') {
    return app.handle(new Request(`http://localhost/api/v1${path}`, {
      method,
      headers: {
        origin,
        'user-agent': userAgent,
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }))
  }
  // 执行登录并返回会话 Cookie 与结果。
  async function login(username = 'owner', password = 'init-password-123', userAgent = 'test-agent') {
    const response = await request('/auth/login', 'POST', { username, password }, undefined, undefined, userAgent)
    expect(response.status).toBe(200)
    const setCookie = response.headers.get('set-cookie')!
    return { response, cookie: setCookie.split(';')[0]! }
  }
  return { db, request, login }
}

describe('修改密码与账号恢复', () => {
  test('修改密码需校验旧密码，更新后撤销旧会话并重发当前 Cookie', async () => {
    const { request, login } = await fixture()
    const device1 = await login('owner', 'init-password-123', 'Agent-1')
    const device2 = await login('owner', 'init-password-123', 'Agent-2')

    // 旧密码错误时拒绝。
    const wrong = await request('/auth/change-password', 'POST', {
      oldPassword: 'wrong-password-123',
      newPassword: 'new-password-12345',
    }, device1.cookie)
    expect(wrong.status).toBe(401)

    // 新密码少于 5 位被拦截。
    const tooShort = await request('/auth/change-password', 'POST', {
      oldPassword: 'init-password-123',
      newPassword: 'shrt',
    }, device1.cookie)
    expect(tooShort.status).toBe(400)

    // 正确修改密码。
    const success = await request('/auth/change-password', 'POST', {
      oldPassword: 'init-password-123',
      newPassword: 'new-password-12345',
    }, device1.cookie)
    expect(success.status).toBe(200)
    const newCookie = success.headers.get('set-cookie')!.split(';')[0]!

    // device1 持有新 cookie 仍可访问。
    expect((await request('/auth/me', 'GET', undefined, newCookie)).status).toBe(200)
    // device2 的旧会话被撤销，返回 401。
    expect((await request('/auth/me', 'GET', undefined, device2.cookie)).status).toBe(401)

    // 旧密码无法登录，新密码可以登录。
    expect((await request('/auth/login', 'POST', { username: 'owner', password: 'init-password-123' })).status).toBe(401)
    expect((await request('/auth/login', 'POST', { username: 'owner', password: 'new-password-12345' })).status).toBe(200)
  })

  test('本地恢复命令重置密码、清理所有会话与登录节流', async () => {
    const { db, request, login } = await fixture()
    const device = await login()

    // 触发节流锁定。
    db.insert(loginThrottle).values({ ip: '127.0.0.1', attempts: 10, windowEnd: Date.now() + 600_000 })
      .onConflictDoUpdate({ target: loginThrottle.ip, set: { attempts: 10, windowEnd: Date.now() + 600_000 } }).run()
    expect((await request('/auth/login', 'POST', { username: 'owner', password: 'wrong-password-123' })).status).toBe(429)

    // 执行重置密码。
    await resetPassword(db, 'recovered-password-123')

    // 节流已被清理，直接用新密码登录成功。
    const afterReset = await request('/auth/login', 'POST', { username: 'owner', password: 'recovered-password-123' })
    expect(afterReset.status).toBe(200)

    // 重置前活跃的设备已被撤销。
    expect((await request('/auth/me', 'GET', undefined, device.cookie)).status).toBe(401)
  })
})

describe('设备会话列表与单设备撤销', () => {
  test('获取设备列表并标记当前设备，单设备撤销精准生效', async () => {
    const { request, login } = await fixture()
    const device1 = await login('owner', 'init-password-123', 'Safari on macOS')
    const device2 = await login('owner', 'init-password-123', 'Firefox on Linux')

    // 设备 1 查看会话列表。
    const res1 = await request('/auth/sessions', 'GET', undefined, device1.cookie)
    expect(res1.status).toBe(200)
    const { sessions } = await res1.json() as { sessions: SessionItem[] }
    expect(sessions).toHaveLength(2)

    const current = sessions.find(s => s.isCurrent)
    const other = sessions.find(s => !s.isCurrent)
    expect(current?.userAgent).toBe('Safari on macOS')
    expect(other?.userAgent).toBe('Firefox on Linux')

    // 设备 1 撤销设备 2。
    const revokeRes = await request(`/auth/sessions/${other!.id}`, 'DELETE', undefined, device1.cookie)
    expect(revokeRes.status).toBe(200)

    // 设备 2 访问变为 401。
    expect((await request('/auth/me', 'GET', undefined, device2.cookie)).status).toBe(401)
    // 设备 1 依然有效。
    expect((await request('/auth/me', 'GET', undefined, device1.cookie)).status).toBe(200)

    // 列表仅剩 1 个会话。
    const res2 = await request('/auth/sessions', 'GET', undefined, device1.cookie)
    const { sessions: remaining } = await res2.json() as { sessions: SessionItem[] }
    expect(remaining).toHaveLength(1)
  })
})

describe('空间体系与隐私隔离', () => {
  test('初始化包含默认与隐私空间，支持独立密码设置与短期解锁', async () => {
    const { request, login } = await fixture()
    const { cookie } = await login()

    // 读取初始空间列表。
    const listRes = await request('/spaces', 'GET', undefined, cookie)
    expect(listRes.status).toBe(200)
    const { spaces } = await listRes.json() as { spaces: SpaceItem[] }
    expect(spaces).toHaveLength(2)
    const normal = spaces.find(s => s.type === 'normal')!
    const privacy = spaces.find(s => s.type === 'privacy')!
    expect(normal.isDefault).toBe(true)
    expect(normal.isUnlocked).toBe(true)
    expect(privacy.hasPassword).toBe(false)
    expect(privacy.isUnlocked).toBe(false)

    // 未设置密码时直接解锁拒绝。
    const unlockWithoutSetup = await request('/spaces/privacy/unlock', 'POST', { password: 'privacy-pass-123' }, cookie)
    expect(unlockWithoutSetup.status).toBe(401)

    // 设置独立隐私密码。
    const setupRes = await request('/spaces/privacy/setup', 'POST', { password: 'privacy-pass-123' }, cookie)
    expect(setupRes.status).toBe(200)

    // 密码错误解锁拒绝。
    const wrongUnlock = await request('/spaces/privacy/unlock', 'POST', { password: 'wrong-privacy-pass' }, cookie)
    expect(wrongUnlock.status).toBe(401)

    // 正确解锁获得短期授权 Cookie。
    const unlockRes = await request('/spaces/privacy/unlock', 'POST', { password: 'privacy-pass-123' }, cookie)
    expect(unlockRes.status).toBe(200)
    const spaceSetCookie = unlockRes.headers.get('set-cookie')!
    expect(spaceSetCookie).toContain('lh_space_session')
    const spaceCookie = spaceSetCookie.split(';')[0]!

    // 双 Cookie 访问，隐私空间呈现已解锁状态。
    const fullCookie = `${cookie}; ${spaceCookie}`
    const unlockedList = await (await request('/spaces', 'GET', undefined, fullCookie)).json() as { spaces: SpaceItem[] }
    expect(unlockedList.spaces.find(s => s.type === 'privacy')?.isUnlocked).toBe(true)

    // 主动锁定隐私空间。
    const lockRes = await request('/spaces/privacy/lock', 'POST', undefined, fullCookie)
    expect(lockRes.status).toBe(200)
    expect(lockRes.headers.get('set-cookie')).toContain('Max-Age=0')

    // 锁定后空间回到未解锁状态。
    const lockedList = await (await request('/spaces', 'GET', undefined, fullCookie)).json() as { spaces: SpaceItem[] }
    expect(lockedList.spaces.find(s => s.type === 'privacy')?.isUnlocked).toBe(false)
  })

  test('账号主动退出时同步撤销短期空间授权', async () => {
    const { request, login } = await fixture()
    const { cookie } = await login()
    await request('/spaces/privacy/setup', 'POST', { password: 'privacy-pass-123' }, cookie)
    const unlockRes = await request('/spaces/privacy/unlock', 'POST', { password: 'privacy-pass-123' }, cookie)
    const spaceCookie = unlockRes.headers.get('set-cookie')!.split(';')[0]!
    const fullCookie = `${cookie}; ${spaceCookie}`

    // 执行登出。
    const logoutRes = await request('/auth/logout', 'POST', undefined, fullCookie)
    expect(logoutRes.status).toBe(200)

    // 重新登录后，即使携带先前的 spaceCookie，也无法视为有效隐私授权。
    const newLogin = await login()
    const recheckList = await (await request('/spaces', 'GET', undefined, `${newLogin.cookie}; ${spaceCookie}`)).json() as { spaces: SpaceItem[] }
    expect(recheckList.spaces.find(s => s.type === 'privacy')?.isUnlocked).toBe(false)
  })
})
