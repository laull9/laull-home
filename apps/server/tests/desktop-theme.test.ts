import { afterEach, expect, test } from 'bun:test'
import { arrangeNodes, newWidget, scopedCss, seedTokens, contrast, DEFAULT_THEME, type Desktop } from '@laull-home/shared'
import { createApp } from '../src/app'
import { openDatabase, type AppDatabase } from '../src/db'
import { createUser } from '../src/modules/auth/service'
import { loadConfig } from '../src/config'

// 每例测试独立内存数据库。
const databases: AppDatabase[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })
// 测试不访问环境文件及外部服务。
async function fixture() {
  const db = openDatabase(':memory:')
  databases.push(db)
  await createUser(db, 'owner', 'test-password-123')
  const app = createApp(db, loadConfig({})).compile()
  // 请求经由真实路由和鉴权链。
  async function request(path: string, method = 'GET', body?: unknown, cookie = '', origin = 'http://localhost:3000') {
    return app.handle(new Request('http://localhost/api/v1' + path, {
      method, headers: { origin, cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }))
  }
  const login = await request('/auth/login', 'POST', { username: 'owner', password: 'test-password-123' })
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!
  return { request, cookie }
}

test('画布保存、重新读取、并发版本冲突与原子失败', async () => {
  const { request, cookie } = await fixture()
  await request('/bookmarks/groups', 'POST', { spaceId: 'default', name: '测试分组' }, cookie)
  const initial = await (await request('/desktop/default', 'GET', undefined, cookie)).json() as Desktop
  expect(initial.nodes.some(node => node.type === 'folder')).toBe(true)
  const note = newWidget('note', 'note')
  note.content = '跨设备持久化'
  note.layouts.mobile = { x: 1, y: 3, w: 2, h: 2, pinned: true }
  const value = { ...initial, nodes: [note] }
  const saved = await request('/desktop/default', 'PUT', value, cookie)
  expect(saved.status).toBe(200)
  expect((await saved.json()).revision).toBe(1)
  expect((await request('/desktop/default', 'PUT', value, cookie)).status).toBe(409)
  const read = await (await request('/desktop/default', 'GET', undefined, cookie)).json()
  expect(read.nodes[0].content).toBe(note.content)
  expect(read.nodes[0].layouts.mobile).toEqual(note.layouts.mobile)
  const duplicate = { ...read, nodes: [note, note] }
  expect((await request('/desktop/default', 'PUT', duplicate, cookie)).status).toBe(400)
  expect((await (await request('/desktop/default', 'GET', undefined, cookie)).json()).revision).toBe(1)
})

test('空间授权、跨来源、跨空间引用和撤销后访问隔离', async () => {
  const { request, cookie } = await fixture()
  expect((await request('/desktop/default')).status).toBe(401)
  const value = { revision: 0, nodes: [newWidget('note', 'note')], templates: [] }
  expect((await request('/desktop/default', 'PUT', value)).status).toBe(401)
  expect((await request('/desktop/default', 'PUT', value, cookie, 'https://evil.test')).status).toBe(403)
  expect((await request('/desktop/privacy', 'GET', undefined, cookie)).status).toBe(403)
  expect((await request('/desktop/missing', 'PUT', value, cookie)).status).toBe(403)
  await request('/spaces/privacy/setup', 'POST', { password: 'private-password' }, cookie)
  const unlocked = await request('/spaces/privacy/unlock', 'POST', { password: 'private-password' }, cookie)
  const combined = cookie + '; ' + unlocked.headers.get('set-cookie')!.split(';')[0]!
  expect((await request('/desktop/privacy', 'PUT', value, combined)).status).toBe(200)
  const folder = { ...newWidget('folder', 'folder'), referenceId: 'group-default' }
  expect((await request('/desktop/privacy', 'PUT', { revision: 1, nodes: [folder], templates: [] }, combined)).status).toBe(400)
  await request('/spaces/privacy/lock', 'POST', undefined, combined)
  expect((await request('/desktop/privacy', 'GET', undefined, combined)).status).toBe(403)
  expect((await request('/desktop/privacy', 'PUT', { ...value, revision: 1 }, combined)).status).toBe(403)
})

test('无效组件类型、布局、CSS、时区和容量拒绝写入', async () => {
  const { request, cookie } = await fixture()
  const note = newWidget('note', 'note')
  for (const node of [
    { ...note, type: 'script' }, { ...note, css: 'p { background: url(https://evil.test) }' },
    { ...note, timezone: 'invalid' }, { ...note, layouts: { desktop: { x: 11, y: 0, w: 2, h: 1, pinned: true } } },
  ]) expect((await request('/desktop/default', 'PUT', { revision: 0, nodes: [node], templates: [] }, cookie)).status).toBe(400)
  expect((await request('/desktop/default', 'PUT', { revision: 0, nodes: Array.from({ length: 121 }, (_, i) => ({ ...note, id: String(i) })), templates: [] }, cookie)).status).toBe(400)
})

test('固定布局优先避让、移动降级、叠放及跨尺寸冲突', () => {
  const pinned = newWidget('note', 'pin')
  pinned.layouts.desktop = { x: 0, y: 0, w: 2, h: 2, pinned: true }
  const flow = newWidget('search', 'flow')
  const nodes = [flow, pinned, newWidget('calendar', 'calendar')]
  for (const bp of ['desktop', 'laptop', 'tablet', 'mobile'] as const) {
    const layout = arrangeNodes(nodes, bp)
    const cells = new Set<string>()
    for (const p of layout.values()) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      expect(cells.has(x + ':' + y)).toBe(false)
      cells.add(x + ':' + y)
    }
  }
  expect(arrangeNodes(nodes, 'desktop').get('pin')!.x).toBe(0)
  const copy = { ...pinned, id: 'copy', stackId: 'stack' }
  expect(arrangeNodes([{ ...pinned, stackId: 'stack' }, copy], 'desktop').get('pin')).toEqual(arrangeNodes([{ ...pinned, stackId: 'stack' }, copy], 'desktop').get('copy'))
})

test('种子主题正文与按钮双模 AA 对比度', () => {
  for (const color of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#777777', '#2563eb']) {
    for (const dark of [false, true]) {
      const tokens = seedTokens(color, dark)
      expect(contrast(tokens['--lh-accent']!, tokens['--lh-accent-text']!)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens['--lh-text']!, tokens['--lh-bg']!)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens['--lh-text-secondary']!, tokens['--lh-surface']!)).toBeGreaterThanOrEqual(4.5)
    }
  }
})

test('CSS 每个选择器限制在组件内，危险语法和嵌套拒绝', () => {
  expect(scopedCss('p, .title { color: #ffffff; padding: 12px; }', '#widget-a')).toContain('#widget-a p,#widget-a .title')
  for (const css of ['@import "x";', 'p { background-color: url(x); }', 'p { color: red; } body { position: fixed; }', 'p { color: red; .nested { color: blue; } }', 'p { --lh-bg: u\\72l(x); }', 'p { color: red } </style>']) expect(() => scopedCss(css, '#a')).toThrow()
})

test('主题参数保存、旧客户端保留配置、导入范围及 CSS 拒绝', async () => {
  const { request, cookie } = await fixture()
  const current = await (await request('/settings', 'GET', undefined, cookie)).json()
  const themeConfig = { ...DEFAULT_THEME, customSeed: true, seed: '#287356', opacity: 70, wallpaperDim: 40 }
  const result = await request('/settings', 'PUT', { ...current, themeConfig }, cookie)
  expect(result.status).toBe(200)
  const saved = await result.json()
  expect(saved.themeConfig).toEqual(themeConfig)
  expect((await request('/settings', 'PUT', { ...saved, themeConfig: { ...themeConfig, blur: 31 } }, cookie)).status).toBe(400)
  expect((await request('/settings', 'PUT', { ...saved, customCss: '@import "evil";' }, cookie)).status).toBe(400)
  delete saved.themeConfig
  expect((await request('/settings', 'PUT', saved, cookie)).status).toBe(200)
  expect((await (await request('/settings', 'GET', undefined, cookie)).json()).themeConfig).toEqual(themeConfig)
})

test('拖拽合并书签在事务内创建文件夹并拒绝过期与非法合并', async () => {
  const { request, cookie } = await fixture()
  const group = (await (await request('/bookmarks/groups', 'POST', { spaceId: 'default', name: '来源' }, cookie)).json()).group
  const references: string[] = []
  for (const title of ['甲', '乙']) {
    const result = await request('/bookmarks', 'POST', { groupId: group.id, title, url: 'https://example.com/' + title }, cookie)
    references.push((await result.json()).bookmark.id)
  }
  const desktop = { revision: 0, nodes: references.map((id, i) => ({ ...newWidget('bookmark', 'bookmark-' + i), referenceId: id })), templates: [] }
  const body = { desktop, sourceId: 'bookmark-0', targetId: 'bookmark-1' }
  expect((await request('/desktop/default/merge', 'POST', body)).status).toBe(401)
  expect((await request('/desktop/default/merge', 'POST', { ...body, targetId: 'missing' }, cookie)).status).toBe(400)
  expect((await (await request('/bookmarks/groups', 'GET', undefined, cookie)).json()).groups).toHaveLength(1)
  const response = await request('/desktop/default/merge', 'POST', body, cookie)
  expect(response.status).toBe(200)
  const merged = await response.json()
  expect(merged.nodes).toHaveLength(1)
  expect(merged.nodes[0].type).toBe('folder')
  const links = (await (await request('/bookmarks', 'GET', undefined, cookie)).json()).bookmarks
  expect(links.every((item: { groupId: string }) => item.groupId === merged.nodes[0].referenceId)).toBe(true)
  expect((await request('/desktop/default/merge', 'POST', body, cookie)).status).toBe(409)
  expect((await (await request('/bookmarks/groups', 'GET', undefined, cookie)).json()).groups).toHaveLength(2)
})

test('支持倒数日、待办清单、多形态 variant 及 frameless 无底座组件持久化', async () => {
  const { request, cookie } = await fixture()
  const clock = newWidget('clock', 'clock-analog', 'analog')
  clock.style = { opacity: 100, blur: 0, radius: 0, padding: 0, border: 0, color: '', background: '', frameless: true }
  const countdown = newWidget('countdown', 'countdown-1')
  countdown.content = '2026-10-01'
  const todo = newWidget('todo', 'todo-1')
  todo.content = JSON.stringify([{ id: '1', text: '发布新功能', done: true }])
  const folder = newWidget('folder', 'folder-launchpad', 'launchpad')
  const bookmark = newWidget('bookmark', 'bm-pill', 'pill')
  const value = { revision: 0, nodes: [clock, countdown, todo, folder, bookmark], templates: [] }
  const saved = await request('/desktop/default', 'PUT', value, cookie)
  expect(saved.status).toBe(200)
  const read = await (await request('/desktop/default', 'GET', undefined, cookie)).json() as Desktop
  expect(read.nodes).toHaveLength(5)
  expect(read.nodes.find(n => n.id === 'clock-analog')?.variant).toBe('analog')
  expect(read.nodes.find(n => n.id === 'clock-analog')?.style?.frameless).toBe(true)
  expect(read.nodes.find(n => n.id === 'countdown-1')?.content).toBe('2026-10-01')
  expect(read.nodes.find(n => n.id === 'todo-1')?.type).toBe('todo')
})

