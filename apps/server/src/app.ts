import { Elysia, t } from 'elysia'
import {
  changePasswordSchema,
  loginSchema,
  privacySetupSchema,
  privacyUnlockSchema,
  settingsSchema,
} from '@laull-home/shared'
import type { ServerConfig } from './config'
import type { AppDatabase } from './db'
import { schemaMigrations } from './db/schema'
import { AuthError, createAuthService } from './modules/auth/service'
import { createSettingsService } from './modules/settings/service'
import { createSpacesService } from './modules/spaces/service'

// 创建应用但不监听端口，便于测试与类型导出。
export function createApp(db: AppDatabase, config: ServerConfig) {
  const auth = createAuthService(db, config)
  const settings = createSettingsService(db)
  const spaces = createSpacesService(db)
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
  return new Elysia({ prefix: '/api/v1', serve: { maxRequestBodySize: 16 * 1024 } })
    .onRequest(({ request, set, status }) => {
      set.headers['cache-control'] = 'no-store'
      set.headers['x-content-type-options'] = 'nosniff'
      set.headers['x-robots-tag'] = 'noindex, nofollow'
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.get('origin') !== config.origin) {
        return status(403, { code: 'FORBIDDEN_ORIGIN', message: '请求来源不受信任' })
      }
    })
    .onError(({ code, error, status }) => {
      if (error instanceof AuthError) {
        const body = { code: 'AUTH_ERROR', message: error.message }
        if (error.status === 401) return status(401, body)
        if (error.status === 409) return status(409, body)
        return status(429, body)
      }
      const body = { code: 'REQUEST_ERROR', message: '请求路径或参数不正确' }
      if (code === 'VALIDATION' || code === 'PARSE') return status(400, body)
      if (code === 'NOT_FOUND') return status(404, body)
      return status(500, { code: 'INTERNAL_ERROR', message: '服务暂时不可用' })
    })
    .get('/health', () => {
      db.select().from(schemaMigrations).limit(1).all()
      return { status: 'ok' as const }
    })
    .post('/auth/login', async ({ body, cookie, request }) => {
      const userAgent = request.headers.get('user-agent') ?? ''
      const result = await auth.login(body.username, body.password, userAgent)
      // 重登轮换当前设备的旧 Session。
      if (typeof cookie.lh_session!.value === 'string') auth.logout(cookie.lh_session!.value)
      cookie.lh_session!.set({ ...cookieOptions, value: result.token, expires: new Date(result.expiresAt) })
      return { user: result.user }
    }, { body: loginSchema })
    .resolve(({ cookie, status }) => {
      const token = cookie.lh_session!.value
      const user = auth.authenticate(token)
      if (!user) return status(401, { code: 'UNAUTHORIZED', message: '请先登录' })
      return { user, sessionToken: token as string }
    })
    .get('/auth/me', ({ user }) => ({ user }))
    .post('/auth/logout', ({ sessionToken, cookie }) => {
      auth.logout(sessionToken)
      cookie.lh_session!.set({ ...cookieOptions, value: '', maxAge: 0, expires: new Date(0) })
      if (typeof cookie.lh_space_session?.value === 'string') {
        spaces.lock(cookie.lh_space_session.value)
        cookie.lh_space_session.set({ ...cookieOptions, value: '', maxAge: 0, expires: new Date(0) })
      }
      return { success: true }
    })
    .post('/auth/change-password', async ({ user, body, cookie, request }) => {
      const userAgent = request.headers.get('user-agent') ?? ''
      const result = await auth.changePassword(user.id, body.oldPassword, body.newPassword, userAgent)
      cookie.lh_session!.set({ ...cookieOptions, value: result.token, expires: new Date(result.expiresAt) })
      return { success: true }
    }, { body: changePasswordSchema })
    .get('/auth/sessions', ({ user, sessionToken }) => {
      return { sessions: auth.listSessions(user.id, sessionToken) }
    })
    .delete('/auth/sessions/:id', ({ user, params }) => {
      auth.revokeSession(user.id, params.id)
      return { success: true }
    }, { params: t.Object({ id: t.String() }) })
    .post('/auth/revoke-others', ({ sessionToken }) => {
      auth.revokeOthers(sessionToken)
      return { success: true }
    })
    .get('/settings', ({ user }) => settings.get(user.id))
    .put('/settings', ({ user, body, status }) => {
      const result = settings.update(user.id, body)
      return result ?? status(409, { code: 'REVISION_CONFLICT', message: '设置已在其他设备更新，请重新读取' })
    }, { body: settingsSchema })
    .get('/spaces', ({ user, cookie }) => {
      const spaceToken = typeof cookie.lh_space_session?.value === 'string' ? cookie.lh_space_session.value : undefined
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
}

// 前端只导入此类型，禁止引入后端运行时代码。
export type App = ReturnType<typeof createApp>
