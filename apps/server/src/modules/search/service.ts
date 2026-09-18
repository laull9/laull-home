import { and, asc, desc, eq, ne } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import type {
  CreateSearchEngineInput,
  SearchEngine,
  UpdateSearchEngineInput,
} from "@laull-home/shared"
import type { AppDatabase } from "../../db"
import { searchEngines } from "../../db/schema"
import { assertSafeOutboundUrl } from "../favicon/service"

// 搜索引擎业务操作异常类。
export class SearchEngineError extends Error {
  // 携带 HTTP 状态码便于路由层转换。
  constructor(public status: number, message: string) {
    super(message)
    this.name = "SearchEngineError"
  }
}

// 转换数据库记录为标准搜索引擎结构。
function mapEngineRow(row: typeof searchEngines.$inferSelect): SearchEngine {
  return {
    id: row.id,
    name: row.name,
    urlTemplate: row.urlTemplate,
    suggestionUrl: row.suggestionUrl ?? "",
    bang: row.bang,
    isDefault: Boolean(row.isDefault),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// 常见搜索引擎建议地址自动推导映射表。
const BUILTIN_SUGGESTION_TEMPLATES: Array<{ match: (url: string, name: string) => boolean; template: string }> = [
  {
    // 谷歌搜索。
    match: (u, n) => u.includes("google.") || n.toLowerCase().includes("google"),
    template: "https://suggestqueries.google.com/complete/search?client=firefox&q=%s",
  },
  {
    // 必应搜索。
    match: (u, n) => u.includes("bing.") || n.toLowerCase().includes("bing") || n.includes("必应"),
    template: "https://cn.bing.com/osjson.aspx?query=%s",
  },
  {
    // 百度搜索。
    match: (u, n) => u.includes("baidu.") || n.toLowerCase().includes("baidu") || n.includes("百度"),
    template: "https://suggestion.baidu.com/su?wd=%s&action=opensearch&ie=utf-8&oe=utf-8",
  },
  {
    // DuckDuckGo。
    match: (u, n) => u.includes("duckduckgo.") || n.toLowerCase().includes("duckduckgo"),
    template: "https://duckduckgo.com/ac/?q=%s&type=list",
  },
  {
    // YouTube 视频搜索。
    match: (u, n) => u.includes("youtube.") || n.toLowerCase().includes("youtube"),
    template: "https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=%s",
  },
  {
    // 哔哩哔哩弹幕网。
    match: (u, n) => u.includes("bilibili.") || n.toLowerCase().includes("bilibili"),
    template: "https://s.search.bilibili.com/main/suggest?term=%s",
  },
  {
    // GitHub 搜索。
    match: (u, n) => u.includes("github.") || n.toLowerCase().includes("github"),
    template: "https://api.github.com/search/repositories?q=%s&per_page=5",
  },
]

// 推导指定搜索引擎对应的联想建议地址模板。
export function resolveSuggestionTemplate(engine: Pick<SearchEngine, "urlTemplate" | "name" | "suggestionUrl">): string {
  if (engine.suggestionUrl && engine.suggestionUrl.trim()) {
    const raw = engine.suggestionUrl.trim()
    if (raw.includes("api.bing.com/osjson.aspx")) {
      return raw.replace("api.bing.com/osjson.aspx", "cn.bing.com/osjson.aspx")
    }
    return raw
  }
  const found = BUILTIN_SUGGESTION_TEMPLATES.find(t => t.match(engine.urlTemplate, engine.name))
  return found?.template ?? ""
}

// 自适应字符编码解码响应字节流。
export function decodeBufferWithEncoding(buffer: ArrayBuffer | Uint8Array, contentTypeHeader?: string | null): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)

  // 1. 优先从 Content-Type 中提取声明的 charset
  let declaredCharset = ""
  if (contentTypeHeader) {
    const match = contentTypeHeader.match(/charset=([a-zA-Z0-9_-]+)/i)
    if (match && match[1]) {
      declaredCharset = match[1].trim().toLowerCase()
    }
  }

  // 若明确声明为 gbk / gb2312 / gb18030 等中文编码
  if (declaredCharset && !declaredCharset.includes("utf-8")) {
    try {
      const decoder = new TextDecoder(declaredCharset)
      return decoder.decode(bytes)
    } catch {
      // 声明编码不可用时进入自适应尝试
    }
  }

  // 2. 默认使用 UTF-8 严格模式测试
  try {
    const utf8Decoder = new TextDecoder("utf-8", { fatal: true })
    return utf8Decoder.decode(bytes)
  } catch {
    // 3. 遇到非合规 UTF-8 字节流时，自适应回退到中文 GBK/GB18030
    try {
      const gbkDecoder = new TextDecoder("gbk")
      return gbkDecoder.decode(bytes)
    } catch {
      // 4. 极端情况宽容替换符解码
      return new TextDecoder("utf-8").decode(bytes)
    }
  }
}

// 解析各类搜索引擎返回的多样化原始响应为建议词列表。
export function parseSuggestionsPayload(rawText: string): string[] {
  if (!rawText || !rawText.trim()) return []
  let text = rawText.trim()

  // 尝试剥离 jsonp 回调包装，如 window.bdsug.sug(...) 或 cb(...)
  const jsonpMatch = text.match(/^[a-zA-Z0-9_$]+(?:\.[a-zA-Z0-9_$]+)*\s*\((.*)\);?$/s)
  if (jsonpMatch && jsonpMatch[1]) {
    text = jsonpMatch[1].trim()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }

  let list: string[] = []

  // 1. OpenSearch 标准规范：[query, [item1, item2, ...]]
  if (Array.isArray(parsed)) {
    if (parsed.length >= 2 && Array.isArray(parsed[1])) {
      list = parsed[1].map(item => String(item).trim())
    } else if (parsed.every(item => typeof item === "string" || typeof item === "number")) {
      list = parsed.map(item => String(item).trim())
    }
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>
    // 2. 哔哩哔哩格式：{ result: { tag: [{ value: "..." }] } }
    const resultObj = obj.result as Record<string, unknown> | undefined
    if (resultObj && Array.isArray(resultObj.tag)) {
      list = resultObj.tag.map((item: unknown) => {
        const val = (item as { value?: unknown })?.value
        return typeof val === "string" ? val.trim() : ""
      })
    }
    // 3. 百度 sugrec 格式：{ g: [{ q: "..." }] }
    else if (Array.isArray(obj.g)) {
      list = obj.g.map((item: unknown) => {
        const q = (item as { q?: unknown })?.q
        return typeof q === "string" ? q.trim() : ""
      })
    }
    // 4. GitHub 格式：{ items: [{ full_name: "..." }] }
    else if (Array.isArray(obj.items)) {
      list = obj.items.map((item: unknown) => {
        const row = item as { full_name?: unknown; name?: unknown }
        return String(row.full_name ?? row.name ?? "").trim()
      })
    }
    // 5. 360 搜索格式：{ result: [{ word: "..." }] }
    else if (Array.isArray(obj.result)) {
      list = obj.result.map((item: unknown) => {
        const word = (item as { word?: unknown })?.word
        return typeof word === "string" ? word.trim() : ""
      })
    }
    // 6. 其它包含 suggestions 字段的格式
    else if (Array.isArray(obj.suggestions)) {
      list = obj.suggestions.map(item => String(item).trim())
    }
  }

  // 过滤空串、去重并最多保留前 10 条结果
  const result: string[] = []
  for (const item of list) {
    if (!item) continue
    if (!result.includes(item)) {
      result.push(item)
    }
    if (result.length >= 10) break
  }
  return result
}

// 建议词内存短期缓存项。
interface SuggestionCacheItem {
  // 缓存过期时间戳。
  expiresAt: number
  // 建议词列表。
  items: string[]
}

// 内存短期缓存字典。
const suggestionCache = new Map<string, SuggestionCacheItem>()

// 创建搜索引擎服务。
export function createSearchService(db: AppDatabase) {
  return {
    // 列出所有可用搜索引擎。
    list(): SearchEngine[] {
      const rows = db.select()
        .from(searchEngines)
        .orderBy(desc(searchEngines.isDefault), asc(searchEngines.sortOrder), asc(searchEngines.createdAt))
        .all()
      return rows.map(mapEngineRow)
    },

    // 新增自定义搜索引擎。
    create(input: CreateSearchEngineInput): SearchEngine {
      if (!input.urlTemplate.includes("%s")) {
        throw new SearchEngineError(400, "搜索引擎模板必须包含 %s 占位符")
      }
      if (input.suggestionUrl && !input.suggestionUrl.includes("%s")) {
        throw new SearchEngineError(400, "搜索建议模板必须包含 %s 占位符")
      }

      const bang = input.bang?.trim().toLowerCase() ?? ""
      if (bang) {
        if (!/^[a-zA-Z0-9_-]{1,16}$/.test(bang)) {
          throw new SearchEngineError(400, "Bang 只能包含 1-16 位字母、数字、下划线或短横线")
        }
        const conflict = db.select().from(searchEngines).where(eq(searchEngines.bang, bang)).get()
        if (conflict) {
          throw new SearchEngineError(400, `Bang 指令 !${bang} 已被搜索引擎「${conflict.name}」使用`)
        }
      }

      const now = Date.now()
      const id = "se-" + randomUUID()
      const isDefault = input.isDefault ? 1 : 0

      // 如果设置为默认引擎，先将原有默认引擎取消
      if (isDefault) {
        db.update(searchEngines).set({ isDefault: 0, updatedAt: now }).run()
      }

      const maxOrderRow = db.select({ sortOrder: searchEngines.sortOrder })
        .from(searchEngines)
        .orderBy(desc(searchEngines.sortOrder))
        .limit(1)
        .get()
      const nextSortOrder = (maxOrderRow?.sortOrder ?? 0) + 1

      db.insert(searchEngines).values({
        id,
        name: input.name.trim(),
        urlTemplate: input.urlTemplate.trim(),
        suggestionUrl: input.suggestionUrl?.trim() ?? "",
        bang,
        isDefault,
        sortOrder: nextSortOrder,
        createdAt: now,
        updatedAt: now,
      }).run()

      const created = db.select().from(searchEngines).where(eq(searchEngines.id, id)).get()!
      return mapEngineRow(created)
    },

    // 更新搜索引擎信息。
    update(id: string, input: UpdateSearchEngineInput): SearchEngine {
      const existing = db.select().from(searchEngines).where(eq(searchEngines.id, id)).get()
      if (!existing) throw new SearchEngineError(404, "指定的搜索引擎不存在")

      if (input.urlTemplate !== undefined && !input.urlTemplate.includes("%s")) {
        throw new SearchEngineError(400, "搜索引擎模板必须包含 %s 占位符")
      }
      if (input.suggestionUrl !== undefined && input.suggestionUrl.trim() !== "" && !input.suggestionUrl.includes("%s")) {
        throw new SearchEngineError(400, "搜索建议模板必须包含 %s 占位符")
      }

      const now = Date.now()
      if (input.isDefault) {
        db.update(searchEngines).set({ isDefault: 0, updatedAt: now }).run()
      }

      const values: Partial<typeof searchEngines.$inferInsert> = {
        updatedAt: now,
      }
      if (input.name !== undefined) values.name = input.name.trim()
      if (input.urlTemplate !== undefined) values.urlTemplate = input.urlTemplate.trim()
      if (input.suggestionUrl !== undefined) values.suggestionUrl = input.suggestionUrl.trim()
      if (input.bang !== undefined) {
        const bang = input.bang.trim().toLowerCase()
        if (bang) {
          if (!/^[a-zA-Z0-9_-]{1,16}$/.test(bang)) {
            throw new SearchEngineError(400, "Bang 只能包含 1-16 位字母、数字、下划线或短横线")
          }
          const conflict = db.select().from(searchEngines).where(and(eq(searchEngines.bang, bang), ne(searchEngines.id, id))).get()
          if (conflict) {
            throw new SearchEngineError(400, `Bang 指令 !${bang} 已被搜索引擎「${conflict.name}」使用`)
          }
        }
        values.bang = bang
      }
      if (input.isDefault !== undefined) values.isDefault = input.isDefault ? 1 : 0
      if (input.sortOrder !== undefined) values.sortOrder = input.sortOrder

      db.update(searchEngines).set(values).where(eq(searchEngines.id, id)).run()
      const updated = db.select().from(searchEngines).where(eq(searchEngines.id, id)).get()!
      return mapEngineRow(updated)
    },

    // 删除搜索引擎。
    delete(id: string): void {
      const existing = db.select().from(searchEngines).where(eq(searchEngines.id, id)).get()
      if (!existing) throw new SearchEngineError(404, "指定的搜索引擎不存在")

      const totalCount = db.select().from(searchEngines).all().length
      if (totalCount <= 1) {
        throw new SearchEngineError(400, "至少保留一个搜索引擎")
      }

      db.delete(searchEngines).where(eq(searchEngines.id, id)).run()

      // 如果删除的是默认引擎，把排在第一个的设为默认
      if (existing.isDefault) {
        const first = db.select().from(searchEngines).orderBy(asc(searchEngines.sortOrder)).limit(1).get()
        if (first) {
          db.update(searchEngines).set({ isDefault: 1, updatedAt: Date.now() }).where(eq(searchEngines.id, first.id)).run()
        }
      }
    },

    // 获取指定搜索引擎关联关键词列表。
    async getSuggestions(query: string, engineId?: string): Promise<string[]> {
      const trimmedQuery = query.trim()
      if (!trimmedQuery) return []

      // 查找对应搜索引擎
      let targetEngine: SearchEngine | null = null
      if (engineId) {
        const found = db.select().from(searchEngines).where(eq(searchEngines.id, engineId)).get()
        if (found) targetEngine = mapEngineRow(found)
      }
      if (!targetEngine) {
        const defaultRow = db.select().from(searchEngines).where(eq(searchEngines.isDefault, 1)).get()
          ?? db.select().from(searchEngines).orderBy(asc(searchEngines.sortOrder)).limit(1).get()
        if (defaultRow) targetEngine = mapEngineRow(defaultRow)
      }
      if (!targetEngine) return []

      const template = resolveSuggestionTemplate(targetEngine)
      if (!template || !template.includes("%s")) return []

      const cacheKey = `${targetEngine.id}:${trimmedQuery.toLowerCase()}`
      const cached = suggestionCache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        return cached.items
      }

      const requestUrls: string[] = [template.replace("%s", encodeURIComponent(trimmedQuery))]
      if (template.includes("bing.com")) {
        const fastCnUrl = "https://cn.bing.com/osjson.aspx?query=" + encodeURIComponent(trimmedQuery)
        if (!requestUrls.includes(fastCnUrl)) {
          requestUrls.unshift(fastCnUrl)
        }
      }

      for (const reqUrl of requestUrls) {
        try {
          await assertSafeOutboundUrl(reqUrl)
          const res = await fetch(reqUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Accept": "application/json, text/plain, */*",
            },
            signal: AbortSignal.timeout(3500),
          })

          if (!res.ok) continue
          const rawBuffer = await res.arrayBuffer()
          const text = decodeBufferWithEncoding(rawBuffer, res.headers.get("content-type"))
          const items = parseSuggestionsPayload(text)
          if (items.length > 0) {
            suggestionCache.set(cacheKey, {
              expiresAt: Date.now() + 60_000,
              items,
            })
            if (suggestionCache.size > 500) {
              const now = Date.now()
              for (const [key, val] of suggestionCache) {
                if (val.expiresAt <= now) suggestionCache.delete(key)
              }
            }
            return items
          }
        } catch {
          // 当前候选地址失败，尝试下一个候选地址
        }
      }
      return []
    },
  }
}
