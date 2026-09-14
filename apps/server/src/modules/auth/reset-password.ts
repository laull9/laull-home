import { loadConfig } from '../../config'
import { openDatabase } from '../../db'
import { resetPassword } from './service'

// 密码通过标准输入读取，避免出现在命令行历史与参数中。
const username = process.argv[2]
if (process.stdin.isTTY) throw new Error('请通过标准输入传入新密码')
// 移除附加的末尾换行符。
const password = (await Bun.stdin.text()).replace(/\r?\n$/, '')
// 命令结束时关闭数据库连接。
const db = openDatabase(loadConfig().databasePath)
try {
  await resetPassword(db, password, username)
  console.info('账号密码重置完成')
} finally {
  db.close()
}
