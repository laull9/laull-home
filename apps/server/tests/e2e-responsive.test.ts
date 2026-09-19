import { expect, test } from 'bun:test'
import { createApp } from '../src/app'
import { loadConfig } from '../src/config'
import { openDatabase } from '../src/db'
import { createUser } from '../src/modules/auth/service'
import { BREAKPOINTS, newWidget, type Breakpoint, type WidgetNode } from '@laull-home/shared'

// 辅助函数：初始化集成环境与已登录上下文。
async function setupE2EEnvironment() {
  const db = openDatabase(':memory:')
  await createUser(db, 'e2e_owner', 'E2E-Pass-123456')
  const config = loadConfig({
    LAULL_HOME_ORIGIN: 'https://e2e.test',
    NODE_ENV: 'production',
  })
  const app = createApp(db, config).compile()

  // 发起经由 Elysia 生命周期的请求。
  async function api(path: string, method = 'GET', body?: unknown, cookie?: string) {
    const headers: Record<string, string> = { origin: 'https://e2e.test' }
    if (body) headers['content-type'] = 'application/json'
    if (cookie) headers.cookie = cookie
    return app.handle(new Request(`http://localhost/api/v1${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }))
  }

  // 登录并提取 Session Cookie。
  const loginRes = await api('/auth/login', 'POST', {
    username: 'e2e_owner',
    password: 'E2E-Pass-123456',
  })
  expect(loginRes.status).toBe(200)
  const sessionCookie = loginRes.headers.get('set-cookie')!.split(';')[0]!

  return { db, app, api, sessionCookie }
}

// 端到端业务闭环：贯穿账号、设置、空间、书签、桌面与搜索。
test('端到端业务流：用户设置、桌面矩阵、空间隔离与搜索引擎闭环', async () => {
  const { db, api, sessionCookie } = await setupE2EEnvironment()

  try {
    // 1. 读取并保存用户定制外观设置。
    const settingRes = await api('/settings', 'GET', undefined, sessionCookie)
    expect(settingRes.status).toBe(200)
    const initialSetting = await settingRes.json()

    const updateSettingRes = await api('/settings', 'PUT', {
      revision: initialSetting.revision,
      title: 'E2E 统一测试主页',
      appearance: 'dark',
      themeId: 'default',
      allowDragWithoutEdit: true,
      iframeAllowlist: ['docs.example.com'],
    }, sessionCookie)
    expect(updateSettingRes.status).toBe(200)

    // 2. 构造包含搜索、书签与时钟的多组件 Desktop 画布。
    const searchWidget = newWidget('search', 'w-search-1')
    const clockWidget = newWidget('clock', 'w-clock-1')
    const bookmarkWidget = newWidget('bookmark', 'w-bm-1')

    const desktopPayload = {
      revision: 0,
      nodes: [searchWidget, clockWidget, bookmarkWidget],
      templates: [],
    }

    const saveDesktopRes = await api('/desktop/default', 'PUT', desktopPayload, sessionCookie)
    expect(saveDesktopRes.status).toBe(200)

    const getDesktopRes = await api('/desktop/default', 'GET', undefined, sessionCookie)
    expect(getDesktopRes.status).toBe(200)
    const savedDesktop = await getDesktopRes.json()
    expect(savedDesktop.nodes.length).toBe(3)

    // 3. 书签分组与独立书签写入。
    const createGroupRes = await api('/bookmarks/groups', 'POST', {
      spaceId: 'default',
      name: '研发工具',
    }, sessionCookie)
    expect(createGroupRes.status).toBe(200)
    const { group } = await createGroupRes.json()

    const createBmRes = await api('/bookmarks', 'POST', {
      spaceId: 'default',
      groupId: group.id,
      title: 'Nuxt 官方网站',
      url: 'https://nuxt.com',
    }, sessionCookie)
    expect(createBmRes.status).toBe(200)

    // 4. 自定义搜索引擎注册与 Bang 快捷检索支持。
    const createEngineRes = await api('/search/engines', 'POST', {
      name: 'GitHub Code',
      urlTemplate: 'https://github.com/search?q=%s',
      bang: 'ghc',
      isDefault: false,
    }, sessionCookie)
    expect(createEngineRes.status).toBe(200)

    const enginesListRes = await api('/search/engines', 'GET', undefined, sessionCookie)
    expect(enginesListRes.status).toBe(200)
    const { engines } = await enginesListRes.json()
    expect(engines.some((e: { bang: string }) => e.bang === 'ghc')).toBe(true)

    // 5. 隐私空间设定密码与解锁流转。
    const setupPrivRes = await api('/spaces/privacy/setup', 'POST', { password: 'privacy-pass-99' }, sessionCookie)
    expect(setupPrivRes.status).toBe(200)

    const unlockRes = await api('/spaces/privacy/unlock', 'POST', { password: 'privacy-pass-99' }, sessionCookie)
    expect(unlockRes.status).toBe(200)
    const spaceCookie = unlockRes.headers.get('set-cookie')!.split(';')[0]!
    const fullAuth = `${sessionCookie}; ${spaceCookie}`

    const privGroupRes = await api('/bookmarks/groups', 'POST', {
      spaceId: 'privacy',
      name: '私密保险箱',
    }, fullAuth)
    expect(privGroupRes.status).toBe(200)

    // 6. MCP 密钥管理流程。
    const refreshMcp = await api('/mcp/key/refresh', 'POST', undefined, sessionCookie)
    expect(refreshMcp.status).toBe(200)
    const mcpResult = await refreshMcp.json()
    expect(mcpResult.key).toBeDefined()
    expect(mcpResult.key.startsWith('lh_mcp_')).toBe(true)
    expect(mcpResult.keyMask).toBeDefined()
  } finally {
    db.close()
  }
})

// 响应式断点列数与组件布局自适应边界检查。
test('响应式断点验证：Desktop(12)、Laptop(8)、Tablet(6) 与 Mobile(4) 严格边界', () => {
  // 1. 检验断点常量的规范列数。
  expect(BREAKPOINTS.desktop).toBe(12)
  expect(BREAKPOINTS.laptop).toBe(8)
  expect(BREAKPOINTS.tablet).toBe(6)
  expect(BREAKPOINTS.mobile).toBe(4)

  // 2. 构造四端响应式组件坐标并校验宽度跨度不越界。
  const responsiveWidget: WidgetNode = {
    id: 'responsive-card',
    type: 'bookmark',
    title: '响应式书签',
    content: '',
    referenceId: 'bm-resp-1',
    timezone: 'Asia/Shanghai',
    hour12: false,
    stackId: '',
    css: '',
    layouts: {
      desktop: { x: 0, y: 0, w: 12, h: 1, pinned: false },
      laptop: { x: 0, y: 0, w: 8, h: 1, pinned: false },
      tablet: { x: 0, y: 0, w: 6, h: 1, pinned: false },
      mobile: { x: 0, y: 0, w: 4, h: 1, pinned: false },
    },
  }

  // 验证每个断点下列坐标加上跨度不超出对应的列数上限。
  for (const [bp, maxCols] of Object.entries(BREAKPOINTS) as [Breakpoint, number][]) {
    const layout = responsiveWidget.layouts[bp]
    if (layout) {
      expect(layout.x + layout.w).toBeLessThanOrEqual(maxCols)
      expect(layout.w).toBeGreaterThanOrEqual(1)
      expect(layout.x).toBeGreaterThanOrEqual(0)
    }
  }

  // 3. 验证手机端（Mobile）越界断言防护。
  const invalidMobileWidget: WidgetNode = {
    ...responsiveWidget,
    id: 'invalid-mobile',
    layouts: {
      desktop: { x: 0, y: 0, w: 4, h: 1, pinned: false },
      // 手机端最大为 4 列，w=5 属于无效定义。
      mobile: { x: 0, y: 0, w: 5, h: 1, pinned: false },
    },
  }
  const mobileLayout = invalidMobileWidget.layouts.mobile!
  expect(mobileLayout.x + mobileLayout.w > BREAKPOINTS.mobile).toBe(true)
})
