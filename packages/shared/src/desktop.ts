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
  frameless: Type.Optional(Type.Boolean()),
}, { additionalProperties: false })
// 组件节点仅支持已实现的白名单渲染器。
export const widgetSchema = Type.Object({
  id: Type.String({ pattern: '^[a-zA-Z0-9_-]{1,64}$' }),
  type: Type.Union([
    Type.Literal('search'), Type.Literal('bookmark'), Type.Literal('folder'),
    Type.Literal('note'), Type.Literal('clock'), Type.Literal('calendar'),
    Type.Literal('countdown'), Type.Literal('todo'),
  ]),
  title: Type.String({ minLength: 1, maxLength: 80 }),
  content: Type.String({ maxLength: 8000 }), referenceId: Type.String({ maxLength: 64 }),
  timezone: Type.String({ maxLength: 64 }), hour12: Type.Boolean(),
  stackId: Type.String({ maxLength: 64 }), css: Type.String({ maxLength: 4000 }),
  variant: Type.Optional(Type.String({ maxLength: 64 })),
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
// 目录定义尺寸、分类与默认内容。
export const WIDGET_CATALOG = [
  { type: 'search', title: '搜索', category: 'nav', w: 8, h: 1, desc: '集成搜索引擎与快捷指令' },
  { type: 'bookmark', title: '图标书签', category: 'nav', w: 1, h: 1, desc: '单书签捷径，支持大图与胶囊' },
  { type: 'folder', title: '书签文件夹', category: 'nav', w: 2, h: 2, desc: '分组收纳盒，支持抽屉与九宫格' },
  { type: 'clock', title: '时钟', category: 'time', w: 2, h: 1, desc: '数码、模拟表盘、翻页与流逝环' },
  { type: 'calendar', title: '日历', category: 'time', w: 3, h: 3, desc: '月度日程网格与当日标记' },
  { type: 'countdown', title: '倒数纪念日', category: 'tools', w: 2, h: 2, desc: '目标日倒数与流逝进度' },
  { type: 'todo', title: '待办清单', category: 'tools', w: 2, h: 2, desc: '桌面随手勾选待办任务' },
  { type: 'note', title: '便签', category: 'tools', w: 2, h: 2, desc: '桌面便笺与备忘草稿' },
] as const
// 创建继承全局主题的节点。
export function newWidget(type: WidgetNode['type'], id: string, variant?: string): WidgetNode {
  const entry = WIDGET_CATALOG.find(item => item.type === type)!
  const defaultW = (type === 'bookmark' && variant === 'pill') ? 2 : entry.w
  return { id, type, title: entry.title, content: '', referenceId: '', timezone: 'Asia/Shanghai', hour12: false,
    stackId: '', css: '', ...(variant ? { variant } : {}),
    ...(type === 'bookmark' ? { style: { opacity: 100, blur: 0, radius: 16, padding: 4, border: 0, color: '', background: '', frameless: true } } : {}),
    layouts: { desktop: { x: 0, y: 0, w: defaultW, h: entry.h, pinned: false } } }
}
// 智能多向避让寻找空位：支持上下左右多向退让与平滑智能换行。
function findBestPlacement(
  targetX: number,
  targetY: number,
  w: number,
  h: number,
  columns: number,
  occupied: Set<string>,
  vector?: { dx: number; dy: number },
): Placement {
  const fitsAt = (cx: number, cy: number) => {
    if (cx < 0 || cx + w > columns || cy < 0) return false
    for (let y = cy; y < cy + h; y++) {
      for (let x = cx; x < cx + w; x++) {
        if (occupied.has(x + ':' + y)) return false
      }
    }
    return true
  }

  if (fitsAt(targetX, targetY)) return { x: targetX, y: targetY, w, h, pinned: true }

  let bestX = targetX, bestY = targetY, minCost = Infinity
  const dirX = vector ? (vector.dx > 6 ? 1 : vector.dx < -6 ? -1 : 0) : 0
  const dirY = vector ? (vector.dy > 6 ? 1 : vector.dy < -6 ? -1 : 0) : 0

  // 围绕目标位置由近及远进行多向加权搜索。
  const maxY = Math.max(targetY + 12, 16)
  for (let cy = Math.max(0, targetY - 4); cy <= maxY; cy++) {
    for (let cx = 0; cx <= columns - w; cx++) {
      if (!fitsAt(cx, cy)) continue
      const dX = cx - targetX, dY = cy - targetY
      const absDX = Math.abs(dX), absDY = Math.abs(dY)

      // 基础距离代价：水平位移比垂直位移更平缓。
      let cost = absDX * 2 + absDY * 3

      // 方向推进加权：顺应拖拽推挤方向降低代价，反方向增加代价。
      if (dirX !== 0) {
        if (Math.sign(dX) === dirX) cost -= 1.8
        else if (dX !== 0) cost += 2.2
      }
      if (dirY !== 0) {
        if (Math.sign(dY) === dirY) cost -= 2.2
        else if (dY !== 0) cost += 2.5
      }

      // 智能换行：当下移一行时，优先保持在同列或相邻列，避免跳回行首。
      if (dY > 0 && absDX <= 1) cost -= 1.2

      if (cost < minCost) {
        minCost = cost
        bestX = cx
        bestY = cy
        if (cost <= 0.8) break
      }
    }
    if (minCost <= 0.8) break
  }

  // 兜底方案：在有限范围内未找到时顺序找下一个空位。
  if (minCost === Infinity) {
    let px = targetX, py = targetY
    while (!fitsAt(px, py)) { px++; if (px + w > columns) { px = 0; py++ } }
    bestX = px
    bestY = py
  }
  return { x: bestX, y: bestY, w, h, pinned: true }
}

// 固定节点优先占位，碰撞与越界自动进行智能多向避让与就近换行。
export function arrangeNodes(
  nodes: WidgetNode[],
  breakpoint: Breakpoint,
  vector?: { dx: number; dy: number },
): Map<string, Placement> {
  const columns = BREAKPOINTS[breakpoint]
  const occupied = new Set<string>()
  const result = new Map<string, Placement>()
  const stacks = new Map<string, Placement>()
  const ordered = [...nodes].sort((a, b) => Number(b.layouts[breakpoint]?.pinned ?? false) - Number(a.layouts[breakpoint]?.pinned ?? false))
  for (const node of ordered) {
    const saved = node.layouts[breakpoint]
    const p = { ...(saved ?? node.layouts.desktop) }
    // 胶囊卡片支持 1 列紧凑并排与 2 列完整横向排版。
    p.w = Math.max(1, Math.min(columns, p.w))
    p.x = Math.min(columns - p.w, p.x)
    if (!saved || !p.pinned) { p.x = 0; p.y = 0 }
    const stack = node.stackId && stacks.get(node.stackId)
    if (stack && stack.w === p.w && stack.h === p.h) { result.set(node.id, { ...stack }); continue }

    const placed = findBestPlacement(p.x, p.y, p.w, p.h, columns, occupied, vector)
    for (let y = placed.y; y < placed.y + placed.h; y++) {
      for (let x = placed.x; x < placed.x + placed.w; x++) {
        occupied.add(x + ':' + y)
      }
    }
    result.set(node.id, placed)
    if (node.stackId) stacks.set(node.stackId, placed)
  }
  return result
}

// 为新组件计算首选放置位置，倾向于现有组件群落中空位的右下角。
export function findBottomRightPlacement(
  existingNodes: WidgetNode[],
  w: number,
  h: number,
  breakpoint: Breakpoint = 'desktop',
): { x: number; y: number } {
  const columns = BREAKPOINTS[breakpoint]
  const clampedW = Math.max(1, Math.min(columns, w))
  const clampedH = Math.max(1, Math.min(20, h))
  if (!existingNodes || existingNodes.length === 0) return { x: 0, y: 0 }

  const positions = arrangeNodes(existingNodes, breakpoint)
  const occupied = new Set<string>()
  let maxBottom = 0

  for (const p of positions.values()) {
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        occupied.add(`${x}:${y}`)
      }
    }
    maxBottom = Math.max(maxBottom, p.y + p.h)
  }

  // 校验指定区域是否无碰撞重叠。
  const fits = (x: number, y: number) => {
    if (x < 0 || x + clampedW > columns || y < 0) return false
    for (let cy = y; cy < y + clampedH; cy++) {
      for (let cx = x; cx < x + clampedW; cx++) {
        if (occupied.has(`${cx}:${cy}`)) return false
      }
    }
    return true
  }

  // 校验目标矩形是否紧挨现有已占用网格。
  const isAdjacent = (x: number, y: number) => {
    for (let cy = y; cy < y + clampedH; cy++) {
      if (x > 0 && occupied.has(`${x - 1}:${cy}`)) return true
      if (x + clampedW < columns && occupied.has(`${x + clampedW}:${cy}`)) return true
    }
    for (let cx = x; cx < x + clampedW; cx++) {
      if (y > 0 && occupied.has(`${cx}:${y - 1}`)) return true
      if (occupied.has(`${cx}:${y + clampedH}`)) return true
    }
    return false
  }

  // 优先在现有组件覆盖的高度区间内，寻找最靠右、最靠下的紧邻空位。
  let bestCandidate: { x: number; y: number; score: number } | null = null
  for (let y = 0; y <= maxBottom - clampedH; y++) {
    for (let x = 0; x <= columns - clampedW; x++) {
      if (fits(x, y) && isAdjacent(x, y)) {
        const score = y * columns + x
        if (!bestCandidate || score > bestCandidate.score) {
          bestCandidate = { x, y, score }
        }
      }
    }
  }

  if (bestCandidate) {
    return { x: bestCandidate.x, y: bestCandidate.y }
  }

  // 现有范围无法容纳时，在最后一行右侧或紧贴下方起行寻找第一个可用位置。
  for (let y = Math.max(0, maxBottom - clampedH); y <= maxBottom; y++) {
    for (let x = 0; x <= columns - clampedW; x++) {
      if (fits(x, y)) {
        return { x, y }
      }
    }
  }

  return { x: 0, y: maxBottom }
}

// 客户端导入与服务端复用同一校验。
export function isWidget(value: unknown): value is WidgetNode { return Value.Check(widgetSchema, value) }

// 书签拖拽合并同时提交当前草稿。
export const mergeWidgetsSchema = Type.Object({
  desktop: desktopSchema,
  sourceId: Type.String({ maxLength: 64 }),
  targetId: Type.String({ maxLength: 64 }),
}, { additionalProperties: false })
