import { Type, type Static } from '@sinclair/typebox'

// MCP 密钥元数据结构，用于前端脱敏展示。
export const mcpKeyMetadataSchema = Type.Object({
  // 当前用户是否已配置有效 MCP 密钥。
  hasKey: Type.Boolean(),
  // 密钥末尾 4 位脱敏掩码，未配置时为 null。
  keyMask: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  // 密钥初次生成时间戳。
  createdAt: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
  // 密钥最近刷新时间戳。
  updatedAt: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
})

// MCP 密钥元数据类型。
export type McpKeyMetadata = Static<typeof mcpKeyMetadataSchema>

// MCP 密钥生成与刷新响应，仅此时向客户端返回明文。
export const mcpKeyRefreshResponseSchema = Type.Object({
  // 完整的原始 MCP 密钥明文。
  key: Type.String(),
  // 对应的脱敏掩码。
  keyMask: Type.String(),
  // 密钥签发时间戳。
  createdAt: Type.Integer(),
})

// MCP 密钥刷新响应类型。
export type McpKeyRefreshResponse = Static<typeof mcpKeyRefreshResponseSchema>

// 浏览器端桌面热重载事件类型。
export const desktopEventTypeSchema = Type.Union([
  Type.Literal('theme.updated'),
  Type.Literal('widget.updated'),
  Type.Literal('layout.updated'),
])

// 桌面热重载事件推导类型。
export type DesktopEventType = Static<typeof desktopEventTypeSchema>
