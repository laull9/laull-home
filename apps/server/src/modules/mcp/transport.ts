import { randomUUID } from 'node:crypto'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

// 会话与传输实例映射表。
const sessionTransports = new Map<string, WebSseServerTransport>()

// 基于 Web 标准 ReadableStream 的 MCP SSE 服务端传输通道。
export class WebSseServerTransport implements Transport {
  // 唯一会话标识。
  readonly sessionId: string
  // 目标客户端 POST 投递地址。
  private readonly endpoint: string
  // SSE 流控制器。
  private controller?: ReadableStreamDefaultController
  // 连接是否已关闭。
  private closed = false

  // 关闭回调。
  onclose?: () => void
  // 异常回调。
  onerror?: (error: Error) => void
  // 收到客户端 JSON-RPC 消息回调。
  onmessage?: (message: JSONRPCMessage) => void

  constructor(endpoint: string, sessionId = randomUUID()) {
    this.endpoint = endpoint
    this.sessionId = sessionId
  }

  // 将响应流控制器绑定到当前传输实例。
  bindStream(controller: ReadableStreamDefaultController): void {
    this.controller = controller
  }

  // 启动传输并向客户端推送 endpoint 事件。
  async start(): Promise<void> {
    if (!this.controller) throw new Error('流控制器尚未绑定')
    const separator = this.endpoint.includes('?') ? '&' : '?'
    const endpointWithSession = `${this.endpoint}${separator}sessionId=${this.sessionId}`
    const frame = `event: endpoint\ndata: ${endpointWithSession}\n\n`
    this.controller.enqueue(new TextEncoder().encode(frame))
    sessionTransports.set(this.sessionId, this)
  }

  // 向客户端推送 JSON-RPC 消息。
  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed || !this.controller) throw new Error('连接已断开')
    const frame = `event: message\ndata: ${JSON.stringify(message)}\n\n`
    this.controller.enqueue(new TextEncoder().encode(frame))
  }

  // 关闭传输通道并注销会话。
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    sessionTransports.delete(this.sessionId)
    try {
      this.controller?.close()
    } catch {
      // 忽略已关闭异常。
    }
    this.onclose?.()
  }

  // 处理客户端 POST 上报的消息。
  handlePostMessage(message: JSONRPCMessage): void {
    if (this.closed) throw new Error('当前会话已关闭')
    this.onmessage?.(message)
  }
}

// 获取指定会话的传输通道实例。
export function getTransportBySession(sessionId: string): WebSseServerTransport | undefined {
  return sessionTransports.get(sessionId)
}

// 注销指定会话通道。
export function removeTransportSession(sessionId: string): void {
  const transport = sessionTransports.get(sessionId)
  if (transport) {
    void transport.close()
  }
}

// 获取当前存活 MCP 会话数。
export function getActiveSessionCount(): number {
  return sessionTransports.size
}
