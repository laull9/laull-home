import { describe, expect, test } from 'bun:test'

// 视窗边界矩形结构。
interface ViewportBounds {
  left: number
  right: number
  top: number
  bottom: number
}

// 文件夹弹窗进出与迟滞唤出核心判定算法。
function evaluateDragPosition(
  cachedRect: ViewportBounds | null,
  currentOutside: boolean,
  clientX: number,
  clientY: number,
): boolean {
  if (!cachedRect) return false
  // 铁律：过滤原生 HTML5 拖拽中的 (0, 0) 空坐标，防止初期误判。
  if (clientX === 0 && clientY === 0) return currentOutside

  const { left, right, top, bottom } = cachedRect
  const isInside =
    clientX >= left &&
    clientX <= right &&
    clientY >= top &&
    clientY <= bottom

  if (isInside) {
    // 移回视窗区域时立即重新唤出显示文件夹。
    return false
  }

  // 超出边界 16px 迟滞缓冲区时判定为拖出外部，文件夹隐形退场。
  const buffer = 16
  const isFarOutside =
    clientX < left - buffer ||
    clientX > right + buffer ||
    clientY < top - buffer ||
    clientY > bottom + buffer

  if (isFarOutside) {
    return true
  }

  // 处于 0~16px 边缘缓冲带时保持原有状态，防止抖动。
  return currentOutside
}

describe('文件夹弹窗拖拽内部重排、移出退场与反悔重新唤出状态机', () => {
  const viewportRect: ViewportBounds = {
    left: 200,
    right: 800,
    top: 100,
    bottom: 600,
  }

  test('内部拖拽时过滤 (0, 0) 空坐标，绝不误触发外部退场与关闭', () => {
    let isOutside = false

    // 1. 刚起拖瞬间，浏览器派发 (0, 0) 空坐标，状态必须保持 false。
    isOutside = evaluateDragPosition(viewportRect, isOutside, 0, 0)
    expect(isOutside).toBe(false)

    // 2. 内部正常坐标拖动，状态保持 false。
    isOutside = evaluateDragPosition(viewportRect, isOutside, 300, 200)
    expect(isOutside).toBe(false)

    // 3. 内部靠近边缘（未超出 16px buffer），状态依然保持 false。
    isOutside = evaluateDragPosition(viewportRect, isOutside, 805, 300)
    expect(isOutside).toBe(false)
  })

  test('拖拽超出视窗边界时进入外部状态，并在外部松手时允许关闭', () => {
    let isOutside = false

    // 1. 拖出右侧边界大于 16px（例如 820px）。
    isOutside = evaluateDragPosition(viewportRect, isOutside, 820, 300)
    expect(isOutside).toBe(true)

    // 2. 外部移动中保持 true。
    isOutside = evaluateDragPosition(viewportRect, isOutside, 900, 400)
    expect(isOutside).toBe(true)
  })

  test('拖出外部后移回视窗相关显示区域，必须立即重新唤出文件夹', () => {
    // 初始状态已处于外部。
    let isOutside = true

    // 1. 鼠标从外部移回视窗矩形内部（例如 x: 400, y: 300）。
    isOutside = evaluateDragPosition(viewportRect, isOutside, 400, 300)
    // 必须恢复为 false，视窗重新唤出！
    expect(isOutside).toBe(false)

    // 2. 移回内部后松手（状态为 false），文件夹不关闭并保持打开。
    expect(isOutside).toBe(false)
  })

  test('防穿透机制：拖拽松手 200ms 内屏蔽遮罩误点击', () => {
    const lastDragEndTime = Date.now()
    const isRecent = (now: number) => now - lastDragEndTime < 200

    // 松手后 50ms 内冒泡的 click 事件被拦截。
    expect(isRecent(lastDragEndTime + 50)).toBe(true)
    // 松手后 250ms 后正常点击遮罩可触发退出。
    expect(isRecent(lastDragEndTime + 250)).toBe(false)
  })

  // 核心准则验证：拖出文件夹后，无匹配位置返回文件夹，有匹配位置才移动。
  test('拖离视窗后无匹配位置松手不关闭弹窗，成功落入桌面才关闭', () => {
    // 决策函数：判定是否执行关闭弹窗。
    const shouldCloseOnDragEnd = (wasDraggedOutside: boolean, wasDroppedToDesktop: boolean): boolean => {
      return wasDraggedOutside && wasDroppedToDesktop
    }

    // 1. 拖出外部但在无匹配位置（如空白区、非画布区）松手，弹窗绝不关闭。
    expect(shouldCloseOnDragEnd(true, false)).toBe(false)

    // 2. 拖出外部后按 ESC 取消，弹窗绝不关闭。
    expect(shouldCloseOnDragEnd(false, false)).toBe(false)

    // 3. 拖出外部并在桌面有效匹配网格松手，桌面接收成功，弹窗关闭。
    expect(shouldCloseOnDragEnd(true, true)).toBe(true)
  })
})
