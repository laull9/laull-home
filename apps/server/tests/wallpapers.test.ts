import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app'
import { openDatabase, type AppDatabase } from '../src/db'
import { createUser } from '../src/modules/auth/service'
import { loadConfig } from '../src/config'
import type { HomeSettings, WallpaperItem } from '@laull-home/shared'

// 记录测试期间创建的临时目录与内存数据库。
const databases: AppDatabase[] = []
const tempDirs: string[] = []

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
  for (const dir of tempDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* 忽略清理失败 */ }
  }
})

// 创建独立临时环境与认证请求上下文。
async function fixture() {
  const db = openDatabase(':memory:')
  databases.push(db)
  const dataDir = mkdtempSync(join(tmpdir(), 'lh-wallpapers-test-'))
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

test('设置持久化：支持图片池类型、定时轮换开关及间隔配置', async () => {
  const { request, cookie } = await fixture()
  const current = await (await request('/settings', 'GET', undefined, cookie)).json() as HomeSettings
  expect(current.wallpaperType).toBe('none')
  expect(current.wallpaperAutoRotate).toBe(false)
  expect(current.wallpaperRotateInterval).toBe(60)

  // 更新为图片池模式，开启定时轮换并设置 15 分钟间隔。
  const updated = await request('/settings', 'PUT', {
    ...current,
    wallpaperType: 'pool',
    wallpaperValue: 'https://example.com/bg1.jpg',
    wallpaperAutoRotate: true,
    wallpaperRotateInterval: 15,
  }, cookie)
  expect(updated.status).toBe(200)
  const saved = await updated.json() as HomeSettings
  expect(saved.wallpaperType).toBe('pool')
  expect(saved.wallpaperAutoRotate).toBe(true)
  expect(saved.wallpaperRotateInterval).toBe(15)

  // 再次读取确认持久化。
  const read = await (await request('/settings', 'GET', undefined, cookie)).json() as HomeSettings
  expect(read.wallpaperType).toBe('pool')
  expect(read.wallpaperAutoRotate).toBe(true)
  expect(read.wallpaperRotateInterval).toBe(15)
})

test('图片池 CRUD：增删改查、排序及外链合法性校验', async () => {
  const { request, cookie } = await fixture()

  // 访客未授权访问拦截。
  const unauth = await request('/wallpapers', 'GET')
  expect(unauth.status).toBe(401)

  // 初始列表为空。
  const initial = await (await request('/wallpapers', 'GET', undefined, cookie)).json()
  expect(initial.wallpapers).toEqual([])

  // 添加非法外链拦截。
  const invalidUrl = await request('/wallpapers', 'POST', { name: '非法链接', url: 'javascript:alert(1)' }, cookie)
  expect(invalidUrl.status).toBe(400)

  // 正常添加两条外链壁纸。
  const res1 = await request('/wallpapers', 'POST', { name: '山川风景', url: 'https://images.unsplash.com/photo-1' }, cookie)
  expect(res1.status).toBe(200)
  const item1 = (await res1.json()).wallpaper as WallpaperItem
  expect(item1.name).toBe('山川风景')
  expect(item1.sourceType).toBe('url')

  await new Promise(r => setTimeout(r, 10))

  const res2 = await request('/wallpapers', 'POST', { name: '星空流云', url: 'https://images.unsplash.com/photo-2' }, cookie)
  expect(res2.status).toBe(200)
  const item2 = (await res2.json()).wallpaper as WallpaperItem

  // 列表按创建时间倒序返回。
  const listRes = await request('/wallpapers', 'GET', undefined, cookie)
  const list = (await listRes.json()).wallpapers as WallpaperItem[]
  expect(list.length).toBe(2)
  expect(list[0]?.id).toBe(item2.id)
  expect(list[1]?.id).toBe(item1.id)

  // 重命名与更新链接。
  const updateRes = await request(`/wallpapers/${item1.id}`, 'PUT', { name: '晨曦山川', url: 'https://images.unsplash.com/photo-1-hd' }, cookie)
  expect(updateRes.status).toBe(200)
  const updated = (await updateRes.json()).wallpaper as WallpaperItem
  expect(updated.name).toBe('晨曦山川')
  expect(updated.url).toBe('https://images.unsplash.com/photo-1-hd')

  // 删除操作。
  const deleteRes = await request(`/wallpapers/${item1.id}`, 'DELETE', undefined, cookie)
  expect(deleteRes.status).toBe(200)
  const afterDelete = (await (await request('/wallpapers', 'GET', undefined, cookie)).json()).wallpapers as WallpaperItem[]
  expect(afterDelete.length).toBe(1)
  expect(afterDelete[0]?.id).toBe(item2.id)
})

test('本地图片上传：格式校验、安全存储、静态访问与级联清理', async () => {
  const { request, cookie } = await fixture()

  // 1. 不支持的文件类型拦截。
  const txtForm = new FormData()
  txtForm.append('file', new Blob(['hello world'], { type: 'text/plain' }), 'test.txt')
  const txtRes = await request('/wallpapers/upload', 'POST', txtForm, cookie)
  expect(txtRes.status).toBe(400)

  // 2. 上传合法 WebP 图片。
  const webpBuffer = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
  const imgForm = new FormData()
  imgForm.append('file', new Blob([webpBuffer], { type: 'image/webp' }), 'my-wallpaper.webp')
  imgForm.append('name', '自选壁纸')
  const uploadRes = await request('/wallpapers/upload', 'POST', imgForm, cookie)
  expect(uploadRes.status).toBe(200)
  const item = (await uploadRes.json()).wallpaper as WallpaperItem
  expect(item.name).toBe('自选壁纸')
  expect(item.sourceType).toBe('upload')
  expect(item.url.startsWith('/api/v1/wallpapers/image/')).toBe(true)

  // 3. 公开静态路由访问图片内容。
  const imagePath = item.url.replace('/api/v1', '')
  const getImgRes = await request(imagePath, 'GET')
  expect(getImgRes.status).toBe(200)
  expect(getImgRes.headers.get('content-type')).toBe('image/webp')
  expect(getImgRes.headers.get('cache-control')).toContain('public')
  const bytes = new Uint8Array(await getImgRes.arrayBuffer())
  expect(bytes[0]).toBe(0x52)

  // 4. 路径穿越非法请求阻断。
  const traversalRes = await request('/wallpapers/image/..%2f..%2fpackage.json', 'GET')
  expect(traversalRes.status).toBe(404)

  // 5. 删除壁纸后本地存储联动清理。
  const delRes = await request(`/wallpapers/${item.id}`, 'DELETE', undefined, cookie)
  expect(delRes.status).toBe(200)
  const afterDelImg = await request(imagePath, 'GET')
  expect(afterDelImg.status).toBe(404)
})
