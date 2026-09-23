// PWA 缓存按职责拆分，升级时统一替换版本号。
const CACHE_VERSION = 'v3'
const CACHE_NAMES = {
  assets: `laull-home-assets-${CACHE_VERSION}`,
  media: `laull-home-media-${CACHE_VERSION}`,
  pages: `laull-home-pages-${CACHE_VERSION}`,
  data: `laull-home-data-${CACHE_VERSION}`,
}
const CACHE_PREFIX = 'laull-home-'

// 根据请求内容选择缓存策略，敏感接口保持完全透传。
function getCachePolicy(request) {
  if (request.method !== 'GET') return 'bypass'
  let url
  try { url = new URL(request.url) } catch { return 'bypass' }
  const pathname = url.pathname.toLowerCase()
  const search = url.search.toLowerCase()
  // Vite 开发服务器与 HMR 内部请求一律透传，防止缓存导致 MIME 类型错乱。
  if (
    pathname.includes('/@vite/') ||
    pathname.includes('/@fs/') ||
    pathname.includes('/@id/') ||
    pathname.includes('/__vite_ping') ||
    search.includes('vue&type=style') ||
    search.includes('v=') ||
    search.includes('t=')
  ) return 'bypass'

  if (pathname.startsWith('/api/v1/auth')) return 'bypass'
  if (pathname.includes('privacy') || search.includes('privacy')) return 'bypass'
  if (pathname.startsWith('/api/v1/desktop/events') || pathname.startsWith('/api/v1/mcp')) return 'bypass'
  if (pathname.startsWith('/api/v1/backups') || pathname.startsWith('/api/v1/integrations')) return 'bypass'
  if (pathname.startsWith('/api/v1/icons/') || pathname.startsWith('/api/v1/wallpapers/image/')) return 'media'
  if (
    pathname === '/api/v1/settings' ||
    pathname === '/api/v1/search/engines' ||
    pathname === '/api/v1/spaces' ||
    pathname === '/api/v1/bookmarks' ||
    pathname === '/api/v1/bookmarks/groups' ||
    pathname.startsWith('/api/v1/desktop/')
  ) return 'data'
  if (pathname.startsWith('/api/v1/')) return 'bypass'
  if (typeof self !== 'undefined' && self.location?.origin && url.origin !== self.location.origin) return 'bypass'
  if (pathname.startsWith('/_nuxt/') || /\.(?:js|css|woff2?|png|jpe?g|webp|svg|ico)$/i.test(pathname)) return 'asset'
  return 'page'
}

// 保留旧测试与外部调用使用的排除判断。
function shouldBypassCache(request) {
  return getCachePolicy(request) === 'bypass'
}

// 媒体缓存忽略界面手动刷新附加的时间戳，避免同一文件重复占用空间。
function cacheKey(request, policy) {
  const url = new URL(request.url)
  if (policy === 'media') {
    url.searchParams.delete('t')
    url.searchParams.delete('_')
  }
  return url.toString()
}

// 仅缓存完整成功且未明确禁止存储的响应。
function canStore(response) {
  const directive = response.headers.get('cache-control')?.toLowerCase() ?? ''
  return response.status === 200 && !directive.includes('no-store') && !directive.includes('private')
}

// 控制各缓存容量，按写入顺序淘汰最旧条目。
async function trimCache(cacheName, maximum) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  const overflow = keys.length - maximum
  if (overflow > 0) await Promise.all(keys.slice(0, overflow).map(key => cache.delete(key)))
}

// 写入响应副本并执行容量收敛。
async function storeResponse(cacheName, key, response, maximum) {
  if (!canStore(response)) return
  const cache = await caches.open(cacheName)
  await cache.put(key, response.clone())
  await trimCache(cacheName, maximum)
}

// 带缓存回退的网络请求，已有缓存时限制前台等待时间。
async function networkFirst(request, cacheName, maximum, timeoutMs, fallbackKey) {
  const key = cacheKey(request, cacheName === CACHE_NAMES.media ? 'media' : 'data')
  const cache = await caches.open(cacheName)
  const cached = await cache.match(key)
  const network = fetch(request).then(async (response) => {
    if (response.status === 401 || response.status === 403) await caches.delete(CACHE_NAMES.data)
    await storeResponse(cacheName, key, response, maximum)
    return response
  })
  try {
    if (!cached) return await network
    return await Promise.race([
      network,
      new Promise((resolve) => globalThis.setTimeout(() => resolve(cached), timeoutMs)),
    ])
  } catch {
    if (cached) return cached
    if (fallbackKey) {
      const fallback = await cache.match(fallbackKey)
      if (fallback) return fallback
    }
    return new Response('离线状态且无本地缓存', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

// 长期媒体优先读缓存，首次未命中才访问网络。
async function cacheFirst(request, cacheName, maximum) {
  const key = cacheKey(request, 'media')
  const cache = await caches.open(cacheName)
  const cached = await cache.match(key)
  if (cached) return cached
  try {
    const response = await fetch(request)
    await storeResponse(cacheName, key, response, maximum)
    return response
  } catch {
    return new Response('', { status: 504, statusText: 'Gateway Timeout' })
  }
}

// 带后台更新的静态资源缓存避免重复阻塞页面渲染。
async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAMES.assets)
  const key = cacheKey(request, 'asset')
  const cached = await cache.match(key)
  const update = fetch(request).then(async (response) => {
    await storeResponse(CACHE_NAMES.assets, key, response, 160)
    return response
  }).catch(() => null)
  if (cached) {
    const cachedType = cached.headers.get('content-type')?.toLowerCase() ?? ''
    const accept = request.headers.get('accept')?.toLowerCase() ?? ''
    // 脚本模块请求绝不能返回样式表缓存，遇到类型冲突立即回源并替换。
    if (cachedType.includes('text/css') && !accept.includes('text/css') && (request.destination === 'script' || request.url.includes('.js'))) {
      const fresh = await update
      if (fresh && (fresh.headers.get('content-type')?.toLowerCase() ?? '').includes('javascript')) return fresh
    }
    event.waitUntil(update)
    return cached
  }
  return await update ?? new Response('', { status: 504, statusText: 'Gateway Timeout' })
}

// 在 Service Worker 环境中注册生命周期和请求处理。
if (typeof self !== 'undefined' && self.addEventListener) {
  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(CACHE_NAMES.assets)
        .then(cache => Promise.allSettled(['/manifest.webmanifest', '/favicon.ico'].map(url => cache.add(url))))
        .then(() => self.skipWaiting()),
    )
  })

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(
        keys.filter(key => key.startsWith(CACHE_PREFIX) && !Object.values(CACHE_NAMES).includes(key)).map(key => caches.delete(key)),
      )).then(() => self.clients.claim()),
    )
  })

  self.addEventListener('message', (event) => {
    if (event.data?.type !== 'CLEAR_USER_CACHES') return
    event.waitUntil(Promise.all([
      caches.delete(CACHE_NAMES.data),
      caches.delete(CACHE_NAMES.media),
      caches.delete(CACHE_NAMES.pages),
    ]))
  })

  self.addEventListener('fetch', (event) => {
    const policy = getCachePolicy(event.request)
    if (policy === 'bypass') return
    if (policy === 'asset') {
      event.respondWith(staleWhileRevalidate(event.request, event))
    } else if (policy === 'media') {
      event.respondWith(cacheFirst(event.request, CACHE_NAMES.media, 240))
    } else if (policy === 'data') {
      event.respondWith(networkFirst(event.request, CACHE_NAMES.data, 80, 1800))
    } else {
      event.respondWith(networkFirst(event.request, CACHE_NAMES.pages, 24, 2200, '/'))
    }
  })
}

// 导出纯判断逻辑供 Bun 测试。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { shouldBypassCache, getCachePolicy, cacheKey, CACHE_NAMES }
}
