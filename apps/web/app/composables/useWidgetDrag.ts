import { ref, computed, onUnmounted, type Ref } from 'vue'
import { arrangeNodes, BREAKPOINTS, snapGridCoordinate, type WidgetNode, type Breakpoint, type Placement } from '@laull-home/shared'
import {
  TOUCH_DRAG_THRESHOLD,
  TOUCH_HOLD_BIG_WINDOW_MS,
  TOUCH_HOLD_DEBOUNCE_MS,
  TOUCH_HOLD_GRACE_MS,
  TOUCH_HOLD_WINDOW_MS,
  TOUCH_PICK_TOLERANCE,
  isTouchMoveExceeded,
  resolveTouchPress,
  touchPressLine,
  touchPressProgress,
  type TouchPressLine,
} from '../utils/touchGesture'

// 拖动状态保留抓取偏移，组件跟随指针而不跳到左上角。
interface DragSession {
  id: string; pointer: number; startX: number; startY: number; offsetX: number; offsetY: number
  dx: number; dy: number; active: boolean; element: HTMLElement; pointerType: string
}
// 待处理指针坐标在动画帧内合并，避免高刷新率触控重复计算布局。
interface PendingMove {
  pointer: number; clientX: number; clientY: number
}
// 指针拖动与原生组件库拖放共用网格吸附算法。
export function useWidgetDrag(options: {
  canvas: Ref<HTMLElement | null>
  nodes: () => WidgetNode[]
  breakpoint: Ref<Breakpoint>
  enabled: (node?: WidgetNode) => boolean
  commit: (id: string, position: Placement, targetId?: string) => void
  acceptsTarget: (sourceId: string, targetId: string) => boolean
  hoverDelay?: number
  edgeThreshold?: number
  // 触屏按压窗口内没有产生有效拖动时，通知外部按按下点弹出右键菜单。
  onTouchHoldMenu?: (node: WidgetNode, x: number, y: number) => void
}) {
  const session = ref<DragSession | null>(null)
  const preview = ref<Placement | null>(null)
  const hoverFolderId = ref<string | null>(null)
  const folderAction = ref<'absorb' | 'displace' | null>(null)
  const hoverTargetId = ref<string | null>(null)
  // 触屏按压进度（0~1），驱动外框描边线的自绘动画。
  const touchHoldProgress = ref(0)
  // 触屏按压等待中的组件标识。
  const touchHoldNodeId = ref<string | null>(null)
  // 触屏按压描边线的绘制几何。
  const touchHoldShape = ref<TouchPressLine | null>(null)
  // 触屏按压已达成确定，进入动画结束后的可拖动就绪状态。
  const touchHoldReady = ref(false)
  // 触屏手势进行中，用于屏蔽浏览器原生长按菜单与拖动入口相互抢占。
  const touchGesture = ref(false)
  let suppressClick = false
  let suppressClickTimer: ReturnType<typeof setTimeout> | undefined
  let edgeHoverTimer: ReturnType<typeof setTimeout> | undefined
  let edgeHoverTargetId: string | null = null
  let pendingMove: PendingMove | null = null
  let moveFrame = 0
  // 触屏按压计时器、宽限期菜单计时器、防抖启动计时器、动画帧标识与等待期监听清理函数。
  let touchHoldTimer: ReturnType<typeof setTimeout> | undefined
  let touchHoldMenuTimer: ReturnType<typeof setTimeout> | undefined
  let touchHoldDebounceTimer: ReturnType<typeof setTimeout> | undefined
  let touchHoldFrame = 0
  let touchHoldStartMs = 0
  let touchHoldWindowMs = TOUCH_HOLD_WINDOW_MS
  let touchHoldReached = false
  let detachTouchPress: (() => void) | undefined

  // 标记屏蔽后续紧随的点击，并在延时后自动复位。
  function markSuppressClick() {
    suppressClick = true
    if (suppressClickTimer) clearTimeout(suppressClickTimer)
    suppressClickTimer = setTimeout(() => { suppressClick = false }, 350)
  }

  // 动画完成或进入拖动期间拦截触摸滚动，防止浏览器以原生 pan-y 滚动打断纵向拖动。
  function blockTouchScroll(ev: TouchEvent) {
    if (touchHoldReady.value || session.value) ev.preventDefault()
  }

  // 结束触屏按压等待：清理计时器、动画进度、几何参数与等待期监听。
  function cancelTouchHold() {
    if (touchHoldTimer) { clearTimeout(touchHoldTimer); touchHoldTimer = undefined }
    if (touchHoldMenuTimer) { clearTimeout(touchHoldMenuTimer); touchHoldMenuTimer = undefined }
    if (touchHoldDebounceTimer) { clearTimeout(touchHoldDebounceTimer); touchHoldDebounceTimer = undefined }
    if (touchHoldFrame) { cancelAnimationFrame(touchHoldFrame); touchHoldFrame = 0 }
    detachTouchPress?.()
    detachTouchPress = undefined
    touchHoldProgress.value = 0
    touchHoldNodeId.value = null
    touchHoldShape.value = null
    touchHoldStartMs = 0
    touchHoldWindowMs = TOUCH_HOLD_WINDOW_MS
    touchHoldReached = false
    touchHoldReady.value = false
  }

  // 每帧递进按压进度，窗口到期时描边线刚好闭合。
  function tickTouchHold() {
    touchHoldProgress.value = touchPressProgress(performance.now() - touchHoldStartMs, touchHoldWindowMs)
    if (touchHoldProgress.value < 1) touchHoldFrame = requestAnimationFrame(tickTouchHold)
  }

  // 读取按压描边线所需的组件尺寸与外框圆角。
  function readTouchHoldShape(element: HTMLElement): TouchPressLine | null {
    const width = element.clientWidth
    const height = element.clientHeight
    if (width <= 0 || height <= 0) return null
    const raw = getComputedStyle(element).borderTopLeftRadius
    // 圆角支持百分比写法，按短边换算成像素后再参与描边线几何。
    const radius = raw.endsWith('%') ? Math.min(width, height) * parseFloat(raw) / 100 : parseFloat(raw) || 0
    return touchPressLine(width, height, radius)
  }

  // 清除边缘悬停计时器。
  function clearEdgeTimer() {
    if (edgeHoverTimer) { clearTimeout(edgeHoverTimer); edgeHoverTimer = undefined }
    edgeHoverTargetId = null
  }

  // 相同网格落点不重复触发响应式更新和避让动画。
  function setPreview(next: Placement | null) {
    const current = preview.value
    if (current && next && current.x === next.x && current.y === next.y && current.w === next.w && current.h === next.h) return
    if (!current && !next) return
    preview.value = next
  }

  // 预览基于抓取点定位网格矩形，半格切换并保留很小的迟滞区。
  function placement(id: string, clientX: number, clientY: number, offsetX = 0, offsetY = 0): Placement | null {
    const grid = options.canvas.value
    const node = options.nodes().find(item => item.id === id)
    if (!grid || !node) return null
    const bounds = grid.getBoundingClientRect()
    const columns = BREAKPOINTS[options.breakpoint.value]
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
    const rowGap = parseFloat(getComputedStyle(grid).rowGap) || 0
    const cell = (bounds.width - gap * (columns - 1)) / columns
    const old = arrangeNodes(options.nodes(), options.breakpoint.value).get(id)!
    const rawX = (clientX - bounds.left - offsetX) / (cell + gap)
    const rawY = (clientY - bounds.top - offsetY) / (96 + rowGap)
    const newX = snapGridCoordinate(rawX, preview.value?.x)
    const newY = snapGridCoordinate(rawY, preview.value?.y)
    return {
      ...old,
      x: Math.max(0, Math.min(columns - old.w, newX)),
      y: Math.max(0, Math.min(199, newY)),
      pinned: true,
    }
  }

  // 只有超过阈值的移动才成为拖动，轻点继续执行原有点击。
  // 触屏先把拖动入口与长按菜单放进同一个判定窗口，鼠标与触控笔保持原有行为。
  function start(event: PointerEvent, node: WidgetNode) {
    if (!options.enabled(node) || (event.pointerType === 'mouse' && event.button !== 0) || !event.isPrimary || session.value) return
    suppressClick = false
    clearEdgeTimer()
    cancelTouchHold()
    touchGesture.value = false
    hoverFolderId.value = null
    folderAction.value = null
    hoverTargetId.value = null
    const target = event.target as HTMLElement
    if (target.closest('input,textarea,select,[contenteditable],.widget-tools,.stack-controls,[data-folder-item]')) return
    const element = event.currentTarget as HTMLElement
    const bounds = element.getBoundingClientRect()

    // 触屏：先进入按压等待，点按确定时间走完并出现有效拖动才转为拖动。
    if (event.pointerType === 'touch') {
      beginTouchHold(event, node, element, bounds)
      return
    }

    // 桌面端（鼠标、触控笔）：按下即进入拖动准备，行为不变。
    session.value = { id: node.id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, dx: 0, dy: 0, active: false, element, pointerType: event.pointerType }
    document.addEventListener('pointermove', move, { passive: false })
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', cancel)
    document.addEventListener('keydown', escape)
  }

  // 触屏按压等待：大块组件延长判定窗口，前 100ms 防抖静止观察期不展现缩放与描边，位移超出立刻取消。
  function beginTouchHold(event: PointerEvent, node: WidgetNode, element: HTMLElement, bounds: DOMRect) {
    const pid = event.pointerId
    const sx = event.clientX
    const sy = event.clientY
    let maxDistance = 0
    let movedBeyond = false

    // 文件夹或大尺寸组件采用收紧判定时长，避开慢速滑动翻页区间。
    const isBig = node.type === 'folder' || bounds.width > 160 || bounds.height > 120
    const windowMs = isBig ? TOUCH_HOLD_BIG_WINDOW_MS : TOUCH_HOLD_WINDOW_MS
    const menuMs = windowMs + TOUCH_HOLD_GRACE_MS
    touchHoldWindowMs = windowMs

    touchGesture.value = true
    touchHoldStartMs = performance.now()
    touchHoldProgress.value = 0

    // 静止超过防抖期后才展现缩放与描边，杜绝快速翻页时大块闪烁。
    function showVisual() {
      if (movedBeyond) return
      touchHoldNodeId.value = node.id
      touchHoldShape.value = readTouchHoldShape(element)
      touchHoldFrame = requestAnimationFrame(tickTouchHold)
    }

    // 结束按压等待并放开手势标记：曾发生位移或长按成功的抬手均拦截点击。
    function finish() {
      if (touchHoldDebounceTimer) { clearTimeout(touchHoldDebounceTimer); touchHoldDebounceTimer = undefined }
      if (touchHoldReached || movedBeyond) markSuppressClick()
      cancelTouchHold()
      touchGesture.value = false
    }

    // 拦截触屏手势期间浏览器的原生长按菜单，避免提前弹出原生或子组件菜单。
    function blockNativeMenu(ev: Event) {
      if (ev.isTrusted) { ev.preventDefault(); ev.stopPropagation() }
    }

    // 抬手：若已达成确定且未发生位移，在触摸点弹出菜单；其余情况直接结束。
    function onPressEnd(ev: PointerEvent) {
      if (ev.pointerId !== pid) return
      const shouldOpenMenu = touchHoldReached && !movedBeyond && maxDistance <= TOUCH_PICK_TOLERANCE
      finish()
      if (shouldOpenMenu) options.onTouchHoldMenu?.(node, sx, sy)
    }

    // 等待期移动：确定时间走完之前严格防滑动翻页误触；走完之后位移达到阈值直接起拖。
    function onPressMove(ev: PointerEvent) {
      if (ev.pointerId !== pid) return
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      const distance = Math.hypot(dx, dy)
      if (distance > maxDistance) maxDistance = distance
      const elapsedMs = performance.now() - touchHoldStartMs

      // 确定时间走完之前：垂直位移超过 5px 或总位移超过 6px 立刻取消长按判定并让位给翻页。
      if (!touchHoldReached && elapsedMs < windowMs) {
        if (isTouchMoveExceeded(dx, dy)) {
          movedBeyond = true
          finish()
          return
        }
      }
      const outcome = resolveTouchPress(distance, elapsedMs, menuMs, TOUCH_DRAG_THRESHOLD, windowMs)
      if (outcome === 'cancel') {
        finish()
        return
      }
      if (outcome !== 'drag') return
      cancelTouchHold()
      session.value = { id: node.id, pointer: pid, startX: sx, startY: sy,
        offsetX: sx - bounds.left, offsetY: sy - bounds.top, dx: 0, dy: 0, active: false, element, pointerType: 'touch' }
      document.addEventListener('touchmove', blockTouchScroll, { passive: false })
      document.addEventListener('pointermove', move, { passive: false })
      document.addEventListener('pointerup', end)
      document.addEventListener('pointercancel', cancel)
      try { navigator?.vibrate?.(10) } catch { /* 无振动权限时忽略。 */ }
      move(ev)
    }
    detachTouchPress = () => {
      if (touchHoldDebounceTimer) { clearTimeout(touchHoldDebounceTimer); touchHoldDebounceTimer = undefined }
      document.removeEventListener('pointermove', onPressMove)
      document.removeEventListener('pointerup', onPressEnd)
      document.removeEventListener('pointercancel', onPressEnd)
      document.removeEventListener('contextmenu', blockNativeMenu, true)
      document.removeEventListener('touchmove', blockTouchScroll)
    }
    document.addEventListener('pointermove', onPressMove, { passive: false })
    document.addEventListener('pointerup', onPressEnd)
    document.addEventListener('pointercancel', onPressEnd)
    document.addEventListener('contextmenu', blockNativeMenu, true)
    document.addEventListener('touchmove', blockTouchScroll, { passive: false })

    // 防抖期内保持静止才开启视觉反馈。
    touchHoldDebounceTimer = setTimeout(showVisual, TOUCH_HOLD_DEBOUNCE_MS)

    // 确定时间走完仍留宽限期，超时未起拖弹出长按菜单。
    touchHoldTimer = setTimeout(() => {
      if (movedBeyond || maxDistance > TOUCH_PICK_TOLERANCE) { finish(); return }
      if (touchHoldFrame) { cancelAnimationFrame(touchHoldFrame); touchHoldFrame = 0 }
      touchHoldProgress.value = 1
      touchHoldReached = true
      touchHoldReady.value = true
      try { navigator?.vibrate?.(10) } catch { /* 振动反馈 */ }
      touchHoldMenuTimer = setTimeout(() => {
        touchHoldNodeId.value = null
        touchHoldShape.value = null
        if (!movedBeyond && maxDistance <= TOUCH_PICK_TOLERANCE && !session.value) {
          options.onTouchHoldMenu?.(node, sx, sy)
        }
      }, TOUCH_HOLD_GRACE_MS)
    }, windowMs)
  }

  // 在单个动画帧内计算最新落点、目标动作和自动滚动。
  function processMove(next: PendingMove) {
    const current = session.value
    if (!current || next.pointer !== current.pointer) return
    current.dx = next.clientX - current.startX
    current.dy = next.clientY - current.startY

    const grid = options.canvas.value
    if (!grid) return
    const bounds = grid.getBoundingClientRect()
    const columns = BREAKPOINTS[options.breakpoint.value]
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
    const rowGap = parseFloat(getComputedStyle(grid).rowGap) || 0
    const cell = (bounds.width - gap * (columns - 1)) / columns

    // 以拖动组件的投影中心判断挤占目标，抓住边角时也符合视觉重心。
    const staticMap = arrangeNodes(options.nodes(), options.breakpoint.value)
    const sourcePlacement = staticMap.get(current.id)
    const sourceWidth = sourcePlacement ? sourcePlacement.w * cell + (sourcePlacement.w - 1) * gap : cell
    const sourceHeight = sourcePlacement ? sourcePlacement.h * 96 + (sourcePlacement.h - 1) * rowGap : 96
    const focusX = next.clientX - current.offsetX + sourceWidth / 2
    const focusY = next.clientY - current.offsetY + sourceHeight / 2
    const focusCellX = Math.max(0, Math.min(columns - 1, Math.floor((focusX - bounds.left) / (cell + gap))))
    const focusCellY = Math.max(0, Math.floor((focusY - bounds.top) / (96 + rowGap)))

    // 查找投影中心覆盖的静态组件，避免被正在播放的位移动画干扰。
    let targetNode: WidgetNode | null = null
    let targetPlacement: Placement | null = null
    for (const node of options.nodes()) {
      if (node.id === current.id) continue
      const p = staticMap.get(node.id)
      if (p && focusCellX >= p.x && focusCellX < p.x + p.w && focusCellY >= p.y && focusCellY < p.y + p.h) {
        targetNode = node
        targetPlacement = p
        break
      }
    }

    const sourceNode = options.nodes().find(n => n.id === current.id)
    const targetId = targetNode?.id
    const delay = options.hoverDelay ?? 500
    const nextPlacement = placement(current.id, next.clientX, next.clientY, current.offsetX, current.offsetY)

    // 可接收组件的中心区域执行合并或叠放，边缘区域保留普通挤占。
    if (targetNode && targetPlacement) {
      const isFolderAbsorb = sourceNode?.type === 'bookmark' && targetNode.type === 'folder'
      const acceptsAction = options.acceptsTarget(current.id, targetNode.id)
      const left = bounds.left + targetPlacement.x * (cell + gap)
      const top = bounds.top + targetPlacement.y * (96 + rowGap)
      const width = targetPlacement.w * cell + (targetPlacement.w - 1) * gap
      const height = targetPlacement.h * 96 + (targetPlacement.h - 1) * rowGap
      const edge = Math.min(options.edgeThreshold ?? 24, width * 0.22, height * 0.22)
      const isNearEdge = (
        focusX < left + edge || focusX > left + width - edge ||
        focusY < top + edge || focusY > top + height - edge
      )

      if (isFolderAbsorb) {
        if (!isNearEdge) {
          clearEdgeTimer()
          hoverFolderId.value = targetId!
          hoverTargetId.value = targetId!
          folderAction.value = 'absorb'
          setPreview(null)
        } else if (folderAction.value !== 'displace') {
          hoverFolderId.value = targetId!
          hoverTargetId.value = targetId!
          folderAction.value = 'absorb'
          setPreview(null)
          if (edgeHoverTargetId !== targetId) {
            clearEdgeTimer()
            edgeHoverTargetId = targetId!
            edgeHoverTimer = setTimeout(() => {
              folderAction.value = 'displace'
              hoverFolderId.value = null
              hoverTargetId.value = null
              const cur = session.value
              if (cur) setPreview(placement(cur.id, cur.startX + cur.dx, cur.startY + cur.dy, cur.offsetX, cur.offsetY))
            }, delay)
          }
        } else {
          setPreview(nextPlacement)
        }
      } else if (acceptsAction && !isNearEdge) {
        clearEdgeTimer()
        hoverFolderId.value = null
        hoverTargetId.value = targetId!
        folderAction.value = null
        setPreview(null)
      } else {
        clearEdgeTimer()
        hoverFolderId.value = null
        hoverTargetId.value = null
        folderAction.value = null
        setPreview(nextPlacement)
      }
    } else {
      clearEdgeTimer()
      hoverFolderId.value = null
      hoverTargetId.value = null
      folderAction.value = null
      setPreview(nextPlacement)
    }

    if (next.clientY > window.innerHeight - 60) window.scrollBy(0, 12)
    else if (next.clientY < 60) window.scrollBy(0, -12)
  }

  // 跟随指针移动，触控使用更宽松阈值并把高频事件合并到下一帧。
  function move(event: PointerEvent) {
    const current = session.value
    if (!current || event.pointerId !== current.pointer) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    const threshold = current.pointerType === 'touch' ? TOUCH_DRAG_THRESHOLD : 5
    if (!current.active && Math.hypot(dx, dy) < threshold) return
    current.active = true
    try {
      if (!current.element.hasPointerCapture(event.pointerId)) current.element.setPointerCapture(event.pointerId)
    } catch { /* 忽略无指针捕获权限异常 */ }
    event.preventDefault()
    pendingMove = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY }
    if (!moveFrame) {
      moveFrame = requestAnimationFrame(() => {
        moveFrame = 0
        const next = pendingMove
        pendingMove = null
        if (next) processMove(next)
      })
    }
  }

  // 松开后应用预览坐标，并屏蔽紧随拖动产生的点击。
  function end(event: PointerEvent) {
    const current = session.value
    if (!current || event.pointerId !== current.pointer) return
    if (moveFrame) { cancelAnimationFrame(moveFrame); moveFrame = 0 }
    if (pendingMove) { const next = pendingMove; pendingMove = null; processMove(next) }
    const targetId = hoverTargetId.value
    clearEdgeTimer()
    if (current.active) {
      suppressClick = true
      if (targetId) {
        options.commit(current.id, preview.value ?? placement(current.id, event.clientX, event.clientY, current.offsetX, current.offsetY)!, targetId)
      } else {
        const p = preview.value ?? placement(current.id, event.clientX, event.clientY, current.offsetX, current.offsetY)
        if (p) options.commit(current.id, p)
      }
    }
    cancel()
  }

  // 取消拖动不会修改草稿。
  function cancel() {
    cancelTouchHold()
    touchGesture.value = false
    clearEdgeTimer()
    if (moveFrame) { cancelAnimationFrame(moveFrame); moveFrame = 0 }
    pendingMove = null
    const current = session.value
    if (current?.active) suppressClick = true
    if (current?.element) {
      try {
        if (current.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer)
      } catch { /* 忽略释放异常 */ }
    }
    session.value = null
    preview.value = null
    hoverFolderId.value = null
    hoverTargetId.value = null
    folderAction.value = null
    document.removeEventListener('pointermove', move)
    document.removeEventListener('pointerup', end)
    document.removeEventListener('pointercancel', cancel)
    document.removeEventListener('keydown', escape)
    document.removeEventListener('touchmove', blockTouchScroll)
  }

  // Esc 提供可恢复的取消路径。
  function escape(event: KeyboardEvent) { if (event.key === 'Escape') cancel() }
  // 捕获阶段阻止拖动触发链接或编辑弹窗。
  function click(event: MouseEvent) {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false }
  }

  // 拖动位移矢量供智能避让方向决策。
  const vector = computed(() => session.value?.active ? { dx: session.value.dx, dy: session.value.dy } : undefined)
  // 当前处于激活拖动状态的组件标识。
  const draggingId = computed(() => session.value?.active ? session.value.id : null)
  // 位移只交给合成层处理，不参与网格回流。
  function transform(id: string) {
    const current = session.value
    return current?.active && current.id === id ? { transform: 'translate3d(' + current.dx + 'px,' + current.dy + 'px,0)', zIndex: 80 } : {}
  }
  onUnmounted(cancel)
  return { start, cancel, click, transform, placement, preview, draggingId, hoverFolderId, hoverTargetId, folderAction, vector, touchHoldProgress, touchHoldNodeId, touchHoldShape, touchHoldReady, touchGesture }
}
