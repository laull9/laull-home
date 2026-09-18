import type { DesktopEventType } from '@laull-home/shared'

// 活跃的 SSE 响应流控制器集合。
const activeClients = new Set<ReadableStreamDefaultController>()

// 心跳定时器引用。
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

// 心跳包内容（SSE 注释帧）。
const pingBytes = new TextEncoder().encode(': ping\n\n')

// 确保心跳定时器启动。
function ensureHeartbeat(): void {
  if (heartbeatTimer !== null) return
  // 每 25 秒广播心跳帧保持长连接活跃。
  heartbeatTimer = setInterval(() => {
    if (activeClients.size === 0) {
      stopHeartbeat()
      return
    }
    for (const client of activeClients) {
      try {
        client.enqueue(pingBytes)
      } catch {
        activeClients.delete(client)
      }
    }
  }, 25000)
  // 不阻碍进程正常退出。
  if (heartbeatTimer && typeof heartbeatTimer === 'object' && 'unref' in heartbeatTimer) {
    heartbeatTimer.unref()
  }
}

// 停止心跳定时器。
export function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

// 编码 SSE 消息文本。
function formatSseMessage(event: DesktopEventType, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`
  return new TextEncoder().encode(payload)
}

// 广播热重载事件给所有已连接的浏览器端。
export function broadcastDesktopEvent(event: DesktopEventType, data?: unknown): void {
  const bytes = formatSseMessage(event, data)
  for (const client of activeClients) {
    try {
      client.enqueue(bytes)
    } catch {
      activeClients.delete(client)
    }
  }
}

// 订阅桌面事件流。
export function subscribeDesktopEvents(controller: ReadableStreamDefaultController): () => void {
  activeClients.add(controller)
  // 发送首个保活注释帧确认连接已建立。
  try {
    controller.enqueue(new TextEncoder().encode(': keepalive\n\n'))
  } catch {
    activeClients.delete(controller)
  }
  ensureHeartbeat()

  return () => {
    activeClients.delete(controller)
    if (activeClients.size === 0) {
      stopHeartbeat()
    }
  }
}

// 获取当前监听连接总数，用于测试断言。
export function getActiveClientsCount(): number {
  return activeClients.size
}

// 清理所有已连接客户端与心跳，用于测试隔离。
export function clearActiveClients(): void {
  activeClients.clear()
  stopHeartbeat()
}
