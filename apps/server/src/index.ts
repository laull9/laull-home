import { createApp } from './app'
import { loadConfig } from './config'
import { openDatabase } from './db'

// 启动时校验环境并执行数据库迁移。
const config = loadConfig()
// 一个进程共用一个 SQLite 连接。
const db = openDatabase(config.databasePath)
// 后端独立监听，浏览器通过 Nuxt 同源代理访问。
const app = createApp(db, config).listen({ hostname: config.host, port: config.port })
console.info(`API 已启动：http://${config.host}:${config.port}`)

// 退出前等待 HTTP 请求结束，再关闭数据库。
async function shutdown() {
  await app.stop()
  db.close()
  process.exit(0)
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
