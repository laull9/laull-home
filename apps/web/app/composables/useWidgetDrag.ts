import { ref, computed, onUnmounted, type Ref } from 'vue'
import { arrangeNodes, BREAKPOINTS, type WidgetNode, type Breakpoint, type Placement } from '@laull-home/shared'

// 拖动状态保留抓取偏移，组件跟随指针而不跳到左上角。
interface DragSession {
  id: string; pointer: number; startX: number; startY: number; offsetX: number; offsetY: number
  dx: number; dy: number; active: boolean; element: HTMLElement; originalTouchAction?: string
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
  let suppressClick = false
  let edgeHoverTimer: ReturnType<typeof setTimeout> | undefined
  let edgeHoverTargetId: string | null = null

  let displacedTargetId: string | null = null

  // 清除边缘悬停计时器。
  function clearEdgeTimer() {
    if (edgeHoverTimer) { clearTimeout(edgeHoverTimer); edgeHoverTimer = undefined }
    edgeHoverTargetId = null
  }

  // 预览基于抓取点精确定位吸附网格矩形，增加迟滞死区消除交界抖动。
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
    let newX = Math.round(rawX)
    let newY = Math.round(rawY)
    // 迟滞死区：当微小晃动未超过 0.55 格时锁定当前预览，杜绝边界震荡跳动。
    if (preview.value) {
      if (Math.abs(rawX - preview.value.x) <= 0.55) newX = preview.value.x
      if (Math.abs(rawY - preview.value.y) <= 0.55) newY = preview.value.y
    }
    return {
      ...old,
      x: Math.max(0, Math.min(columns - old.w, newX)),
      y: Math.max(0, Math.min(199, newY)),
      pinned: true,
    }
  }

  // 只有超过阈值的移动才成为拖动，轻点继续执行原有点击。
  function start(event: PointerEvent, node: WidgetNode) {
    if (!options.enabled(node) || event.button !== 0 || session.value) return
    suppressClick = false
    clearEdgeTimer()
    hoverFolderId.value = null
    folderAction.value = null
    displacedTargetId = null
    const target = event.target as HTMLElement
    if (target.closest('input,textarea,select,[contenteditable],.widget-tools,.stack-controls,[data-folder-item]')) return
    const element = event.currentTarget as HTMLElement
    const originalTouchAction = element.style.touchAction
    element.style.touchAction = 'none'
    const bounds = element.getBoundingClientRect()
    session.value = { id: node.id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, dx: 0, dy: 0, active: false, element, originalTouchAction }
    document.addEventListener('pointermove', move, { passive: false })
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', cancel)
    document.addEventListener('keydown', escape)
  }

  // 跟随指针移动，处理边缘悬停 1 秒规则并更新网格落点。
  function move(event: PointerEvent) {
    const current = session.value
    if (!current || event.pointerId !== current.pointer) return
    current.dx = event.clientX - current.startX
    current.dy = event.clientY - current.startY
    if (!current.active && Math.hypot(current.dx, current.dy) < 6) return
    current.active = true
    if (!current.element.hasPointerCapture(event.pointerId)) current.element.setPointerCapture(event.pointerId)
    event.preventDefault()

    const grid = options.canvas.value
    if (!grid) return
    const bounds = grid.getBoundingClientRect()
    const columns = BREAKPOINTS[options.breakpoint.value]
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
    const rowGap = parseFloat(getComputedStyle(grid).rowGap) || 0
    const cell = (bounds.width - gap * (columns - 1)) / columns

    // 计算当前指针在网格中的基准逻辑单元格。
    const pointerCellX = Math.max(0, Math.min(columns - 1, Math.floor((event.clientX - bounds.left) / (cell + gap))))
    const pointerCellY = Math.max(0, Math.floor((event.clientY - bounds.top) / (96 + rowGap)))

    // 查找当前指针所在的基准静态组件（不受动画位移影响）。
    const staticMap = arrangeNodes(options.nodes(), options.breakpoint.value)
    let targetNode: WidgetNode | null = null
    let targetPlacement: Placement | null = null
    for (const node of options.nodes()) {
      if (node.id === current.id) continue
      const p = staticMap.get(node.id)
      if (p && pointerCellX >= p.x && pointerCellX < p.x + p.w && pointerCellY >= p.y && pointerCellY < p.y + p.h) {
        targetNode = node
        targetPlacement = p
        break
      }
    }

    const sourceNode = options.nodes().find(n => n.id === current.id)
    const targetId = targetNode?.id
    const delay = options.hoverDelay ?? 500

    // 当指针落在其他已有组件基准区域时，执行边缘悬停 0.5 秒才挤开的通用规则。
    if (targetNode && targetPlacement) {
      const isFolderAbsorb = sourceNode?.type === 'bookmark' && targetNode.type === 'folder'
      const left = bounds.left + targetPlacement.x * (cell + gap)
      const top = bounds.top + targetPlacement.y * (96 + rowGap)
      const width = targetPlacement.w * cell + (targetPlacement.w - 1) * gap
      const height = targetPlacement.h * 96 + (targetPlacement.h - 1) * rowGap
      const edge = Math.min(options.edgeThreshold ?? 24, width * 0.22, height * 0.22)
      const isNearEdge = (
        event.clientX < left + edge || event.clientX > left + width - edge ||
        event.clientY < top + edge || event.clientY > top + height - edge
      )

      if (isFolderAbsorb) {
        if (!isNearEdge) {
          clearEdgeTimer()
          hoverFolderId.value = targetId!
          folderAction.value = 'absorb'
          preview.value = null
        } else if (folderAction.value !== 'displace') {
          hoverFolderId.value = targetId!
          folderAction.value = 'absorb'
          preview.value = null
          if (edgeHoverTargetId !== targetId) {
            clearEdgeTimer()
            edgeHoverTargetId = targetId!
            edgeHoverTimer = setTimeout(() => {
              folderAction.value = 'displace'
              hoverFolderId.value = null
              const cur = session.value
              if (cur) preview.value = placement(cur.id, cur.startX + cur.dx, cur.startY + cur.dy, cur.offsetX, cur.offsetY)
            }, delay)
          }
        } else {
          preview.value = placement(current.id, event.clientX, event.clientY, current.offsetX, current.offsetY)
        }
      } else {
        hoverFolderId.value = null
        folderAction.value = null
        if (displacedTargetId === targetId) {
          // 已经处于避让状态：稳定保持避让落点，杜绝由于被挤开而撤销产生的反复抖动。
          preview.value = placement(current.id, event.clientX, event.clientY, current.offsetX, current.offsetY)
        } else if (isNearEdge) {
          // 刚停留在边缘区域：启动 0.5 秒计时器。
          preview.value = null
          if (edgeHoverTargetId !== targetId) {
            clearEdgeTimer()
            edgeHoverTargetId = targetId!
            edgeHoverTimer = setTimeout(() => {
              displacedTargetId = targetId!
              const cur = session.value
              if (cur) preview.value = placement(cur.id, cur.startX + cur.dx, cur.startY + cur.dy, cur.offsetX, cur.offsetY)
            }, delay)
          }
        } else {
          // 在卡片中心且未避让：不触发挤走。
          clearEdgeTimer()
          preview.value = null
        }
      }
    } else {
      clearEdgeTimer()
      hoverFolderId.value = null
      folderAction.value = null
      displacedTargetId = null
      const nextPreview = placement(current.id, event.clientX, event.clientY, current.offsetX, current.offsetY)
      if (!preview.value || !nextPreview || preview.value.x !== nextPreview.x || preview.value.y !== nextPreview.y || preview.value.w !== nextPreview.w || preview.value.h !== nextPreview.h) {
        preview.value = nextPreview
      }
    }

    if (event.clientY > window.innerHeight - 60) window.scrollBy(0, 12)
    else if (event.clientY < 60) window.scrollBy(0, -12)
  }

  // 松开后应用预览坐标，并屏蔽紧随拖动产生的点击。
  function end(event: PointerEvent) {
    const current = session.value
    if (!current || event.pointerId !== current.pointer) return
    const targetFolder = hoverFolderId.value
    const action = folderAction.value
    clearEdgeTimer()
    if (current.active) {
      suppressClick = true
      if (targetFolder && action === 'absorb') {
        options.commit(current.id, preview.value ?? placement(current.id, event.clientX, event.clientY, current.offsetX, current.offsetY)!, targetFolder)
      } else {
        const p = preview.value ?? placement(current.id, event.clientX, event.clientY, current.offsetX, current.offsetY)
        if (p) {
          const targetEl = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-widget-id]')
          const targetId = targetEl?.dataset.widgetId
          const validTarget = targetId && targetId !== current.id && options.acceptsTarget(current.id, targetId) ? targetId : undefined
          options.commit(current.id, p, validTarget)
        }
      }
    }
    cancel()
  }

  // 取消拖动不会修改草稿。
  function cancel() {
    clearEdgeTimer()
    const current = session.value
    if (current?.active) suppressClick = true
    if (current?.element) {
      if (current.originalTouchAction) {
        current.element.style.touchAction = current.originalTouchAction
      } else {
        current.element.style.removeProperty('touch-action')
      }
      if (current.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer)
    }
    session.value = null
    preview.value = null
    hoverFolderId.value = null
    folderAction.value = null
    displacedTargetId = null
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
  // 位移不参与网格布局。
  function transform(id: string) {
    const current = session.value
    return current?.active && current.id === id ? { transform: 'translate(' + current.dx + 'px,' + current.dy + 'px)', zIndex: 80 } : {}
  }
  onUnmounted(cancel)
  return { start, cancel, click, transform, placement, preview, draggingId, hoverFolderId, folderAction, vector }
}
