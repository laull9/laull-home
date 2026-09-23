import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import { arrangeNodes, BREAKPOINTS, newWidget, type Bookmark, type Breakpoint, type Placement, type WidgetNode } from '@laull-home/shared'
import {
  TOUCH_DRAG_THRESHOLD,
  TOUCH_HOLD_DEBOUNCE_MS,
  TOUCH_HOLD_WINDOW_MS,
  TOUCH_PICK_TOLERANCE,
  TOUCH_SOURCE_LEAVE_BUFFER,
  isTouchMoveExceeded,
  resolveGridCell,
  resolveTouchPick,
  touchLeftSource,
  touchPressLine,
  touchPressProgress,
  type TouchPickMode,
  type TouchPressLine,
} from '../utils/touchGesture'

// 落点预览用的临时节点标识：只在虚拟排布里占位，不会被提交到桌面。
const PREVIEW_NODE_ID = '__laull-folder-item-preview__'

// 长按拾起后跟随指针的悬浮图标。
export interface FolderItemGhost {
  bookmark: Bookmark
  x: number
  y: number
}

// 被按下图标的描边线：几何贴合图标外框，坐标取视口坐标系以便渲染到 body 层。
export interface FolderItemPressLine extends TouchPressLine {
  left: number
  top: number
  boxWidth: number
  boxHeight: number
}

// 拖出来源：组件内的图标与弹窗内的图标使用不同拾起模式与样式类。
interface DragSource {
  kind: 'widget' | 'modal'
  element: HTMLElement
  // 判定「是否已离开来源」所用的盒子：弹窗取对话框面板，组件取组件本身。
  bounds: HTMLElement
  folderWidgetId: string
  mode: TouchPickMode
  holdClass: string
  pickClass: string
  dismissed: boolean
}

// 组件内图标（文件夹未打开）：内容不滚动，点按确定时间走完后位移达到阈值即刻拾起并拖出。
const WIDGET_SOURCE = { mode: 'direct' as TouchPickMode, holdClass: 'folder-item-holding', pickClass: 'folder-item-picked' }
// 弹窗内图标（文件夹已打开）：内容可滚动，确定时间内的位移让位给列表滚动，确定后才可拖动。
const MODAL_SOURCE = { mode: 'scrollable' as TouchPickMode, holdClass: 'is-holding', pickClass: 'is-dragging' }

// 文件夹内图标的触屏拖出：按住拾起图标，拖到画布网格松手生成独立书签组件。
export function useFolderItemTouchDrag(options: {
  canvas: Ref<HTMLElement | null>
  breakpoint: Ref<Breakpoint>
  nodes: () => WidgetNode[]
  bookmarks: () => Bookmark[]
  enabled: () => boolean
  commit: (bookmark: Bookmark, folderWidgetId: string, placement: Placement) => void
}) {
  // 悬浮图标与网格落点预览。
  const ghost = ref<FolderItemGhost | null>(null)
  const preview = ref<Placement | null>(null)
  // 被按下图标的描边线与按压进度：与组件按压使用同一套方框/圆形动画。
  const pressLine = ref<FolderItemPressLine | null>(null)
  const pressProgress = ref(0)
  // 手势上下文：来源容器、书签、指针起点与两个状态位。
  let source: DragSource | null = null
  let itemElement: HTMLElement | null = null
  let bookmark: Bookmark | null = null
  let pointer = 0
  let startX = 0
  let startY = 0
  let startMs = 0
  // 点按确定时间已走完、可随时拖动但尚未产生位移。
  let armed = false
  // 已拾起并跟随指针，图标交给悬浮层。
  let pickedUp = false
  // 拾起手势结束后屏蔽紧随其后的点击，避免误打开书签或误开文件夹。
  let suppressClick = false
  let suppressClickTimer: ReturnType<typeof setTimeout> | undefined
  let pendingPoint: { x: number; y: number } | null = null
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let maxDistance = 0
  let movedBeyond = false
  let moveFrame = 0
  let pressFrame = 0
  let detach: (() => void) | undefined

  // 标记屏蔽紧随其后的点击，并在超时后自动复位。
  function markSuppressClick() {
    suppressClick = true
    if (suppressClickTimer) clearTimeout(suppressClickTimer)
    suppressClickTimer = setTimeout(() => { suppressClick = false }, 350)
  }

  // 收回按下的描边线：拾起、让位滚动或手势结束时都要清掉。
  function clearPress() {
    if (pressFrame) { cancelAnimationFrame(pressFrame); pressFrame = 0 }
    pressLine.value = null
    pressProgress.value = 0
  }

  // 清理手势状态与图标上的长按、拾起样式。
  function reset() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = undefined }
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = undefined }
    if (moveFrame) { cancelAnimationFrame(moveFrame); moveFrame = 0 }
    clearPress()
    detach?.()
    detach = undefined
    if (itemElement && source) itemElement.classList.remove(source.holdClass, source.pickClass)
    itemElement = null
    source = null
    bookmark = null
    pointer = 0
    armed = false
    pickedUp = false
    pendingPoint = null
    ghost.value = null
    preview.value = null
  }

  // 指针位置换算网格落点：来源容器尚未收起时，落在其上方不给落点；
  // 其余位置一律给出落点（含内容下方的空白桌面），夹取规则与组件拖动、组件树拖放完全一致。
  // 落点取值等于排布后的真实落位，因此落点框画在哪，松手后图标就落在哪。
  function placementAt(clientX: number, clientY: number): Placement | null {
    const grid = options.canvas.value
    const current = source
    if (!grid || !current) return null
    if (!current.dismissed) {
      const rect = current.bounds.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return null
    }
    const bounds = grid.getBoundingClientRect()
    const computed = getComputedStyle(grid)
    const breakpoint = options.breakpoint.value
    const nodes = options.nodes()
    const cell = resolveGridCell({
      clientX,
      clientY,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      columns: BREAKPOINTS[breakpoint],
      gap: parseFloat(computed.columnGap) || 0,
      rowGap: parseFloat(computed.rowGap) || 0,
    })
    // 落点必须等于最终落位，而排布又依赖该节点自身的落位（同一行同一列时按原始顺序先到先得），
    // 因此迭代到不动点：空闲位置一轮即收敛，需要把已有组件挤开时通常两轮，最多四轮兜底。
    let target = cell
    for (let round = 0; round < 4; round += 1) {
      const layout = { ...target, w: 1, h: 1, pinned: true }
      const candidate: WidgetNode = {
        ...newWidget('bookmark', PREVIEW_NODE_ID),
        layouts: { desktop: { ...layout }, [breakpoint]: { ...layout } },
      }
      const resolved = arrangeNodes([...nodes, candidate], breakpoint).get(PREVIEW_NODE_ID)
      if (!resolved || (resolved.x === target.x && resolved.y === target.y)) break
      target = { x: resolved.x, y: resolved.y }
    }
    return { x: target.x, y: target.y, w: 1, h: 1, pinned: true }
  }

  // 读取被按下图标的描边线几何，坐标取视口坐标系（浮层渲染在 body 上）。
  function readPressLine(element: HTMLElement): FolderItemPressLine | null {
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0
    return { ...touchPressLine(rect.width, rect.height, radius), left: rect.left, top: rect.top, boxWidth: rect.width, boxHeight: rect.height }
  }

  // 推进按压进度：按窗口线性收满后停住；逐帧重读几何，让描边线始终贴合正在放大的图标。
  function tickPress() {
    pressFrame = 0
    if (itemElement) pressLine.value = readPressLine(itemElement)
    pressProgress.value = touchPressProgress(performance.now() - startMs)
    if (pressProgress.value < 1) pressFrame = requestAnimationFrame(tickPress)
  }

  // 拾起图标：原位淡出，改为悬浮层跟随指针，并给出一次轻微振动反馈。
  function pickUp() {
    if (!itemElement || !bookmark || !source) return
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = undefined }
    pickedUp = true
    clearPress()
    itemElement.classList.remove(source.holdClass)
    itemElement.classList.add(source.pickClass)
    ghost.value = { bookmark, x: startX, y: startY }
    try { navigator?.vibrate?.(10) } catch { /* 无振动权限时忽略。 */ }
  }

  // 拖出文件夹弹窗后收起来源：只通知弹窗做视觉隐藏，不立刻移除节点。
  // 拖动期间移除被按住的那个节点会中断真实触摸的指针序列（真机发 pointercancel），
  // 表现为「图标刚拖出文件夹就消失」，因此真正关闭放到手势结束时。
  function dismissSource(point: { x: number; y: number }) {
    const current = source
    if (!current || current.kind !== 'modal' || current.dismissed) return
    const rect = current.bounds.getBoundingClientRect()
    if (!touchLeftSource(point.x, point.y, { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, TOUCH_SOURCE_LEAVE_BUFFER)) return
    current.dismissed = true
    current.element.dispatchEvent(new CustomEvent('folder-drag-out'))
  }

  // 手势结束后真正关闭已拖出的文件夹。
  function settleSource() {
    const current = source
    if (!current || !current.dismissed) return
    current.element.dispatchEvent(new CustomEvent('folder-drag-settled'))
  }

  // 按指针位置刷新悬浮图标与网格落点。
  function track(point: { x: number; y: number }) {
    const current = ghost.value
    if (!current) return
    ghost.value = { ...current, x: point.x, y: point.y }
    dismissSource(point)
    preview.value = placementAt(point.x, point.y)
  }

  // 手势期间屏蔽浏览器原生长按菜单，只放行本模块自己派发的菜单事件。
  function blockNativeMenu(event: Event) { if (event.isTrusted) { event.preventDefault(); event.stopPropagation() } }

  // 拾起后拦下触摸滚动，避免打开的文件夹在拖动过程中跟着滚动。
  function blockScroll(event: TouchEvent) { if (armed || pickedUp) event.preventDefault() }

  // 指针移动：先判定滚动与拾起，拾起后把坐标合并到下一帧刷新悬浮层。
  function move(event: PointerEvent) {
    if (event.pointerId !== pointer) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    const distance = Math.hypot(dx, dy)
    if (distance > maxDistance) maxDistance = distance
    if (isTouchMoveExceeded(dx, dy)) movedBeyond = true
    if (movedBeyond) {
      markSuppressClick()
      reset()
      return
    }
    const outcome = resolveTouchPick(distance, performance.now() - startMs, source?.mode ?? 'direct')
    if (outcome === 'scroll') {
      markSuppressClick()
      reset()
      return
    }
    if (outcome === 'pick' && !pickedUp) pickUp()
    if (!pickedUp) return
    event.preventDefault()
    pendingPoint = { x: event.clientX, y: event.clientY }
    if (moveFrame) return
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0
      const point = pendingPoint
      pendingPoint = null
      if (point) track(point)
    })
  }

  // 系统取消手势：已拖出的按最后停留的落点落盘，避免图标凭空消失。
  function abort(event: PointerEvent) {
    if (event.pointerId !== pointer) return
    const current = source
    const target = bookmark
    const drop = pickedUp ? preview.value : null
    settleSource()
    reset()
    if (drop && target && current) options.commit(target, current.folderWidgetId, drop)
  }

  // 松手：落到有效网格内生成独立组件；打开的文件夹内按住未移动则保留条目菜单入口。
  function end(event: PointerEvent) {
    if (event.pointerId !== pointer) return
    const current = source
    const target = bookmark
    const element = itemElement
    const moved = Math.hypot(event.clientX - startX, event.clientY - startY) >= TOUCH_DRAG_THRESHOLD
    const drop = pickedUp && moved ? placementAt(event.clientX, event.clientY) : null
    const wantsMenu = current?.kind === 'modal' && !current.dismissed && armed && !moved
    const held = armed || pickedUp
    settleSource()
    reset()
    // 进入长按、拾起状态或滑动翻页后的抬手不再触发图标点击。
    if (held || movedBeyond) markSuppressClick()
    if (drop && target && current) options.commit(target, current.folderWidgetId, drop)
    else if (wantsMenu && element) {
      // 复用条目上已有的右键菜单处理，保持触屏可达。
      element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY }))
    }
  }

  // 尝试接管文件夹内图标的触屏按下手势，返回是否已接管本次事件。
  function take(event: PointerEvent): boolean {
    if (event.pointerType !== 'touch' || !event.isPrimary || !options.enabled()) return false
    const item = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-folder-item]')
    const found = item?.dataset.bookmarkId ? options.bookmarks().find(entry => entry.id === item.dataset.bookmarkId) : undefined
    if (!item || !found) return false
    const modal = item.closest<HTMLElement>('[data-folder-modal]')
    const widget = item.closest<HTMLElement>('[data-widget-id]')
    // 弹窗虽然 teleport 到 body，仍优先按弹窗判定，避免将来结构变化后误判成组件拖动。
    const kind: DragSource['kind'] | null = modal ? 'modal' : widget ? 'widget' : null
    if (!kind) return false
    const preset = kind === 'modal' ? MODAL_SOURCE : WIDGET_SOURCE
    const root = (kind === 'modal' ? modal : widget)!
    // 弹窗遮罩铺满视口，判断「是否拖出」必须以对话框面板为界，否则指针永远出不去。
    const panel = kind === 'modal' ? modal!.querySelector<HTMLElement>('[data-folder-panel]') : null
    reset()
    source = {
      kind,
      element: root,
      bounds: panel ?? root,
      folderWidgetId: kind === 'modal' ? modal!.dataset.folderNodeId || '' : widget!.dataset.widgetId || '',
      dismissed: false,
      ...preset,
    }
    itemElement = item
    bookmark = found
    pointer = event.pointerId
    startX = event.clientX
    startY = event.clientY
    startMs = performance.now()
    maxDistance = 0
    movedBeyond = false

    // 防抖期内保持静止才开启图标高亮与描边，避免划屏翻页时图标闪烁。
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      if (movedBeyond || !itemElement || !source) return
      itemElement.classList.add(source.holdClass)
      pressLine.value = readPressLine(itemElement)
      pressProgress.value = 0
      if (pressLine.value) pressFrame = requestAnimationFrame(tickPress)
    }, TOUCH_HOLD_DEBOUNCE_MS)

    detach = () => {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = undefined }
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', end)
      document.removeEventListener('pointercancel', abort)
      document.removeEventListener('contextmenu', blockNativeMenu, true)
      document.removeEventListener('touchmove', blockScroll)
    }
    document.addEventListener('pointermove', move, { passive: false })
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', abort)
    document.addEventListener('contextmenu', blockNativeMenu, true)
    document.addEventListener('touchmove', blockScroll, { passive: false })
    // 点按确定时间走完后进入就绪状态：此前位移不拾起，此后任何位移都直接拖动。
    holdTimer = setTimeout(() => {
      holdTimer = undefined
      if (movedBeyond || maxDistance > TOUCH_PICK_TOLERANCE) { reset(); return }
      armed = true
    }, TOUCH_HOLD_WINDOW_MS)
    return kind === 'widget'
  }

  // 画布与弹窗内的按下统一在捕获阶段判定，组件内图标要同时截断组件整体拖动。
  function handlePointerDown(event: PointerEvent) {
    if (take(event)) event.stopPropagation()
  }

  // 拾起手势结束后屏蔽随后的点击，避免误打开书签或误开文件夹弹窗。
  function click(event: MouseEvent) {
    if (!suppressClick) return
    suppressClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  onMounted(() => {
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('click', click, true)
  })
  onUnmounted(() => {
    document.removeEventListener('pointerdown', handlePointerDown, true)
    document.removeEventListener('click', click, true)
    reset()
  })
  return { ghost, preview, pressLine, pressProgress }
}
