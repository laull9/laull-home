import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 加载 sw.js 导出的安全匹配逻辑。
const swPath = join(__dirname, '../../web/public/sw.js')
const swContent = readFileSync(swPath, 'utf-8')

// 在受控沙箱上下文中执行导出逻辑以供测试。
const mod: { exports: {
  shouldBypassCache: (req: { method: string; url: string }) => boolean
  getCachePolicy?: (req: { method: string; url: string }) => string
  cacheKey?: (req: { url: string }, policy: string) => string
} } = {
  exports: { shouldBypassCache: () => false },
}

const sandboxFn = new Function('module', 'exports', swContent)
sandboxFn(mod, mod.exports)
const swModule = mod.exports

describe('PWA Service Worker 缓存排除安全红线验证', () => {
  test('所有非 GET 请求必须直接透传网络，严禁缓存', () => {
    const methods = ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']
    for (const method of methods) {
      const bypass = swModule.shouldBypassCache({
        method,
        url: 'https://example.com/api/v1/settings',
      })
      expect(bypass).toBe(true)
    }
  })

  test('所有认证相关接口必须严格排除，严禁落地任何身份凭据', () => {
    const authEndpoints = [
      'https://example.com/api/v1/auth/login',
      'https://example.com/api/v1/auth/me',
      'https://example.com/api/v1/auth/sessions',
      'https://example.com/api/v1/auth/change-password',
      'https://example.com/api/v1/auth/change-username',
      'https://example.com/api/v1/auth/logout',
    ]
    for (const url of authEndpoints) {
      expect(swModule.shouldBypassCache({ method: 'GET', url })).toBe(true)
    }
  })

  test('所有涉及隐私空间的接口与数据必须严格排除', () => {
    const privacyEndpoints = [
      'https://example.com/api/v1/spaces/privacy',
      'https://example.com/api/v1/spaces/privacy/unlock',
      'https://example.com/api/v1/desktop/privacy',
      'https://example.com/api/v1/bookmarks?spaceId=privacy',
      'https://example.com/api/v1/bookmarks/groups?spaceId=privacy',
      'https://example.com/api/v1/spaces?filter=privacy_only',
    ]
    for (const url of privacyEndpoints) {
      expect(swModule.shouldBypassCache({ method: 'GET', url })).toBe(true)
    }
  })

  test('SSE 实时通信与 MCP 协议通道严禁缓存', () => {
    const streamEndpoints = [
      'https://example.com/api/v1/desktop/events',
      'https://example.com/api/v1/mcp/sse',
      'https://example.com/api/v1/mcp/messages?sessionId=abc',
    ]
    for (const url of streamEndpoints) {
      expect(swModule.shouldBypassCache({ method: 'GET', url })).toBe(true)
    }
  })

  test('备份管理与外部微服务代理接口严禁缓存', () => {
    const sensitiveEndpoints = [
      'https://example.com/api/v1/backups/snapshots',
      'https://example.com/api/v1/backups/restore',
      'https://example.com/api/v1/integrations/int-1/widgets/w-1/data',
      'https://example.com/api/v1/integrations',
    ]
    for (const url of sensitiveEndpoints) {
      expect(swModule.shouldBypassCache({ method: 'GET', url })).toBe(true)
    }
  })

  test('普通空间核心只读 API 允许进入离线缓存策略', () => {
    const normalApiEndpoints = [
      'https://example.com/api/v1/settings',
      'https://example.com/api/v1/bookmarks',
      'https://example.com/api/v1/bookmarks/groups?spaceId=default',
      'https://example.com/api/v1/desktop/default',
      'https://example.com/api/v1/search/engines',
      'https://example.com/api/v1/spaces',
    ]
    for (const url of normalApiEndpoints) {
      expect(swModule.shouldBypassCache({ method: 'GET', url })).toBe(false)
    }
  })

  test('静态图标与壁纸图片允许进入离线高速缓存策略', () => {
    const mediaEndpoints = [
      'https://example.com/api/v1/icons/hash123.png',
      'https://example.com/api/v1/icons/google.ico',
      'https://example.com/api/v1/wallpapers/image/photo.webp',
    ]
    for (const url of mediaEndpoints) {
      expect(swModule.shouldBypassCache({ method: 'GET', url })).toBe(false)
    }
  })

  test('同源静态资产允许进入缓存策略', () => {
    const staticAssets = [
      'https://example.com/_nuxt/entry.js',
      'https://example.com/_nuxt/style.css',
      'https://example.com/favicon.ico',
      'https://example.com/manifest.webmanifest',
      'https://example.com/assets/font.woff2',
      'https://example.com/',
      'https://example.com/login',
    ]
    for (const url of staticAssets) {
      expect(swModule.shouldBypassCache({ method: 'GET', url })).toBe(false)
    }
  })

  test('页面、静态资源、媒体与普通数据使用独立策略', () => {
    expect(swModule.getCachePolicy?.({ method: 'GET', url: 'https://example.com/' })).toBe('page')
    expect(swModule.getCachePolicy?.({ method: 'GET', url: 'https://example.com/_nuxt/app.js' })).toBe('asset')
    expect(swModule.getCachePolicy?.({ method: 'GET', url: 'https://example.com/api/v1/icons/a.png' })).toBe('media')
    expect(swModule.getCachePolicy?.({ method: 'GET', url: 'https://example.com/api/v1/desktop/default' })).toBe('data')
  })

  test('媒体缓存键剔除时间戳但保留其他查询条件', () => {
    expect(swModule.cacheKey?.(
      { url: 'https://example.com/api/v1/icons/a.png?size=64&t=123&_=1' },
      'media',
    )).toBe('https://example.com/api/v1/icons/a.png?size=64')
  })

  // 开发服务器内部路径、HMR 轮询与单文件样式模块绝不能被 Service Worker 缓存，防止造成模块 MIME 类型错乱。
  test('Vite 开发特征请求与动态样式模块必须直接透传 bypass', () => {
    const devRequests = [
      'https://example.com/_nuxt/@fs/Users/laull/Projects/Ts/laull-home/node_modules/nuxt/dist/app/entry.js?v=61c23011',
      'https://example.com/_nuxt/@vite/client',
      'https://example.com/_nuxt/@id/virtual:nuxt:.nuxt%2Fcss.mjs',
      'https://example.com/_nuxt/__vite_ping',
      'https://example.com/_nuxt/components/desktop/DesktopCanvas.vue?vue&type=style&index=0&scoped=f524b238&lang.css',
      'https://example.com/_nuxt/app.vue?vue&type=style&index=0&lang.css',
      'https://example.com/_nuxt/pages/index.vue?t=1685504873151',
    ]
    for (const url of devRequests) {
      expect(swModule.shouldBypassCache({ method: 'GET', url })).toBe(true)
      expect(swModule.getCachePolicy?.({ method: 'GET', url })).toBe('bypass')
    }
  })

  // 客户端插件源码规范：必须在开发环境主动注销 Service Worker 并清理已有缓存，杜绝残留缓存导致白屏。
  test('PWA 客户端插件源码中必须包含开发环境禁用与清理逻辑', () => {
    const pluginPath = join(__dirname, '../../web/app/plugins/pwa.client.ts')
    const pluginCode = readFileSync(pluginPath, 'utf-8')
    expect(pluginCode).toContain('import.meta.dev')
    expect(pluginCode).toContain('unregister')
    expect(pluginCode).toContain('caches.delete')
  })
})
