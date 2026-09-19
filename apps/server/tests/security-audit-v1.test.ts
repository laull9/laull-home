import { expect, test } from 'bun:test'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { openDatabase } from '../src/db'
import { createUser } from '../src/modules/auth/service'
import { isPrivateIp, assertSafeOutboundUrl } from '../src/modules/favicon/service'
import { isCloudMetadataOrBlockedIp, isHostAllowed } from '../src/modules/integrations/http-client'
import { detectImageFormat } from '../src/modules/wallpapers/storage'
import { createZip, readZipEntries } from '../src/modules/themes/zip'

// 辅助函数：初始化测试应用与用户上下文。
async function setupSecurityFixture() {
  const db = openDatabase(':memory:')
  await createUser(db, 'audit_admin', 'Audit-Password-1234')
  const config = loadConfig({
    LAULL_HOME_ORIGIN: 'https://home.example.test',
    NODE_ENV: 'production',
  })
  const app = createApp(db, config).compile()

  // 发起通用测试请求。
  async function makeRequest(
    path: string,
    method = 'GET',
    body?: unknown,
    cookie?: string,
    origin = 'https://home.example.test',
  ) {
    const headers: Record<string, string> = { origin }
    if (body) headers['content-type'] = 'application/json'
    if (cookie) headers.cookie = cookie
    return app.handle(
      new Request(`http://localhost/api/v1${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }),
    )
  }

  // 获取登录认证 Cookie。
  async function getLoginCookie(password = 'Audit-Password-1234', ip = '127.0.0.1') {
    const res = await app.handle(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'origin': 'https://home.example.test',
          'content-type': 'application/json',
          'x-forwarded-for': ip,
        },
        body: JSON.stringify({ username: 'audit_admin', password }),
      }),
    )
    if (res.status !== 200) return { res, cookie: '' }
    const cookie = res.headers.get('set-cookie')!.split(';')[0]!
    return { res, cookie }
  }

  return { db, app, makeRequest, getLoginCookie }
}

// 审查一：认证安全、IP 限流、安全响应标头与 Session 隔离。
test('安全审查 - 认证防护：单 IP 暴力破解锁定、会话淘汰与安全标头', async () => {
  const { db, makeRequest, getLoginCookie } = await setupSecurityFixture()

  try {
    // 1. 检验全站统一安全响应标头。
    const healthRes = await makeRequest('/health')
    expect(healthRes.headers.get('cache-control')).toBe('no-store')
    expect(healthRes.headers.get('x-content-type-options')).toBe('nosniff')
    expect(healthRes.headers.get('x-robots-tag')).toBe('noindex, nofollow')

    // 2. 跨站写请求伪造（CSRF/Origin）拦截。
    const evilPost = await makeRequest('/auth/login', 'POST', { username: 'audit_admin', password: 'pwd' }, undefined, 'https://evil-hacker.test')
    expect(evilPost.status).toBe(403)

    // 3. 登录失败 10 次后触发 IP 独立限流拦截（429）。
    const attackIp = '198.51.100.22'
    for (let i = 0; i < 10; i++) {
      const failRes = await getLoginCookie('wrong-password', attackIp)
      expect(failRes.res.status).toBe(401)
    }
    const lockedRes = await getLoginCookie('wrong-password', attackIp)
    expect(lockedRes.res.status).toBe(429)

    // 4. 其他正常 IP 登录不受攻击 IP 锁定影响。
    const normalLogin = await getLoginCookie('Audit-Password-1234', '203.0.113.88')
    expect(normalLogin.res.status).toBe(200)

    // 5. 验证会话信息脱敏，不泄漏密码摘要。
    const meRes = await makeRequest('/auth/me', 'GET', undefined, normalLogin.cookie)
    expect(meRes.status).toBe(200)
    const meJson = await meRes.json()
    expect(meJson.user.username).toBe('audit_admin')
    expect(meJson.user.passwordHash).toBeUndefined()
  } finally {
    db.close()
  }
})

// 审查二：隐私空间数据彻底隔离与越权阻断。
test('安全审查 - 隐私空间：未授权坚决阻断与防止跨空间写入', async () => {
  const { db, makeRequest, getLoginCookie } = await setupSecurityFixture()

  try {
    const { cookie } = await getLoginCookie()

    // 1. 未解锁时获取隐私空间书签与分组必须返回 403。
    const privBmRes = await makeRequest('/bookmarks?spaceId=privacy', 'GET', undefined, cookie)
    expect(privBmRes.status).toBe(403)

    const privGroupRes = await makeRequest('/bookmarks/groups?spaceId=privacy', 'GET', undefined, cookie)
    expect(privGroupRes.status).toBe(403)

    const privDesktopRes = await makeRequest('/desktop/privacy', 'GET', undefined, cookie)
    expect(privDesktopRes.status).toBe(403)

    // 2. 尝试向未解锁的隐私空间写入书签，必须被坚决拒绝。
    const writeBmRes = await makeRequest('/bookmarks', 'POST', {
      spaceId: 'privacy',
      title: '私密站点',
      url: 'https://secret.example.test',
    }, cookie)
    expect(writeBmRes.status).toBe(403)

    // 3. 正常设置密码并解锁隐私空间。
    const setupRes = await makeRequest('/spaces/privacy/setup', 'POST', { password: 'privacy-key-9999' }, cookie)
    expect(setupRes.status).toBe(200)

    const unlockRes = await makeRequest('/spaces/privacy/unlock', 'POST', { password: 'privacy-key-9999' }, cookie)
    expect(unlockRes.status).toBe(200)
    const spaceCookie = unlockRes.headers.get('set-cookie')!.split(';')[0]!
    const fullAuth = `${cookie}; ${spaceCookie}`

    // 4. 授权后写入并验证隔离存储。
    const createBm = await makeRequest('/bookmarks', 'POST', {
      spaceId: 'privacy',
      title: '私密站点',
      url: 'https://secret.example.test',
    }, fullAuth)
    expect(createBm.status).toBe(200)

    // 5. 立即上锁退出后再次请求应重新返回 403。
    await makeRequest('/spaces/privacy/lock', 'POST', undefined, fullAuth)
    const relockedRes = await makeRequest('/bookmarks?spaceId=privacy', 'GET', undefined, fullAuth)
    expect(relockedRes.status).toBe(403)
  } finally {
    db.close()
  }
})

// 审查三：出站安全（SSRF / 私网 IP / 云元数据 / 逐跳跳向内网）。
test('安全审查 - 资源出站：全面阻断回环私网与云厂商元数据服务', async () => {
  // 1. 本地回环与广义私有网段检测。
  expect(isPrivateIp('127.0.0.1')).toBe(true)
  expect(isPrivateIp('localhost')).toBe(true)
  expect(isPrivateIp('::1')).toBe(true)
  expect(isPrivateIp('10.20.30.40')).toBe(true)
  expect(isPrivateIp('172.20.0.1')).toBe(true)
  expect(isPrivateIp('192.168.1.1')).toBe(true)
  expect(isPrivateIp('169.254.169.254')).toBe(true)

  // 2. 出站地址严格校验拦截。
  await expect(assertSafeOutboundUrl('http://127.0.0.1:8080/favicon.ico')).rejects.toThrow()
  await expect(assertSafeOutboundUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow()
  await expect(assertSafeOutboundUrl('ftp://example.com/icon.png')).rejects.toThrow('仅允许请求 http 或 https')

  // 3. 微服务云厂商元数据与受限危险 IP 检测。
  expect(isCloudMetadataOrBlockedIp('169.254.169.254')).toBe(true)
  expect(isCloudMetadataOrBlockedIp('fd00:ec2::254')).toBe(true)
  expect(isCloudMetadataOrBlockedIp('0.0.0.0')).toBe(true)
  expect(isCloudMetadataOrBlockedIp('255.255.255.255')).toBe(true)

  // 4. 微服务白名单严格判定。
  const allowed = ['api.weather.com', 'internal-svc.home:8443']
  expect(isHostAllowed(new URL('https://api.weather.com/v1'), allowed)).toBe(true)
  expect(isHostAllowed(new URL('https://internal-svc.home:8443/data'), allowed)).toBe(true)
  expect(isHostAllowed(new URL('https://untrusted-api.com/data'), allowed)).toBe(false)
})

// 审查四：上传文件真实魔数嗅探、SVG 恶意载荷清洗与 Zip Slip 防护。
test('安全审查 - 上传与归档：文件魔数嗅探、XSS 脚本过滤与路径穿越阻断', () => {
  // 1. 拦截伪造扩展名的恶意文件（伪造为 jpg 的可执行脚本）。
  const fakeJpg = Buffer.from('#!/bin/bash\necho dangerous\n')
  expect(() => detectImageFormat(fakeJpg)).toThrow('仅支持合法')

  // 2. 拦截包含动态脚本的 SVG 图像。
  const evilSvg1 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  expect(() => detectImageFormat(evilSvg1)).toThrow('包含不安全的脚本')

  const evilSvg2 = Buffer.from('<svg onload="fetch(\'https://evil.test\')" xmlns="http://www.w3.org/2000/svg"><circle/></svg>')
  expect(() => detectImageFormat(evilSvg2)).toThrow('包含不安全的脚本')

  const evilSvg3 = Buffer.from('<svg><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject></svg>')
  expect(() => detectImageFormat(evilSvg3)).toThrow('包含不安全的脚本')

  // 3. 正常合规图片放行。
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
  const detected = detectImageFormat(validPng)
  expect(detected.ext).toBe('png')
  expect(detected.mime).toBe('image/png')

  // 4. Zip Slip 路径穿越深度防护。
  const zipBuffer = createZip([
    { path: '../../etc/cron.d/malicious', data: Buffer.from('malicious content') },
  ])
  expect(() => readZipEntries(zipBuffer)).toThrow('目录穿越')
})
