import { onMounted, onBeforeUnmount } from 'vue'

// 桌面事件监听回调选项。
export interface DesktopEventsOptions {
  // 主题与样式发生更新时的回调。
  onThemeUpdated?: (data: unknown) => void
  // 组件生命周期变动时的回调。
  onWidgetUpdated?: (data: unknown) => void
  // 网格排布变动时的回调。
  onLayoutUpdated?: (data: unknown) => void
  // 连接断线后恢复时的重读回调。
  onReconnect?: () => void
}

// 建立与服务端的轻量 SSE 热重载连接。
export function useDesktopEvents(options: DesktopEventsOptions) {
  let eventSource: EventSource | null = null
  let hasDisconnected = false

  // 启动热重载长连接。
  function connect() {
    if (!import.meta.client) return
    if (eventSource) return

    try {
      eventSource = new EventSource('/api/v1/desktop/events', { withCredentials: true })

      eventSource.onopen = () => {
        if (hasDisconnected) {
          hasDisconnected = false
          options.onReconnect?.()
        }
      }

      eventSource.onerror = () => {
        hasDisconnected = true
      }

      if (options.onThemeUpdated) {
        eventSource.addEventListener('theme.updated', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data)
            options.onThemeUpdated?.(data)
          } catch {
            options.onThemeUpdated?.(undefined)
          }
        })
      }

      if (options.onWidgetUpdated) {
        eventSource.addEventListener('widget.updated', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data)
            options.onWidgetUpdated?.(data)
          } catch {
            options.onWidgetUpdated?.(undefined)
          }
        })
      }

      if (options.onLayoutUpdated) {
        eventSource.addEventListener('layout.updated', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data)
            options.onLayoutUpdated?.(data)
          } catch {
            options.onLayoutUpdated?.(undefined)
          }
        })
      }
    } catch {
      // 容错处理，由标准 EventSource 内部重试机制负责保活。
    }
  }

  // 关闭热重载长连接。
  function disconnect() {
    if (eventSource) {
      eventSource.close()
      eventSource = null
      hasDisconnected = false
    }
  }

  onMounted(() => {
    connect()
  })

  onBeforeUnmount(() => {
    disconnect()
  })

  return {
    connect,
    disconnect,
  }
}
