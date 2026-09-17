import { ref, computed, onUnmounted, type Ref } from 'vue'
import { arrangeNodes, BREAKPOINTS, type WidgetNode, type Breakpoint, type Placement } from '@laull-home/shared'

// 拖动状态保留抓取偏移，组件跟随指针而不跳到左上角。
interface DragSession {
  id: string; pointer: number; startX: number; startY: number; offsetX: number; offsetY: number
  dx: number; dy: number; active: boolean; element: HTMLElement
}
// 指针拖动与原生组件库拖放共用网格吸附算法。
export function useWidgetDrag(options: {
  canvas: Ref<HTMLElement | null>
  nodes: () => WidgetNode[]
  breakpoint: Ref<Breakpoint>
  enabled: () => boolean
  commit: (id: string, position: Placement, targetId?: string) => void
  acceptsTarget: (sourceId: string, targetId: string) => boolean
}) {
  const session = ref<DragSession | null>(null)
  const preview = ref<Placement | null>(null)
  let suppressClick = false
  // 预览先通过真实避让算法，确保落点与最终布局一致。
  function placement(id: string, clientX: number, clientY: number, offsetX = 0, offsetY = 0) {
    const grid = options.canvas.value
    const node = options.nodes().find(item => item.id === id)
    if (!grid || !node) return null
    const bounds = grid.getBoundingClientRect()
    const columns = BREAKPOINTS[options.breakpoint.value]
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
    const rowGap = parseFloat(getComputedStyle(grid).rowGap) || 0
    const cell = (bounds.width - gap * (columns - 1)) / columns
    const old = arrangeNodes(options.nodes(), options.breakpoint.value).get(id)!
    const p = { ...old,
      x: Math.max(0, Math.min(columns - old.w, Math.round((clientX - bounds.left - offsetX) / (cell + gap)))),
      y: Math.max(0, Math.min(199, Math.round((clientY - bounds.top - offsetY) / (96 + rowGap)))), pinned: true,
    }
    const candidate = options.nodes().map(item => item.id === id ? { ...item, stackId: '', layouts: { ...item.layouts, [options.breakpoint.value]: p } } : item)
    return arrangeNodes(candidate, options.breakpoint.value).get(id)!
  }
  // 只有超过阈值的移动才成为拖动，轻点继续执行原有点击。
  function start(event: PointerEvent, node: WidgetNode) {
    if (!options.enabled() || event.button !== 0 || session.value) return
    suppressClick = false
    const target = event.target as HTMLElement
    if (target.closest('input,textarea,select,[contenteditable],.widget-tools,.stack-controls')) return
    const element = event.currentTarget as HTMLElement
    const bounds = element.getBoundingClientRect()
    session.value = { id: node.id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, dx: 0, dy: 0, active: false, element }
    document.addEventListener('pointermove', move, { passive: false })
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', cancel)
    document.addEventListener('keydown', escape)
  }
  // 跟随指针移动，并绘制吸附后的目标矩形。
  function move(event: PointerEvent) {
    const current = session.value
    if (!current || event.pointerId !== current.pointer) return
    current.dx = event.clientX - current.startX
    current.dy = event.clientY - current.startY
    if (!current.active && Math.hypot(current.dx, current.dy) < 6) return
    current.active = true
    if (!current.element.hasPointerCapture(event.pointerId)) current.element.setPointerCapture(event.pointerId)
    event.preventDefault()
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-widget-id]')?.dataset.widgetId
    const nextPreview = target && target !== current.id && options.acceptsTarget(current.id, target)
      ? arrangeNodes(options.nodes(), options.breakpoint.value).get(target)!
      : placement(current.id, event.clientX, event.clientY, current.offsetX, current.offsetY)
    if (!preview.value || !nextPreview || preview.value.x !== nextPreview.x || preview.value.y !== nextPreview.y || preview.value.w !== nextPreview.w || preview.value.h !== nextPreview.h) {
      preview.value = nextPreview
    }
    if (event.clientY > window.innerHeight - 60) window.scrollBy(0, 12)
    else if (event.clientY < 60) window.scrollBy(0, -12)
  }
  // 松开后应用预览坐标，并屏蔽紧随拖动产生的点击。
  function end(event: PointerEvent) {
    const current = session.value
    if (!current || event.pointerId !== current.pointer) return
    if (current.active && preview.value) {
      suppressClick = true
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-widget-id]')
      options.commit(current.id, preview.value, target?.dataset.widgetId)
    }
    cancel()
  }
  // 取消拖动不会修改草稿。
  function cancel() {
    const current = session.value
    if (current?.active) suppressClick = true
    if (current?.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer)
    session.value = null
    preview.value = null
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
  // 拖动中的组件使用完整实物反馈。
  const draggingId = computed(() => session.value?.active ? session.value.id : '')
  // 位移不参与网格布局。
  function transform(id: string) {
    const current = session.value
    return current?.active && current.id === id ? { transform: 'translate(' + current.dx + 'px,' + current.dy + 'px)', zIndex: 80 } : {}
  }
  onUnmounted(cancel)
  return { start, cancel, click, transform, placement, preview, draggingId }
}
