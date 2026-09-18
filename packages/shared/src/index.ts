import { themeConfigSchema } from './theme'
export * from './desktop'
export * from './theme'
export * from './wallpaper'
export * from './mcp'
export * from './integration'
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
  // 壁纸类型：无、纯色、渐变、自定义图片地址或图片池。
  wallpaperType: Type.Optional(Type.Union([Type.Literal('none'), Type.Literal('color'), Type.Literal('gradient'), Type.Literal('url'), Type.Literal('pool')])),
  // 壁纸具体参数值。
  wallpaperValue: Type.Optional(Type.String({ maxLength: 500 })),
  // 是否启用壁纸定时轮换。
  wallpaperAutoRotate: Type.Optional(Type.Boolean()),
  // 壁纸定时轮换间隔时间（分钟）。
  wallpaperRotateInterval: Type.Optional(Type.Integer({ minimum: 1, maximum: 10080 })),
  // 当前使用的图片池标识。
  activeWallpaperPoolId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  // 全局默认壁纸填充模式。
  wallpaperFitMode: Type.Optional(Type.Union([
    Type.Literal('cover'),
    Type.Literal('contain'),
    Type.Literal('fill'),
    Type.Literal('center'),
    Type.Literal('tile'),
  ])),
  // 结构化主题参数支持跨端同步。
  themeConfig: Type.Optional(themeConfigSchema),
  // 自定义 CSS 覆盖样式规则。
  customCss: Type.Optional(Type.String({ maxLength: 32768 })),
  // 未进入编辑模式时是否允许拖动图标链接改位置（默认开启）。
  allowDragWithoutEdit: Type.Optional(Type.Boolean()),
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
  // 所属分组标识，未归入文件夹时为 null。
  groupId: Type.Union([Type.String(), Type.Null()]),
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
  // 所属分组标识，未归入文件夹时不传或为 null。
  groupId: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
  // 所属空间标识。
  spaceId: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
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
  // 目标分组标识，传 null 可将书签移出分组成为独立图标。
  groupId: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
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

// 导出搜索引擎与联想建议相关定义与工具。
export * from "./search"

// 图片池条目结构。
export const wallpaperItemSchema = Type.Object({
  // 壁纸唯一标识。
  id: Type.String(),
  // 所属用户编号。
  userId: Type.Integer(),
  // 所属图片池标识。
  poolId: Type.String(),
  // 壁纸名称。
  name: Type.String({ minLength: 1, maxLength: 100 }),
  // 壁纸访问地址。
  url: Type.String({ minLength: 1, maxLength: 1024 }),
  // 来源类型：本地上传或外部 URL 导入。
  sourceType: Type.Union([Type.Literal('upload'), Type.Literal('url')]),
  // 独立填充模式（可选，auto 或 null 代表跟随全局）。
  fitMode: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  // 创建时间戳。
  createdAt: Type.Integer(),
  // 更新时间戳。
  updatedAt: Type.Integer(),
})

// 图片池条目类型。
export type WallpaperItem = Static<typeof wallpaperItemSchema>

// 导入外部壁纸请求结构。
export const createWallpaperSchema = Type.Object({
  // 所属图片池标识（可选，默认当前图片池）。
  poolId: Type.Optional(Type.String({ minLength: 1 })),
  // 壁纸展示名称。
  name: Type.String({ minLength: 1, maxLength: 100 }),
  // 图片外部 URL 地址。
  url: Type.String({ minLength: 1, maxLength: 1024 }),
  // 独立填充模式（可选）。
  fitMode: Type.Optional(Type.Union([Type.String(), Type.Null()])),
}, { additionalProperties: false })

// 导入外部壁纸输入类型。
export type CreateWallpaperInput = Static<typeof createWallpaperSchema>

// 更新壁纸条目请求结构。
export const updateWallpaperSchema = Type.Object({
  // 转移所属图片池（可选）。
  poolId: Type.Optional(Type.String({ minLength: 1 })),
  // 壁纸展示名称。
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  // 图片外部 URL 地址。
  url: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
  // 独立填充模式（可选，传 auto 或 null 表示恢复跟随全局）。
  fitMode: Type.Optional(Type.Union([Type.String(), Type.Null()])),
}, { additionalProperties: false })

// 更新壁纸条目输入类型。
export type UpdateWallpaperInput = Static<typeof updateWallpaperSchema>
