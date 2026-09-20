import type { SearchEngine } from '@laull-home/shared'

// 建议词内存短期缓存项结构。
interface ClientSuggestionCacheItem {
  // 缓存过期时间戳。
  expiresAt: number
  // 建议词列表。
  items: string[]
}

// 客户端建议词内存缓存，避免重复击键时的无谓网络拉取。
const clientSuggestionCache = new Map<string, ClientSuggestionCacheItem>()

// 全局自增请求序列号。
let callbackCounter = 0

// 在浏览器环境中通过 JSONP 动态加载脚本并获取回调数据。
function fetchJsonp<T>(url: string, callbackParam = 'callback', timeoutMs = 2500): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return reject(new Error('非浏览器运行环境'))
    }

    const callbackName = `__lh_jsonp_cb_${Date.now()}_${++callbackCounter}`
    const script = document.createElement('script')
    let timer: ReturnType<typeof setTimeout> | null = null

    // 清理全局挂载函数与脚本标签。
    const cleanup = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
      try {
        delete (window as unknown as Record<string, unknown>)[callbackName]
      } catch {
        (window as unknown as Record<string, unknown>)[callbackName] = undefined
      }
    }

    // 挂载全局回调。
    (window as unknown as Record<string, (data: T) => void>)[callbackName] = (data: T) => {
      cleanup()
      resolve(data)
    }

    // 超时拒绝。
    timer = setTimeout(() => {
      cleanup()
      reject(new Error('JSONP 请求超时'))
    }, timeoutMs)

    // 加载异常拦截。
    script.onerror = () => {
      cleanup()
      reject(new Error('脚本加载失败'))
    }

    // 拼接回调参数。
    const separator = url.includes('?') ? '&' : '?'
    script.src = `${url}${separator}${callbackParam}=${callbackName}`
    script.async = true

    document.head.appendChild(script)
  })
}

// 判定搜索引擎特征类别。
type EngineKind = 'baidu' | 'bing' | 'google' | 'youtube' | 'github' | 'duckduckgo' | 'custom'

// 推导搜索引擎对应的客户端联想类别。
function detectEngineKind(engine?: Pick<SearchEngine, 'urlTemplate' | 'name' | 'suggestionUrl'>): EngineKind {
  if (!engine) return 'bing'
  const text = `${engine.name} ${engine.urlTemplate} ${engine.suggestionUrl || ''}`.toLowerCase()

  if (text.includes('baidu') || text.includes('百度')) return 'baidu'
  if (text.includes('bing') || text.includes('必应')) return 'bing'
  if (text.includes('youtube')) return 'youtube'
  if (text.includes('google')) return 'google'
  if (text.includes('github')) return 'github'
  if (text.includes('duckduckgo')) return 'duckduckgo'
  return 'custom'
}

// 解析各类常见 OpenSearch 或 JSONP 格式响应为建议词列表。
export function extractSuggestionList(payload: unknown): string[] {
  if (!payload) return []

  // 1. 标准 OpenSearch 数组：[query, [item1, item2, ...]]
  if (Array.isArray(payload)) {
    if (payload.length >= 2 && Array.isArray(payload[1])) {
      return payload[1]
        .map(item => {
          if (typeof item === 'string') return item.trim()
          if (Array.isArray(item) && typeof item[0] === 'string') return item[0].trim()
          return ''
        })
        .filter(Boolean)
    }
    if (payload.every(i => typeof i === 'string')) {
      return (payload as string[]).map(s => s.trim()).filter(Boolean)
    }
  }

  // 2. 对象结构响应。
  if (typeof payload === 'object') {
    const obj = payload as Record<string, unknown>

    // 百度格式：{ s: ["item1", "item2"] }
    if (Array.isArray(obj.s)) {
      return obj.s.map(i => String(i).trim()).filter(Boolean)
    }

    // 必应 qsonhs 格式：{ AS: { Results: [{ Suggests: [{ Txt: "..." }] }] } }
    const asObj = obj.AS as { Results?: Array<{ Suggests?: Array<{ Txt?: string }> }> } | undefined
    if (asObj?.Results && Array.isArray(asObj.Results)) {
      const list: string[] = []
      for (const res of asObj.Results) {
        if (Array.isArray(res.Suggests)) {
          for (const s of res.Suggests) {
            if (s?.Txt) list.push(s.Txt.trim())
          }
        }
      }
      if (list.length > 0) return list.filter(Boolean)
    }

    // GitHub 格式：{ items: [{ full_name: "..." }] }
    if (Array.isArray(obj.items)) {
      return (obj.items as Array<{ full_name?: string; name?: string }>)
        .map(i => (i.full_name || i.name || '').trim())
        .filter(Boolean)
    }
  }

  return []
}

// 客户端本地直接拉取建议词。
export async function fetchClientSuggestions(query: string, engine?: SearchEngine): Promise<string[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const kind = detectEngineKind(engine)
  const cacheKey = `${kind}:${trimmed.toLowerCase()}`
  const now = Date.now()

  // 1. 命中客户端本地短期内存缓存时直接秒出。
  const cached = clientSuggestionCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.items
  }

  const encoded = encodeURIComponent(trimmed)
  let rawResult: unknown = null

  try {
    switch (kind) {
      case 'baidu': {
        // 百度原生支持 JSONP，cb 为参数名。
        const url = `https://suggestion.baidu.com/su?wd=${encoded}`
        rawResult = await fetchJsonp(url, 'cb', 2000)
        break
      }

      case 'bing': {
        // 必应原生支持 JSONP。
        const url = `https://api.bing.com/qsonhs.aspx?type=cb&q=${encoded}`
        rawResult = await fetchJsonp(url, 'cb', 2000)
        break
      }

      case 'google': {
        // 谷歌搜索联想使用 chrome 客户端标识的 JSONP 接口。
        const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encoded}`
        rawResult = await fetchJsonp(url, 'callback', 2000)
        break
      }

      case 'youtube': {
        // YouTube 联想使用 JSONP 接口。
        const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encoded}`
        rawResult = await fetchJsonp(url, 'jsonp', 2000)
        break
      }

      case 'github': {
        // GitHub API 原生支持跨域 CORS。
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 2000)
        try {
          const res = await fetch(`https://api.github.com/search/repositories?q=${encoded}&per_page=5`, {
            signal: controller.signal,
          })
          if (res.ok) {
            rawResult = await res.json()
          }
        } finally {
          clearTimeout(timer)
        }
        break
      }

      case 'duckduckgo': {
        // DuckDuckGo 优先尝试原生 fetch。
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 2000)
        try {
          const res = await fetch(`https://duckduckgo.com/ac/?q=${encoded}&type=list`, {
            signal: controller.signal,
          })
          if (res.ok) {
            rawResult = await res.json()
          }
        } finally {
          clearTimeout(timer)
        }
        break
      }

      case 'custom':
      default: {
        // 自定义引擎优先使用用户自定义的建议地址模板。
        if (engine?.suggestionUrl && engine.suggestionUrl.includes('%s')) {
          const customUrl = engine.suggestionUrl.replace('%s', encoded)
          if (customUrl.includes('cb=') || customUrl.includes('callback=')) {
            rawResult = await fetchJsonp(customUrl, 'cb', 2000)
          } else {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 2000)
            try {
              const res = await fetch(customUrl, { signal: controller.signal })
              if (res.ok) {
                rawResult = await res.json()
              }
            } finally {
              clearTimeout(timer)
            }
          }
        } else {
          // 兜底回退至必应直连。
          const url = `https://api.bing.com/qsonhs.aspx?type=cb&q=${encoded}`
          rawResult = await fetchJsonp(url, 'cb', 2000)
        }
        break
      }
    }
  } catch {
    // 客户端直接拉取若因本地网络环境受阻，静默降级为空数组，绝不上报异常中断输入体验。
    return []
  }

  const items = extractSuggestionList(rawResult)
  // 去重且最多保留前 10 条结果。
  const uniqueItems = Array.from(new Set(items)).slice(0, 10)

  // 写入客户端本地内存短期缓存（5 分钟）。
  if (uniqueItems.length > 0) {
    clientSuggestionCache.set(cacheKey, {
      expiresAt: now + 5 * 60_000,
      items: uniqueItems,
    })
    // 限制客户端缓存字典上限，超出淘汰过期项。
    if (clientSuggestionCache.size > 300) {
      for (const [key, val] of clientSuggestionCache) {
        if (val.expiresAt <= now) clientSuggestionCache.delete(key)
      }
    }
  }

  return uniqueItems
}
