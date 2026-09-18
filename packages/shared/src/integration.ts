import { Type, type Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

// 微服务小部件支持的渲染器白名单。
export const WIDGET_RENDERERS = ['metric-grid', 'status-card', 'api-card'] as const
// 渲染器类型。
export type WidgetRenderer = typeof WIDGET_RENDERERS[number]

// 检查渲染器名称是否在受支持的白名单内。
export function isValidWidgetRenderer(renderer: string): renderer is WidgetRenderer {
  return (WIDGET_RENDERERS as readonly string[]).includes(renderer)
}

// 指标字段数据类型。
export const fieldTypeSchema = Type.Union([
  Type.Literal('status'),
  Type.Literal('number'),
  Type.Literal('text'),
  Type.Literal('progress'),
])
// 字段类型推导。
export type FieldType = Static<typeof fieldTypeSchema>

// 小部件展示字段定义。
export const widgetFieldSchema = Type.Object({
  key: Type.String({ minLength: 1, maxLength: 64 }),
  label: Type.String({ minLength: 1, maxLength: 64 }),
  type: fieldTypeSchema,
  unit: Type.Optional(Type.String({ maxLength: 16 })),
}, { additionalProperties: false })
// 小部件展示字段类型。
export type WidgetField = Static<typeof widgetFieldSchema>

// 小部件数据拉取端点定义。
export const widgetDataEndpointSchema = Type.Object({
  method: Type.Union([Type.Literal('GET'), Type.Literal('POST')]),
  path: Type.String({ minLength: 1, maxLength: 256, pattern: '^/[a-zA-Z0-9_./-]*$' }),
  refreshInterval: Type.Optional(Type.Integer({ minimum: 1000, maximum: 86400000 })),
}, { additionalProperties: false })
// 小部件数据端点类型。
export type WidgetDataEndpoint = Static<typeof widgetDataEndpointSchema>

// 微服务声明的小部件结构。
export const integrationWidgetSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' }),
  name: Type.String({ minLength: 1, maxLength: 80 }),
  description: Type.Optional(Type.String({ maxLength: 256 })),
  renderer: Type.Union([
    Type.Literal('metric-grid'),
    Type.Literal('status-card'),
    Type.Literal('api-card'),
  ]),
  data: widgetDataEndpointSchema,
  fields: Type.Optional(Type.Array(widgetFieldSchema, { maxItems: 32 })),
}, { additionalProperties: false })
// 微服务小部件类型。
export type IntegrationWidget = Static<typeof integrationWidgetSchema>

// 微服务动作操作定义。
export const integrationActionSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' }),
  label: Type.String({ minLength: 1, maxLength: 64 }),
  method: Type.Union([Type.Literal('POST'), Type.Literal('PUT'), Type.Literal('DELETE')]),
  path: Type.String({ minLength: 1, maxLength: 256, pattern: '^/[a-zA-Z0-9_./-]*$' }),
  description: Type.Optional(Type.String({ maxLength: 256 })),
}, { additionalProperties: false })
// 微服务动作类型。
export type IntegrationAction = Static<typeof integrationActionSchema>

// 严格受控的微服务清单规范 Schema。
export const integrationManifestSchema = Type.Object({
  schemaVersion: Type.Literal(1),
  id: Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' }),
  name: Type.String({ minLength: 1, maxLength: 80 }),
  icon: Type.Optional(Type.String({ maxLength: 256 })),
  description: Type.Optional(Type.String({ maxLength: 256 })),
  widgets: Type.Array(integrationWidgetSchema, { maxItems: 32 }),
  actions: Type.Optional(Type.Array(integrationActionSchema, { maxItems: 32 })),
}, { additionalProperties: false })
// 微服务清单类型。
export type IntegrationManifest = Static<typeof integrationManifestSchema>

// 检查清单对象是否合法有效。
export function isValidIntegrationManifest(value: unknown): value is IntegrationManifest {
  return Value.Check(integrationManifestSchema, value)
}

// 认证类型约束。
export const integrationAuthTypeSchema = Type.Union([
  Type.Literal('none'),
  Type.Literal('bearer'),
  Type.Literal('basic'),
  Type.Literal('api-key'),
])
// 认证类型推导。
export type IntegrationAuthType = Static<typeof integrationAuthTypeSchema>

// 允许目标主机格式校验（例如 192.168.1.100:8080 或 ltrade:8080 或 example.com）。
export const allowedHostSchema = Type.String({
  minLength: 1,
  maxLength: 128,
  pattern: '^[a-zA-Z0-9_.-]+(:[0-9]{1,5})?$',
})

// 服务集成展示项，绝不向浏览器暴露 Secret 明文。
export const integrationItemSchema = Type.Object({
  id: Type.String(),
  spaceId: Type.String(),
  name: Type.String({ minLength: 1, maxLength: 80 }),
  slug: Type.String({ minLength: 1, maxLength: 64 }),
  baseUrl: Type.String({ minLength: 1, maxLength: 512 }),
  authType: integrationAuthTypeSchema,
  allowedHosts: Type.Array(allowedHostSchema),
  timeout: Type.Integer({ minimum: 500, maximum: 30000 }),
  maxConcurrency: Type.Integer({ minimum: 1, maximum: 20 }),
  manifest: integrationManifestSchema,
  hasSecret: Type.Boolean(),
  createdAt: Type.Integer(),
  updatedAt: Type.Integer(),
})
// 服务集成展示项类型。
export type IntegrationItem = Static<typeof integrationItemSchema>

// 创建服务集成请求结构。
export const createIntegrationSchema = Type.Object({
  spaceId: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  name: Type.String({ minLength: 1, maxLength: 80 }),
  slug: Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' }),
  baseUrl: Type.String({ minLength: 1, maxLength: 512 }),
  authType: integrationAuthTypeSchema,
  allowedHosts: Type.Optional(Type.Array(allowedHostSchema)),
  timeout: Type.Optional(Type.Integer({ minimum: 500, maximum: 30000 })),
  maxConcurrency: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
  secret: Type.Optional(Type.String({ minLength: 1, maxLength: 4096 })),
}, { additionalProperties: false })
// 创建服务集成输入类型。
export type CreateIntegrationInput = Static<typeof createIntegrationSchema>

// 更新服务集成请求结构。
export const updateIntegrationSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  slug: Type.Optional(Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' })),
  baseUrl: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
  authType: Type.Optional(integrationAuthTypeSchema),
  allowedHosts: Type.Optional(Type.Array(allowedHostSchema)),
  timeout: Type.Optional(Type.Integer({ minimum: 500, maximum: 30000 })),
  maxConcurrency: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
  secret: Type.Optional(Type.String({ minLength: 1, maxLength: 4096 })),
  removeSecret: Type.Optional(Type.Boolean()),
}, { additionalProperties: false })
// 更新服务集成输入类型。
export type UpdateIntegrationInput = Static<typeof updateIntegrationSchema>

// 发现并校验微服务清单请求结构。
export const discoverIntegrationSchema = Type.Object({
  baseUrl: Type.String({ minLength: 1, maxLength: 512 }),
  authType: Type.Optional(integrationAuthTypeSchema),
  secret: Type.Optional(Type.String({ minLength: 1, maxLength: 4096 })),
  allowedHosts: Type.Optional(Type.Array(allowedHostSchema)),
}, { additionalProperties: false })
// 发现微服务清单输入类型。
export type DiscoverIntegrationInput = Static<typeof discoverIntegrationSchema>

// 执行微服务动作请求结构。
export const executeActionSchema = Type.Object({
  params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
}, { additionalProperties: false })
// 执行动作输入类型。
export type ExecuteActionInput = Static<typeof executeActionSchema>

// 密钥轮换请求结构。
export const rotateSecretKeySchema = Type.Object({
  oldMasterKey: Type.String({ minLength: 1, maxLength: 256 }),
  newMasterKey: Type.String({ minLength: 16, maxLength: 256 }),
}, { additionalProperties: false })
// 密钥轮换输入类型。
export type RotateSecretKeyInput = Static<typeof rotateSecretKeySchema>
