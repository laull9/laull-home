import { nextTick, type Ref } from 'vue'

// 网格动画配置选项。
export interface GridFlipOptions {
  duration?: number
  easing?: string
}

// 记录元素屏幕边界快照与正在进行的动画。
interface FlipRecord {
  rect: DOMRect
  cleanup?: () => void
}

// 使用标准 FLIP 技术为网格排布变动提供平滑的非线性位移动画。
export function useGridFlip(container: Ref<HTMLElement | null>, options: GridFlipOptions = {}) {
  const duration = options.duration ?? 280
  const easing = options.easing ?? 'cubic-bezier(0.2, 0, 0.1, 1)'
  const snapshots = new Map<string, DOMRect>()
  const activeRecords = new Map<string, FlipRecord>()

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
        activeRecords.get(id)?.cleanup?.()
        el.style.opacity = '0'
        el.style.transform = 'scale(0.85)'
        el.style.transition = 'none'
        void el.offsetHeight
        requestAnimationFrame(() => {
          el.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ${easing}`
          el.style.opacity = ''
          el.style.transform = ''
          const onEnd = () => {
            el.style.transition = ''
            el.removeEventListener('transitionend', onEnd)
            activeRecords.delete(id)
          }
          el.addEventListener('transitionend', onEnd)
          activeRecords.set(id, {
            rect: el.getBoundingClientRect(),
            cleanup: () => {
              el.removeEventListener('transitionend', onEnd)
              el.style.transition = ''
              el.style.opacity = ''
              el.style.transform = ''
            },
          })
        })
        continue
      }
      const last = el.getBoundingClientRect()
      const dx = first.left - last.left
      const dy = first.top - last.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue

      // 清理该元素先前的动画回调。
      activeRecords.get(id)?.cleanup?.()

      // 逆向反转到位移发生前的起点。
      el.style.transform = `translate(${dx}px, ${dy}px)`
      el.style.transition = 'none'

      // 强制触发回流确保逆向位移生效。
      void el.offsetHeight

      // 在下一帧启用平滑非线性缓动回正到新网格。
      requestAnimationFrame(() => {
        el.style.transition = `transform ${duration}ms ${easing}`
        el.style.transform = ''
        const onEnd = (event: TransitionEvent) => {
          if (event.propertyName !== 'transform') return
          el.style.transition = ''
          el.removeEventListener('transitionend', onEnd)
          activeRecords.delete(id)
        }
        el.addEventListener('transitionend', onEnd)
        activeRecords.set(id, {
          rect: last,
          cleanup: () => {
            el.removeEventListener('transitionend', onEnd)
            el.style.transition = ''
          },
        })
      })
    }
    snapshots.clear()
  }

  // 停止并清理所有正在进行的过渡。
  function reset() {
    for (const record of activeRecords.values()) record.cleanup?.()
    activeRecords.clear()
    snapshots.clear()
  }

  return { snapshot, play, reset }
}
