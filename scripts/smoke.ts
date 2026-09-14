import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Buffer } from 'node:buffer'

// 由系统分配测试端口，避免占用正常开发端口。
function freePort(): number {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() })
  const port = server.port!
  server.stop(true)
  return port
}

// 断言失败即退出，让构建产物问题阻止 CI 通过。
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

// 测试数据全部位于系统临时目录。
const folder = mkdtempSync(join(tmpdir(), 'laull-smoke-'))
// Web 与 API 使用不同的临时端口。
const apiPort = freePort()
let webPort = freePort()
while (webPort === apiPort) webPort = freePort()
// HTTPS 来源用于校验生产 Cookie，测试连接只发生在本机。
const origin = 'https://home.test'
// 显式覆盖环境，避免访问真实用户数据库。
const env = {
  ...process.env,
  NODE_ENV: 'production',
  LAULL_HOME_ORIGIN: origin,
  LAULL_HOME_HOST: '127.0.0.1',
  LAULL_HOME_DATABASE_PATH: join(folder, 'smoke.db'),
  LAULL_HOME_PORT: String(apiPort),
  NUXT_API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
  HOST: '127.0.0.1',
  PORT: String(webPort),
}
// 所有子进程在退出路径统一释放。
const children: ReturnType<typeof Bun.spawn>[] = []

// 请求经过编译后的 Nuxt 代理，再访问独立 Elysia 进程。
async function request(path: string, method = 'GET', body?: unknown, cookie?: string, source = origin) {
  return fetch(`http://127.0.0.1:${webPort}${path}`, {
    method,
    headers: { origin: source, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(3000),
  })
}

try {
  const setup = Bun.spawnSync(['bun', 'apps/server/dist/create-user.js', 'owner'], {
    env, stdin: Buffer.from('smoke-password-123'), stdout: 'pipe', stderr: 'pipe',
  })
  assert(setup.exitCode === 0, '构建后的账号初始化命令失败')
  for (const entry of ['apps/server/dist/index.js', 'apps/web/.output/server/index.mjs']) {
    children.push(Bun.spawn(['bun', entry], { env, stdout: 'ignore', stderr: 'inherit' }))
  }
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (children.some(child => child.exitCode !== null)) throw new Error('构建后的服务提前退出')
    try { ready = (await request('/api/v1/health')).status === 200 } catch { /* 等待服务完成监听。 */ }
    if (ready) break
    await Bun.sleep(100)
  }
  assert(ready, '服务启动超时')
  assert((await request('/')).status === 200, '首页 SSR 失败')
  assert((await request('/login')).status === 200, '登录页 SSR 失败')
  assert((await request('/api/v1/auth/me')).status === 401, '匿名请求未被拒绝')
  assert((await request('/api/v1/auth/login', 'POST', { username: 'owner', password: 'smoke-password-123' }, undefined, 'https://evil.test')).status === 403, '跨站登录未被拦截')
  assert((await request('/api/v1/auth/login', 'POST', { username: 'owner', password: 'wrong-password-123' })).status === 401, '密码错误未返回401')
  const login = await request('/api/v1/auth/login', 'POST', { username: 'owner', password: 'smoke-password-123' })
  assert(login.status === 200, '同源登录失败')
  const rawCookie = login.headers.get('set-cookie') ?? ''
  assert(rawCookie.includes('Secure') && rawCookie.includes('HttpOnly'), '代理未保留安全 Cookie')
  const cookie = rawCookie.split(';')[0]!
  assert((await request('/api/v1/auth/me', 'GET', undefined, cookie)).status === 200, '代理未转发 Session')
  assert((await request('/api/v1/auth/me')).status === 401, '不同请求之间发生身份泄漏')
  const settings = { revision: 0, title: '联调主页', appearance: 'dark' }
  assert((await request('/api/v1/settings', 'PUT', settings, cookie)).status === 200, '设置保存失败')
  const saved = await (await request('/api/v1/settings', 'GET', undefined, cookie)).json()
  assert(saved.title === settings.title && saved.revision === 1, '设置持久化结果不一致')
  assert((await request('/api/v1/settings', 'PUT', settings, cookie)).status === 409, '版本冲突未被拒绝')
  const enginesRes = await request('/api/v1/search/engines')
  assert(enginesRes.status === 200, '访客读取搜索引擎失败')
  const anonGroupsRes = await request('/api/v1/bookmarks/groups?spaceId=default')
  assert(anonGroupsRes.status === 200, '访客读取公开书签分组失败')
  const createGroup = await request('/api/v1/bookmarks/groups', 'POST', { spaceId: 'default', name: '联调分组' }, cookie)
  assert(createGroup.status === 200, '创建书签分组失败')
  const { group: smokeGroup } = await createGroup.json()
  const createBm = await request('/api/v1/bookmarks', 'POST', { groupId: smokeGroup.id, title: 'Smoke Site', url: 'https://example.com' }, cookie)
  assert(createBm.status === 200, '创建书签失败')
  const bmsRes = await request('/api/v1/bookmarks?spaceId=default', 'GET', undefined, cookie)
  assert(bmsRes.status === 200, '读取书签失败')
  const sessionsRes = await request('/api/v1/auth/sessions', 'GET', undefined, cookie)
  assert(sessionsRes.status === 200, '会话列表获取失败')
  const spacesRes = await request('/api/v1/spaces', 'GET', undefined, cookie)
  assert(spacesRes.status === 200, '空间列表获取失败')
  assert((await request('/api/v1/spaces/privacy/setup', 'POST', { password: 'privacy-smoke-123' }, cookie)).status === 200, '隐私密码设置失败')
  const unlockRes = await request('/api/v1/spaces/privacy/unlock', 'POST', { password: 'privacy-smoke-123' }, cookie)
  assert(unlockRes.status === 200, '隐私空间解锁失败')
  const spaceCookie = unlockRes.headers.get('set-cookie')!.split(';')[0]!
  const privGroup = await request('/api/v1/bookmarks/groups', 'POST', { spaceId: 'privacy', name: '隐私联调组' }, `${cookie}; ${spaceCookie}`)
  assert(privGroup.status === 200, '隐私空间写入书签分组失败')
  assert((await request('/api/v1/auth/logout', 'POST', undefined, cookie, 'https://evil.test')).status === 403, '跨站请求未被拒绝')
  const logout = await request('/api/v1/auth/logout', 'POST', undefined, cookie)
  assert(logout.status === 200 && logout.headers.get('set-cookie')?.includes('Max-Age=0'), '退出未清除 Cookie')
  assert((await request('/api/v1/auth/me', 'GET', undefined, cookie)).status === 401, '退出后的 Session 仍然有效')
  const reset = Bun.spawnSync(['bun', 'apps/server/dist/reset-password.js', 'owner'], {
    env, stdin: Buffer.from('smoke-new-password-123'), stdout: 'pipe', stderr: 'pipe',
  })
  assert(reset.exitCode === 0, '构建后的密码重置命令失败')
  const reLogin = await request('/api/v1/auth/login', 'POST', { username: 'owner', password: 'smoke-new-password-123' })
  assert(reLogin.status === 200, '重置密码后登录失败')
  console.info('构建产物联调通过')
} finally {
  for (const child of children) child.kill('SIGKILL')
  await Promise.all(children.map(child => child.exited))
  rmSync(folder, { recursive: true, force: true })
}
