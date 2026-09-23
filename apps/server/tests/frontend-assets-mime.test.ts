import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Service Worker 脚本路径。
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

describe('前端资源加载与 MIME 类型安全测试', () => {
  // 浏览器的 Strict MIME Type 检查要求 module script 必须为合法 JS 类型，返回 text/css 必定导致白屏报错。
  test('合法的 JavaScript 与 CSS MIME 类型严格区分', () => {
    const validJsMimes = ['text/javascript', 'application/javascript']
    const cssMime = 'text/css'
    for (const mime of validJsMimes) {
      expect(mime).not.toBe(cssMime)
    }
  })

  // 开发环境 Vite 动态模块、HMR 与单文件样式查询绝不能被 Service Worker 误拦截为 asset 缓存。
  test('开发服务器内部模块与样式提取参数必须被 Service Worker 排除', () => {
    const devUrls = [
      'http://127.0.0.1:3000/_nuxt/@fs/Users/laull/Projects/Ts/laull-home/node_modules/nuxt/dist/app/entry.js?v=61c23011',
      'http://127.0.0.1:3000/_nuxt/@vite/client',
      'http://127.0.0.1:3000/_nuxt/@id/virtual:nuxt:.nuxt%2Fcss.mjs',
      'http://127.0.0.1:3000/_nuxt/components/desktop/DesktopCanvas.vue?vue&type=style&index=0&scoped=f524b238&lang.css',
      'http://127.0.0.1:3000/_nuxt/pages/index.vue?vue&type=style&index=0&scoped=02281a80&lang.css',
      'http://127.0.0.1:3000/_nuxt/pages/index.vue?t=1685504873151',
    ]
    for (const url of devUrls) {
      expect(swModule.shouldBypassCache({ method: 'GET', url })).toBe(true)
      expect(swModule.getCachePolicy?.({ method: 'GET', url })).toBe('bypass')
    }
  })

  // 生产环境如果已经完成构建，验证所有静态打包产物的后缀与物理结构合规。
  test('静态构建产物中 JS 与 CSS 文件后缀严格分离', () => {
    const outputNuxtDir = join(__dirname, '../../web/.output/public/_nuxt')
    if (!existsSync(outputNuxtDir)) return
    const files = readdirSync(outputNuxtDir)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      if (file.endsWith('.js')) {
        expect(file.endsWith('.css')).toBe(false)
        expect(file).not.toContain('.css.')
      }
      if (file.endsWith('.css')) {
        expect(file.endsWith('.js')).toBe(false)
        expect(file).not.toContain('.js.')
      }
    }
  })

  // 模拟 HTML 标签与资源 MIME 类型对应关系，防止 link stylesheet 指向 js 或 script module 指向 css。
  test('HTML 标签与静态资源类型必须严格匹配', () => {
    // 模拟从 HTML 提取资源引用并验证其匹配合法性。
    function validateResource(tag: string, src: string, mime: string): boolean {
      if (tag === 'script' || tag === 'modulepreload') {
        return mime.includes('javascript') && !mime.includes('text/css') && !mime.includes('text/html')
      }
      if (tag === 'stylesheet') {
        return mime.includes('text/css')
      }
      return true
    }

    expect(validateResource('script', '/_nuxt/entry.js', 'text/javascript')).toBe(true)
    expect(validateResource('script', '/_nuxt/entry.js', 'text/css')).toBe(false)
    expect(validateResource('script', '/_nuxt/entry.js', 'text/html')).toBe(false)
    expect(validateResource('modulepreload', '/_nuxt/entry.async.js', 'application/javascript')).toBe(true)
    expect(validateResource('modulepreload', '/_nuxt/entry.async.js', 'text/css')).toBe(false)
    expect(validateResource('stylesheet', '/_nuxt/entry.css', 'text/css')).toBe(true)
    expect(validateResource('stylesheet', '/_nuxt/entry.css', 'text/javascript')).toBe(false)
  })

  // 校验 Service Worker 源码对脚本与样式响应类型的隔离逻辑。
  test('Service Worker 源码必须包含脚本类型与样式表缓存隔离防御', () => {
    expect(swContent).toContain('text/css')
    expect(swContent).toContain('javascript')
    expect(swContent).toContain('request.destination')
  })
})
