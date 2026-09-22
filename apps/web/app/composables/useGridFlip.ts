import { nextTick, type Ref } from 'vue'

// 网格动画配置选项。
export interface GridFlipOptions {
  duration?: number
  easing?: string
}

// 使用标准 FLIP 技术为网格排布变动提供平滑的非线性位移动画。
export function useGridFlip(container: Ref<HTMLElement | null>, options: GridFlipOptions = {}) {
  const duration = options.duration ?? 280
  const easing = options.easing ?? 'cubic-bezier(0.2, 0, 0.1, 1)'
  const snapshots = new Map<string, DOMRect>()
  const activeAnimations = new Map<string, Animation>()

  // 系统要求减少动态效果时跳过位移动画。
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  // 为节点登记唯一动画，结束或取消后释放记录。
  function registerAnimation(id: string, animation: Animation) {
    activeAnimations.set(id, animation)
    const clear = () => {
      if (activeAnimations.get(id) === animation) activeAnimations.delete(id)
    }
    animation.addEventListener('finish', clear, { once: true })
    animation.addEventListener('cancel', clear, { once: true })
  }

  // 记录排布变动前各静态组件的屏幕绝对坐标。
  function snapshot(ignoreId?: string) {
    if (!container.value || !import.meta.client) return
    snapshots.clear()
    const elements = container.value.querySelectorAll<HTMLElement>('[data-widget-id]')
    for (const el of elements) {
      const id = el.dataset.widgetId
      if (!id || id === ignoreId) continue
      snapshots.set(id, el.getBoundingClientRect())
    }
  }

  // 测量新位置并启动非线性平滑过渡。
  async function play(ignoreId?: string) {
    if (!container.value || snapshots.size === 0 || !import.meta.client) return
    await nextTick()
    const elements = container.value.querySelectorAll<HTMLElement>('[data-widget-id]')
    for (const el of elements) {
      const id = el.dataset.widgetId
      if (!id || id === ignoreId) continue
      const first = snapshots.get(id)
      if (!first) {
        // 新增元素执行平滑的缩放与淡入进场动画。
        activeAnimations.get(id)?.cancel()
        if (!prefersReducedMotion()) {
          registerAnimation(id, el.animate(
            [{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'scale(1)' }],
            { duration, easing, fill: 'none' },
          ))
        }
        continue
      }
      activeAnimations.get(id)?.cancel()
      const last = el.getBoundingClientRect()
      const dx = first.left - last.left
      const dy = first.top - last.top
      if ((Math.abs(dx) < 1 && Math.abs(dy) < 1) || prefersReducedMotion()) continue
      registerAnimation(id, el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration, easing, fill: 'none' },
      ))
    }
    snapshots.clear()
  }

  // 停止并清理所有正在进行的过渡。
  function reset() {
    for (const animation of activeAnimations.values()) animation.cancel()
    activeAnimations.clear()
    snapshots.clear()
  }

  return { snapshot, play, reset }
}
