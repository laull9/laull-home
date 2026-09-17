import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app'
import { openDatabase, type AppDatabase } from '../src/db'
import { createUser } from '../src/modules/auth/service'
import { loadConfig } from '../src/config'
import type { HomeSettings, WallpaperItem, WallpaperPool } from '@laull-home/shared'

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

  // 4. 上传合法 SVG 图片并校验返回的 CSP 响应头。
  const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>'
  const svgForm = new FormData()
  svgForm.append('file', new Blob([svgContent], { type: 'image/svg+xml' }), 'vector.svg')
  const svgUpload = await request('/wallpapers/upload', 'POST', svgForm, cookie)
  expect(svgUpload.status).toBe(200)
  const svgItem = (await svgUpload.json()).wallpaper as WallpaperItem
  const svgRes = await request(svgItem.url.replace('/api/v1', ''), 'GET')
  expect(svgRes.status).toBe(200)
  expect(svgRes.headers.get('content-type')).toBe('image/svg+xml')
  expect(svgRes.headers.get('content-security-policy')).toContain("default-src 'none'")

  // 5. 路径穿越非法请求阻断。
  const traversalRes = await request('/wallpapers/image/..%2f..%2fpackage.json', 'GET')
  expect(traversalRes.status).toBe(404)

  // 6. 删除壁纸后本地存储联动清理。
  const delRes = await request(`/wallpapers/${item.id}`, 'DELETE', undefined, cookie)
  expect(delRes.status).toBe(200)
  const afterDelImg = await request(imagePath, 'GET')
  expect(afterDelImg.status).toBe(404)
})

test('批量导入壁纸：权限拦截、格式校验、原子入库与倒序持久化', async () => {
  const { request, cookie } = await fixture()

  // 1. 未登录访客拦截。
  const unauth = await request('/wallpapers/batch', 'POST', {
    items: [{ url: 'https://example.com/pic.jpg' }],
  })
  expect(unauth.status).toBe(401)

  // 2. 空列表拦截。
  const emptyRes = await request('/wallpapers/batch', 'POST', { items: [] }, cookie)
  expect(emptyRes.status).toBe(400)

  // 3. 包含非法链接拦截。
  const invalidRes = await request('/wallpapers/batch', 'POST', {
    items: [
      { name: '合法', url: 'https://example.com/ok.jpg' },
      { name: '非法', url: 'javascript:alert(1)' },
    ],
  }, cookie)
  expect(invalidRes.status).toBe(400)

  // 4. 正常批量导入。
  const batchRes = await request('/wallpapers/batch', 'POST', {
    items: [
      { name: '第1张风景', url: 'https://images.unsplash.com/pic1.jpg' },
      { url: 'https://images.unsplash.com/pic2.png' }, // 未传名称，自动生成
      { name: '第3张星空', url: 'https://images.unsplash.com/pic3.webp' },
    ],
  }, cookie)
  expect(batchRes.status).toBe(200)
  const result = await batchRes.json()
  expect(result.wallpapers.length).toBe(3)
  expect(result.wallpapers[0].name).toBe('第1张风景')
  expect(result.wallpapers[1].name).toBe('壁纸 2')
  expect(result.wallpapers[2].name).toBe('第3张星空')

  // 5. 查询列表确认持久化与顺序（第一张导入的排在最前）。
  const listRes = await request('/wallpapers', 'GET', undefined, cookie)
  const list = (await listRes.json()).wallpapers as WallpaperItem[]
  expect(list.length).toBe(3)
  expect(list[0]?.url).toBe('https://images.unsplash.com/pic1.jpg')
  expect(list[1]?.url).toBe('https://images.unsplash.com/pic2.png')
  expect(list[2]?.url).toBe('https://images.unsplash.com/pic3.webp')
})

test('多图片池管理：新建、修改、删除级联清理、隔离与当前池切换', async () => {
  const { request, cookie } = await fixture()

  // 1. 获取默认图片池列表。
  const initialPoolsRes = await request('/wallpapers/pools', 'GET', undefined, cookie)
  expect(initialPoolsRes.status).toBe(200)
  const initialPools = (await initialPoolsRes.json()).pools as WallpaperPool[]
  expect(initialPools.length).toBe(1)
  expect(initialPools[0]?.name).toBe('默认图片池')
  expect(initialPools[0]?.isDefault).toBe(true)

  const defaultPoolId = initialPools[0]!.id

  // 2. 新建两个独立图片池。
  const p1Res = await request('/wallpapers/pools', 'POST', { name: '动漫壁纸' }, cookie)
  expect(p1Res.status).toBe(200)
  const poolAnime = (await p1Res.json()).pool as WallpaperPool
  expect(poolAnime.name).toBe('动漫壁纸')

  const p2Res = await request('/wallpapers/pools', 'POST', { name: '摄影风景' }, cookie)
  expect(p2Res.status).toBe(200)
  const poolLandscape = (await p2Res.json()).pool as WallpaperPool

  // 3. 重命名图片池。
  const renameRes = await request(`/wallpapers/pools/${poolAnime.id}`, 'PUT', { name: '精选动漫' }, cookie)
  expect(renameRes.status).toBe(200)
  const renamed = (await renameRes.json()).pool as WallpaperPool
  expect(renamed.name).toBe('精选动漫')

  // 4. 分别向两个池添加图片，验证池间互不干扰。
  await request('/wallpapers', 'POST', {
    poolId: poolAnime.id,
    name: '动漫图1',
    url: 'https://example.com/anime1.jpg',
  }, cookie)
  await new Promise(r => setTimeout(r, 10))
  await request('/wallpapers', 'POST', {
    poolId: poolAnime.id,
    name: '动漫图2',
    url: 'https://example.com/anime2.jpg',
  }, cookie)

  await request('/wallpapers', 'POST', {
    poolId: poolLandscape.id,
    name: '风景图1',
    url: 'https://example.com/land1.jpg',
  }, cookie)

  // 5. 按池查询验证隔离与计数。
  const animeList = (await (await request(`/wallpapers?poolId=${poolAnime.id}`, 'GET', undefined, cookie)).json()).wallpapers as WallpaperItem[]
  expect(animeList.length).toBe(2)
  expect(animeList[0]?.name).toBe('动漫图2')
  expect(animeList[1]?.name).toBe('动漫图1')

  const landList = (await (await request(`/wallpapers?poolId=${poolLandscape.id}`, 'GET', undefined, cookie)).json()).wallpapers as WallpaperItem[]
  expect(landList.length).toBe(1)
  expect(landList[0]?.name).toBe('风景图1')

  const defaultList = (await (await request(`/wallpapers?poolId=${defaultPoolId}`, 'GET', undefined, cookie)).json()).wallpapers as WallpaperItem[]
  expect(defaultList.length).toBe(0)

  // 6. 池列表统计计数。
  const poolsListRes = await (await request('/wallpapers/pools', 'GET', undefined, cookie)).json()
  const pools = poolsListRes.pools as WallpaperPool[]
  expect(pools.length).toBe(3)
  const animeInList = pools.find(p => p.id === poolAnime.id)
  expect(animeInList?.count).toBe(2)
  const landInList = pools.find(p => p.id === poolLandscape.id)
  expect(landInList?.count).toBe(1)

  // 7. 切换当前使用的图片池，并在设置中持久化。
  const currentSettings = await (await request('/settings', 'GET', undefined, cookie)).json() as HomeSettings
  const setPoolRes = await request('/settings', 'PUT', {
    ...currentSettings,
    activeWallpaperPoolId: poolAnime.id,
  }, cookie)
  expect(setPoolRes.status).toBe(200)

  // 未指定 poolId 请求默认取当前激活池（精选动漫）。
  const activeWallpapers = (await (await request('/wallpapers', 'GET', undefined, cookie)).json()).wallpapers as WallpaperItem[]
  expect(activeWallpapers.length).toBe(2)
  expect(activeWallpapers[0]?.name).toBe('动漫图2')

  // 8. 删除图片池，包含本地上传的图片将联动清理文件。
  const webpBuffer = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
  const imgForm = new FormData()
  imgForm.append('file', new Blob([webpBuffer], { type: 'image/webp' }), 'del-test.webp')
  imgForm.append('name', '待随池删除本地图')
  imgForm.append('poolId', poolLandscape.id)
  const uploadRes = await request('/wallpapers/upload', 'POST', imgForm, cookie)
  expect(uploadRes.status).toBe(200)
  const uploadedItem = (await uploadRes.json()).wallpaper as WallpaperItem
  const imgPath = uploadedItem.url.replace('/api/v1', '')
  expect((await request(imgPath, 'GET')).status).toBe(200)

  // 删除摄影风景池。
  const delPoolRes = await request(`/wallpapers/pools/${poolLandscape.id}`, 'DELETE', undefined, cookie)
  expect(delPoolRes.status).toBe(200)
  // 确认物理文件已被联动清理。
  expect((await request(imgPath, 'GET')).status).toBe(404)
  // 确认该池已不存在，查询返回 404。
  const afterDelRes = await request(`/wallpapers?poolId=${poolLandscape.id}`, 'GET', undefined, cookie)
  expect(afterDelRes.status).toBe(404)

  // 9. 删除池后若用户仅剩一个池，禁止删除最后一个图片池。
  await request(`/wallpapers/pools/${poolAnime.id}`, 'DELETE', undefined, cookie)
  const lastDelRes = await request(`/wallpapers/pools/${defaultPoolId}`, 'DELETE', undefined, cookie)
  expect(lastDelRes.status).toBe(400)
})

test('批量删除壁纸：支持多选批量删除且联动物理清理本地图片', async () => {
  const { request, cookie } = await fixture()

  // 1. 添加外链与上传两张本地图片。
  const res1 = await request('/wallpapers', 'POST', { name: '外链1', url: 'https://example.com/p1.jpg' }, cookie)
  const item1 = (await res1.json()).wallpaper as WallpaperItem

  const webpBuffer = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
  const form1 = new FormData()
  form1.append('file', new Blob([webpBuffer], { type: 'image/webp' }), 'b1.webp')
  form1.append('name', '本地1')
  const upload1 = (await (await request('/wallpapers/upload', 'POST', form1, cookie)).json()).wallpaper as WallpaperItem

  const form2 = new FormData()
  form2.append('file', new Blob([webpBuffer], { type: 'image/webp' }), 'b2.webp')
  form2.append('name', '本地2')
  const upload2 = (await (await request('/wallpapers/upload', 'POST', form2, cookie)).json()).wallpaper as WallpaperItem

  const img1Path = upload1.url.replace('/api/v1', '')
  const img2Path = upload2.url.replace('/api/v1', '')
  expect((await request(img1Path, 'GET')).status).toBe(200)
  expect((await request(img2Path, 'GET')).status).toBe(200)

  // 2. 批量删除外链1与本地1。
  const batchDelRes = await request('/wallpapers/batch-delete', 'POST', {
    ids: [item1.id, upload1.id],
  }, cookie)
  expect(batchDelRes.status).toBe(200)
  const batchResult = await batchDelRes.json()
  expect(batchResult.success).toBe(true)
  expect(batchResult.deletedCount).toBe(2)

  // 3. 验证本地1文件已删除，本地2保留。
  expect((await request(img1Path, 'GET')).status).toBe(404)
  expect((await request(img2Path, 'GET')).status).toBe(200)

  // 4. 验证数据库列表中仅剩本地2。
  const list = (await (await request('/wallpapers', 'GET', undefined, cookie)).json()).wallpapers as WallpaperItem[]
  expect(list.length).toBe(1)
  expect(list[0]?.id).toBe(upload2.id)
})

test('填充模式：全局默认配置与单张壁纸独立覆盖持久化', async () => {
  const { request, cookie } = await fixture()

  // 1. 全局配置填充模式为 contain。
  const cur = await (await request('/settings', 'GET', undefined, cookie)).json() as HomeSettings
  const setRes = await request('/settings', 'PUT', {
    ...cur,
    wallpaperFitMode: 'contain',
  }, cookie)
  expect(setRes.status).toBe(200)
  const savedSettings = await (await request('/settings', 'GET', undefined, cookie)).json() as HomeSettings
  expect(savedSettings.wallpaperFitMode).toBe('contain')

  // 2. 创建图片时指定独立填充模式 fill。
  const res1 = await request('/wallpapers', 'POST', {
    name: '拉伸壁纸',
    url: 'https://example.com/stretch.jpg',
    fitMode: 'fill',
  }, cookie)
  expect(res1.status).toBe(200)
  const item1 = (await res1.json()).wallpaper as WallpaperItem
  expect(item1.fitMode).toBe('fill')

  // 3. 上传本地图片时指定独立填充模式 tile。
  const webpBuffer = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
  const form = new FormData()
  form.append('file', new Blob([webpBuffer], { type: 'image/webp' }), 'tile.webp')
  form.append('name', '平铺壁纸')
  form.append('fitMode', 'tile')
  const uploadRes = await request('/wallpapers/upload', 'POST', form, cookie)
  expect(uploadRes.status).toBe(200)
  const item2 = (await uploadRes.json()).wallpaper as WallpaperItem
  expect(item2.fitMode).toBe('tile')

  // 4. 更新单张壁纸填充模式为 center。
  const updateRes = await request(`/wallpapers/${item1.id}`, 'PUT', { fitMode: 'center' }, cookie)
  expect(updateRes.status).toBe(200)
  const updated1 = (await updateRes.json()).wallpaper as WallpaperItem
  expect(updated1.fitMode).toBe('center')

  // 5. 更新单张壁纸填充模式为 auto（恢复跟随全局）。
  const autoRes = await request(`/wallpapers/${item1.id}`, 'PUT', { fitMode: 'auto' }, cookie)
  expect(autoRes.status).toBe(200)
  const updatedAuto = (await autoRes.json()).wallpaper as WallpaperItem
  expect(updatedAuto.fitMode).toBeNull()
})


