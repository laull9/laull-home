import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm'
import {
  isValidSafeUrl,
  WALLPAPER_FIT_MODES,
  WALLPAPER_QUOTA,
  type BatchWallpaperItem,
  type CreateWallpaperInput,
  type CreateWallpaperPoolInput,
  type UpdateWallpaperInput,
  type UpdateWallpaperPoolInput,
  type WallpaperFitMode,
  type WallpaperItem,
  type WallpaperPool,
  type WallpaperQuotaInfo,
} from '@laull-home/shared'
import type { AppDatabase } from '../../db'
import { userSettings, wallpaperPools, wallpapers } from '../../db/schema'
import { createWallpaperStorage, type LocalImageContent } from './storage'

// 壁纸服务业务异常类。
export class WallpaperError extends Error {
  // 附带 HTTP 状态码便于路由层精准转换。
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'WallpaperError'
  }
}

// 规范化填充模式取值。
function sanitizeFitMode(mode?: string | null): WallpaperFitMode | null {
  if (!mode || mode === 'auto') return null
  if (WALLPAPER_FIT_MODES.includes(mode as WallpaperFitMode)) {
    return mode as WallpaperFitMode
  }
  return null
}

// 创建壁纸池管理与安全文件存储服务。
export function createWallpaperService(db: AppDatabase, dataDir: string) {
  // 本地物理文件安全读写与清理管理器。
  const storage = createWallpaperStorage(dataDir)

  // 确保用户至少拥有一个系统默认图片池。
  function ensureDefaultPool(userId: number): { id: string; name: string } {
    const existing = db.select()
      .from(wallpaperPools)
      .where(eq(wallpaperPools.userId, userId))
      .orderBy(desc(wallpaperPools.isDefault), wallpaperPools.createdAt)
      .get()
    if (existing) return existing

    const now = Date.now()
    const poolId = `default-pool-${userId}`
    const defaultPool = {
      id: poolId,
      userId,
      name: '默认图片池',
      isDefault: 1,
      createdAt: now,
      updatedAt: now,
    }
    db.insert(wallpaperPools).values(defaultPool).onConflictDoNothing().run()

    db.update(userSettings)
      .set({ activeWallpaperPoolId: poolId })
      .where(and(eq(userSettings.userId, userId), isNull(userSettings.activeWallpaperPoolId)))
      .run()

    return defaultPool
  }

  // 解析并确定有效的目标图片池标识。
  function resolveTargetPoolId(userId: number, explicitPoolId?: string): string {
    if (explicitPoolId) {
      const pool = db.select()
        .from(wallpaperPools)
        .where(and(eq(wallpaperPools.id, explicitPoolId), eq(wallpaperPools.userId, userId)))
        .get()
      if (!pool) throw new WallpaperError(404, '指定的图片池不存在')
      return pool.id
    }

    const settings = db.select({ active: userSettings.activeWallpaperPoolId })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .get()

    if (settings?.active) {
      const activePool = db.select()
        .from(wallpaperPools)
        .where(and(eq(wallpaperPools.id, settings.active), eq(wallpaperPools.userId, userId)))
        .get()
      if (activePool) return activePool.id
    }

    return ensureDefaultPool(userId).id
  }

  return {
    // 获取当前用户的所有图片池列表及图片计数。
    listPools(userId: number): WallpaperPool[] {
      ensureDefaultPool(userId)
      const pools = db.select()
        .from(wallpaperPools)
        .where(eq(wallpaperPools.userId, userId))
        .orderBy(desc(wallpaperPools.isDefault), wallpaperPools.createdAt)
        .all()

      const counts = db.select({
        poolId: wallpapers.poolId,
        count: count(),
      })
        .from(wallpapers)
        .where(eq(wallpapers.userId, userId))
        .groupBy(wallpapers.poolId)
        .all()

      const countMap = new Map<string, number>()
      for (const item of counts) {
        if (item.poolId) countMap.set(item.poolId, Number(item.count))
      }

      return pools.map(p => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
        isDefault: Boolean(p.isDefault),
        count: countMap.get(p.id) ?? 0,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }))
    },

    // 创建新图片池。
    createPool(userId: number, input: CreateWallpaperPoolInput): WallpaperPool {
      const name = input.name.trim()
      if (!name) throw new WallpaperError(400, '图片池名称不能为空')
      if (name.length > 64) throw new WallpaperError(400, '图片池名称不能超过 64 个字符')

      const now = Date.now()
      const pool: WallpaperPool = {
        id: crypto.randomUUID(),
        userId,
        name,
        isDefault: false,
        count: 0,
        createdAt: now,
        updatedAt: now,
      }
      db.insert(wallpaperPools).values({
        id: pool.id,
        userId,
        name: pool.name,
        isDefault: 0,
        createdAt: now,
        updatedAt: now,
      }).run()
      return pool
    },

    // 修改图片池名称。
    updatePool(userId: number, poolId: string, input: UpdateWallpaperPoolInput): WallpaperPool {
      const existing = db.select()
        .from(wallpaperPools)
        .where(and(eq(wallpaperPools.id, poolId), eq(wallpaperPools.userId, userId)))
        .get()
      if (!existing) throw new WallpaperError(404, '图片池不存在')

      const name = input.name.trim()
      if (!name) throw new WallpaperError(400, '图片池名称不能为空')
      if (name.length > 64) throw new WallpaperError(400, '图片池名称不能超过 64 个字符')

      const now = Date.now()
      db.update(wallpaperPools)
        .set({ name, updatedAt: now })
        .where(and(eq(wallpaperPools.id, poolId), eq(wallpaperPools.userId, userId)))
        .run()

      const countRow = db.select({ count: count() })
        .from(wallpapers)
        .where(and(eq(wallpapers.userId, userId), eq(wallpapers.poolId, poolId)))
        .get()

      return {
        id: existing.id,
        userId: existing.userId,
        name,
        isDefault: Boolean(existing.isDefault),
        count: countRow ? Number(countRow.count) : 0,
        createdAt: existing.createdAt,
        updatedAt: now,
      }
    },

    // 删除图片池并级联清理其所有本地物理图片文件。
    deletePool(userId: number, poolId: string): void {
      const userPools = db.select()
        .from(wallpaperPools)
        .where(eq(wallpaperPools.userId, userId))
        .all()
      const targetPool = userPools.find(p => p.id === poolId)
      if (!targetPool) throw new WallpaperError(404, '图片池不存在')

      if (userPools.length <= 1) {
        throw new WallpaperError(400, '至少保留一个图片池，无法删除')
      }

      // 提取本池所有本地上传图片并物理删除。
      const itemsInPool = db.select()
        .from(wallpapers)
        .where(and(eq(wallpapers.poolId, poolId), eq(wallpapers.userId, userId)))
        .all()
      for (const item of itemsInPool) {
        if (item.sourceType === 'upload') storage.cleanupLocalFile(item.url)
      }

      const remainingPool = userPools.find(p => p.id !== poolId)!

      db.transaction(tx => {
        tx.delete(wallpapers)
          .where(and(eq(wallpapers.poolId, poolId), eq(wallpapers.userId, userId)))
          .run()
        tx.delete(wallpaperPools)
          .where(and(eq(wallpaperPools.id, poolId), eq(wallpaperPools.userId, userId)))
          .run()

        // 若当前设置激活的正是被删除的池，自动切换至剩余图片池。
        tx.update(userSettings)
          .set({ activeWallpaperPoolId: remainingPool.id })
          .where(and(eq(userSettings.userId, userId), eq(userSettings.activeWallpaperPoolId, poolId)))
          .run()
      })
    },

    // 获取指定图片池（或当前图片池）的壁纸记录。
    list(userId: number, poolId?: string): WallpaperItem[] {
      const targetPoolId = resolveTargetPoolId(userId, poolId)
      return db.select()
        .from(wallpapers)
        .where(and(eq(wallpapers.userId, userId), eq(wallpapers.poolId, targetPoolId)))
        .orderBy(desc(wallpapers.createdAt))
        .all() as WallpaperItem[]
    },

    // 导入外部图片链接至目标图片池。
    create(userId: number, input: CreateWallpaperInput): WallpaperItem {
      const name = input.name.trim()
      const url = input.url.trim()
      if (!name) throw new WallpaperError(400, '壁纸名称不能为空')
      if (!url || !isValidSafeUrl(url)) throw new WallpaperError(400, '必须为有效的 http 或 https 链接')

      const targetPoolId = resolveTargetPoolId(userId, input.poolId)
      const fitMode = sanitizeFitMode(input.fitMode)

      const now = Date.now()
      const item: WallpaperItem = {
        id: crypto.randomUUID(),
        userId,
        poolId: targetPoolId,
        name,
        url,
        sourceType: 'url',
        fitMode,
        createdAt: now,
        updatedAt: now,
      }
      db.insert(wallpapers).values({
        id: item.id,
        userId: item.userId,
        poolId: item.poolId,
        name: item.name,
        url: item.url,
        sourceType: item.sourceType,
        fitMode: item.fitMode,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }).run()
      return item
    },

    // 批量导入外部图片链接至目标图片池。
    createBatch(userId: number, items: BatchWallpaperItem[], poolId?: string): WallpaperItem[] {
      if (!items || items.length === 0) throw new WallpaperError(400, '导入列表不能为空')
      if (items.length > 100) throw new WallpaperError(400, '单次最多批量导入 100 张壁纸')

      const targetPoolId = resolveTargetPoolId(userId, poolId)
      const now = Date.now()
      const total = items.length

      const records: WallpaperItem[] = items.map((it, idx) => {
        const url = it.url.trim()
        if (!url || !isValidSafeUrl(url)) throw new WallpaperError(400, '必须为有效的 http 或 https 链接')
        const name = it.name?.trim() || `壁纸 ${idx + 1}`
        const timestamp = now + (total - 1 - idx)
        const fitMode = sanitizeFitMode(it.fitMode)
        return {
          id: crypto.randomUUID(),
          userId,
          poolId: targetPoolId,
          name: name.slice(0, 100),
          url,
          sourceType: 'url',
          fitMode,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
      })

      db.transaction((tx) => {
        tx.insert(wallpapers).values(records).run()
      })

      return records
    },

    // 修改壁纸名称、图片链接、填充模式或所属图片池。
    update(userId: number, id: string, input: UpdateWallpaperInput): WallpaperItem {
      const existing = db.select()
        .from(wallpapers)
        .where(and(eq(wallpapers.id, id), eq(wallpapers.userId, userId)))
        .get()
      if (!existing) throw new WallpaperError(404, '壁纸不存在')

      const updates: Partial<typeof wallpapers.$inferInsert> = { updatedAt: Date.now() }
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (!name) throw new WallpaperError(400, '壁纸名称不能为空')
        updates.name = name
      }
      if (input.url !== undefined) {
        const url = input.url.trim()
        if (!url || !isValidSafeUrl(url)) throw new WallpaperError(400, '必须为有效的 http 或 https 链接')
        updates.url = url
      }
      if (input.fitMode !== undefined) {
        updates.fitMode = sanitizeFitMode(input.fitMode)
      }
      if (input.poolId !== undefined) {
        const targetPool = db.select()
          .from(wallpaperPools)
          .where(and(eq(wallpaperPools.id, input.poolId), eq(wallpaperPools.userId, userId)))
          .get()
        if (!targetPool) throw new WallpaperError(404, '目标图片池不存在')
        updates.poolId = targetPool.id
      }

      db.update(wallpapers)
        .set(updates)
        .where(and(eq(wallpapers.id, id), eq(wallpapers.userId, userId)))
        .run()

      return db.select()
        .from(wallpapers)
        .where(and(eq(wallpapers.id, id), eq(wallpapers.userId, userId)))
        .get() as WallpaperItem
    },

    // 删除单张壁纸并联动清理本地上传物理文件。
    delete(userId: number, id: string): void {
      const existing = db.select()
        .from(wallpapers)
        .where(and(eq(wallpapers.id, id), eq(wallpapers.userId, userId)))
        .get()
      if (!existing) throw new WallpaperError(404, '壁纸不存在')

      if (existing.sourceType === 'upload') {
        storage.cleanupLocalFile(existing.url)
      }

      db.delete(wallpapers)
        .where(and(eq(wallpapers.id, id), eq(wallpapers.userId, userId)))
        .run()
    },

    // 批量删除壁纸并联动清理本地上传物理文件。
    deleteBatch(userId: number, ids: string[]): { deletedCount: number } {
      if (!ids || ids.length === 0) throw new WallpaperError(400, '请选择要删除的壁纸')

      const existingItems = db.select()
        .from(wallpapers)
        .where(and(eq(wallpapers.userId, userId), inArray(wallpapers.id, ids)))
        .all()

      if (existingItems.length === 0) return { deletedCount: 0 }

      for (const item of existingItems) {
        if (item.sourceType === 'upload') {
          storage.cleanupLocalFile(item.url)
        }
      }

      const matchedIds = existingItems.map(it => it.id)
      db.transaction(tx => {
        tx.delete(wallpapers)
          .where(and(eq(wallpapers.userId, userId), inArray(wallpapers.id, matchedIds)))
          .run()
      })

      return { deletedCount: matchedIds.length }
    },

    // 获取当前用户图库本地上传存储配额详情。
    getQuota(userId: number): WallpaperQuotaInfo {
      const uploadRows = db.select({ url: wallpapers.url })
        .from(wallpapers)
        .where(and(eq(wallpapers.userId, userId), eq(wallpapers.sourceType, 'upload')))
        .all()

      const filenames = uploadRows
        .map(r => r.url.replace('/api/v1/wallpapers/image/', ''))
        .filter(Boolean)
      const usedBytes = storage.getFilesTotalSize(filenames)
      const usedCount = uploadRows.length

      return {
        usedBytes,
        totalBytes: WALLPAPER_QUOTA.maxTotalBytes,
        usedCount,
        maxCount: WALLPAPER_QUOTA.maxCount,
      }
    },

    // 上传本地图片并加入指定图片池。
    async saveUpload(userId: number, file: Blob, customName?: string, poolId?: string, fitMode?: string): Promise<WallpaperItem> {
      const quota = this.getQuota(userId)
      if (quota.usedCount >= quota.maxCount) {
        throw new WallpaperError(400, `已达到图库上传数量上限（最多 ${quota.maxCount} 张）`)
      }
      if (quota.usedBytes + file.size > quota.totalBytes) {
        const maxMb = Math.round(quota.totalBytes / (1024 * 1024))
        throw new WallpaperError(400, `已超出图库存储配额（上限 ${maxMb}MB），请先清理不需要的壁纸`)
      }

      const targetPoolId = resolveTargetPoolId(userId, poolId)
      const { relativeUrl } = await storage.saveUploadFile(file)

      let displayName = customName?.trim()
      if (!displayName || displayName === 'undefined') {
        const rawName = (file as { name?: string })?.name
        displayName = (rawName && rawName !== 'undefined') ? rawName.replace(/\.[^.]+$/, '') : '本地壁纸'
      }

      const now = Date.now()
      const item: WallpaperItem = {
        id: crypto.randomUUID(),
        userId,
        poolId: targetPoolId,
        name: displayName.slice(0, 100),
        url: relativeUrl,
        sourceType: 'upload',
        fitMode: sanitizeFitMode(fitMode),
        createdAt: now,
        updatedAt: now,
      }
      db.insert(wallpapers).values({
        id: item.id,
        userId: item.userId,
        poolId: item.poolId,
        name: item.name,
        url: item.url,
        sourceType: item.sourceType,
        fitMode: item.fitMode,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }).run()
      return item
    },

    // 读取本地图片二进制内容与类型。
    getImage(filename: string): LocalImageContent | null {
      return storage.getImage(filename)
    },
  }
}
