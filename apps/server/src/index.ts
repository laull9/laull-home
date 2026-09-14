import { createApp } from './app'
import { loadConfig } from './config'
import { openDatabase } from './db'
import { ensureInitialUser } from './modules/auth/service'

// 启动时校验环境并执行数据库迁移。
const config = loadConfig()
// 一个进程共用一个 SQLite 连接。
const db = openDatabase(config.databasePath)

// 首次启动若无账号则自动创建初始管理员账号。
const initialUser = await ensureInitialUser(db)
if (initialUser.created) {
  console.info('========================================')
  console.info('系统未检测到账号，已自动创建初始管理员：')
  console.info(`用户名: ${initialUser.username}`)
  console.info(`密码:   ${initialUser.password}`)
  console.info('请尽快登录并在设置中修改初始密码。')
  console.info('========================================')
}

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
