import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app'
import { openDatabase, type AppDatabase } from '../src/db'
import { createUser } from '../src/modules/auth/service'
import { loadConfig } from '../src/config'
import { detectIconFormat, FaviconError } from '../src/modules/favicon/service'
import type { Desktop } from '@laull-home/shared'

// 记录测试期间创建的临时数据库与测试目录。
const databases: AppDatabase[] = []
const tempDirs: string[] = []

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
  for (const dir of tempDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* 忽略清理残留 */ }
  }
})

// 创建独立临时环境与认证请求上下文。
async function fixture() {
  const db = openDatabase(':memory:')
  databases.push(db)
  const dataDir = mkdtempSync(join(tmpdir(), 'lh-favicon-test-'))
  tempDirs.push(dataDir)

  await createUser(db, 'owner', 'test-password-123')
  const config = { ...loadConfig({}), dataDir }
  const app = createApp(db, config).compile()

  // 基础请求处理方法。
  async function request(path: string, method = 'GET', body?: unknown, cookie = '', origin = 'http://localhost:3000') {
    const isFormData = body instanceof FormData
    return app.handle(new Request('http://localhost/api/v1' + path, {
      method,
      headers: {
        origin,
        cookie,
        ...(isFormData ? {} : body ? { 'content-type': 'application/json' } : {}),
      },
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    }))
  }

  const login = await request('/auth/login', 'POST', { username: 'owner', password: 'test-password-123' })
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!
  return { request, cookie, dataDir }
}

test('图标格式检测与恶意载荷拦截', () => {
  // 1. 合法 PNG
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
  expect(detectIconFormat(pngHeader)).toEqual({ ext: 'png', mime: 'image/png' })

  // 2. 合法 ICO
  const icoHeader = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00])
  expect(detectIconFormat(icoHeader)).toEqual({ ext: 'ico', mime: 'image/x-icon' })

  // 3. 合法安全 SVG
  const safeSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M0 0h16v16H0z"/></svg>')
  expect(detectIconFormat(safeSvg)).toEqual({ ext: 'svg', mime: 'image/svg+xml' })

  // 4. 恶意 SVG：含 <script>
  const scriptSvg = Buffer.from('<svg><script>alert(1)</script></svg>')
  expect(() => detectIconFormat(scriptSvg)).toThrow(FaviconError)

  // 5. 恶意 SVG：含事件属性
  const onloadSvg = Buffer.from('<svg onload="alert(1)"><circle r="5"/></svg>')
  expect(() => detectIconFormat(onloadSvg)).toThrow(FaviconError)

  // 6. 恶意 SVG：含 javascript: 伪协议
  const jsSvg = Buffer.from('<svg><a href="javascript:alert(1)"><text>link</text></a></svg>')
  expect(() => detectIconFormat(jsSvg)).toThrow(FaviconError)

  // 7. 恶意 SVG：含 foreignObject
  const foreignSvg = Buffer.from('<svg><foreignObject><div>xss</div></foreignObject></svg>')
  expect(() => detectIconFormat(foreignSvg)).toThrow(FaviconError)

  // 8. 非法未知文件
  const unknownFile = Buffer.from('MZ executable binary content')
  expect(() => detectIconFormat(unknownFile)).toThrow('仅支持合法的')
})

test('图标上传接口权限与文件校验', async () => {
  const { request, cookie } = await fixture()

  // 1. 未登录上传返回 401
  const formAnon = new FormData()
  formAnon.append('file', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }), 'icon.png')
  const anonRes = await request('/favicon/upload', 'POST', formAnon)
  expect(anonRes.status).toBe(401)

  // 2. 登录上传合法 PNG 成功并返回可访问路径
  const formPng = new FormData()
  formPng.append('file', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])], { type: 'image/png' }), 'test.png')
  const pngRes = await request('/favicon/upload', 'POST', formPng, cookie)
  expect(pngRes.status).toBe(200)
  const pngData = await pngRes.json() as { iconUrl: string }
  expect(pngData.iconUrl).toMatch(/^\/api\/v1\/icons\/[a-f0-9]{16}\.png$/)

  // 读取已上传的图标
  const iconFilename = pngData.iconUrl.replace('/api/v1/icons/', '')
  const getIconRes = await request('/icons/' + iconFilename)
  expect(getIconRes.status).toBe(200)
  expect(getIconRes.headers.get('content-type')).toBe('image/png')

  // 3. 上传合法 SVG 成功
  const formSvg = new FormData()
  formSvg.append('file', new Blob([Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>')], { type: 'image/svg+xml' }), 'test.svg')
  const svgRes = await request('/favicon/upload', 'POST', formSvg, cookie)
  expect(svgRes.status).toBe(200)
  const svgData = await svgRes.json() as { iconUrl: string }
  expect(svgData.iconUrl).toMatch(/^\/api\/v1\/icons\/[a-f0-9]{16}\.svg$/)

  // 读取已上传的 SVG 包含安全隔离头
  const svgFilename = svgData.iconUrl.replace('/api/v1/icons/', '')
  const getSvgRes = await request('/icons/' + svgFilename)
  expect(getSvgRes.status).toBe(200)
  expect(getSvgRes.headers.get('content-type')).toBe('image/svg+xml')
  expect(getSvgRes.headers.get('content-security-policy')).toContain('sandbox')

  // 4. 上传恶意 SVG 返回 400
  const formBadSvg = new FormData()
  formBadSvg.append('file', new Blob([Buffer.from('<svg><script>alert("xss")</script></svg>')], { type: 'image/svg+xml' }), 'bad.svg')
  const badSvgRes = await request('/favicon/upload', 'POST', formBadSvg, cookie)
  expect(badSvgRes.status).toBe(400)

  // 5. 上传超限文件返回 400
  const formOversize = new FormData()
  const bigBuffer = new Uint8Array(513 * 1024)
  formOversize.append('file', new Blob([bigBuffer], { type: 'image/png' }), 'big.png')
  const oversizeRes = await request('/favicon/upload', 'POST', formOversize, cookie)
  expect(oversizeRes.status).toBe(400)
})

test('桌面组件支持空标题保存与修改重命名，不再触发 400 校验异常', async () => {
  const { request, cookie } = await fixture()

  // 读取初始桌面
  const initial = await (await request('/desktop/default', 'GET', undefined, cookie)).json() as Desktop
  expect(initial.revision).toBe(0)

  // 构造包含空白标题组件的画布（模拟用户在组件编辑弹窗中清空标题时触发自动保存）
  const emptyTitleDesktop = {
    ...initial,
    nodes: [
      {
        id: 'test-folder-widget',
        type: 'folder' as const,
        title: '',
        content: '',
        referenceId: '',
        timezone: 'Asia/Shanghai',
        hour12: false,
        stackId: '',
        css: '',
        layouts: {
          desktop: { x: 0, y: 0, w: 2, h: 2, pinned: true },
        },
      },
    ],
  }

  // 提交保存：放宽限制后应成功通过，返回递增版本号，而非 400
  const saveRes = await request('/desktop/default', 'PUT', emptyTitleDesktop, cookie)
  expect(saveRes.status).toBe(200)
  const savedData = await saveRes.json() as Desktop
  expect(savedData.revision).toBe(1)
  expect(savedData.nodes[0]?.title).toBe('')

  // 再次读取验证状态一致
  const readRes = await request('/desktop/default', 'GET', undefined, cookie)
  expect(readRes.status).toBe(200)
  const readData = await readRes.json() as Desktop
  expect(readData.revision).toBe(1)
  expect(readData.nodes[0]?.id).toBe('test-folder-widget')
  expect(readData.nodes[0]?.title).toBe('')
})

test('服务端仅嗅探候选链接并不直接下载图片，由上传落地存储', async () => {
  const { request, cookie } = await fixture()

  // 1. 探测受限目标地址，触发安全防护阻断
  const blockedRes = await request('/favicon/fetch', 'POST', { url: 'http://127.0.0.1:8080/test' }, cookie)
  expect(blockedRes.status).toBe(403)

  // 2. 客户端上传探测下载得到的二进制文件
  const fakeIco = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10])
  const form = new FormData()
  form.append('file', new Blob([fakeIco], { type: 'image/x-icon' }), 'favicon.ico')
  const uploadRes = await request('/favicon/upload', 'POST', form, cookie)
  expect(uploadRes.status).toBe(200)
  const uploadJson = await uploadRes.json() as { iconUrl: string }
  expect(uploadJson.iconUrl).toMatch(/^\/api\/v1\/icons\/[a-f0-9]+\.ico$/)

  // 3. 验证静态资源可正确访问
  const getRes = await request(uploadJson.iconUrl.replace('/api/v1', ''), 'GET')
  expect(getRes.status).toBe(200)
})

test('服务端探测公网域名优先使用 Favicon.im 并落盘缓存', async () => {
  const originalFetch = globalThis.fetch
  try {
    const requestedUrls: string[] = []
    // 隔离外部调用，使用内置模拟响应
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const urlStr = input.toString()
      requestedUrls.push(urlStr)
      if (urlStr.includes('favicon.im')) {
        // 模拟 Favicon.im 返回合法 PNG 图标数据
        const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
        return new Response(fakePng, {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      }
      return new Response('Not Found', { status: 404 })
    }) as typeof globalThis.fetch

    const { request, cookie } = await fixture()
    const res = await request('/favicon/fetch', 'POST', { url: 'https://example.com' }, cookie)
    expect(res.status).toBe(200)
    const json = await res.json() as { iconUrl: string; candidateUrls?: string[] }
    // 验证优先向 Favicon.im 发起探测
    expect(requestedUrls.some(u => u.includes('favicon.im/example.com'))).toBe(true)
    expect(json.iconUrl).toMatch(/^\/api\/v1\/icons\/[a-f0-9]+\.png$/)
    expect(json.candidateUrls?.[0]).toBe('https://favicon.im/example.com?larger=true')
  } finally {
    globalThis.fetch = originalFetch
  }
})
