import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 加载 sw.js 导出的安全匹配逻辑。
const swPath = join(__dirname, '../../web/public/sw.js')
const swContent = readFileSync(swPath, 'utf-8')

// 在受控沙箱上下文中执行导出逻辑以供测试。
const mod: { exports: { shouldBypassCache: (req: { method: string; url: string }) => boolean } } = {
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

  test('动态 API 一律透传网络，不写入离线 CacheStorage', () => {
    const apiEndpoints = [
      'https://example.com/api/v1/settings',
      'https://example.com/api/v1/bookmarks',
      'https://example.com/api/v1/bookmarks/groups?spaceId=default',
      'https://example.com/api/v1/desktop/default',
      'https://example.com/api/v1/search/engines',
    ]
    for (const url of apiEndpoints) {
      expect(swModule.shouldBypassCache({ method: 'GET', url })).toBe(true)
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
})
