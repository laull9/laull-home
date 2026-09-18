import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app'
import { openDatabase, type AppDatabase } from '../src/db'
import { createUser } from '../src/modules/auth/service'
import { loadConfig } from '../src/config'
import type { WallpaperItem, WallpaperQuotaInfo } from '@laull-home/shared'

// 记录测试期间创建的临时目录与内存数据库。
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
  const dataDir = mkdtempSync(join(tmpdir(), 'lh-quota-test-'))
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

test('真实魔数校验：拦截伪造后缀文件与恶意 SVG 脚本，放行合规图片', async () => {
  const { request, cookie } = await fixture()

  // 1. 伪造 JPEG（实为可执行文本）被魔数嗅探直接拦截
  const fakeForm = new FormData()
  const fakeJpg = new Blob([new TextEncoder().encode('echo "malicious script"')], { type: 'image/jpeg' })
  fakeForm.append('file', fakeJpg, 'exploit.jpg')
  const fakeRes = await request('/wallpapers/upload', 'POST', fakeForm, cookie)
  expect(fakeRes.status).toBe(400)
  expect((await fakeRes.json()).message).toContain('仅支持合法的')

  // 2. 伪造 PNG（实为全零无头部信息）被拦截
  const zeroForm = new FormData()
  zeroForm.append('file', new Blob([new Uint8Array([0, 0, 0, 0, 0, 0])], { type: 'image/png' }), 'zero.png')
  const zeroRes = await request('/wallpapers/upload', 'POST', zeroForm, cookie)
  expect(zeroRes.status).toBe(400)

  // 3. 包含 XSS <script> 的恶意 SVG 文件被拦截
  const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><rect width="10" height="10"/></svg>'
  const svgForm = new FormData()
  svgForm.append('file', new Blob([new TextEncoder().encode(maliciousSvg)], { type: 'image/svg+xml' }), 'evil.svg')
  const svgRes = await request('/wallpapers/upload', 'POST', svgForm, cookie)
  expect(svgRes.status).toBe(400)
  expect((await svgRes.json()).message).toContain('不安全的脚本')

  // 4. 包含 inline event (onload) 的恶意 SVG 被拦截
  const inlineSvg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>'
  const inlineForm = new FormData()
  inlineForm.append('file', new Blob([new TextEncoder().encode(inlineSvg)], { type: 'image/svg+xml' }), 'inline.svg')
  const inlineRes = await request('/wallpapers/upload', 'POST', inlineForm, cookie)
  expect(inlineRes.status).toBe(400)

  // 5. 合法 PNG 真实魔数放行
  const validPngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D])
  const pngForm = new FormData()
  pngForm.append('file', new Blob([validPngHeader], { type: 'image/png' }), 'valid.png')
  const pngRes = await request('/wallpapers/upload', 'POST', pngForm, cookie)
  expect(pngRes.status).toBe(200)
  const pngItem = (await pngRes.json()).wallpaper as WallpaperItem
  expect(pngItem.sourceType).toBe('upload')
  expect(pngItem.url).toMatch(/\.png$/)

  // 6. 合法 JPEG 真实魔数放行
  const validJpgHeader = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46])
  const jpgForm = new FormData()
  jpgForm.append('file', new Blob([validJpgHeader], { type: 'image/jpeg' }), 'valid.jpg')
  const jpgRes = await request('/wallpapers/upload', 'POST', jpgForm, cookie)
  expect(jpgRes.status).toBe(200)
  const jpgItem = (await jpgRes.json()).wallpaper as WallpaperItem
  expect(jpgItem.url).toMatch(/\.jpg$/)

  // 7. 合法安全 SVG 放行
  const safeSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/></svg>'
  const safeSvgForm = new FormData()
  safeSvgForm.append('file', new Blob([new TextEncoder().encode(safeSvg)], { type: 'image/svg+xml' }), 'safe.svg')
  const safeSvgRes = await request('/wallpapers/upload', 'POST', safeSvgForm, cookie)
  expect(safeSvgRes.status).toBe(200)
})

test('图库配额：读取配额、数量与容量统计、超限拦截及删除后配额释放', async () => {
  const { request, cookie } = await fixture()

  // 1. 初始读取配额为空使用
  const initialQuotaRes = await request('/wallpapers/quota', 'GET', undefined, cookie)
  expect(initialQuotaRes.status).toBe(200)
  const initialQuota = (await initialQuotaRes.json()).quota as WallpaperQuotaInfo
  expect(initialQuota.usedBytes).toBe(0)
  expect(initialQuota.usedCount).toBe(0)
  expect(initialQuota.maxCount).toBe(100)
  expect(initialQuota.totalBytes).toBe(150 * 1024 * 1024)

  // 2. 上传一张有效图片并验证配额增加
  const validPngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D])
  const form = new FormData()
  form.append('file', new Blob([validPngHeader], { type: 'image/png' }), 'quota-test.png')
  const uploadRes = await request('/wallpapers/upload', 'POST', form, cookie)
  expect(uploadRes.status).toBe(200)
  const uploaded = (await uploadRes.json()).wallpaper as WallpaperItem

  const afterUploadRes = await request('/wallpapers/quota', 'GET', undefined, cookie)
  const afterQuota = (await afterUploadRes.json()).quota as WallpaperQuotaInfo
  expect(afterQuota.usedCount).toBe(1)
  expect(afterQuota.usedBytes).toBe(validPngHeader.length)

  // 3. 删除该上传壁纸后配额释放
  const delRes = await request(`/wallpapers/${uploaded.id}`, 'DELETE', undefined, cookie)
  expect(delRes.status).toBe(200)

  const afterDelRes = await request('/wallpapers/quota', 'GET', undefined, cookie)
  const afterDelQuota = (await afterDelRes.json()).quota as WallpaperQuotaInfo
  expect(afterDelQuota.usedCount).toBe(0)
  expect(afterDelQuota.usedBytes).toBe(0)
})
