import { Type, type Static } from '@sinclair/typebox'

// 登录输入限制用于前后端一致校验。
export const loginSchema = Type.Object({
  // 用户名只允许稳定的标识字符。
  username: Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' }),
  // 密码上限限制哈希输入体积。
  password: Type.String({ minLength: 12, maxLength: 128 }),
}, { additionalProperties: false })

// 第一版用户配置只开放明确支持的字段。
export const settingsSchema = Type.Object({
  // 版本号用于防止多设备覆盖写入。
  revision: Type.Integer({ minimum: 0 }),
  // 页面标题由服务端持久化。
  title: Type.String({ minLength: 1, maxLength: 80 }),
  // 外观跟随系统或固定明暗模式。
  appearance: Type.Union([Type.Literal('system'), Type.Literal('light'), Type.Literal('dark')]),
}, { additionalProperties: false })

// 设置接口使用同一份运行时结构推导类型。
export type HomeSettings = Static<typeof settingsSchema>

// 修改密码输入验证。
export const changePasswordSchema = Type.Object({
  // 当前密码用于二次确认。
  oldPassword: Type.String({ minLength: 12, maxLength: 128 }),
  // 新密码限制长度与复杂度。
  newPassword: Type.String({ minLength: 12, maxLength: 128 }),
}, { additionalProperties: false })

// 修改密码请求类型。
export type ChangePasswordInput = Static<typeof changePasswordSchema>

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
  password: Type.String({ minLength: 12, maxLength: 128 }),
}, { additionalProperties: false })

// 隐私密码输入类型。
export type PrivacySetupInput = Static<typeof privacySetupSchema>

// 解锁隐私空间输入。
export const privacyUnlockSchema = Type.Object({
  // 隐私空间密码。
  password: Type.String({ minLength: 12, maxLength: 128 }),
}, { additionalProperties: false })

// 隐私解锁输入类型。
export type PrivacyUnlockInput = Static<typeof privacyUnlockSchema>
