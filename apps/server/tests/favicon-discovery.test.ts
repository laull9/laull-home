import { test, expect } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverManifestIcons, discoverPageIcons } from '../src/modules/favicon/discovery'
import { assertSafeOutboundUrl, createFaviconService } from '../src/modules/favicon/service'
import { findBrowserIcon, persistBrowserIcon, probeIconImage } from '../../web/app/utils/favicon'

test('解析重定向页面的 base、属性空格、未引号路径和实体，忽略脚本及注释', () => {
  expect(discoverPageIcons(`<!-- <link rel=icon href=/fake> -->
    <script>const value = '<link rel=icon href=/fake2>'</script>
    <base href="../assets/"><link REL = 'shortcut icon' href = 'logo.png?v=1&amp;x=2'>
    <link rel=manifest href=app.webmanifest><link rel=icon href=javascript:alert(1)>`,
  'https://site.test/app/login/')).toEqual({
    icons: ['https://site.test/app/assets/logo.png?v=1&x=2'],
    manifests: ['https://site.test/app/assets/app.webmanifest'],
  })
  expect(discoverManifestIcons('{"icons":[null,{"src":"./logo.png"},{"src":"file:///tmp/a"}]}', 'https://site.test/app/manifest.json'))
    .toEqual(['https://site.test/app/logo.png'])
  expect(discoverManifestIcons('invalid', 'https://site.test')).toEqual([])
})

test('重定向后的 manifest 图标被缓存，刷新失败保留旧图标且端口相互隔离', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'favicon-discovery-'))
  const original = globalThis.fetch
  const requested: string[] = []
  let failing = false
  // 测试注入解析器，避免真实 DNS 和网络请求。
  const service = createFaviconService(dir, async target => ({ url: new URL(target), resolvedIp: '93.184.216.34' }))
  try {
    globalThis.fetch = (async input => {
      const url = String(input)
      requested.push(url)
      if (failing) return new Response('blocked', { status: 403 })
      if (url === 'https://site.test/start') return new Response(null, { status: 302, headers: { location: '/app/' } })
      if (url === 'https://site.test/app/') return new Response('<link rel=manifest href=manifest.json>', { headers: { 'content-type': 'text/html' } })
      if (url === 'https://site.test/app/manifest.json') return new Response('{"icons":[{"src":"assets/logo.png"}]}')
      if (url === 'https://site.test/app/assets/logo.png') return new Response(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      return new Response('missing', { status: 404 })
    }) as typeof fetch
    const first = await service.fetchAndCache('https://site.test/start')
    expect(first.iconUrl).toMatch(/\.png$/)
    expect(requested).toContain('https://site.test/app/assets/logo.png')
    requested.length = 0
    expect((await service.fetchAndCache('https://site.test/start')).iconUrl).toBe(first.iconUrl)
    expect(requested).toHaveLength(0)
    failing = true
    expect((await service.fetchAndCache('https://site.test/start', true)).iconUrl).toBe(first.iconUrl)
    expect((await service.fetchAndCache('https://site.test:8443/start')).iconUrl).toBe('')
  } finally {
    globalThis.fetch = original
    rmSync(dir, { recursive: true, force: true })
  }
})

test('浏览器图片可加载但 CORS 下载失败时保留直链，加载失败不接受地址', async () => {
  const originalImage = globalThis.Image
  const originalFetch = globalThis.fetch
  // 模拟图片加载事件，不访问实际站点。
  class FakeImage {
    naturalWidth = 32
    naturalHeight = 32
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    // 根据地址模拟成功或失败。
    set src(value: string) {
      if (value.includes('timeout')) return
      queueMicrotask(() => value.includes('missing') ? this.onerror?.() : this.onload?.())
    }
    // 清理接口与浏览器保持一致。
    removeAttribute() {}
  }
  try {
    globalThis.Image = FakeImage as unknown as typeof Image
    expect(await probeIconImage('https://site.test/icon.png')).toBe('https://site.test/icon.png')
    expect(await probeIconImage('https://site.test/missing')).toBe('')
    expect(await probeIconImage('https://site.test/timeout', 5)).toBe('')
    expect(await findBrowserIcon(['javascript:alert(1)', 'https://site.test/missing', 'https://site.test/icon.png'])).toBe('https://site.test/icon.png')
    globalThis.fetch = (async () => { throw new TypeError('CORS') }) as unknown as typeof fetch
    expect(await persistBrowserIcon('https://site.test/icon.png', async () => 'uploaded')).toBe('https://site.test/icon.png')
    globalThis.fetch = (async () => new Response('png', { headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch
    expect(await persistBrowserIcon('https://site.test/icon.png', async () => '/api/v1/icons/uploaded.png')).toBe('/api/v1/icons/uploaded.png')
  } finally {
    globalThis.Image = originalImage
    globalThis.fetch = originalFetch
  }
})


test('图标声明和重定向不能使服务器访问内网，带凭据和非 HTTP 地址被拒绝', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'favicon-security-'))
  const original = globalThis.fetch
  const requested: string[] = []
  // 公网解析固定返回测试 IP，内网仍执行生产校验。
  const service = createFaviconService(dir, async target => {
    const url = new URL(target)
    if (url.hostname === '127.0.0.1') return assertSafeOutboundUrl(target)
    return { url, resolvedIp: '93.184.216.34' }
  })
  try {
    globalThis.fetch = (async input => {
      const url = String(input)
      requested.push(url)
      if (url === 'https://site.test/') return new Response('<link rel=icon href=http://127.0.0.1/secret><link rel=manifest href=/manifest>', { headers: { 'content-type': 'text/html' } })
      if (url === 'https://site.test/manifest') return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } })
      return new Response('blocked', { status: 403 })
    }) as typeof fetch
    expect((await service.fetchAndCache('https://site.test/')).iconUrl).toBe('')
    expect(requested.some(url => url.includes('127.0.0.1'))).toBe(false)
    await expect(assertSafeOutboundUrl('https://user:pass@site.test')).rejects.toThrow()
    await expect(assertSafeOutboundUrl('file:///tmp/icon')).rejects.toThrow()
  } finally {
    globalThis.fetch = original
    rmSync(dir, { recursive: true, force: true })
  }
})


test('页面返回防护错误时仍探测同站点图标资源', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'favicon-protected-'))
  const original = globalThis.fetch
  // 固定 DNS 与响应，复现页面受保护但图片允许访问的站点。
  const service = createFaviconService(dir, async target => ({ url: new URL(target), resolvedIp: '93.184.216.34' }))
  try {
    globalThis.fetch = (async input => String(input) === 'https://site.test/favicon.ico'
      ? new Response(Buffer.from([0, 0, 1, 0, 1, 0]))
      : new Response('challenge', { status: 403 })) as typeof fetch
    expect((await service.fetchAndCache('https://site.test/')).iconUrl).toMatch(/\.ico$/)
  } finally {
    globalThis.fetch = original
    rmSync(dir, { recursive: true, force: true })
  }
})
