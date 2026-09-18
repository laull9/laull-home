import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
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

// 识别二进制缓冲区的真实图片类型并防范恶意脚本。
export function detectImageFormat(buffer: Buffer): { ext: string; mime: string } {
  if (buffer.length < 4) {
    throw new WallpaperError(400, '无效的文件内容')
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' }
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' }
  }

  // 3. GIF: GIF87a 或 GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61
  ) {
    return { ext: 'gif', mime: 'image/gif' }
  }

  // 4. WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { ext: 'webp', mime: 'image/webp' }
  }

  // 5. AVIF: 4 字节偏移后为 ftypavif 或 ftypavis
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70 &&
    buffer[8] === 0x61 && buffer[9] === 0x76 && buffer[10] === 0x69 &&
    (buffer[11] === 0x66 || buffer[11] === 0x73)
  ) {
    return { ext: 'avif', mime: 'image/avif' }
  }

  // 6. SVG: 检查 XML/<svg 标签与防范 XSS
  const textHead = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf-8').trim().toLowerCase()
  if (textHead.includes('<svg') || (textHead.startsWith('<?xml') && textHead.includes('<svg'))) {
    const fullText = buffer.toString('utf-8').toLowerCase()
    // 防范包含脚本和危险事件执行
    if (
      fullText.includes('<script') ||
      fullText.includes('javascript:') ||
      fullText.includes('<foreignobject') ||
      /on[a-z]+\s*=/i.test(fullText)
    ) {
      throw new WallpaperError(400, 'SVG 图片包含不安全的脚本或事件代码，已被系统拦截')
    }
    return { ext: 'svg', mime: 'image/svg+xml' }
  }

  throw new WallpaperError(400, '仅支持合法的 JPG、PNG、WebP、GIF、AVIF 与 SVG 图片')
}

// 壁纸本地物理文件存储管理器。
export interface WallpaperStorage {
  // 清理本地物理文件。
  cleanupLocalFile: (url: string) => void
  // 保存上传图片并返回相对访问路径与生成文件名。
  saveUploadFile: (file: Blob) => Promise<{ filename: string; relativeUrl: string; size: number }>
  // 读取本地图片二进制内容与类型。
  getImage: (filename: string) => LocalImageContent | null
  // 计算给定文件列表在磁盘上的实际总物理字节大小。
  getFilesTotalSize: (filenames: string[]) => number
}

// 创建壁纸本地安全存储管理器。
export function createWallpaperStorage(dataDir: string): WallpaperStorage {
  // 本地持久化壁纸存放目录。
  const wallpapersDir = resolve(dataDir, 'wallpapers')
  if (!existsSync(wallpapersDir)) mkdirSync(wallpapersDir, { recursive: true })

  // 从 URL 提取安全的文件名。
  function extractFilenameFromUrl(url: string): string | null {
    if (url.startsWith('/api/v1/wallpapers/image/')) {
      const filename = url.slice('/api/v1/wallpapers/image/'.length)
      if (/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
        return filename
      }
    }
    return null
  }

  // 联动清理本地物理图片文件。
  function cleanupLocalFile(url: string): void {
    const filename = extractFilenameFromUrl(url)
    if (filename) {
      const filePath = resolve(wallpapersDir, filename)
      if (existsSync(filePath)) {
        try { unlinkSync(filePath) } catch { /* 忽略删除残留 */ }
      }
    }
  }

  // 保存上传的文件并进行严格魔数与体积校验。
  async function saveUploadFile(file: Blob): Promise<{ filename: string; relativeUrl: string; size: number }> {
    if (!file || file.size === 0) throw new WallpaperError(400, '请选择要上传的图片文件')
    if (file.size > MAX_FILE_SIZE) throw new WallpaperError(400, '图片文件体积不能超过 15MB')

    const buffer = Buffer.from(await file.arrayBuffer())
    // 真实魔数检测与安全净化
    const detected = detectImageFormat(buffer)

    const filename = `${crypto.randomUUID()}.${detected.ext}`
    const targetPath = resolve(wallpapersDir, filename)
    writeFileSync(targetPath, buffer)

    return {
      filename,
      relativeUrl: `/api/v1/wallpapers/image/${filename}`,
      size: buffer.length,
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

  // 计算指定文件名列表对应的总物理存储体积。
  function getFilesTotalSize(filenames: string[]): number {
    let total = 0
    for (const name of filenames) {
      if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(name)) continue
      const filePath = resolve(wallpapersDir, name)
      if (existsSync(filePath)) {
        try {
          total += statSync(filePath).size
        } catch {
          // 忽略单个文件统计异常
        }
      }
    }
    return total
  }

  return {
    cleanupLocalFile,
    saveUploadFile,
    getImage,
    getFilesTotalSize,
  }
}

