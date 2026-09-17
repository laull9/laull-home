import type { DesktopEventType } from '@laull-home/shared'

// 活跃的 SSE 响应流控制器集合。
const activeClients = new Set<ReadableStreamDefaultController>()

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
  controller.enqueue(new TextEncoder().encode(': keepalive\n\n'))
  return () => {
    activeClients.delete(controller)
  }
}

// 获取当前监听连接总数，用于测试断言。
export function getActiveClientsCount(): number {
  return activeClients.size
}

// 清理所有已连接客户端，用于测试隔离。
export function clearActiveClients(): void {
  activeClients.clear()
}
