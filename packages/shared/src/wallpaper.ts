import { Type, type Static } from '@sinclair/typebox'
import { isValidSafeUrl } from './search'

// 允许的壁纸填充模式常量列表。
export const WALLPAPER_FIT_MODES = ['cover', 'contain', 'fill', 'center', 'tile'] as const

// 壁纸填充模式类型。
export type WallpaperFitMode = (typeof WALLPAPER_FIT_MODES)[number]

// 图库存储配额限制常量。
export const WALLPAPER_QUOTA = {
  // 单用户本地上传壁纸最大总存储体积（150MB）。
  maxTotalBytes: 150 * 1024 * 1024,
  // 单用户本地上传壁纸最大数量（100 张）。
  maxCount: 100,
} as const

// 图库存储配额校验结构。
export const wallpaperQuotaSchema = Type.Object({
  // 已使用存储字节数。
  usedBytes: Type.Integer(),
  // 允许的最大存储字节数。
  totalBytes: Type.Integer(),
  // 已上传壁纸数量。
  usedCount: Type.Integer(),
  // 允许的最大上传壁纸数量。
  maxCount: Type.Integer(),
})

// 图库存储配额类型。
export type WallpaperQuotaInfo = Static<typeof wallpaperQuotaSchema>

// 填充模式校验结构。
export const wallpaperFitModeSchema = Type.Union([
  Type.Literal('cover'),
  Type.Literal('contain'),
  Type.Literal('fill'),
  Type.Literal('center'),
  Type.Literal('tile'),
])

// 单张壁纸填充模式支持设为 auto 跟随全局。
export const itemFitModeSchema = Type.Union([
  wallpaperFitModeSchema,
  Type.Literal('auto'),
])

// 图片池数据结构。
export const wallpaperPoolSchema = Type.Object({
  // 图片池唯一标识。
  id: Type.String(),
  // 所属用户编号。
  userId: Type.Integer(),
  // 图片池名称。
  name: Type.String({ minLength: 1, maxLength: 64 }),
  // 是否为系统默认图片池。
  isDefault: Type.Boolean(),
  // 该图片池当前包含的壁纸数量。
  count: Type.Optional(Type.Integer()),
  // 创建时间戳。
  createdAt: Type.Integer(),
  // 更新时间戳。
  updatedAt: Type.Integer(),
})

// 图片池数据类型。
export type WallpaperPool = Static<typeof wallpaperPoolSchema>

// 创建图片池请求结构。
export const createWallpaperPoolSchema = Type.Object({
  // 图片池名称。
  name: Type.String({ minLength: 1, maxLength: 64 }),
}, { additionalProperties: false })

// 创建图片池请求类型。
export type CreateWallpaperPoolInput = Static<typeof createWallpaperPoolSchema>

// 更新图片池请求结构。
export const updateWallpaperPoolSchema = Type.Object({
  // 图片池名称。
  name: Type.String({ minLength: 1, maxLength: 64 }),
}, { additionalProperties: false })

// 更新图片池请求类型。
export type UpdateWallpaperPoolInput = Static<typeof updateWallpaperPoolSchema>

// 批量删除壁纸请求结构。
export const batchDeleteWallpapersSchema = Type.Object({
  // 要批量删除的壁纸标识列表。
  ids: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 500 }),
}, { additionalProperties: false })

// 批量删除壁纸请求类型。
export type BatchDeleteWallpapersInput = Static<typeof batchDeleteWallpapersSchema>

// 单个壁纸批量创建项校验结构。
export const batchWallpaperItemSchema = Type.Object({
  // 壁纸展示名称（可选）。
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  // 外部图片地址。
  url: Type.String({ minLength: 1, maxLength: 1024 }),
  // 单图填充模式（可选）。
  fitMode: Type.Optional(itemFitModeSchema),
}, { additionalProperties: false })

// 单个壁纸批量创建项类型。
export type BatchWallpaperItem = Static<typeof batchWallpaperItemSchema>

// 壁纸批量创建请求结构。
export const batchCreateWallpaperSchema = Type.Object({
  // 目标图片池标识（可选，默认当前图片池）。
  poolId: Type.Optional(Type.String({ minLength: 1 })),
  // 批量导入的壁纸列表，单次限制 1 到 100 条。
  items: Type.Array(batchWallpaperItemSchema, { minItems: 1, maxItems: 100 }),
}, { additionalProperties: false })

// 壁纸批量创建请求类型。
export type BatchCreateWallpaperInput = Static<typeof batchCreateWallpaperSchema>

// 文本识别提取出的图片条目。
export interface ExtractedImageItem {
  // 推导或提取出的名称。
  name: string
  // 清洗后的有效图片地址。
  url: string
}

// 常见图片扩展名正则表达式。
const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|gif|avif|svg|bmp|ico|tiff)$/i

// 常见图床域名及其有效图片路径特征。
const KNOWN_IMAGE_HOSTS = [
  'images.unsplash.com',
  'images.pexels.com',
  'i.imgur.com',
  'w.wallhaven.cc',
  'cdn.pixabay.com',
]

// 剥离 URL 尾部可能粘连的标点符号。
function trimTrailingPunctuation(rawUrl: string): string {
  // 包含中英文闭合符号及断句标点。
  const trailingPunctuationRegex = /[),.;:!?'"\]>}\u3002\uff0c\uff1b\uff1a\uff01\uff1f\u2019\u201d\uff09\u300b\u3011\u3001]+$/
  let cleaned = rawUrl
  while (trailingPunctuationRegex.test(cleaned)) {
    cleaned = cleaned.replace(trailingPunctuationRegex, '')
  }
  return cleaned
}

// 检查给定的 URL 是否呈现出明确的图片特征。
export function isLikelyImageUrl(targetUrl: string): boolean {
  if (!isValidSafeUrl(targetUrl)) return false
  try {
    const parsed = new URL(targetUrl)
    // 1. 文件路径包含图片扩展名。
    if (IMAGE_EXT_REGEX.test(parsed.pathname)) {
      return true
    }
    // 2. 查询参数显式指定图片格式（例如 format=webp、ext=jpg、f=png）。
    const searchStr = parsed.search.toLowerCase()
    if (/(?:format|ext|f|image_type)=(?:jpe?g|png|webp|avif|gif|svg)/.test(searchStr)) {
      return true
    }
    // 3. 常见图床服务直链规则。
    const host = parsed.hostname.toLowerCase()
    if (KNOWN_IMAGE_HOSTS.some(knownHost => host === knownHost || host.endsWith(`.${knownHost}`))) {
      return true
    }
    return false
  } catch {
    return false
  }
}

// 根据提取上下文或 URL 生成友好的展示名称。
function deriveImageName(targetUrl: string, explicitName?: string): string {
  const trimmedExplicit = explicitName?.trim()
  if (trimmedExplicit) {
    return trimmedExplicit.slice(0, 100)
  }
  try {
    const parsed = new URL(targetUrl)
    const segments = parsed.pathname.split('/').filter(Boolean)
    const lastSegment = segments[segments.length - 1]
    if (lastSegment) {
      // 移除文件后缀并解码 URI 字符。
      const rawBase = decodeURIComponent(lastSegment).replace(/\.[^.]+$/, '')
      const cleaned = rawBase.replace(/[-_+]/g, ' ').trim()
      if (cleaned.length > 0 && cleaned.length <= 100) {
        return cleaned
      }
    }
  } catch {
    // 无法解析时降级到默认名称。
  }
  return '壁纸'
}

// 从自由文本中自动提取识别所有合法的图片链接列表。
export function extractImageUrls(text: string, maxItems = 100): ExtractedImageItem[] {
  if (!text || typeof text !== 'string') return []

  const results: ExtractedImageItem[] = []
  const seenUrls = new Set<string>()

  // 记录已被显式匹配捕获的 URL。
  function addResult(rawUrl: string, explicitName?: string, bypassImageCheck = false) {
    if (results.length >= maxItems) return
    const cleaned = trimTrailingPunctuation(rawUrl.trim())
    if (!cleaned || !isValidSafeUrl(cleaned)) return
    if (!bypassImageCheck && !isLikelyImageUrl(cleaned)) return
    if (seenUrls.has(cleaned)) return

    seenUrls.add(cleaned)
    results.push({
      name: deriveImageName(cleaned, explicitName),
      url: cleaned,
    })
  }

  // 1. 提取 Markdown 图片标记：![alt](url)。
  const markdownImgRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)"'<>]+)\)/gi
  let mdMatch: RegExpExecArray | null
  while ((mdMatch = markdownImgRegex.exec(text)) !== null) {
    const altText = mdMatch[1] ?? ''
    const url = mdMatch[2] ?? ''
    // Markdown 图片语法本身已明确是图片资源，跳过特征检测。
    addResult(url, altText, true)
  }

  // 2. 提取 HTML <img> 标签：<img ... src="url" ...>。
  const htmlImgRegex = /<img\b(?=[^>]*?\bsrc=["'](https?:\/\/[^"'>\s]+)["'])[^>]*?>/gi
  let htmlMatch: RegExpExecArray | null
  while ((htmlMatch = htmlImgRegex.exec(text)) !== null) {
    const tag = htmlMatch[0]
    const srcMatch = /src=["'](https?:\/\/[^"'>\s]+)["']/i.exec(tag)
    const altMatch = /alt=["']([^"']*)["']/i.exec(tag)
    if (srcMatch && srcMatch[1]) {
      // HTML img 标签同样已明确指示图片资源。
      addResult(srcMatch[1], altMatch?.[1], true)
    }
  }

  // 3. 提取混合文本中的任意 http/https 链接并进行图片特征识别。
  const genericUrlRegex = /https?:\/\/[^\s<>"'`，。；：！？’”）》】、()[\]]+/gi
  let urlMatch: RegExpExecArray | null
  while ((urlMatch = genericUrlRegex.exec(text)) !== null) {
    const url = urlMatch[0]
    addResult(url, undefined, false)
  }

  return results
}
