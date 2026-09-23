// 触屏点按的确定时长（毫秒），也就是描边线的闭合时长：走完之前一律不进入拖动，走完才算点按确定。
export const TOUCH_HOLD_WINDOW_MS = 500
// 针对文件夹等大块组件的确定时长（毫秒）：延长观察期，彻底杜绝翻页滑动误触。
export const TOUCH_HOLD_BIG_WINDOW_MS = 650
// 按压视觉反馈的防抖延迟（毫秒）：按下前 100ms 处于静止观察期，不展现缩放与描边，避免滑动翻页时闪烁。
export const TOUCH_HOLD_DEBOUNCE_MS = 100
// 确定完成后的拖动宽限时长（毫秒）：期间仍可起拖，超时未拖动才弹出长按菜单。
export const TOUCH_HOLD_GRACE_MS = 600
// 长按菜单最早出现的时刻，等于按压窗口加宽限期。
export const TOUCH_HOLD_MENU_MS = TOUCH_HOLD_WINDOW_MS + TOUCH_HOLD_GRACE_MS
// 触屏进入拖动所需的最小位移（像素），与拖动过程中的激活阈值保持一致。
export const TOUCH_DRAG_THRESHOLD = 10
// 触屏静止长按判定允许的最大位移容差（像素），超出即视为滑动翻页而不进入长按。
export const TOUCH_PICK_TOLERANCE = 6
// 触屏垂直翻页判定的最大位移（像素）：垂直位移优先让位给纵向滚动翻页。
export const TOUCH_SCROLL_VERTICAL_TOLERANCE = 5
// 指针离开来源容器后仍需越过的缓冲距离（像素），避免贴着边缘抖动就切换落点。
export const TOUCH_SOURCE_LEAVE_BUFFER = 16
// 桌面网格的行高（像素），必须与 .desktop-grid 的 grid-auto-rows 保持一致。
export const GRID_ROW_HEIGHT = 96
// 允许落点到达的最大行号，与组件拖动、组件树拖放共用的上限保持一致。
export const GRID_MAX_ROW = 199

// 触屏按压判定结果：wait 继续等待、drag 进入拖动、expired 已交给长按菜单、cancel 位移超出容差取消长按。
export type TouchPressOutcome = 'wait' | 'drag' | 'expired' | 'cancel'

// 文件夹内图标的拾起模式：direct 直接拖出（未展开的文件夹组件，内容不滚动），
// scrollable 先让位给滚动（已打开的文件夹弹窗，内容可滚动）。
export type TouchPickMode = 'direct' | 'scrollable'

// 文件夹内图标的长按拾起判定结果：wait 继续等待、scroll 让位给滚动、pick 拾起图标、armed 已就绪待移动。
export type TouchPickOutcome = 'wait' | 'scroll' | 'pick' | 'armed'

// 判定触屏位移是否已超出静止容差（支持总距离与纵向位移分别核验，优先保障垂直翻页）。
export function isTouchMoveExceeded(
  dx: number,
  dy: number,
  tolerance = TOUCH_PICK_TOLERANCE,
  verticalTolerance = TOUCH_SCROLL_VERTICAL_TOLERANCE,
): boolean {
  return Math.abs(dy) > verticalTolerance || Math.hypot(dx, dy) > tolerance
}

// 判定按压等待期间的移动：确定时间走完之前手指必须保持静止（位移超出容差立刻取消长按判定，让位给页面翻动）；
// 走完之后位移达到阈值判定为拖动，超过菜单时刻则交给长按菜单。
export function resolveTouchPress(
  distance: number,
  elapsedMs: number,
  menuMs = TOUCH_HOLD_MENU_MS,
  threshold = TOUCH_DRAG_THRESHOLD,
  confirmMs = TOUCH_HOLD_WINDOW_MS,
  tolerance = TOUCH_PICK_TOLERANCE,
): TouchPressOutcome {
  if (elapsedMs > menuMs) return 'expired'
  if (elapsedMs < confirmMs) return distance > tolerance ? 'cancel' : 'wait'
  return distance >= threshold ? 'drag' : 'wait'
}

// 判定文件夹内图标的拾起：确定时间走完之前不拾起，位移超出容差立刻让位给滚动与翻页；
// 走完之后位移达到阈值立刻拾起，仍无位移则进入就绪状态，此后任何位移都直接拖动。
export function resolveTouchPick(
  distance: number,
  elapsedMs: number,
  mode: TouchPickMode = 'direct',
  holdMs = TOUCH_HOLD_WINDOW_MS,
  threshold = TOUCH_DRAG_THRESHOLD,
  tolerance = TOUCH_PICK_TOLERANCE,
): TouchPickOutcome {
  const held = elapsedMs >= holdMs
  if (!held) return distance > tolerance ? 'scroll' : 'wait'
  if (mode === 'scrollable' && distance < threshold) return 'armed'
  return distance >= threshold ? 'pick' : 'armed'
}

// 判定指针是否已离开来源容器（含缓冲），用于拖出文件夹弹窗后收起来源。
export function touchLeftSource(
  x: number,
  y: number,
  rect: { left: number; right: number; top: number; bottom: number },
  buffer = TOUCH_SOURCE_LEAVE_BUFFER,
): boolean {
  if (rect.right <= rect.left && rect.bottom <= rect.top) return true
  return x < rect.left - buffer || x > rect.right + buffer || y < rect.top - buffer || y > rect.bottom + buffer
}

// 按压进度（0~1）：0 为刚按下，1 为判定窗口到期，用于自绘外框描边线。
export function touchPressProgress(elapsedMs: number, windowMs = TOUCH_HOLD_WINDOW_MS): number {
  if (!(windowMs > 0)) return 1
  return Math.min(1, Math.max(0, elapsedMs / windowMs))
}

// 按压描边线的绘制几何与周长。
export interface TouchPressLine {
  viewBox: string
  x: number
  y: number
  width: number
  height: number
  rx: number
  perimeter: number
}

// 计算按压描边线：贴着组件内边缘的圆角方框，圆角足够大时自然收敛为圆形。
export function touchPressLine(width: number, height: number, radius: number, inset = 1): TouchPressLine {
  const w = Math.max(1, width - inset * 2)
  const h = Math.max(1, height - inset * 2)
  const rx = Math.max(0, Math.min(radius - inset, Math.min(w, h) / 2))
  // 圆角矩形的周长拆成直线段与四个圆角，用于把进度换算成描边长度。
  const perimeter = 2 * (w - 2 * rx) + 2 * (h - 2 * rx) + 2 * Math.PI * rx
  return { viewBox: '0 0 ' + width + ' ' + height, x: inset, y: inset, width: w, height: h, rx, perimeter }
}

// 网格换算所需的画布度量与指针坐标。
export interface TouchGridMetrics {
  clientX: number
  clientY: number
  // 画布网格外框在视口坐标系中的位置与宽度。
  left: number
  top: number
  width: number
  columns: number
  gap: number
  rowGap: number
}

// 把指针位置换算为网格单元，与组件拖动、组件树拖放共用同一套夹取规则：
// 网格外框只覆盖到内容最末行，而桌面可拖区域远大于它，因此越界一律夹取到最近的有效单元
// （列夹到首末列、行夹到 0~199），保证任何位置都有落点，而不是把落点判空。
export function resolveGridCell(metrics: TouchGridMetrics): { x: number; y: number } {
  const columns = Math.max(1, Math.floor(metrics.columns))
  const stride = (metrics.width - metrics.gap * (columns - 1)) / columns + metrics.gap
  const rawX = stride > 0 ? Math.floor((metrics.clientX - metrics.left) / stride) : 0
  const rawY = Math.floor((metrics.clientY - metrics.top) / (GRID_ROW_HEIGHT + metrics.rowGap))
  const round = (value: number) => (Number.isFinite(value) ? value : 0)
  return {
    x: Math.max(0, Math.min(columns - 1, round(rawX))),
    y: Math.max(0, Math.min(GRID_MAX_ROW, round(rawY))),
  }
}
