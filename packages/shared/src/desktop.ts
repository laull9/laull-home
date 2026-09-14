import { Value } from '@sinclair/typebox/value'
import { Type, type Static } from '@sinclair/typebox'

// 四种断点共用稳定标识。
export const BREAKPOINTS = { mobile: 4, tablet: 6, laptop: 8, desktop: 12 } as const
// 断点类型。
export type Breakpoint = keyof typeof BREAKPOINTS
// 网格坐标与跨度限制。
export const placementSchema = Type.Object({
  x: Type.Integer({ minimum: 0, maximum: 11 }), y: Type.Integer({ minimum: 0, maximum: 199 }),
  w: Type.Integer({ minimum: 1, maximum: 12 }), h: Type.Integer({ minimum: 1, maximum: 4 }),
  pinned: Type.Boolean(),
}, { additionalProperties: false })
// 局部样式只允许几何与颜色值。
export const widgetStyleSchema = Type.Object({
  opacity: Type.Number({ minimum: 50, maximum: 100 }), blur: Type.Number({ minimum: 0, maximum: 30 }),
  radius: Type.Number({ minimum: 0, maximum: 40 }), padding: Type.Number({ minimum: 0, maximum: 32 }),
  border: Type.Number({ minimum: 0, maximum: 4 }),
  color: Type.String({ pattern: '^$|^#[0-9a-fA-F]{6}$' }),
  background: Type.String({ pattern: '^$|^#[0-9a-fA-F]{6}$' }),
}, { additionalProperties: false })
// 组件节点仅支持已实现的白名单渲染器。
export const widgetSchema = Type.Object({
  id: Type.String({ pattern: '^[a-zA-Z0-9_-]{1,64}$' }),
  type: Type.Union([Type.Literal('search'), Type.Literal('bookmark'), Type.Literal('folder'), Type.Literal('note'), Type.Literal('clock'), Type.Literal('calendar')]),
  title: Type.String({ minLength: 1, maxLength: 80 }),
  content: Type.String({ maxLength: 8000 }), referenceId: Type.String({ maxLength: 64 }),
  timezone: Type.String({ maxLength: 64 }), hour12: Type.Boolean(),
  stackId: Type.String({ maxLength: 64 }), css: Type.String({ maxLength: 4000 }),
  style: Type.Optional(widgetStyleSchema),
  layouts: Type.Object({
    mobile: Type.Optional(placementSchema), tablet: Type.Optional(placementSchema),
    laptop: Type.Optional(placementSchema), desktop: placementSchema,
  }, { additionalProperties: false }),
}, { additionalProperties: false })
// 原子替换保存节点、模板及所有断点。
export const desktopSchema = Type.Object({
  revision: Type.Integer({ minimum: 0 }),
  nodes: Type.Array(widgetSchema, { maxItems: 120 }),
  templates: Type.Array(widgetSchema, { maxItems: 40 }),
}, { additionalProperties: false })
// 组件节点类型。
export type WidgetNode = Static<typeof widgetSchema>
// 画布类型。
export type Desktop = Static<typeof desktopSchema>
// 坐标类型。
export type Placement = Static<typeof placementSchema>
// 目录定义尺寸与默认内容。
export const WIDGET_CATALOG = [
  { type: 'search', title: '搜索', w: 8, h: 1 },
  { type: 'bookmark', title: '图标书签', w: 1, h: 1 },
  { type: 'folder', title: '书签文件夹', w: 2, h: 2 },
  { type: 'note', title: '便签', w: 2, h: 2 },
  { type: 'clock', title: '时钟', w: 2, h: 1 },
  { type: 'calendar', title: '日历', w: 3, h: 3 },
] as const
// 创建继承全局主题的节点。
export function newWidget(type: WidgetNode['type'], id: string): WidgetNode {
  const entry = WIDGET_CATALOG.find(item => item.type === type)!
  return { id, type, title: entry.title, content: '', referenceId: '', timezone: 'Asia/Shanghai', hour12: false,
    stackId: '', css: '', layouts: { desktop: { x: 0, y: 0, w: entry.w, h: entry.h, pinned: false } } }
}
// 固定节点优先占位，碰撞与越界自动寻找下一处空位。
export function arrangeNodes(nodes: WidgetNode[], breakpoint: Breakpoint): Map<string, Placement> {
  const columns = BREAKPOINTS[breakpoint]
  const occupied = new Set<string>()
  const result = new Map<string, Placement>()
  const stacks = new Map<string, Placement>()
  const ordered = [...nodes].sort((a, b) => Number(b.layouts[breakpoint]?.pinned ?? false) - Number(a.layouts[breakpoint]?.pinned ?? false))
  for (const node of ordered) {
    const saved = node.layouts[breakpoint]
    const p = { ...(saved ?? node.layouts.desktop) }
    p.w = Math.min(columns, p.w)
    p.x = Math.min(columns - p.w, p.x)
    if (!saved || !p.pinned) { p.x = 0; p.y = 0 }
    const stack = node.stackId && stacks.get(node.stackId)
    if (stack && stack.w === p.w && stack.h === p.h) { result.set(node.id, { ...stack }); continue }
    // 检查完整矩形，防止大卡片覆盖小卡片。
    const fits = () => {
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (occupied.has(x + ':' + y)) return false
      return true
    }
    while (!fits()) { p.x++; if (p.x + p.w > columns) { p.x = 0; p.y++ } }
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) occupied.add(x + ':' + y)
    result.set(node.id, p)
    if (node.stackId) stacks.set(node.stackId, p)
  }
  return result
}

// 客户端导入与服务端复用同一校验。
export function isWidget(value: unknown): value is WidgetNode { return Value.Check(widgetSchema, value) }

// 书签拖拽合并同时提交当前草稿。
export const mergeWidgetsSchema = Type.Object({
  desktop: desktopSchema,
  sourceId: Type.String({ maxLength: 64 }),
  targetId: Type.String({ maxLength: 64 }),
}, { additionalProperties: false })
