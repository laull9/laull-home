import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { and, desc, eq } from 'drizzle-orm'
import { isValidSafeUrl, type CreateWallpaperInput, type UpdateWallpaperInput, type WallpaperItem } from '@laull-home/shared'
import type { AppDatabase } from '../../db'
import { wallpapers } from '../../db/schema'

// 壁纸服务业务异常类。
export class WallpaperError extends Error {
  // 附带 HTTP 状态码便于路由层精准转换。
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'WallpaperError'
  }
}

// 允许上传的图片 MIME 类型与扩展名映射。
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

// 允许的单张图片最大体积（15MB）。
const MAX_FILE_SIZE = 15 * 1024 * 1024

// 创建壁纸池管理与安全文件存储服务。
export function createWallpaperService(db: AppDatabase, dataDir: string) {
  // 本地持久化壁纸存放目录。
  const wallpapersDir = resolve(dataDir, 'wallpapers')
  if (!existsSync(wallpapersDir)) mkdirSync(wallpapersDir, { recursive: true })

  return {
    // 获取当前用户的所有图片池记录。
    list(userId: number): WallpaperItem[] {
      return db.select()
        .from(wallpapers)
        .where(eq(wallpapers.userId, userId))
        .orderBy(desc(wallpapers.createdAt))
        .all() as WallpaperItem[]
    },

    // 导入外部图片链接至图片池。
    create(userId: number, input: CreateWallpaperInput): WallpaperItem {
      const name = input.name.trim()
      const url = input.url.trim()
      if (!name) throw new WallpaperError(400, '壁纸名称不能为空')
      if (!url || !isValidSafeUrl(url)) throw new WallpaperError(400, '必须为有效的 http 或 https 链接')

      const now = Date.now()
      const item: WallpaperItem = {
        id: crypto.randomUUID(),
        userId,
        name,
        url,
        sourceType: 'url',
        createdAt: now,
        updatedAt: now,
      }
      db.insert(wallpapers).values(item).run()
      return item
    },

    // 修改壁纸名称或图片链接。
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

      db.update(wallpapers)
        .set(updates)
        .where(and(eq(wallpapers.id, id), eq(wallpapers.userId, userId)))
        .run()

      return db.select()
        .from(wallpapers)
        .where(and(eq(wallpapers.id, id), eq(wallpapers.userId, userId)))
        .get() as WallpaperItem
    },

    // 删除壁纸记录并清理本地上传文件。
    delete(userId: number, id: string): void {
      const existing = db.select()
        .from(wallpapers)
        .where(and(eq(wallpapers.id, id), eq(wallpapers.userId, userId)))
        .get()
      if (!existing) throw new WallpaperError(404, '壁纸不存在')

      // 本地文件联动安全清理。
      if (existing.sourceType === 'upload' && existing.url.startsWith('/api/v1/wallpapers/image/')) {
        const filename = existing.url.slice('/api/v1/wallpapers/image/'.length)
        if (/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
          const filePath = resolve(wallpapersDir, filename)
          if (existsSync(filePath)) {
            try { unlinkSync(filePath) } catch { /* 忽略删除残留 */ }
          }
        }
      }

      db.delete(wallpapers)
        .where(and(eq(wallpapers.id, id), eq(wallpapers.userId, userId)))
        .run()
    },

    // 上传本地图片并加入图片池。
    async saveUpload(userId: number, file: Blob, customName?: string): Promise<WallpaperItem> {
      if (!file || file.size === 0) throw new WallpaperError(400, '请选择要上传的图片文件')
      if (file.size > MAX_FILE_SIZE) throw new WallpaperError(400, '图片文件体积不能超过 15MB')

      const mime = file.type
      const ext = ALLOWED_MIME_TYPES[mime]
      if (!ext) throw new WallpaperError(400, '仅支持 JPG、PNG、WebP、GIF、AVIF 与 SVG 图片格式')

      const filename = `${crypto.randomUUID()}.${ext}`
      const targetPath = resolve(wallpapersDir, filename)
      const buffer = Buffer.from(await file.arrayBuffer())
      writeFileSync(targetPath, buffer)

      let displayName = customName?.trim()
      if (!displayName) {
        const rawName = file instanceof File ? file.name : ''
        displayName = rawName ? rawName.replace(/\.[^.]+$/, '') : '本地壁纸'
      }

      const now = Date.now()
      const item: WallpaperItem = {
        id: crypto.randomUUID(),
        userId,
        name: displayName.slice(0, 100),
        url: `/api/v1/wallpapers/image/${filename}`,
        sourceType: 'upload',
        createdAt: now,
        updatedAt: now,
      }
      db.insert(wallpapers).values(item).run()
      return item
    },

    // 读取本地图片二进制内容与类型。
    getImage(filename: string): { buffer: Buffer, contentType: string } | null {
      // 严格文件名正则校验防范路径穿越。
      if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) return null
      const filePath = resolve(wallpapersDir, filename)
      if (!existsSync(filePath)) return null

      const ext = extname(filename).toLowerCase().replace('.', '')
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        avif: 'image/avif',
        svg: 'image/svg+xml',
      }
      const contentType = mimeMap[ext] ?? 'application/octet-stream'
      const buffer = readFileSync(filePath)
      return { buffer, contentType }
    },
  }
}
