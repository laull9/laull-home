import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { DesktopService } from '../desktop/service'
import type { SettingsService } from '../settings/service'
import { registerMcpTools } from './tools'

// MCP 服务端依赖集合。
export interface McpServerDependencies {
  // 当前操作用户编号。
  userId: number
  // 画布服务实例。
  desktopService: DesktopService
  // 用户设置服务实例。
  settingsService: SettingsService
}

// 工厂函数：创建已挂载所有工具与资源的 McpServer 实例。
export function createMcpServer(deps: McpServerDependencies): McpServer {
  const server = new McpServer({
    name: 'laull-home',
    version: '0.1.0',
  })

  // 注册所有能力工具与资源。
  registerMcpTools(server, deps)

  return server
}
