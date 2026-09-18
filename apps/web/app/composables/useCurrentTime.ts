import { onMounted, onUnmounted, type Ref } from 'vue'

let activeSubscribers = 0
let sharedTimer: ReturnType<typeof setInterval> | undefined

// 全局单例时间响应器，统一驱动时钟、日历与微缩预览。
export function useCurrentTime(): { now: Ref<Date> } {
  const now = useState<Date>('system:current-time', () => new Date())

  // 页面可见时对齐时间。
  function tick() {
    if (typeof document !== 'undefined' && !document.hidden) {
      now.value = new Date()
    }
  }

  onMounted(() => {
    activeSubscribers++
    if (activeSubscribers === 1) {
      sharedTimer = setInterval(tick, 1000)
      document.addEventListener('visibilitychange', tick)
    }
  })

  onUnmounted(() => {
    activeSubscribers = Math.max(0, activeSubscribers - 1)
    if (activeSubscribers === 0 && sharedTimer) {
      clearInterval(sharedTimer)
      sharedTimer = undefined
      document.removeEventListener('visibilitychange', tick)
    }
  })

  return { now }
}
