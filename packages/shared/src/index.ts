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
