import { type Static, Type } from "@sinclair/typebox"

// 搜索引擎结构。
export const searchEngineSchema = Type.Object({
  // 引擎唯一标识。
  id: Type.String(),
  // 引擎展示名称。
  name: Type.String({ minLength: 1, maxLength: 64 }),
  // 查询地址模板，包含 %s。
  urlTemplate: Type.String({ minLength: 3, maxLength: 512 }),
  // 搜索建议联想地址模板，包含 %s。
  suggestionUrl: Type.String({ maxLength: 512 }),
  // 快捷 Bang 指令，例如 gh。
  bang: Type.String({ maxLength: 16 }),
  // 是否为默认搜索引擎。
  isDefault: Type.Boolean(),
  // 排序权重。
  sortOrder: Type.Integer(),
  // 创建时间戳。
  createdAt: Type.Integer(),
  // 更新时间戳。
  updatedAt: Type.Integer(),
})

// 搜索引擎类型。
export type SearchEngine = Static<typeof searchEngineSchema>

// 创建搜索引擎请求结构。
export const createSearchEngineSchema = Type.Object({
  // 引擎展示名称。
  name: Type.String({ minLength: 1, maxLength: 64 }),
  // 查询地址模板。
  urlTemplate: Type.String({ minLength: 3, maxLength: 512 }),
  // 搜索建议联想地址模板。
  suggestionUrl: Type.Optional(Type.String({ maxLength: 512 })),
  // 快捷 Bang 指令。
  bang: Type.Optional(Type.String({ maxLength: 16 })),
  // 是否设为默认。
  isDefault: Type.Optional(Type.Boolean()),
}, { additionalProperties: false })

// 创建搜索引擎输入类型。
export type CreateSearchEngineInput = Static<typeof createSearchEngineSchema>

// 更新搜索引擎请求结构。
export const updateSearchEngineSchema = Type.Object({
  // 引擎展示名称。
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  // 查询地址模板。
  urlTemplate: Type.Optional(Type.String({ minLength: 3, maxLength: 512 })),
  // 搜索建议联想地址模板。
  suggestionUrl: Type.Optional(Type.String({ maxLength: 512 })),
  // 快捷 Bang 指令。
  bang: Type.Optional(Type.String({ maxLength: 16 })),
  // 是否设为默认。
  isDefault: Type.Optional(Type.Boolean()),
  // 排序权重。
  sortOrder: Type.Optional(Type.Integer()),
}, { additionalProperties: false })

// 更新搜索引擎输入类型。
export type UpdateSearchEngineInput = Static<typeof updateSearchEngineSchema>

// 搜索建议联想查询请求结构。
export const searchSuggestionsQuerySchema = Type.Object({
  // 搜索关键字。
  q: Type.String({ minLength: 1, maxLength: 128 }),
  // 关联搜索引擎标识。
  engineId: Type.Optional(Type.String({ maxLength: 64 })),
})

// 搜索建议联想查询输入类型。
export type SearchSuggestionsQuery = Static<typeof searchSuggestionsQuerySchema>

// 搜索建议联想响应结构。
export const searchSuggestionsResponseSchema = Type.Object({
  // 建议词列表。
  suggestions: Type.Array(Type.String()),
})

// 搜索建议联想响应类型。
export type SearchSuggestionsResponse = Static<typeof searchSuggestionsResponseSchema>

// 图标抓取请求结构。
export const fetchFaviconSchema = Type.Object({
  // 需要探测图标的站点地址。
  url: Type.String({ minLength: 1, maxLength: 1024 }),
  // 是否强制跳过缓存重新远程抓取。
  forceRefresh: Type.Optional(Type.Boolean()),
}, { additionalProperties: false })

// 图标抓取输入类型。
export type FetchFaviconInput = Static<typeof fetchFaviconSchema>

// 从完整网址或模板中提取主机站点源地址。
export function extractSiteOrigin(urlStr?: string): string {
  if (!urlStr) return ""
  try {
    const raw = urlStr.replace(/%s.*/, "").trim()
    let parsed: URL
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
      parsed = new URL(raw)
    } else {
      parsed = new URL("https://" + raw)
    }
    if (["http:", "https:"].includes(parsed.protocol)) {
      return parsed.origin
    }
  } catch { /* 忽略非法地址。 */ }
  return ""
}

// 检查地址是否使用安全的 Web 协议。
export function isValidSafeUrl(target: string): boolean {
  try {
    const parsed = new URL(target)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

// 识别是否像一个域名或网址。
export function looksLikeUrl(text: string): boolean {
  const trimmed = text.trim()
  if (/^https?:\/\//i.test(trimmed)) return true
  return /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/i.test(trimmed)
    || /^localhost(:\d+)?(\/.*)?$/i.test(trimmed)
}

// 搜索查询解析结果结构。
export interface SearchQueryResult {
  // 跳转方式：直接打开网址或通过搜索引擎查询。
  type: "url" | "search"
  // 最终跳转的目标地址。
  targetUrl: string
}

// 解析用户输入的搜索词或网址。
export function parseSearchQuery(input: string, engines: SearchEngine[]): SearchQueryResult {
  const trimmed = input.trim()
  if (!trimmed) {
    const defaultEngine = engines.find(e => e.isDefault) ?? engines[0]
    return {
      type: "search",
      targetUrl: defaultEngine ? defaultEngine.urlTemplate.replace("%s", "") : "https://www.google.com",
    }
  }

  // 1. 检查是否为 Bang 语法，如 !gh rust 或 !yt bun
  if (trimmed.startsWith("!")) {
    const spaceIndex = trimmed.indexOf(" ")
    const bang = spaceIndex === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIndex)
    const keyword = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim()
    const matchedEngine = engines.find(e => e.bang && e.bang.toLowerCase() === bang.toLowerCase())
    if (matchedEngine) {
      return {
        type: "search",
        targetUrl: matchedEngine.urlTemplate.replace("%s", encodeURIComponent(keyword)),
      }
    }
  }

  // 2. 检查是否为网址
  if (looksLikeUrl(trimmed)) {
    const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    if (isValidSafeUrl(finalUrl)) {
      return { type: "url", targetUrl: finalUrl }
    }
  }

  // 3. 默认搜索引擎搜索
  const defaultEngine = engines.find(e => e.isDefault) ?? engines[0]
  const template = defaultEngine?.urlTemplate ?? "https://www.google.com/search?q=%s"
  return {
    type: "search",
    targetUrl: template.replace("%s", encodeURIComponent(trimmed)),
  }
}
