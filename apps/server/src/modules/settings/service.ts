import { and, eq, sql } from 'drizzle-orm'
import type { HomeSettings } from '@laull-home/shared'
import type { AppDatabase } from '../../db'
import { userSettings } from '../../db/schema'

// 设置访问集中处理版本比较，防止多端编辑互相覆盖。
export function createSettingsService(db: AppDatabase) {
  return {
    // 所有设置都从数据库读取。
    get(userId: number) {
      const row = db.select({
        revision: userSettings.revision,
        title: userSettings.title,
        appearance: userSettings.appearance,
        themeId: userSettings.themeId,
        wallpaperType: userSettings.wallpaperType,
        wallpaperValue: userSettings.wallpaperValue,
        customCss: userSettings.customCss,
      }).from(userSettings).where(eq(userSettings.userId, userId)).get()
      return row as HomeSettings
    },
    // Drizzle 完成版本比较与写入；冲突返回空值。
    update(userId: number, value: HomeSettings) {
      const rows = db.update(userSettings).set({
        title: value.title,
        appearance: value.appearance,
        themeId: value.themeId ?? 'default',
        wallpaperType: value.wallpaperType ?? 'none',
        wallpaperValue: value.wallpaperValue ?? '',
        customCss: value.customCss ?? '',
        revision: sql`${userSettings.revision} + 1`,
        updatedAt: Date.now(),
      }).where(
        and(eq(userSettings.userId, userId), eq(userSettings.revision, value.revision)),
      ).returning({
        revision: userSettings.revision,
        title: userSettings.title,
        appearance: userSettings.appearance,
        themeId: userSettings.themeId,
        wallpaperType: userSettings.wallpaperType,
        wallpaperValue: userSettings.wallpaperValue,
        customCss: userSettings.customCss,
      }).all()
      return (rows[0] as HomeSettings) ?? null
    },
  }
}
