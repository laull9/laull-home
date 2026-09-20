import { afterEach, expect, test } from 'bun:test'
import { arrangeNodes, findBottomRightPlacement, newWidget, scopedCss, seedTokens, contrast, DEFAULT_THEME, type Desktop } from '@laull-home/shared'
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
  const themeConfig = { ...DEFAULT_THEME, customSeed: true, seed: '#287356', opacity: 70, wallpaperDim: 40, themeColors: { color1: '#123456', color2: '#654321' } }
  const result = await request('/settings', 'PUT', { ...current, themeConfig }, cookie)
  expect(result.status).toBe(200)
  const saved = await result.json()
  expect(saved.themeConfig).toEqual(themeConfig)
  expect((await request('/settings', 'PUT', { ...saved, themeConfig: { ...themeConfig, blur: 31 } }, cookie)).status).toBe(400)
  expect((await request('/settings', 'PUT', { ...saved, themeConfig: { ...themeConfig, themeColors: { color1: 'not-hex' } } }, cookie)).status).toBe(400)
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
  expect(bookmark.layouts.desktop.w).toBe(2)
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

test('添加组件排布算法：优先现有组件右下角紧邻空位，不从左上角起找', () => {
  // 1. 无任何组件时，首选原点 (0, 0)。
  expect(findBottomRightPlacement([], 1, 1)).toEqual({ x: 0, y: 0 })

  // 2. 模拟左上方有空缺（如 (0,0) 为空，但已有组件位于 (1,0) 2x2 和 (3,0) 1x1）。
  const nodeA = newWidget('note', 'node-a')
  nodeA.layouts.desktop = { x: 1, y: 0, w: 2, h: 2, pinned: true }
  const nodeB = newWidget('bookmark', 'node-b')
  nodeB.layouts.desktop = { x: 3, y: 0, w: 1, h: 1, pinned: true }

  // 添加 1x1 组件，期望放在紧邻右下角空位 (3, 1)，而不是回填到左上角 (0, 0)。
  const place1 = findBottomRightPlacement([nodeA, nodeB], 1, 1, 'desktop')
  expect(place1).toEqual({ x: 3, y: 1 })

  // 3. 模拟 (0,0) 2x2 与 (2,0) 1x1，添加 1x1 填补 (2,1) 右下紧邻空位。
  const nodeC = newWidget('note', 'node-c')
  nodeC.layouts.desktop = { x: 0, y: 0, w: 2, h: 2, pinned: true }
  const nodeD = newWidget('bookmark', 'node-d')
  nodeD.layouts.desktop = { x: 2, y: 0, w: 1, h: 1, pinned: true }

  const place2 = findBottomRightPlacement([nodeC, nodeD], 1, 1, 'desktop')
  expect(place2).toEqual({ x: 2, y: 1 })
})

test('胶囊信息卡书签支持 1 列紧凑并排与持久化', async () => {
  // 1. arrangeNodes 尊重 1 列胶囊卡片，支持 1x2 并排
  const pill1 = newWidget('bookmark', 'bm-pill-1', 'pill')
  pill1.layouts.desktop = { x: 0, y: 0, w: 1, h: 1, pinned: true }
  const pill2 = newWidget('bookmark', 'bm-pill-2', 'pill')
  pill2.layouts.desktop = { x: 1, y: 0, w: 1, h: 1, pinned: true }
  const placements = arrangeNodes([pill1, pill2], 'desktop')
  expect(placements.get('bm-pill-1')?.w).toBe(1)
  expect(placements.get('bm-pill-2')?.w).toBe(1)
  expect(placements.get('bm-pill-1')?.x).toBe(0)
  expect(placements.get('bm-pill-2')?.x).toBe(1)

  // 2. 服务端保存与读取 1 列胶囊卡片完整保留布局
  const { request, cookie } = await fixture()
  const doc = { revision: 0, nodes: [pill1, pill2], templates: [] }
  await request('/desktop/default', 'PUT', doc, cookie)
  const fetched = await (await request('/desktop/default', 'GET', undefined, cookie)).json() as Desktop
  expect(fetched.nodes[0]?.layouts.desktop.w).toBe(1)
  expect(fetched.nodes[1]?.layouts.desktop.w).toBe(1)
})

test('智能多向避让算法：支持向左退让、垂直避让与就近换行', () => {
  // 1. 向左推挤（左侧有空位 (0,0)，节点原在 (1,0)，新组件插入 (1,0) 且向左推，原节点优先向左退让到 (0,0)）
  const activeLeft = newWidget('bookmark', 'active-left')
  activeLeft.layouts.desktop = { x: 1, y: 0, w: 1, h: 1, pinned: true }
  const existingNode = newWidget('bookmark', 'existing-node')
  existingNode.layouts.desktop = { x: 1, y: 0, w: 1, h: 1, pinned: true }
  const leftRes = arrangeNodes([activeLeft, existingNode], 'desktop', { dx: -30, dy: 0 })
  expect(leftRes.get('active-left')).toEqual({ x: 1, y: 0, w: 1, h: 1, pinned: true })
  expect(leftRes.get('existing-node')).toEqual({ x: 0, y: 0, w: 1, h: 1, pinned: true })

  // 2. 垂直向下推挤（节点原在 (2,0)，新组件插入 (2,0) 且向下推，原节点优先垂直同列下移到 (2,1)）
  const activeDown = newWidget('bookmark', 'active-down')
  activeDown.layouts.desktop = { x: 2, y: 0, w: 1, h: 1, pinned: true }
  const nodeAt20 = newWidget('bookmark', 'node-at-20')
  nodeAt20.layouts.desktop = { x: 2, y: 0, w: 1, h: 1, pinned: true }
  const downRes = arrangeNodes([activeDown, nodeAt20], 'desktop', { dx: 0, dy: 40 })
  expect(downRes.get('active-down')).toEqual({ x: 2, y: 0, w: 1, h: 1, pinned: true })
  expect(downRes.get('node-at-20')).toEqual({ x: 2, y: 1, w: 1, h: 1, pinned: true })

  // 3. 行末向右推挤智能换行（6 列布局下最后一列 x: 5 被挤开，优先换行到下一行同列 (5,1) 或就近列，而非跳回 (0,1)）
  const activeRight = newWidget('bookmark', 'active-right')
  activeRight.layouts.tablet = { x: 5, y: 0, w: 1, h: 1, pinned: true }
  const edgeNode = newWidget('bookmark', 'edge-node')
  edgeNode.layouts.tablet = { x: 5, y: 0, w: 1, h: 1, pinned: true }
  const wrapRes = arrangeNodes([activeRight, edgeNode], 'tablet', { dx: 50, dy: 0 })
  expect(wrapRes.get('active-right')?.x).toBe(5)
  const wrappedP = wrapRes.get('edge-node')!
  expect(wrappedP.y).toBe(1)
  expect(wrappedP.x).toBeGreaterThanOrEqual(4) // 紧邻就近列，绝不生硬跳回 x: 0
})

// 文件夹内书签移出落盘至桌面成为独立书签组件。
test('文件夹内书签移出落盘至桌面生成独立书签组件并脱离分组', async () => {
  const { request, cookie } = await fixture()
  // 1. 创建分组与两个书签。
  const group = (await (await request('/bookmarks/groups', 'POST', { spaceId: 'default', name: '常用工具' }, cookie)).json()).group
  const bmRes1 = await request('/bookmarks', 'POST', { groupId: group.id, title: '工具A', url: 'https://a.com' }, cookie)
  const bmA = (await bmRes1.json()).bookmark
  const bmRes2 = await request('/bookmarks', 'POST', { groupId: group.id, title: '工具B', url: 'https://b.com' }, cookie)
  const bmB = (await bmRes2.json()).bookmark

  // 2. 初始桌面包含一个文件夹小部件。
  const folderWidget = {
    ...newWidget('folder', 'folder-1'),
    title: '常用工具',
    referenceId: group.id,
    layouts: {
      desktop: { x: 0, y: 0, w: 2, h: 2, pinned: true },
    },
  }
  const initialDesktop = { revision: 0, nodes: [folderWidget], templates: [] }
  await request('/desktop/default', 'PUT', initialDesktop, cookie)

  // 3. 模拟拖出书签 A 到桌面落点 (3, 2)：首先将书签 A 的 groupId 置空（脱离分组）。
  const updateBmRes = await request(`/bookmarks/${bmA.id}`, 'PUT', { groupId: null }, cookie)
  expect(updateBmRes.status).toBe(200)
  const updatedBmA = (await updateBmRes.json()).bookmark
  expect(updatedBmA.groupId).toBeNull()

  // 4. 将独立书签添加到桌面 nodes 数组并保存桌面。
  const newBookmarkWidget = {
    ...newWidget('bookmark', 'bm-widget-a'),
    title: bmA.title,
    referenceId: bmA.id,
    layouts: {
      desktop: { x: 3, y: 2, w: 1, h: 1, pinned: true },
    },
    style: { opacity: 100, blur: 0, radius: 16, padding: 8, border: 0, color: '', background: '', frameless: true },
  }
  const updatedDesktop = {
    revision: 1,
    nodes: [folderWidget, newBookmarkWidget],
    templates: [],
  }
  const saveRes = await request('/desktop/default', 'PUT', updatedDesktop, cookie)
  expect(saveRes.status).toBe(200)

  // 5. 验证读取桌面与分组状态：书签 A 已独立于桌面 (3, 2)，书签 B 仍在文件夹分组内。
  const desktopData = await (await request('/desktop/default', 'GET', undefined, cookie)).json() as Desktop
  expect(desktopData.nodes).toHaveLength(2)
  const savedFolder = desktopData.nodes.find(n => n.id === 'folder-1')
  const savedBm = desktopData.nodes.find(n => n.id === 'bm-widget-a')
  expect(savedFolder?.type).toBe('folder')
  expect(savedBm?.type).toBe('bookmark')
  expect(savedBm?.layouts.desktop).toEqual({ x: 3, y: 2, w: 1, h: 1, pinned: true })

  const allBookmarks = (await (await request('/bookmarks', 'GET', undefined, cookie)).json()).bookmarks
  const foundA = allBookmarks.find((b: { id: string }) => b.id === bmA.id)
  const foundB = allBookmarks.find((b: { id: string }) => b.id === bmB.id)
  expect(foundA.groupId).toBeNull()
  expect(foundB.groupId).toBe(group.id)
})

test('文件夹之间严格独立：禁止不同文件夹绑定相同分组，且各文件夹书签读写完全隔离', async () => {
  const { request, cookie } = await fixture()

  // 1. 创建两个独立的分组与各自的书签。
  const grp1Res = await request('/bookmarks/groups', 'POST', { spaceId: 'default', name: '文件夹一' }, cookie)
  const grp2Res = await request('/bookmarks/groups', 'POST', { spaceId: 'default', name: '文件夹二' }, cookie)
  const group1 = (await grp1Res.json()).group
  const group2 = (await grp2Res.json()).group

  const bm1Res = await request('/bookmarks', 'POST', { groupId: group1.id, title: '图标1', url: 'https://example.com/1' }, cookie)
  const bm2Res = await request('/bookmarks', 'POST', { groupId: group2.id, title: '图标2', url: 'https://example.com/2' }, cookie)
  const bm1 = (await bm1Res.json()).bookmark
  const bm2 = (await bm2Res.json()).bookmark

  // 2. 尝试将两个文件夹组件绑定到相同分组，服务端必须直接拦截并返回 400。
  const conflictDesktop = {
    revision: 0,
    nodes: [
      { ...newWidget('folder', 'folder-alpha', 'launchpad'), title: '文件夹一', referenceId: group1.id },
      { ...newWidget('folder', 'folder-beta', 'launchpad'), title: '文件夹二', referenceId: group1.id },
    ],
    templates: [],
  }
  const conflictSave = await request('/desktop/default', 'PUT', conflictDesktop, cookie)
  expect(conflictSave.status).toBe(400)
  expect((await conflictSave.json()).message).toBe('不同文件夹不能绑定相同分组')

  // 3. 两个文件夹分别绑定各自独立分组，保存成功。
  const independentDesktop = {
    revision: 0,
    nodes: [
      { ...newWidget('folder', 'folder-alpha', 'launchpad'), title: '文件夹一', referenceId: group1.id },
      { ...newWidget('folder', 'folder-beta', 'launchpad'), title: '文件夹二', referenceId: group2.id },
    ],
    templates: [],
  }
  const successSave = await request('/desktop/default', 'PUT', independentDesktop, cookie)
  expect(successSave.status).toBe(200)

  // 4. 从文件夹一移出书签 1 为独立书签，验证文件夹二中的书签 2 保持原状不受任何影响。
  await request(`/bookmarks/${bm1.id}`, 'PUT', { groupId: null }, cookie)
  const bookmarksList = (await (await request('/bookmarks', 'GET', undefined, cookie)).json()).bookmarks
  const updatedBm1 = bookmarksList.find((b: { id: string }) => b.id === bm1.id)
  const updatedBm2 = bookmarksList.find((b: { id: string }) => b.id === bm2.id)
  expect(updatedBm1.groupId).toBeNull()
  expect(updatedBm2.groupId).toBe(group2.id)
})

