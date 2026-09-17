import { describe, expect, it } from 'bun:test'
import { createApp } from '../src/app'
import { openDatabase } from '../src/db'
import { createAuthService, ensureInitialUser } from '../src/modules/auth/service'
import { createDesktopService } from '../src/modules/desktop/service'
import { createMcpService } from '../src/modules/mcp/service'
import { createMcpServer } from '../src/modules/mcp/server'
import { createSettingsService } from '../src/modules/settings/service'
import { WebSseServerTransport } from '../src/modules/mcp/transport'
import { broadcastDesktopEvent, clearActiveClients, getActiveClientsCount, subscribeDesktopEvents } from '../src/modules/mcp/events'
import type { ServerConfig } from '../src/config'

// 构造隔离的测试配置与内存数据库。
async function createTestEnv() {
  const db = openDatabase(':memory:')
  await ensureInitialUser(db)
  const config: ServerConfig = {
    port: 3001,
    host: '127.0.0.1',
    origin: 'http://localhost:3000',
    dataDir: ':memory:',
    databasePath: ':memory:',
    sessionDays: 7,
    secureCookie: false,
  }
  const auth = createAuthService(db, config)
  const app = createApp(db, config)
  return { db, config, auth, app }
}

describe('MCP 密钥管理与安全存储', () => {
  it('密钥生成、单向展示、掩码脱敏与单向刷新', async () => {
    const { db, auth } = await createTestEnv()
    const loginResult = await auth.login('admin', 'admin', 'test-agent')
    const userId = loginResult.user.id
    const mcpService = createMcpService(db)

    // 初始状态无密钥。
    const initialMeta = mcpService.getKeyMetadata(userId)
    expect(initialMeta.hasKey).toBe(false)
    expect(initialMeta.keyMask).toBeNull()

    // 首次签发密钥，明文返回且为统一前缀。
    const firstKey = mcpService.refreshKey(userId)
    expect(firstKey.key.startsWith('lh_mcp_')).toBe(true)
    expect(firstKey.keyMask.startsWith('lh_mcp_••••••••')).toBe(true)
    expect(firstKey.keyMask.endsWith(firstKey.key.slice(-4))).toBe(true)

    // 数据库仅保存 SHA-256 哈希，不存明文。
    const verifiedUser = mcpService.verifyKey(firstKey.key)
    expect(verifiedUser?.id).toBe(userId)

    // 反查元数据时无法获取明文。
    const metaAfterCreate = mcpService.getKeyMetadata(userId)
    expect(metaAfterCreate.hasKey).toBe(true)
    expect(metaAfterCreate.keyMask).toBe(firstKey.keyMask)

    // 单向刷新：旧密钥立即作废，签发新密钥。
    const secondKey = mcpService.refreshKey(userId)
    expect(secondKey.key).not.toBe(firstKey.key)
    expect(mcpService.verifyKey(firstKey.key)).toBeNull()
    expect(mcpService.verifyKey(secondKey.key)?.id).toBe(userId)

    // 彻底停用并吊销。
    const revoked = mcpService.revokeKey(userId)
    expect(revoked).toBe(true)
    expect(mcpService.verifyKey(secondKey.key)).toBeNull()
    expect(mcpService.getKeyMetadata(userId).hasKey).toBe(false)
  })

  it('Web API 密钥管理接口权限校验', async () => {
    const { app, auth } = await createTestEnv()
    // 未登录访问受限。
    const unauthGet = await app.handle(new Request('http://localhost:3000/api/v1/mcp/key'))
    expect(unauthGet.status).toBe(401)

    // 登录后签发。
    const loginResult = await auth.login('admin', 'admin', 'test-agent')
    const cookieHeader = `lh_session=${loginResult.token}`

    const refreshRes = await app.handle(new Request('http://localhost:3000/api/v1/mcp/key/refresh', {
      method: 'POST',
      headers: { cookie: cookieHeader, origin: 'http://localhost:3000' },
    }))
    expect(refreshRes.status).toBe(200)
    const keyData = await refreshRes.json()
    expect(keyData.key.startsWith('lh_mcp_')).toBe(true)

    // 读取脱敏信息。
    const getRes = await app.handle(new Request('http://localhost:3000/api/v1/mcp/key', {
      headers: { cookie: cookieHeader },
    }))
    expect(getRes.status).toBe(200)
    const metaData = await getRes.json()
    expect(metaData.hasKey).toBe(true)
    expect(metaData.keyMask).toBe(keyData.keyMask)

    // 停用密钥。
    const deleteRes = await app.handle(new Request('http://localhost:3000/api/v1/mcp/key', {
      method: 'DELETE',
      headers: { cookie: cookieHeader, origin: 'http://localhost:3000' },
    }))
    expect(deleteRes.status).toBe(200)
    const deleteResult = await deleteRes.json()
    expect(deleteResult.success).toBe(true)
  })
})

describe('MCP 远程 SSE 握手与消息路由', () => {
  it('Bearer Token 校验与建立连接', async () => {
    const { app, db, auth } = await createTestEnv()
    const loginResult = await auth.login('admin', 'admin', 'test-agent')
    const mcpService = createMcpService(db)
    const keyData = mcpService.refreshKey(loginResult.user.id)

    // 无 Token 拒绝。
    const noTokenRes = await app.handle(new Request('http://localhost:3000/api/v1/mcp/sse'))
    expect(noTokenRes.status).toBe(401)

    // 错误 Token 拒绝。
    const badTokenRes = await app.handle(new Request('http://localhost:3000/api/v1/mcp/sse', {
      headers: { authorization: 'Bearer invalid_mcp_token' },
    }))
    expect(badTokenRes.status).toBe(401)

    // 合法 Token 成功建立 SSE 流。
    const sseRes = await app.handle(new Request('http://localhost:3000/api/v1/mcp/sse', {
      headers: { authorization: `Bearer ${keyData.key}` },
    }))
    expect(sseRes.status).toBe(200)
    expect(sseRes.headers.get('content-type')).toContain('text/event-stream')

    // 读取首个数据块确认下发了 endpoint 事件。
    const reader = sseRes.body?.getReader()
    const chunk = await reader?.read()
    const text = new TextDecoder().decode(chunk?.value)
    expect(text).toContain('event: endpoint')
    expect(text).toContain('sessionId=')
    void reader?.cancel()
  })

  it('POST 消息未携带有效 session 时返回 404', async () => {
    const { app, db, auth } = await createTestEnv()
    const loginResult = await auth.login('admin', 'admin', 'test-agent')
    const mcpService = createMcpService(db)
    const keyData = mcpService.refreshKey(loginResult.user.id)

    const postRes = await app.handle(new Request('http://localhost:3000/api/v1/mcp/messages?sessionId=non-existent-session', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${keyData.key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    }))
    expect(postRes.status).toBe(404)
  })
})

describe('MCP Tools 工具矩阵行为执行', () => {
  it('外观工具：读取配置、写入合法 CSS 及非法 CSS 拦截', async () => {
    const { db } = await createTestEnv()
    const desktopService = createDesktopService(db)
    const settingsService = createSettingsService(db)
    const server = createMcpServer({ userId: 1, desktopService, settingsService })

    const transport = new WebSseServerTransport('/dummy')
    let sseOutput = ''
    transport.bindStream({
      enqueue(chunk: Uint8Array) { sseOutput += new TextDecoder().decode(chunk) },
      close() {},
      error() {},
    } as unknown as ReadableStreamDefaultController)
    await server.connect(transport)

    // 读取主题和 CSS。
    const getThemeMsg = { jsonrpc: '2.0' as const, id: 1, method: 'tools/call', params: { name: 'get_theme_and_css', arguments: {} } }
    transport.handlePostMessage(getThemeMsg)
    await Bun.sleep(20)
    expect(sseOutput).toContain('seed')

    // 覆盖写入合法 CSS。
    sseOutput = ''
    const setCssMsg = { jsonrpc: '2.0' as const, id: 2, method: 'tools/call', params: { name: 'set_custom_css', arguments: { css: '.test { color: red; }' } } }
    transport.handlePostMessage(setCssMsg)
    await Bun.sleep(20)
    expect(sseOutput).toContain('success')

    // 验证设置服务已持久化。
    const currentSettings = settingsService.get(1)
    expect(currentSettings.customCss).toContain('.test { color: red; }')

    // 拦截非法 CSS（如外部 url 或危险字符）。
    sseOutput = ''
    const badCssMsg = { jsonrpc: '2.0' as const, id: 3, method: 'tools/call', params: { name: 'set_custom_css', arguments: { css: 'body { background: url("http://evil.com/x"); }' } } }
    transport.handlePostMessage(badCssMsg)
    await Bun.sleep(20)
    expect(sseOutput).toContain('isError')

    // 切换种子色。
    sseOutput = ''
    const setThemeMsg = { jsonrpc: '2.0' as const, id: 4, method: 'tools/call', params: { name: 'set_theme', arguments: { seed: '#10b981', opacity: 90 } } }
    transport.handlePostMessage(setThemeMsg)
    await Bun.sleep(20)
    expect(sseOutput).toContain('#10b981')
    expect(settingsService.get(1).themeConfig?.seed).toBe('#10b981')

    // 调整壁纸遮罩滤镜。
    sseOutput = ''
    const backdropMsg = { jsonrpc: '2.0' as const, id: 5, method: 'tools/call', params: { name: 'set_wallpaper_backdrop', arguments: { dim: 40, blur: 10 } } }
    transport.handlePostMessage(backdropMsg)
    await Bun.sleep(20)
    expect(settingsService.get(1).themeConfig?.wallpaperDim).toBe(40)
    expect(settingsService.get(1).themeConfig?.wallpaperBlur).toBe(10)

    void transport.close()
  })

  it('组件生命周期：增删改、Scoped CSS、克隆与模板沉淀', async () => {
    const { db } = await createTestEnv()
    const desktopService = createDesktopService(db)
    const settingsService = createSettingsService(db)
    const server = createMcpServer({ userId: 1, desktopService, settingsService })

    const transport = new WebSseServerTransport('/dummy')
    let sseOutput = ''
    transport.bindStream({
      enqueue(chunk: Uint8Array) { sseOutput += new TextDecoder().decode(chunk) },
      close() {},
      error() {},
    } as unknown as ReadableStreamDefaultController)
    await server.connect(transport)

    // 添加时钟组件。
    const addMsg = { jsonrpc: '2.0' as const, id: 10, method: 'tools/call', params: { name: 'add_widget', arguments: { type: 'clock', title: '世界时钟' } } }
    transport.handlePostMessage(addMsg)
    await Bun.sleep(20)
    expect(sseOutput).toContain('世界时钟')

    const currentDesktop = desktopService.get('default')
    const clockWidget = currentDesktop.nodes.find(n => n.title === '世界时钟')!
    expect(clockWidget).toBeDefined()

    // 修改组件参数。
    sseOutput = ''
    const updateMsg = { jsonrpc: '2.0' as const, id: 11, method: 'tools/call', params: { name: 'update_widget', arguments: { widgetId: clockWidget.id, title: '伦敦时钟', timezone: 'Europe/London' } } }
    transport.handlePostMessage(updateMsg)
    await Bun.sleep(20)
    expect(desktopService.get('default').nodes.find(n => n.id === clockWidget.id)?.timezone).toBe('Europe/London')

    // 设置独立 Scoped CSS。
    sseOutput = ''
    const cssMsg = { jsonrpc: '2.0' as const, id: 12, method: 'tools/call', params: { name: 'set_widget_css', arguments: { widgetId: clockWidget.id, css: '.clock-face { font-size: 20px; }' } } }
    transport.handlePostMessage(cssMsg)
    await Bun.sleep(20)
    expect(desktopService.get('default').nodes.find(n => n.id === clockWidget.id)?.css).toContain('.clock-face')

    // 克隆组件。
    sseOutput = ''
    const cloneMsg = { jsonrpc: '2.0' as const, id: 13, method: 'tools/call', params: { name: 'clone_widget', arguments: { widgetId: clockWidget.id } } }
    transport.handlePostMessage(cloneMsg)
    await Bun.sleep(20)
    const cloned = desktopService.get('default').nodes.find(n => n.title.includes('副本'))
    expect(cloned).toBeDefined()

    // 沉淀为模板。
    sseOutput = ''
    const tplMsg = { jsonrpc: '2.0' as const, id: 14, method: 'tools/call', params: { name: 'save_widget_as_template', arguments: { widgetId: clockWidget.id, templateTitle: '时钟模板' } } }
    transport.handlePostMessage(tplMsg)
    await Bun.sleep(20)
    expect(desktopService.get('default').templates.some(t => t.title === '时钟模板')).toBe(true)

    // 删除组件。
    sseOutput = ''
    const delMsg = { jsonrpc: '2.0' as const, id: 15, method: 'tools/call', params: { name: 'delete_widget', arguments: { widgetId: clockWidget.id } } }
    transport.handlePostMessage(delMsg)
    await Bun.sleep(20)
    expect(desktopService.get('default').nodes.some(n => n.id === clockWidget.id)).toBe(false)

    void transport.close()
  })

  it('网格排布工具：读取排布、平移、缩放、锁定与批量重排', async () => {
    const { db } = await createTestEnv()
    const desktopService = createDesktopService(db)
    const settingsService = createSettingsService(db)
    const server = createMcpServer({ userId: 1, desktopService, settingsService })

    const transport = new WebSseServerTransport('/dummy')
    let sseOutput = ''
    transport.bindStream({
      enqueue(chunk: Uint8Array) { sseOutput += new TextDecoder().decode(chunk) },
      close() {},
      error() {},
    } as unknown as ReadableStreamDefaultController)
    await server.connect(transport)

    const initialNodes = desktopService.get('default').nodes
    const targetNode = initialNodes[0]!

    // 读取布局。
    const getLayoutMsg = { jsonrpc: '2.0' as const, id: 20, method: 'tools/call', params: { name: 'get_layout', arguments: { breakpoint: 'desktop' } } }
    transport.handlePostMessage(getLayoutMsg)
    await Bun.sleep(20)
    expect(sseOutput).toContain('columns')

    // 平移坐标。
    sseOutput = ''
    const moveMsg = { jsonrpc: '2.0' as const, id: 21, method: 'tools/call', params: { name: 'move_widget', arguments: { widgetId: targetNode.id, x: 2, y: 3 } } }
    transport.handlePostMessage(moveMsg)
    await Bun.sleep(20)
    expect(desktopService.get('default').nodes.find(n => n.id === targetNode.id)?.layouts.desktop.x).toBe(2)

    // 调整尺寸。
    sseOutput = ''
    const resizeMsg = { jsonrpc: '2.0' as const, id: 22, method: 'tools/call', params: { name: 'resize_widget', arguments: { widgetId: targetNode.id, colSpan: 4, rowSpan: 1 } } }
    transport.handlePostMessage(resizeMsg)
    await Bun.sleep(20)
    expect(desktopService.get('default').nodes.find(n => n.id === targetNode.id)?.layouts.desktop.w).toBe(4)

    // 锁定固定锚点。
    sseOutput = ''
    const pinMsg = { jsonrpc: '2.0' as const, id: 23, method: 'tools/call', params: { name: 'pin_widget', arguments: { widgetId: targetNode.id, pinned: true } } }
    transport.handlePostMessage(pinMsg)
    await Bun.sleep(20)
    expect(desktopService.get('default').nodes.find(n => n.id === targetNode.id)?.layouts.desktop.pinned).toBe(true)

    // 批量重排。
    sseOutput = ''
    const batchMsg = {
      jsonrpc: '2.0' as const,
      id: 24,
      method: 'tools/call',
      params: {
        name: 'batch_update_layout',
        arguments: {
          placements: [{ widgetId: targetNode.id, x: 0, y: 0, colSpan: 6, rowSpan: 1 }],
        },
      },
    }
    transport.handlePostMessage(batchMsg)
    await Bun.sleep(20)
    expect(desktopService.get('default').nodes.find(n => n.id === targetNode.id)?.layouts.desktop.w).toBe(6)

    void transport.close()
  })
})

describe('桌面事件热重载广播系统', () => {
  it('广播分发与订阅者生命周期管理', () => {
    clearActiveClients()
    expect(getActiveClientsCount()).toBe(0)

    let receivedData = ''
    const mockController = {
      enqueue(chunk: Uint8Array) {
        receivedData += new TextDecoder().decode(chunk)
      },
    } as ReadableStreamDefaultController

    const unsubscribe = subscribeDesktopEvents(mockController)
    expect(getActiveClientsCount()).toBe(1)
    expect(receivedData).toContain(': keepalive')

    // 广播组件更新。
    receivedData = ''
    broadcastDesktopEvent('widget.updated', { action: 'added' })
    expect(receivedData).toContain('event: widget.updated')
    expect(receivedData).toContain('"action":"added"')

    // 广播布局更新。
    receivedData = ''
    broadcastDesktopEvent('layout.updated', { spaceId: 'default' })
    expect(receivedData).toContain('event: layout.updated')

    // 取消订阅。
    unsubscribe()
    expect(getActiveClientsCount()).toBe(0)
  })
})
