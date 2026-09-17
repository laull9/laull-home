import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { WallpaperError } from './service'

// 允许上传的图片 MIME 类型与扩展名映射。
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

// 允许的单张图片最大体积（15MB）。
export const MAX_FILE_SIZE = 15 * 1024 * 1024

// 读取本地图片返回结构。
export interface LocalImageContent {
  // 图片二进制内容。
  buffer: Buffer
  // 响应 MIME 类型。
  contentType: string
}

// 壁纸本地物理文件存储管理器。
export interface WallpaperStorage {
  // 清理本地物理文件。
  cleanupLocalFile: (url: string) => void
  // 保存上传图片并返回相对访问路径与生成文件名。
  saveUploadFile: (file: Blob) => Promise<{ filename: string; relativeUrl: string }>
  // 读取本地图片二进制内容与类型。
  getImage: (filename: string) => LocalImageContent | null
}

// 创建壁纸本地安全存储管理器。
export function createWallpaperStorage(dataDir: string): WallpaperStorage {
  // 本地持久化壁纸存放目录。
  const wallpapersDir = resolve(dataDir, 'wallpapers')
  if (!existsSync(wallpapersDir)) mkdirSync(wallpapersDir, { recursive: true })

  // 联动清理本地物理图片文件。
  function cleanupLocalFile(url: string): void {
    if (url.startsWith('/api/v1/wallpapers/image/')) {
      const filename = url.slice('/api/v1/wallpapers/image/'.length)
      if (/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
        const filePath = resolve(wallpapersDir, filename)
        if (existsSync(filePath)) {
          try { unlinkSync(filePath) } catch { /* 忽略删除残留 */ }
        }
      }
    }
  }

  // 保存上传的文件并进行严格校验。
  async function saveUploadFile(file: Blob): Promise<{ filename: string; relativeUrl: string }> {
    if (!file || file.size === 0) throw new WallpaperError(400, '请选择要上传的图片文件')
    if (file.size > MAX_FILE_SIZE) throw new WallpaperError(400, '图片文件体积不能超过 15MB')

    const mime = file.type
    const ext = ALLOWED_MIME_TYPES[mime]
    if (!ext) throw new WallpaperError(400, '仅支持 JPG、PNG、WebP、GIF、AVIF 与 SVG 图片格式')

    const filename = `${crypto.randomUUID()}.${ext}`
    const targetPath = resolve(wallpapersDir, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    writeFileSync(targetPath, buffer)

    return {
      filename,
      relativeUrl: `/api/v1/wallpapers/image/${filename}`,
    }
  }

  // 读取本地图片二进制内容与类型。
  function getImage(filename: string): LocalImageContent | null {
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
  }

  return {
    cleanupLocalFile,
    saveUploadFile,
    getImage,
  }
}
