import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from '../../config'
import { openDatabase } from '../../db'
import { createDesktopService } from '../desktop/service'
import { createSettingsService } from '../settings/service'
import { createMcpServer } from './server'

// 启动本地 Stdio 模式 MCP 服务器。
async function main() {
  const config = loadConfig()
  const db = openDatabase(config.databasePath)
  const desktopService = createDesktopService(db)
  const settingsService = createSettingsService(db)

  // 单用户主页，默认管理员编号固定为 1。
  const server = createMcpServer({
    userId: 1,
    desktopService,
    settingsService,
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  // 标准错误输出启动成功提示，避免污染 stdout JSON-RPC 通道。
  console.error('[MCP] laull-home stdio server is running')
}

void main().catch(error => {
  console.error('[MCP] stdio fatal error:', error)
  process.exit(1)
})
