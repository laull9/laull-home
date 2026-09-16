import { and, eq, sql } from 'drizzle-orm'
import { DEFAULT_THEME, scopedCss, type HomeSettings } from '@laull-home/shared'
import { BookmarkError } from '../bookmarks/service'
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
        wallpaperAutoRotate: userSettings.wallpaperAutoRotate,
        wallpaperRotateInterval: userSettings.wallpaperRotateInterval,
        customCss: userSettings.customCss,
        themeConfig: userSettings.themeConfig,
      }).from(userSettings).where(eq(userSettings.userId, userId)).get()
      return {
        ...row,
        wallpaperAutoRotate: Boolean(row?.wallpaperAutoRotate),
        wallpaperRotateInterval: row?.wallpaperRotateInterval ?? 60,
        themeConfig: { ...DEFAULT_THEME, ...JSON.parse(row?.themeConfig ?? '{}') },
      } as HomeSettings
    },
    // Drizzle 完成版本比较与写入；冲突返回空值。
    update(userId: number, value: HomeSettings) {
      try { scopedCss(value.customCss ?? '', '.app-root') } catch (error) {
        throw new BookmarkError(400, error instanceof Error ? error.message : 'CSS 无效')
      }
      const rows = db.update(userSettings).set({
        title: value.title,
        appearance: value.appearance,
        themeId: value.themeId ?? 'default',
        wallpaperType: value.wallpaperType ?? 'none',
        wallpaperValue: value.wallpaperValue ?? '',
        ...(value.wallpaperAutoRotate !== undefined ? { wallpaperAutoRotate: value.wallpaperAutoRotate ? 1 : 0 } : {}),
        ...(value.wallpaperRotateInterval !== undefined ? { wallpaperRotateInterval: value.wallpaperRotateInterval } : {}),
        customCss: value.customCss ?? '',
        ...(value.themeConfig ? { themeConfig: JSON.stringify(value.themeConfig) } : {}),
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
        wallpaperAutoRotate: userSettings.wallpaperAutoRotate,
        wallpaperRotateInterval: userSettings.wallpaperRotateInterval,
        customCss: userSettings.customCss,
        themeConfig: userSettings.themeConfig,
      }).all()
      const row = rows[0]
      return row ? {
        ...row,
        wallpaperAutoRotate: Boolean(row.wallpaperAutoRotate),
        wallpaperRotateInterval: row.wallpaperRotateInterval ?? 60,
        themeConfig: { ...DEFAULT_THEME, ...JSON.parse(row.themeConfig) },
      } as HomeSettings : null
    },
  }
}
