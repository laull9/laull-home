import { Elysia, t } from 'elysia'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import type { DesktopService } from '../desktop/service'
import type { SettingsService } from '../settings/service'
import type { AuthService } from '../auth/service'
import { subscribeDesktopEvents } from './events'
import { createMcpServer } from './server'
import type { McpService } from './service'
import { getTransportBySession, WebSseServerTransport } from './transport'

// 协议路由选项。
export interface McpProtocolOptions {
  mcpService: McpService
  desktopService: DesktopService
  settingsService: SettingsService
  authService: AuthService
}

// 抽取请求头中的 Bearer 凭据。
function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null
  const [prefix, token] = authHeader.trim().split(/\s+/)
  if (prefix?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

// 远程 MCP 协议传输通道与浏览器广播路由（位于 resolve 之前）。
export function createMcpProtocolRoutes(options: McpProtocolOptions) {
  const { mcpService, desktopService, settingsService, authService } = options

  return new Elysia()
    // 浏览器端桌面热重载 SSE 通道（需要已登录 Session 授权）。
    .get('/desktop/events', ({ cookie, request, status }) => {
      const sessionToken = cookie.lh_session?.value
      const bearerToken = extractBearerToken(request.headers.get('authorization'))
      const token = typeof sessionToken === 'string' ? sessionToken : bearerToken
      if (!token) return status(401, { code: 'UNAUTHORIZED', message: '请先登录' })
      const user = authService.authenticate(token)
      if (!user) return status(401, { code: 'UNAUTHORIZED', message: '请先登录' })

      let unsubscribe: (() => void) | undefined
      const stream = new ReadableStream({
        start(controller) {
          unsubscribe = subscribeDesktopEvents(controller)
        },
        cancel() {
          unsubscribe?.()
        },
      })
      request.signal?.addEventListener('abort', () => {
        unsubscribe?.()
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      })
    })

    // 远程客户端建立 SSE 事件流。
    .get('/mcp/sse', async ({ request, status }) => {
      const bearerToken = extractBearerToken(request.headers.get('authorization'))
      if (!bearerToken) return status(401, { code: 'UNAUTHORIZED', message: '缺少 Authorization: Bearer <mcp-key> 凭据' })

      const user = mcpService.verifyKey(bearerToken)
      if (!user) return status(401, { code: 'UNAUTHORIZED', message: 'MCP 密钥无效或已吊销' })

      const transport = new WebSseServerTransport('/api/v1/mcp/messages')
      const server = createMcpServer({
        userId: user.id,
        desktopService,
        settingsService,
      })

      const stream = new ReadableStream({
        async start(controller) {
          transport.bindStream(controller)
          try {
            await server.connect(transport)
          } catch (err) {
            controller.error(err)
          }
        },
        cancel() {
          void transport.close()
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      })
    })

    // 远程客户端提交 JSON-RPC 消息。
    .post('/mcp/messages', async ({ request, query, body, status }) => {
      const bearerToken = extractBearerToken(request.headers.get('authorization'))
      if (!bearerToken) return status(401, { code: 'UNAUTHORIZED', message: '缺少 Authorization: Bearer <mcp-key> 凭据' })

      const user = mcpService.verifyKey(bearerToken)
      if (!user) return status(401, { code: 'UNAUTHORIZED', message: 'MCP 密钥无效或已吊销' })

      const sessionId = query.sessionId
      if (!sessionId) return status(400, { code: 'BAD_REQUEST', message: '缺少 sessionId 查询参数' })

      const transport = getTransportBySession(sessionId)
      if (!transport) return status(404, { code: 'NOT_FOUND', message: 'MCP 会话不存在或已关闭' })

      try {
        transport.handlePostMessage(body as JSONRPCMessage)
        return status(202, { success: true })
      } catch (err) {
        return status(400, { code: 'BAD_REQUEST', message: err instanceof Error ? err.message : '消息格式异常' })
      }
    }, {
      query: t.Object({ sessionId: t.String() }),
    })
}
