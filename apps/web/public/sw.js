// PWA 静态资源与普通空间离线缓存版本标识。
const CACHE_NAME = 'laull-home-cache-v2'

// 判断请求是否必须严格排除在缓存之外。
function shouldBypassCache(request) {
  // 仅对 GET 请求提供静态缓存，写操作全部直接透传网络。
  if (request.method !== 'GET') return true

  let url
  try {
    url = new URL(request.url)
  } catch {
    return true
  }

  const pathname = url.pathname.toLowerCase()
  const search = url.search.toLowerCase()

  // 1. 严格排除所有认证接口，绝不落地缓存任何身份凭据。
  if (pathname.startsWith('/api/v1/auth')) return true

  // 2. 严格排除所有涉及隐私空间的接口与数据。
  if (pathname.includes('privacy') || search.includes('privacy')) return true

  // 3. 严格排除 SSE 长连接与 MCP 协议通道。
  if (pathname.startsWith('/api/v1/desktop/events') || pathname.startsWith('/api/v1/mcp')) return true

  // 4. 严格排除备份管理与外部微服务实时代理请求。
  if (pathname.startsWith('/api/v1/backups') || pathname.startsWith('/api/v1/integrations')) return true

  // 5. 放行静态媒体资产：图标与壁纸图片，支持长期高速离线访问。
  if (pathname.startsWith('/api/v1/icons/') || pathname.startsWith('/api/v1/wallpapers/image/')) return false

  // 6. 放行普通空间核心只读接口，支持全功能离线浏览与 SWR 缓存。
  if (
    pathname === '/api/v1/settings' ||
    pathname === '/api/v1/search/engines' ||
    pathname === '/api/v1/spaces' ||
    pathname === '/api/v1/bookmarks' ||
    pathname === '/api/v1/bookmarks/groups' ||
    pathname.startsWith('/api/v1/desktop/')
  ) {
    return false
  }

  // 7. 所有其他未明确声明的 API 接口一律走网络。
  if (pathname.startsWith('/api/v1/')) return true

  return false
}

// 在 Service Worker 运行环境中挂载事件监听。
if (typeof self !== 'undefined' && self.addEventListener) {
  // Service Worker 安装阶段，跳过等待立即进入活跃。
  self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting())
  })

  // Service Worker 激活阶段，接管所有受控客户端并清理历史过期缓存。
  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys().then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      }).then(() => self.clients.claim())
    )
  })

  // 拦截网络请求，落实安全排除与静态资源离线回退。
  self.addEventListener('fetch', (event) => {
    const { request } = event

    // 命中排除规则时，直接发起常规网络请求，禁止缓存。
    if (shouldBypassCache(request)) {
      return
    }

    // 仅对同源的静态资产和页面进行网络优先并缓存回退。
    const url = new URL(request.url)
    if (url.origin !== self.location.origin) {
      return
    }

    event.respondWith(
      fetch(request)
        .then((response) => {
          // 成功获取且状态正常时，克隆并持久化至 CacheStorage。
          if (response.status === 200 && response.type === 'basic') {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone)
            })
          }
          return response
        })
        .catch(() => {
          // 网络不可用时回退到本地缓存。
          return caches.match(request).then((cached) => {
            if (cached) return cached
            // 页面导航离线回退。
            if (request.mode === 'navigate') {
              return caches.match('/')
            }
            return new Response('离线状态且无本地缓存', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          })
        })
    )
  })
}

// 导出判断逻辑以便在 Node/Bun 测试环境中校验安全规则。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { shouldBypassCache, CACHE_NAME }
}
