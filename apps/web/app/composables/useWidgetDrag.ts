import { ref, computed, onUnmounted, type Ref } from 'vue'
import { arrangeNodes, BREAKPOINTS, snapGridCoordinate, type WidgetNode, type Breakpoint, type Placement } from '@laull-home/shared'

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
}) {
  const session = ref<DragSession | null>(null)
  const preview = ref<Placement | null>(null)
  const hoverFolderId = ref<string | null>(null)
  const folderAction = ref<'absorb' | 'displace' | null>(null)
  const hoverTargetId = ref<string | null>(null)
  let suppressClick = false
  let edgeHoverTimer: ReturnType<typeof setTimeout> | undefined
  let edgeHoverTargetId: string | null = null
  let pendingMove: PendingMove | null = null
  let moveFrame = 0

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
  function start(event: PointerEvent, node: WidgetNode) {
    if (!options.enabled(node) || (event.pointerType === 'mouse' && event.button !== 0) || !event.isPrimary || session.value) return
    suppressClick = false
    clearEdgeTimer()
    hoverFolderId.value = null
    folderAction.value = null
    hoverTargetId.value = null
    const target = event.target as HTMLElement
    if (target.closest('input,textarea,select,[contenteditable],.widget-tools,.stack-controls,[data-folder-item]')) return
    const element = event.currentTarget as HTMLElement
    const bounds = element.getBoundingClientRect()
    session.value = { id: node.id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, dx: 0, dy: 0, active: false, element, pointerType: event.pointerType }
    document.addEventListener('pointermove', move, { passive: false })
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', cancel)
    document.addEventListener('keydown', escape)
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
    const threshold = current.pointerType === 'touch' ? 10 : 5
    if (!current.active && Math.hypot(dx, dy) < threshold) return
    current.active = true
    if (!current.element.hasPointerCapture(event.pointerId)) current.element.setPointerCapture(event.pointerId)
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
    clearEdgeTimer()
    if (moveFrame) { cancelAnimationFrame(moveFrame); moveFrame = 0 }
    pendingMove = null
    const current = session.value
    if (current?.active) suppressClick = true
    if (current?.element) {
      if (current.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer)
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
  return { start, cancel, click, transform, placement, preview, draggingId, hoverFolderId, hoverTargetId, folderAction, vector }
}
