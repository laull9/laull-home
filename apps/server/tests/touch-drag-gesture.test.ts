import { describe, expect, test } from 'bun:test'
import {
  resolveGridCell,
  resolveTouchPress,
  resolveTouchPick,
  touchLeftSource,
  touchPressLine,
  touchPressProgress,
  GRID_MAX_ROW,
  GRID_ROW_HEIGHT,
  TOUCH_DRAG_THRESHOLD,
  TOUCH_HOLD_GRACE_MS,
  TOUCH_HOLD_MENU_MS,
  TOUCH_HOLD_WINDOW_MS,
  TOUCH_PICK_TOLERANCE,
  TOUCH_SOURCE_LEAVE_BUFFER,
} from '../../web/app/utils/touchGesture'

describe('触屏按压判定与描边线几何', () => {
  // 点按确定时间固定 0.5 秒，其后留 0.3 秒宽限，长按菜单最早在 0.8 秒出现。
  test('点按确定时间 0.5 秒、宽限 0.3 秒、菜单最早 0.8 秒', () => {
    expect(TOUCH_HOLD_WINDOW_MS).toBe(500)
    expect(TOUCH_HOLD_GRACE_MS).toBe(300)
    expect(TOUCH_HOLD_MENU_MS).toBe(800)
    expect(TOUCH_DRAG_THRESHOLD).toBe(10)
  })

  // 点按确定时间（描边线闭合）走完之前，位移再大也不进入拖动，避免动画未完成就被拖走。
  test('确定时间走完前任何位移都不进入拖动', () => {
    expect(resolveTouchPress(10, 0)).toBe('wait')
    expect(resolveTouchPress(TOUCH_DRAG_THRESHOLD, TOUCH_HOLD_WINDOW_MS - 1)).toBe('wait')
    expect(resolveTouchPress(120, 60)).toBe('wait')
    expect(resolveTouchPress(999, TOUCH_HOLD_WINDOW_MS - 1)).toBe('wait')
  })

  // 确定时间走完后位移达到阈值即判定为拖动，宽限期内起拖依然有效。
  test('确定时间走完后位移达到阈值判定为拖动', () => {
    expect(resolveTouchPress(TOUCH_DRAG_THRESHOLD, TOUCH_HOLD_WINDOW_MS)).toBe('drag')
    expect(resolveTouchPress(80, TOUCH_HOLD_WINDOW_MS + 120)).toBe('drag')
    expect(resolveTouchPress(TOUCH_DRAG_THRESHOLD, TOUCH_HOLD_MENU_MS)).toBe('drag')
  })

  // 位移不足时继续等待，交给计时器决定是拖动还是菜单。
  test('确定时间前后位移不足时都保持等待', () => {
    expect(resolveTouchPress(0, 0)).toBe('wait')
    expect(resolveTouchPress(TOUCH_DRAG_THRESHOLD - 1, TOUCH_HOLD_WINDOW_MS - 1)).toBe('wait')
    expect(resolveTouchPress(TOUCH_DRAG_THRESHOLD - 1, TOUCH_HOLD_WINDOW_MS + 200)).toBe('wait')
  })

  // 菜单出现后手势已交给长按菜单，后续移动不能再触发拖动。
  test('超过菜单时刻后手势交由长按菜单接管', () => {
    expect(resolveTouchPress(0, TOUCH_HOLD_MENU_MS + 1)).toBe('expired')
    expect(resolveTouchPress(120, TOUCH_HOLD_MENU_MS + 1)).toBe('expired')
  })

  // 未展开文件夹里的图标（内容不滚动）：确定时间走完前不拾起，与主页图标保持同一套判定。
  test('文件夹未打开时确定时间内不拾起', () => {
    expect(resolveTouchPick(0, 0, 'direct')).toBe('wait')
    expect(resolveTouchPick(TOUCH_PICK_TOLERANCE, 60, 'direct')).toBe('wait')
    expect(resolveTouchPick(TOUCH_DRAG_THRESHOLD, 0, 'direct')).toBe('wait')
    expect(resolveTouchPick(200, TOUCH_HOLD_WINDOW_MS - 1, 'direct')).toBe('wait')
  })

  // 确定时间走完后位移达到阈值立刻拾起并拖动。
  test('文件夹未打开时确定时间走完后按位移拾起', () => {
    expect(resolveTouchPick(TOUCH_DRAG_THRESHOLD, TOUCH_HOLD_WINDOW_MS, 'direct')).toBe('pick')
    expect(resolveTouchPick(60, TOUCH_HOLD_WINDOW_MS + 300, 'direct')).toBe('pick')
    expect(resolveTouchPick(TOUCH_DRAG_THRESHOLD, TOUCH_HOLD_WINDOW_MS * 3, 'direct')).toBe('pick')
  })

  // 满确定时间仍未移动时进入就绪状态，之后任何位移都直接拖动。
  test('文件夹未打开时满确定时间进入可拖动的就绪状态', () => {
    expect(resolveTouchPick(0, TOUCH_HOLD_WINDOW_MS - 1, 'direct')).toBe('wait')
    expect(resolveTouchPick(0, TOUCH_HOLD_WINDOW_MS, 'direct')).toBe('armed')
    expect(resolveTouchPick(TOUCH_DRAG_THRESHOLD - 1, TOUCH_HOLD_WINDOW_MS + 400, 'direct')).toBe('armed')
  })

  // 打开的文件夹（弹窗）内部可滚动：确定时间内的位移让位给滚动，确定后才可拾起。
  test('文件夹打开时确定时间内让位给滚动，满确定时间后可拖动', () => {
    expect(resolveTouchPick(0, 0, 'scrollable')).toBe('wait')
    expect(resolveTouchPick(TOUCH_PICK_TOLERANCE, 120, 'scrollable')).toBe('wait')
    expect(resolveTouchPick(TOUCH_PICK_TOLERANCE + 1, 120, 'scrollable')).toBe('scroll')
    expect(resolveTouchPick(60, TOUCH_HOLD_WINDOW_MS - 1, 'scrollable')).toBe('scroll')
    expect(resolveTouchPick(TOUCH_DRAG_THRESHOLD, 60, 'scrollable')).toBe('scroll')
    expect(resolveTouchPick(0, TOUCH_HOLD_WINDOW_MS, 'scrollable')).toBe('armed')
    expect(resolveTouchPick(TOUCH_DRAG_THRESHOLD, TOUCH_HOLD_WINDOW_MS + 200, 'scrollable')).toBe('pick')
    expect(resolveTouchPick(TOUCH_DRAG_THRESHOLD - 1, TOUCH_HOLD_WINDOW_MS + 200, 'scrollable')).toBe('armed')
  })

  // 指针越过来源容器边界加缓冲后即可落到桌面网格，退化矩形视为已离开。
  test('指针离开来源容器判定带缓冲并兼容退化矩形', () => {
    const rect = { left: 100, right: 300, top: 200, bottom: 400 }
    expect(touchLeftSource(200, 300, rect)).toBe(false)
    expect(touchLeftSource(100 + TOUCH_SOURCE_LEAVE_BUFFER, 300, rect)).toBe(false)
    expect(touchLeftSource(100 - TOUCH_SOURCE_LEAVE_BUFFER - 1, 300, rect)).toBe(true)
    expect(touchLeftSource(200, 400 + TOUCH_SOURCE_LEAVE_BUFFER + 1, rect)).toBe(true)
    expect(touchLeftSource(0, 0, { left: 0, right: 0, top: 0, bottom: 0 })).toBe(true)
  })

  // 进度用于驱动描边线，必须在窗口内线性推进并在到期时刚好闭合。
  test('按压进度线性推进并在窗口到期时收满', () => {
    expect(touchPressProgress(0)).toBe(0)
    expect(touchPressProgress(TOUCH_HOLD_WINDOW_MS / 2)).toBeCloseTo(0.5, 5)
    expect(touchPressProgress(TOUCH_HOLD_WINDOW_MS)).toBe(1)
    expect(touchPressProgress(TOUCH_HOLD_WINDOW_MS * 5)).toBe(1)
  })

  // 无效窗口长度不能产生除零或负数进度。
  test('无效窗口长度直接收满进度', () => {
    expect(touchPressProgress(120, 0)).toBe(1)
    expect(touchPressProgress(-50)).toBe(0)
  })

  // 常规组件得到贴合圆角的方框描边线。
  test('描边线贴合组件圆角并给出可换算的周长', () => {
    const line = touchPressLine(120, 96, 16)
    expect(line.viewBox).toBe('0 0 120 96')
    expect(line.width).toBe(118)
    expect(line.height).toBe(94)
    expect(line.rx).toBe(15)
    expect(line.perimeter).toBeCloseTo(2 * (118 - 30) + 2 * (94 - 30) + 2 * Math.PI * 15, 5)
  })

  // 圆形组件与直角组件都要能得到正确的描边形状。
  test('大圆角收敛为圆形，零圆角保持直角方框', () => {
    const circle = touchPressLine(64, 64, 9999)
    expect(circle.rx).toBe(31)
    expect(circle.perimeter).toBeCloseTo(2 * Math.PI * 31, 5)
    expect(touchPressLine(120, 96, 0).rx).toBe(0)
  })

  // 尚未完成布局的组件不能产生非法的负宽高与负周长。
  test('退化尺寸仍返回合法的绘制参数', () => {
    const line = touchPressLine(0, 0, 16)
    expect(line.width).toBeGreaterThan(0)
    expect(line.height).toBeGreaterThan(0)
    expect(line.perimeter).toBeGreaterThan(0)
  })
})

describe('触屏拖出的网格落点换算', () => {
  // 画布网格外框只覆盖到内容最末行，桌面可拖区域却大得多。
  // 因此任何位置的指针都必须换算出落点，夹取规则与组件拖动、组件树拖放保持一致。
  const canvas = { left: 40, top: 0, width: 400, columns: 4, gap: 16, rowGap: 16 }
  // 列步长与行步长，用来反算期望的网格单元。
  const columnStride = (canvas.width - canvas.gap * (canvas.columns - 1)) / canvas.columns + canvas.gap
  const rowStride = GRID_ROW_HEIGHT + canvas.rowGap

  // 行高必须与 .desktop-grid 的 grid-auto-rows 一致，否则落点会逐行漂移。
  test('行高与最大行号常量同网格样式保持一致', () => {
    expect(GRID_ROW_HEIGHT).toBe(96)
    expect(GRID_MAX_ROW).toBe(199)
    expect(rowStride).toBe(112)
  })

  // 外框内的指针按常规取整换算。
  test('外框内指针换算为所在单元', () => {
    expect(resolveGridCell({ ...canvas, clientX: canvas.left + 1, clientY: canvas.top + 1 })).toEqual({ x: 0, y: 0 })
    expect(resolveGridCell({ ...canvas, clientX: canvas.left + columnStride + 4, clientY: canvas.top + 1 })).toEqual({ x: 1, y: 0 })
    expect(resolveGridCell({ ...canvas, clientX: canvas.left + 1, clientY: canvas.top + rowStride * 2 + 4 })).toEqual({ x: 0, y: 2 })
    expect(resolveGridCell({ ...canvas, clientX: canvas.left + columnStride * 3 + 4, clientY: canvas.top + rowStride * 3 + 4 })).toEqual({ x: 3, y: 3 })
  })

  // 手指拖到内容下方的空白桌面时必须仍有落点，并且落在手指所在的单元（跟手）。
  test('内容下方空白给出跟手的落点', () => {
    expect(resolveGridCell({ ...canvas, clientX: canvas.left + 1, clientY: canvas.top + rowStride * 8 + 4 })).toEqual({ x: 0, y: 8 })
    expect(resolveGridCell({ ...canvas, clientX: canvas.left + columnStride + 4, clientY: canvas.top + rowStride * 12 + 4 })).toEqual({ x: 1, y: 12 })
  })

  // 越出上下左右边界时夹取到最近的有效单元，而不是丢弃落点。
  test('越界指针夹取到最近有效单元', () => {
    expect(resolveGridCell({ ...canvas, clientX: canvas.left + 1, clientY: canvas.top - 300 })).toEqual({ x: 0, y: 0 })
    expect(resolveGridCell({ ...canvas, clientX: canvas.left - 1000, clientY: canvas.top + 1 })).toEqual({ x: 0, y: 0 })
    expect(resolveGridCell({ ...canvas, clientX: canvas.left + 5000, clientY: canvas.top + 1 })).toEqual({ x: 3, y: 0 })
    expect(resolveGridCell({ ...canvas, clientX: canvas.left + 1, clientY: canvas.top + rowStride * 500 })).toEqual({ x: 0, y: GRID_MAX_ROW })
  })

  // 退化输入不能产生负数、越界或 NaN 单元。
  test('退化输入仍返回合法单元', () => {
    expect(resolveGridCell({ ...canvas, columns: 0, width: 0, clientX: 0, clientY: 0 })).toEqual({ x: 0, y: 0 })
    const measured = resolveGridCell({ ...canvas, width: 0, clientX: 123, clientY: 456 })
    expect(Number.isInteger(measured.x) && Number.isInteger(measured.y)).toBe(true)
    expect(measured.x).toBeGreaterThanOrEqual(0)
    expect(measured.y).toBeGreaterThanOrEqual(0)
  })
})
