import { loadConfig } from '../../config'
import { openDatabase } from '../../db'
import { createUser } from './service'

// 密码通过标准输入读取，避免出现在命令行参数与历史记录中。
const username = process.argv[2]
if (!username || process.stdin.isTTY) throw new Error('请通过标准输入传入密码，并提供用户名参数')
// 只移除管道附加的单个换行，保留密码中的空格。
const password = (await Bun.stdin.text()).replace(/\r?\n$/, '')
// 命令结束时关闭数据库，即使初始化失败也释放连接。
const db = openDatabase(loadConfig().databasePath)
try {
  await createUser(db, username, password)
  console.info('账号初始化完成')
} finally { db.close() }
