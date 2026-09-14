import { loadConfig } from '../config'
import { openDatabase } from './index'

// 显式迁移命令与服务启动共用迁移器。
const db = openDatabase(loadConfig().databasePath)
db.close()
console.info('数据库迁移完成')
