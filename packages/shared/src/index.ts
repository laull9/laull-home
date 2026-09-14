import { themeConfigSchema } from './theme'
export * from './desktop'
export * from './theme'
import { Type, type Static } from '@sinclair/typebox'

// 登录输入限制用于前后端一致校验。
export const loginSchema = Type.Object({
  // 用户名只允许稳定的标识字符。
  username: Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' }),
  // 密码上限限制哈希输入体积，支持初始密码。
  password: Type.String({ minLength: 1, maxLength: 128 }),
}, { additionalProperties: false })

// 用户配置结构，支持版本冲突检测、主题与独立壁纸设置。
export const settingsSchema = Type.Object({
  // 版本号用于防止多设备覆盖写入。
  revision: Type.Integer({ minimum: 0 }),
  // 页面标题由服务端持久化。
  title: Type.String({ minLength: 1, maxLength: 80 }),
  // 外观跟随系统或固定明暗模式。
  appearance: Type.Union([Type.Literal('system'), Type.Literal('light'), Type.Literal('dark')]),
  // 预设主题标识。
  themeId: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  // 壁纸类型：无、纯色、渐变或自定义图片地址。
  wallpaperType: Type.Optional(Type.Union([Type.Literal('none'), Type.Literal('color'), Type.Literal('gradient'), Type.Literal('url')])),
  // 壁纸具体参数值。
  wallpaperValue: Type.Optional(Type.String({ maxLength: 500 })),
  // 结构化主题参数支持跨端同步。
  themeConfig: Type.Optional(themeConfigSchema),
  // 自定义 CSS 覆盖样式规则。
  customCss: Type.Optional(Type.String({ maxLength: 32768 })),
}, { additionalProperties: false })

// 设置接口使用同一份运行时结构推导类型。
export type HomeSettings = Static<typeof settingsSchema>

// 修改密码输入验证。
export const changePasswordSchema = Type.Object({
  // 当前密码用于二次确认，支持初始密码。
  oldPassword: Type.String({ minLength: 1, maxLength: 128 }),
  // 新密码限制长度与复杂度。
  newPassword: Type.String({ minLength: 5, maxLength: 128 }),
}, { additionalProperties: false })

// 修改密码请求类型。
export type ChangePasswordInput = Static<typeof changePasswordSchema>

// 修改用户名请求验证。
export const changeUsernameSchema = Type.Object({
  // 新用户名限制长度与字符格式。
  newUsername: Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' }),
}, { additionalProperties: false })

// 修改用户名请求类型。
export type ChangeUsernameInput = Static<typeof changeUsernameSchema>

// 设备会话展示项。
export const sessionItemSchema = Type.Object({
  // 会话公开随机标识。
  id: Type.String(),
  // 创建时间戳。
  createdAt: Type.Integer(),
  // 过期时间戳。
  expiresAt: Type.Integer(),
  // 是否为当前发出请求的设备。
  isCurrent: Type.Boolean(),
  // 客户端设备信息。
  userAgent: Type.String(),
})

// 会话数据结构类型。
export type SessionItem = Static<typeof sessionItemSchema>

// 空间类型约束。
export const spaceTypeSchema = Type.Union([Type.Literal('normal'), Type.Literal('privacy')])

// 空间类型推导。
export type SpaceType = Static<typeof spaceTypeSchema>

// 空间信息项结构。
export const spaceItemSchema = Type.Object({
  // 空间唯一标识。
  id: Type.String(),
  // 空间展示名称。
  name: Type.String({ minLength: 1, maxLength: 64 }),
  // 空间分类。
  type: spaceTypeSchema,
  // 是否为系统默认普通空间。
  isDefault: Type.Boolean(),
  // 隐私空间是否已初始化密码。
  hasPassword: Type.Boolean(),
  // 当前客户端是否已获取短期解锁授权。
  isUnlocked: Type.Boolean(),
})

// 空间数据类型。
export type SpaceItem = Static<typeof spaceItemSchema>

// 设置独立隐私密码输入。
export const privacySetupSchema = Type.Object({
  // 隐私空间独立密码。
  password: Type.String({ minLength: 5, maxLength: 128 }),
}, { additionalProperties: false })

// 隐私密码输入类型。
export type PrivacySetupInput = Static<typeof privacySetupSchema>

// 解锁隐私空间输入。
export const privacyUnlockSchema = Type.Object({
  // 隐私空间密码。
  password: Type.String({ minLength: 5, maxLength: 128 }),
}, { additionalProperties: false })

// 隐私解锁输入类型。
export type PrivacyUnlockInput = Static<typeof privacyUnlockSchema>

// 书签分组信息结构。
export const bookmarkGroupSchema = Type.Object({
  // 分组唯一标识。
  id: Type.String(),
  // 所属空间标识。
  spaceId: Type.String(),
  // 分组名称。
  name: Type.String({ minLength: 1, maxLength: 64 }),
  // 组间排序权重。
  sortOrder: Type.Integer(),
  // 访客模式下是否可见。
  isPublic: Type.Boolean(),
  // 创建时间戳。
  createdAt: Type.Integer(),
  // 更新时间戳。
  updatedAt: Type.Integer(),
})

// 书签分组类型。
export type BookmarkGroup = Static<typeof bookmarkGroupSchema>

// 创建书签分组请求结构。
export const createBookmarkGroupSchema = Type.Object({
  // 所属空间标识。
  spaceId: Type.String({ minLength: 1, maxLength: 64 }),
  // 分组名称。
  name: Type.String({ minLength: 1, maxLength: 64 }),
  // 访客模式下是否可见。
  isPublic: Type.Optional(Type.Boolean()),
}, { additionalProperties: false })

// 创建分组输入类型。
export type CreateBookmarkGroupInput = Static<typeof createBookmarkGroupSchema>

// 更新书签分组请求结构。
export const updateBookmarkGroupSchema = Type.Object({
  // 分组名称。
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  // 组间排序权重。
  sortOrder: Type.Optional(Type.Integer()),
  // 访客模式下是否可见。
  isPublic: Type.Optional(Type.Boolean()),
}, { additionalProperties: false })

// 更新分组输入类型。
export type UpdateBookmarkGroupInput = Static<typeof updateBookmarkGroupSchema>

// 批量重排分组请求结构。
export const reorderBookmarkGroupsSchema = Type.Object({
  // 按顺序排列的分组标识数组。
  groupIds: Type.Array(Type.String(), { minItems: 1 }),
}, { additionalProperties: false })

// 批量重排分组输入类型。
export type ReorderBookmarkGroupsInput = Static<typeof reorderBookmarkGroupsSchema>

// 书签信息结构。
export const bookmarkSchema = Type.Object({
  // 书签唯一标识。
  id: Type.String(),
  // 所属分组标识。
  groupId: Type.String(),
  // 所属空间标识。
  spaceId: Type.String(),
  // 书签标题。
  title: Type.String({ minLength: 1, maxLength: 128 }),
  // 目标地址。
  url: Type.String({ minLength: 1, maxLength: 1024 }),
  // 图标地址。
  iconUrl: Type.String({ maxLength: 1024 }),
  // 组内排序权重。
  sortOrder: Type.Integer(),
  // 访客模式下是否可见。
  isPublic: Type.Boolean(),
  // 创建时间戳。
  createdAt: Type.Integer(),
  // 更新时间戳。
  updatedAt: Type.Integer(),
})

// 书签类型。
export type Bookmark = Static<typeof bookmarkSchema>

// 创建书签请求结构。
export const createBookmarkSchema = Type.Object({
  // 所属分组标识。
  groupId: Type.String({ minLength: 1 }),
  // 书签标题。
  title: Type.String({ minLength: 1, maxLength: 128 }),
  // 目标地址。
  url: Type.String({ minLength: 1, maxLength: 1024 }),
  // 可选自定义或抓取的图标地址。
  iconUrl: Type.Optional(Type.String({ maxLength: 1024 })),
  // 访客模式下是否可见。
  isPublic: Type.Optional(Type.Boolean()),
}, { additionalProperties: false })

// 创建书签输入类型。
export type CreateBookmarkInput = Static<typeof createBookmarkSchema>

// 更新书签请求结构。
export const updateBookmarkSchema = Type.Object({
  // 目标分组标识。
  groupId: Type.Optional(Type.String({ minLength: 1 })),
  // 书签标题。
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  // 目标地址。
  url: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
  // 图标地址。
  iconUrl: Type.Optional(Type.String({ maxLength: 1024 })),
  // 组内排序权重。
  sortOrder: Type.Optional(Type.Integer()),
  // 访客模式下是否可见。
  isPublic: Type.Optional(Type.Boolean()),
}, { additionalProperties: false })

// 更新书签输入类型。
export type UpdateBookmarkInput = Static<typeof updateBookmarkSchema>

// 批量重读书签请求结构。
export const reorderBookmarksSchema = Type.Object({
  // 目标分组标识。
  groupId: Type.String({ minLength: 1 }),
  // 排序后的书签标识列表。
  bookmarkIds: Type.Array(Type.String(), { minItems: 1 }),
}, { additionalProperties: false })

// 批量重读书签输入类型。
export type ReorderBookmarksInput = Static<typeof reorderBookmarksSchema>

// 搜索引擎结构。
export const searchEngineSchema = Type.Object({
  // 引擎唯一标识。
  id: Type.String(),
  // 引擎展示名称。
  name: Type.String({ minLength: 1, maxLength: 64 }),
  // 查询地址模板，包含 %s。
  urlTemplate: Type.String({ minLength: 3, maxLength: 512 }),
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
  // 快捷 Bang 指令。
  bang: Type.Optional(Type.String({ maxLength: 16 })),
  // 是否设为默认。
  isDefault: Type.Optional(Type.Boolean()),
  // 排序权重。
  sortOrder: Type.Optional(Type.Integer()),
}, { additionalProperties: false })

// 更新搜索引擎输入类型。
export type UpdateSearchEngineInput = Static<typeof updateSearchEngineSchema>

// 图标抓取请求结构。
export const fetchFaviconSchema = Type.Object({
  // 需要探测图标的站点地址。
  url: Type.String({ minLength: 1, maxLength: 1024 }),
}, { additionalProperties: false })

// 图标抓取输入类型。
export type FetchFaviconInput = Static<typeof fetchFaviconSchema>

// 检查地址是否使用安全的 Web 协议。
export function isValidSafeUrl(target: string): boolean {
  try {
    const parsed = new URL(target)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
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
  type: 'url' | 'search'
  // 最终跳转的目标地址。
  targetUrl: string
}

// 解析用户输入的搜索词或网址。
export function parseSearchQuery(input: string, engines: SearchEngine[]): SearchQueryResult {
  const trimmed = input.trim()
  if (!trimmed) {
    const defaultEngine = engines.find(e => e.isDefault) ?? engines[0]
    return {
      type: 'search',
      targetUrl: defaultEngine ? defaultEngine.urlTemplate.replace('%s', '') : 'https://www.google.com',
    }
  }

  // 1. 检查是否为 Bang 语法，如 !gh rust 或 !yt bun
  if (trimmed.startsWith('!')) {
    const spaceIndex = trimmed.indexOf(' ')
    const bang = spaceIndex === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIndex)
    const keyword = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim()
    const matchedEngine = engines.find(e => e.bang && e.bang.toLowerCase() === bang.toLowerCase())
    if (matchedEngine) {
      return {
        type: 'search',
        targetUrl: matchedEngine.urlTemplate.replace('%s', encodeURIComponent(keyword)),
      }
    }
  }

  // 2. 检查是否为网址
  if (looksLikeUrl(trimmed)) {
    const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    if (isValidSafeUrl(finalUrl)) {
      return { type: 'url', targetUrl: finalUrl }
    }
  }

  // 3. 默认搜索引擎搜索
  const defaultEngine = engines.find(e => e.isDefault) ?? engines[0]
  const template = defaultEngine?.urlTemplate ?? 'https://www.google.com/search?q=%s'
  return {
    type: 'search',
    targetUrl: template.replace('%s', encodeURIComponent(trimmed)),
  }
}
