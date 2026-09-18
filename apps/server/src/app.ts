import { Elysia, t } from 'elysia'
import {
  changePasswordSchema,
  changeUsernameSchema,
  batchCreateWallpaperSchema,
  batchDeleteWallpapersSchema,
  createBookmarkGroupSchema,
  createBookmarkSchema,
  createSearchEngineSchema,
  createWallpaperPoolSchema,
  createWallpaperSchema,
  updateWallpaperPoolSchema,
  fetchFaviconSchema,
  loginSchema,
  privacySetupSchema,
  privacyUnlockSchema,
  reorderBookmarkGroupsSchema,
  reorderBookmarksSchema,
  searchSuggestionsQuerySchema,
  settingsSchema,
  desktopSchema,
  mergeWidgetsSchema,
  updateBookmarkGroupSchema,
  updateBookmarkSchema,
  updateSearchEngineSchema,
  updateWallpaperSchema,
} from '@laull-home/shared'
import { createDesktopService } from './modules/desktop/service'
import type { ServerConfig } from './config'
import type { AppDatabase } from './db'
import { schemaMigrations } from './db/schema'
import { AuthError, createAuthService } from './modules/auth/service'
import { BookmarkError, createBookmarkService } from './modules/bookmarks/service'
import { createFaviconService, FaviconError } from './modules/favicon/service'
import { createSearchService, SearchEngineError } from './modules/search/service'
import { createSettingsService } from './modules/settings/service'
import { createSpacesService } from './modules/spaces/service'
import { createWallpaperService, WallpaperError } from './modules/wallpapers/service'
import { createMcpProtocolRoutes, createMcpService } from './modules/mcp'

// 检查请求来源是否属于受信任的站点或本地开发环境。
export function isTrustedOrigin(originHeader: string | null | undefined, refererHeader: string | null | undefined, configOrigin: string): boolean {
  let source = originHeader
  if (!source && refererHeader) {
    try {
      source = new URL(refererHeader).origin
    } catch {
      // 忽略格式错误的 Referer。
    }
  }
  // 写操作必须携带来源头，GET/HEAD/OPTIONS 缺失时仍在安全范围内放行。
  if (!source) return false
  // 与明确配置的来源完全一致。
  if (source === configOrigin) return true

  // 本地回环地址兼容（localhost 与 127.0.0.1 互通）：
  try {
    const configuredUrl = new URL(configOrigin)
    const requestUrl = new URL(source)
    const isLoopbackConfig = ['localhost', '127.0.0.1'].includes(configuredUrl.hostname)
    const isLoopbackRequest = ['localhost', '127.0.0.1'].includes(requestUrl.hostname)
    if (isLoopbackConfig && isLoopbackRequest && configuredUrl.port === requestUrl.port && configuredUrl.protocol === requestUrl.protocol) {
      return true
    }
  } catch {
    return false
  }

  return false
}

// 创建应用但不监听端口，便于测试与类型导出。
export function createApp(db: AppDatabase, config: ServerConfig) {
  const auth = createAuthService(db, config)
  const settings = createSettingsService(db)
  const desktop = createDesktopService(db)
  const spaces = createSpacesService(db)
  const bookmarksService = createBookmarkService(db)
  const searchService = createSearchService(db)
  const faviconService = createFaviconService(config.dataDir)
  const wallpaperService = createWallpaperService(db, config.dataDir)
  const mcpService = createMcpService(db)
  const cookieOptions = {
    // 限制 Cookie 只能由 HTTP 读取。
    httpOnly: true,
    // 生产来源要求 HTTPS。
    secure: config.secureCookie,
    // 跨站请求不携带认证 Cookie。
    sameSite: 'lax' as const,
    // 同源页面与 API 共用认证。
    path: '/',
  }
  return new Elysia({ prefix: '/api/v1', serve: { maxRequestBodySize: 15 * 1024 * 1024 } })
    .onRequest(({ request, set, status }) => {
      set.headers['cache-control'] = 'no-store'
      set.headers['x-content-type-options'] = 'nosniff'
      set.headers['x-robots-tag'] = 'noindex, nofollow'
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        const origin = request.headers.get('origin')
        const referer = request.headers.get('referer')
        const hasAuthHeader = Boolean(request.headers.get('authorization'))
        // 纯 API 或 MCP 客户端使用 Authorization 凭据，在无 Origin/Referer 时免受 Cookie CSRF 约束。
        if (!hasAuthHeader || origin || referer) {
          if (!isTrustedOrigin(origin, referer, config.origin)) {
            return status(403, { code: 'FORBIDDEN_ORIGIN', message: '请求来源不受信任' })
          }
        }
      }
    })
    .onError(({ code, error, status }) => {
      if (error instanceof AuthError) {
        const body = { code: 'AUTH_ERROR', message: error.message }
        if (error.status === 401) return status(401, body)
        if (error.status === 409) return status(409, body)
        return status(429, body)
      }
      if (error instanceof BookmarkError || error instanceof SearchEngineError || error instanceof FaviconError || error instanceof WallpaperError) {
        return status(error.status, { code: 'BUSINESS_ERROR', message: error.message })
      }
      if (code === 'VALIDATION') {
        const firstError = (error as { all?: Array<{ summary?: string; message?: string }> }).all?.[0]
        const validationMessage = firstError?.summary ?? firstError?.message ?? '请求参数不正确'
        return status(400, { code: 'REQUEST_ERROR', message: validationMessage })
      }
      if (code === 'PARSE') return status(400, { code: 'REQUEST_ERROR', message: '请求数据格式不正确' })
      if (code === 'NOT_FOUND') return status(404, { code: 'REQUEST_ERROR', message: '请求路径不存在' })
      return status(500, { code: 'INTERNAL_ERROR', message: '服务暂时不可用' })
    })
    .get('/health', () => {
      db.select().from(schemaMigrations).limit(1).all()
      return { status: 'ok' as const }
    })
    .post('/auth/login', async ({ body, cookie, request, server }) => {
      const userAgent = request.headers.get('user-agent') ?? ''
      // 从请求中提取客户端 IP 用于分桶限流。
      const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || server?.requestIP(request)?.address
        || '127.0.0.1'
      const result = await auth.login(body.username, body.password, userAgent, clientIp)
      // 重登轮换当前设备的旧 Session。
      if (typeof cookie.lh_session!.value === 'string') auth.logout(cookie.lh_session!.value)
      cookie.lh_session!.set({ ...cookieOptions, value: result.token, expires: new Date(result.expiresAt) })
      return { user: result.user }
    }, { body: loginSchema })
    .get('/search/engines', () => {
      return { engines: searchService.list() }
    })
    .get('/search/suggestions', async ({ query }) => {
      const suggestions = await searchService.getSuggestions(query.q, query.engineId)
      return { suggestions }
    }, { query: searchSuggestionsQuerySchema })
    .get('/icons/:filename', ({ params, set, status }) => {
      const icon = faviconService.getIcon(params.filename)
      if (!icon) return status(404, { code: 'NOT_FOUND', message: '图标不存在' })
      set.headers['content-type'] = icon.contentType
      set.headers['cache-control'] = 'public, max-age=604800, immutable'
      set.headers['access-control-allow-origin'] = '*'
      if (icon.contentType === 'image/svg+xml') {
        set.headers['content-security-policy'] = "default-src 'none'; sandbox"
      }
      return icon.buffer
    }, { params: t.Object({ filename: t.String() }) })
    .get('/wallpapers/image/:filename', ({ params, set, status }) => {
      const image = wallpaperService.getImage(params.filename)
      if (!image) return status(404, { code: 'NOT_FOUND', message: '壁纸不存在' })
      set.headers['content-type'] = image.contentType
      set.headers['cache-control'] = 'public, max-age=604800, immutable'
      if (image.contentType === 'image/svg+xml') {
        set.headers['content-security-policy'] = "default-src 'none'; sandbox"
      }
      return image.buffer
    }, { params: t.Object({ filename: t.String() }) })
    .get('/bookmarks/groups', ({ query, cookie, status }) => {
      const spaceId = query.spaceId ?? 'default'
      const sessionToken = cookie.lh_session?.value
      const user = typeof sessionToken === 'string' ? auth.authenticate(sessionToken) : null
      const isVisitor = !user
      const spaceToken = typeof cookie.lh_space_session?.value === 'string' ? cookie.lh_space_session.value : undefined
      const isUnlocked = user ? spaces.verifyAccess(user.id, spaceId, spaceToken) : false
      if (spaceId === 'privacy' && isVisitor) return status(401, { code: 'UNAUTHORIZED', message: '请先登录' })
      if (spaceId === 'privacy' && !isUnlocked) return status(403, { code: 'FORBIDDEN', message: '隐私空间尚未解锁' })
      return { groups: bookmarksService.listGroups(spaceId, isUnlocked, isVisitor) }
    }, { query: t.Object({ spaceId: t.Optional(t.String()) }) })
    .get('/bookmarks', ({ query, cookie, status }) => {
      const spaceId = query.spaceId ?? 'default'
      const sessionToken = cookie.lh_session?.value
      const user = typeof sessionToken === 'string' ? auth.authenticate(sessionToken) : null
      const isVisitor = !user
      const spaceToken = typeof cookie.lh_space_session?.value === 'string' ? cookie.lh_space_session.value : undefined
      const isUnlocked = user ? spaces.verifyAccess(user.id, spaceId, spaceToken) : false
      if (spaceId === 'privacy' && isVisitor) return status(401, { code: 'UNAUTHORIZED', message: '请先登录' })
      if (spaceId === 'privacy' && !isUnlocked) return status(403, { code: 'FORBIDDEN', message: '隐私空间尚未解锁' })
      return { bookmarks: bookmarksService.listBookmarks(spaceId, isUnlocked, isVisitor, query.groupId) }
    }, { query: t.Object({ spaceId: t.Optional(t.String()), groupId: t.Optional(t.String()) }) })
    .use(createMcpProtocolRoutes({ mcpService, desktopService: desktop, settingsService: settings }))
    .resolve(({ cookie, status }) => {
      const token = cookie.lh_session!.value
      const user = auth.authenticate(token)
      if (!user) return status(401, { code: 'UNAUTHORIZED', message: '请先登录' })
      const spaceToken = typeof cookie.lh_space_session?.value === 'string' ? cookie.lh_space_session.value : undefined
      return { user, sessionToken: token as string, spaceToken }
    })
    .get('/auth/me', async ({ user }) => {
      const isDefaultPassword = await Bun.password.verify('admin', user.passwordHash)
      return { user: { id: user.id, username: user.username, isDefaultPassword } }
    })
    .post('/auth/logout', ({ sessionToken, cookie }) => {
      auth.logout(sessionToken)
      cookie.lh_session!.set({ ...cookieOptions, value: '', maxAge: 0, expires: new Date(0) })
      if (typeof cookie.lh_space_session?.value === 'string') {
        spaces.lock(cookie.lh_space_session.value)
        cookie.lh_space_session!.set({ ...cookieOptions, value: '', maxAge: 0, expires: new Date(0) })
      }
      return { success: true }
    })
    .post('/auth/change-password', async ({ user, body, cookie, request }) => {
      const userAgent = request.headers.get('user-agent') ?? ''
      const result = await auth.changePassword(user.id, body.oldPassword, body.newPassword, userAgent)
      cookie.lh_session!.set({ ...cookieOptions, value: result.token, expires: new Date(result.expiresAt) })
      return { success: true }
    }, { body: changePasswordSchema })
    .post('/auth/change-username', async ({ user, body }) => {
      return auth.changeUsername(user.id, body.newUsername)
    }, { body: changeUsernameSchema })
    .get('/auth/sessions', ({ user, sessionToken }) => {
      return { sessions: auth.listSessions(user.id, sessionToken) }
    })
    .delete('/auth/sessions/:id', ({ user, params }) => {
      auth.revokeSession(user.id, params.id)
      return { success: true }
    }, { params: t.Object({ id: t.String() }) })
    .post('/auth/revoke-others', ({ user, sessionToken }) => {
      auth.revokeOthers(user.id, sessionToken)
      return { success: true }
    })
    .get('/settings', ({ user }) => settings.get(user.id))
    .put('/settings', ({ user, body, status }) => {
      const result = settings.update(user.id, body)
      return result ?? status(409, { code: 'REVISION_CONFLICT', message: '设置已在其他设备更新，请重新读取' })
    }, { body: settingsSchema })
    .post('/desktop/:spaceId/merge', ({ user, params, body, spaceToken, status }) => {
      if (!spaces.verifyAccess(user.id, params.spaceId, spaceToken)) return status(403, { code: 'FORBIDDEN', message: '空间不存在或尚未解锁' })
      return desktop.merge(params.spaceId, body.desktop, body.sourceId, body.targetId) ?? status(409, { code: 'REVISION_CONFLICT', message: '布局已更新，请重新读取' })
    }, { params: t.Object({ spaceId: t.String({ maxLength: 64 }) }), body: mergeWidgetsSchema })
    .get('/desktop/:spaceId', ({ user, params, spaceToken, status }) => {
      if (!spaces.verifyAccess(user.id, params.spaceId, spaceToken)) return status(403, { code: 'FORBIDDEN', message: '空间不存在或尚未解锁' })
      return desktop.get(params.spaceId)
    }, { params: t.Object({ spaceId: t.String({ maxLength: 64 }) }) })
    .put('/desktop/:spaceId', ({ user, params, body, spaceToken, status }) => {
      if (!spaces.verifyAccess(user.id, params.spaceId, spaceToken)) return status(403, { code: 'FORBIDDEN', message: '空间不存在或尚未解锁' })
      return desktop.save(params.spaceId, body) ?? status(409, { code: 'REVISION_CONFLICT', message: '布局已在其他设备更新，请重新读取' })
    }, { params: t.Object({ spaceId: t.String({ maxLength: 64 }) }), body: desktopSchema })
    .get('/spaces', ({ user, spaceToken }) => {
      return { spaces: spaces.list(user.id, spaceToken) }
    })
    .post('/spaces/privacy/setup', async ({ user, body }) => {
      await spaces.setupPassword(user.id, 'privacy', body.password)
      return { success: true }
    }, { body: privacySetupSchema })
    .post('/spaces/privacy/unlock', async ({ user, body, cookie }) => {
      const result = await spaces.unlock(user.id, 'privacy', body.password)
      cookie.lh_space_session!.set({ ...cookieOptions, value: result.token, expires: new Date(result.expiresAt) })
      return { success: true, expiresAt: result.expiresAt }
    }, { body: privacyUnlockSchema })
    .post('/spaces/privacy/lock', ({ cookie }) => {
      if (typeof cookie.lh_space_session?.value === 'string') {
        spaces.lock(cookie.lh_space_session.value)
      }
      cookie.lh_space_session!.set({ ...cookieOptions, value: '', maxAge: 0, expires: new Date(0) })
      return { success: true }
    })
    .post('/bookmarks/groups', ({ user, body, spaceToken }) => {
      const isUnlocked = spaces.verifyAccess(user.id, body.spaceId, spaceToken)
      return { group: bookmarksService.createGroup(body, isUnlocked) }
    }, { body: createBookmarkGroupSchema })
    .put('/bookmarks/groups/:id', ({ user, params, body, spaceToken }) => {
      const isUnlocked = spaces.verifyAccess(user.id, 'privacy', spaceToken)
      return { group: bookmarksService.updateGroup(params.id, body, isUnlocked) }
    }, { params: t.Object({ id: t.String() }), body: updateBookmarkGroupSchema })
    .delete('/bookmarks/groups/:id', ({ user, params, spaceToken }) => {
      const isUnlocked = spaces.verifyAccess(user.id, 'privacy', spaceToken)
      bookmarksService.deleteGroup(params.id, isUnlocked)
      return { success: true }
    }, { params: t.Object({ id: t.String() }) })
    .post('/bookmarks/groups/reorder', ({ user, query, body, spaceToken }) => {
      const spaceId = query.spaceId ?? 'default'
      const isUnlocked = spaces.verifyAccess(user.id, spaceId, spaceToken)
      bookmarksService.reorderGroups(spaceId, body, isUnlocked)
      return { success: true }
    }, { query: t.Object({ spaceId: t.Optional(t.String()) }), body: reorderBookmarkGroupsSchema })
    .post('/bookmarks', ({ user, body, spaceToken }) => {
      const isUnlocked = spaces.verifyAccess(user.id, 'privacy', spaceToken)
      return { bookmark: bookmarksService.createBookmark(body, isUnlocked) }
    }, { body: createBookmarkSchema })
    .put('/bookmarks/:id', ({ user, params, body, spaceToken }) => {
      const isUnlocked = spaces.verifyAccess(user.id, 'privacy', spaceToken)
      return { bookmark: bookmarksService.updateBookmark(params.id, body, isUnlocked) }
    }, { params: t.Object({ id: t.String() }), body: updateBookmarkSchema })
    .delete('/bookmarks/:id', ({ user, params, spaceToken }) => {
      const isUnlocked = spaces.verifyAccess(user.id, 'privacy', spaceToken)
      bookmarksService.deleteBookmark(params.id, isUnlocked)
      return { success: true }
    }, { params: t.Object({ id: t.String() }) })
    .post('/bookmarks/reorder', ({ user, body, spaceToken }) => {
      const isUnlocked = spaces.verifyAccess(user.id, 'privacy', spaceToken)
      bookmarksService.reorderBookmarks(body, isUnlocked)
      return { success: true }
    }, { body: reorderBookmarksSchema })
    .post('/search/engines', ({ body }) => {
      return { engine: searchService.create(body) }
    }, { body: createSearchEngineSchema })
    .put('/search/engines/:id', ({ params, body }) => {
      return { engine: searchService.update(params.id, body) }
    }, { params: t.Object({ id: t.String() }), body: updateSearchEngineSchema })
    .delete('/search/engines/:id', ({ params }) => {
      searchService.delete(params.id)
      return { success: true }
    }, { params: t.Object({ id: t.String() }) })
    .post('/favicon/fetch', async ({ body }) => {
      const iconUrl = await faviconService.fetchAndCache(body.url, body.forceRefresh ?? false)
      return { iconUrl }
    }, { body: fetchFaviconSchema })
    .get('/wallpapers/pools', ({ user }) => {
      return { pools: wallpaperService.listPools(user.id) }
    })
    .post('/wallpapers/pools', ({ user, body }) => {
      return { pool: wallpaperService.createPool(user.id, body) }
    }, { body: createWallpaperPoolSchema })
    .put('/wallpapers/pools/:id', ({ user, params, body }) => {
      return { pool: wallpaperService.updatePool(user.id, params.id, body) }
    }, { params: t.Object({ id: t.String() }), body: updateWallpaperPoolSchema })
    .delete('/wallpapers/pools/:id', ({ user, params }) => {
      wallpaperService.deletePool(user.id, params.id)
      return { success: true }
    }, { params: t.Object({ id: t.String() }) })
    .get('/wallpapers', ({ user, query }) => {
      return { wallpapers: wallpaperService.list(user.id, query.poolId) }
    }, { query: t.Object({ poolId: t.Optional(t.String()) }) })
    .post('/wallpapers', ({ user, body }) => {
      return { wallpaper: wallpaperService.create(user.id, body) }
    }, { body: createWallpaperSchema })
    .post('/wallpapers/batch', ({ user, body }) => {
      return { wallpapers: wallpaperService.createBatch(user.id, body.items, body.poolId) }
    }, { body: batchCreateWallpaperSchema })
    .post('/wallpapers/batch-delete', ({ user, body }) => {
      const result = wallpaperService.deleteBatch(user.id, body.ids)
      return { success: true, ...result }
    }, { body: batchDeleteWallpapersSchema })
    .post('/wallpapers/upload', async ({ user, body }) => {
      const wallpaper = await wallpaperService.saveUpload(user.id, body.file, body.name, body.poolId, body.fitMode)
      return { wallpaper }
    }, {
      body: t.Object({
        file: t.File(),
        name: t.Optional(t.String()),
        poolId: t.Optional(t.String()),
        fitMode: t.Optional(t.String()),
      }),
    })
    .put('/wallpapers/:id', ({ user, params, body }) => {
      return { wallpaper: wallpaperService.update(user.id, params.id, body) }
    }, { params: t.Object({ id: t.String() }), body: updateWallpaperSchema })
    .delete('/wallpapers/:id', ({ user, params }) => {
      wallpaperService.delete(user.id, params.id)
      return { success: true }
    }, { params: t.Object({ id: t.String() }) })
    // 获取当前账号的 MCP 密钥元数据。
    .get('/mcp/key', ({ user }) => mcpService.getKeyMetadata(user.id))
    // 签发或单向刷新 MCP 密钥。
    .post('/mcp/key/refresh', ({ user }) => mcpService.refreshKey(user.id))
    // 停用并吊销 MCP 密钥。
    .delete('/mcp/key', ({ user }) => ({ success: mcpService.revokeKey(user.id) }))
}

// 前端只导入此类型，禁止引入后端运行时代码。
export type App = ReturnType<typeof createApp>
