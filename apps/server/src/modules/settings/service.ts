import type { Database } from 'bun:sqlite'
import type { HomeSettings } from '@laull-home/shared'

// 设置访问集中处理版本比较，防止多端编辑互相覆盖。
export function createSettingsService(db: Database) {
  return {
    // 所有设置都从数据库读取。
    get(userId: number) {
      return db.query<HomeSettings, [number]>('SELECT revision, title, appearance FROM user_settings WHERE user_id = ?').get(userId)!
    },
    // 单条 SQL 完成版本比较与写入；冲突返回空值。
    update(userId: number, value: HomeSettings) {
      return db.query<HomeSettings, [string, string, number, number, number]>(
        'UPDATE user_settings SET title = ?, appearance = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision, title, appearance',
      ).get(value.title, value.appearance, Date.now(), userId, value.revision)
    },
  }
}
