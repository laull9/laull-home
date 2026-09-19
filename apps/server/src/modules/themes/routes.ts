import { Elysia, t } from 'elysia'
import type { ThemePackageService } from './service'
import { ThemePackageError } from './service'
import type { AuthService } from '../auth/service'
import { broadcastDesktopEvent } from '../mcp'

// 主题路由上下文依赖接口。
export interface ThemeRouteDeps {
  themeService: ThemePackageService
  authService: AuthService
}

// 组装并导出主题包相关 HTTP API 路由。
export function createThemeRoutes({ themeService, authService }: ThemeRouteDeps) {
  return new Elysia({ prefix: '/themes' })
    .onError(({ error, status }) => {
      if (error instanceof ThemePackageError) {
        return status(error.status, { code: 'THEME_ERROR', message: error.message })
      }
    })
    // 权限解析中间件，确保仅登录用户可操作主题。
    .resolve(({ cookie, status }) => {
      const token = cookie.lh_session!.value
      const user = authService.authenticate(token)
      if (!user) return status(401, { code: 'UNAUTHORIZED', message: '请先登录' })
      return { user }
    })
    // 校验主题包合法性。
    .post('/validate', async ({ body }) => {
      const file = body.file as Blob
      const buffer = Buffer.from(await file.arrayBuffer())
      const { manifest } = themeService.parseAndValidateTheme(buffer)
      return { valid: true, manifest }
    }, {
      body: t.Object({
        file: t.File(),
      }),
    })
    // 导入并应用主题包。
    .post('/import', async ({ user, body }) => {
      const file = body.file as Blob
      const buffer = Buffer.from(await file.arrayBuffer())
      const applyToCurrent = body.apply !== false
      const result = await themeService.importTheme(user.id, buffer, applyToCurrent)
      if (applyToCurrent) {
        broadcastDesktopEvent('theme.updated', { themeId: 'custom' })
      }
      return { success: true, ...result }
    }, {
      body: t.Object({
        file: t.File(),
        apply: t.Optional(t.Boolean()),
      }),
    })
    // 导出当前用户主题配置包。
    .get('/export', ({ user, query, set }) => {
      const themeName = query.name || '我的主题'
      const { filename, buffer } = themeService.exportTheme(user.id, themeName)
      set.headers['content-type'] = 'application/zip'
      set.headers['content-disposition'] = `attachment; filename="${encodeURIComponent(filename)}"`
      return buffer
    }, {
      query: t.Object({
        name: t.Optional(t.String({ maxLength: 50 })),
      }),
    })
}
