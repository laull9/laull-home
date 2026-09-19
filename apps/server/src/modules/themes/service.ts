import { extname } from 'node:path'
import { isThemePackageManifest, scopedCss, type ThemePackageManifest } from '@laull-home/shared'
import type { AppDatabase } from '../../db'
import { createWallpaperStorage } from '../wallpapers/storage'
import { createZip, readZipEntries, ZipError, type ZipEntry, type ZipFileToWrite } from './zip'
import { createSettingsService } from '../settings/service'

// 允许的主题包文件扩展名白名单。
export const ALLOWED_THEME_FILE_EXTENSIONS = new Set([
  '.json', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg',
])

// 主题包业务异常类。
export class ThemePackageError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ThemePackageError'
  }
}

// 检查 SVG 文件内容是否包含潜在的 XSS 攻击脚本。
function validateSvgSafety(content: string): void {
  const dangerousPatterns = [
    /<script\b/i,
    /\bon\w+\s*=/i,
    /javascript:/i,
    /<foreignobject\b/i,
    /<animate\b/i,
    /<set\b/i,
    /xlink:href\s*=\s*["']?javascript:/i,
  ]
  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      throw new ThemePackageError(400, 'SVG 图片中包含不安全的脚本或动态执行内容')
    }
  }
}

// 主题包导入结果数据结构。
export interface ThemeImportResult {
  manifest: ThemePackageManifest
  wallpaperUrl?: string
  applied: boolean
}

// 创建主题包管理与导入导出服务。
export function createThemePackageService(db: AppDatabase, dataDir: string) {
  const wallpaperStorage = createWallpaperStorage(dataDir)
  const settingsService = createSettingsService(db)

  return {
    // 深度检验并解析主题包 ZIP 归档。
    parseAndValidateTheme(buffer: Buffer): { manifest: ThemePackageManifest; wallpaperEntry?: ZipEntry; cssContent?: string } {
      if (!buffer || buffer.length === 0) {
        throw new ThemePackageError(400, '上传的主题包内容为空')
      }

      // 上传压缩包总体积硬限制（最大 15MB）。
      if (buffer.length > 15 * 1024 * 1024) {
        throw new ThemePackageError(400, '主题包体积超出限制（最大允许 15MB）')
      }

      let entries: ZipEntry[]
      try {
        entries = readZipEntries(buffer, {
          maxFileSize: 5 * 1024 * 1024,
          maxTotalSize: 25 * 1024 * 1024,
          maxFiles: 50,
        })
      } catch (err) {
        const msg = err instanceof ZipError ? err.message : '压缩包解析失败'
        throw new ThemePackageError(400, msg)
      }

      // 1. 严格检查所有非目录文件的类型白名单。
      for (const entry of entries) {
        if (entry.isDirectory) continue
        const ext = extname(entry.path).toLowerCase()
        if (!ALLOWED_THEME_FILE_EXTENSIONS.has(ext)) {
          throw new ThemePackageError(400, `主题包中包含不允许的文件类型：${entry.path}（仅支持 .json, .css, .png, .jpg, .webp, .svg）`)
        }

        // 若存在 SVG 文件，做安全清洗检查。
        if (ext === '.svg') {
          validateSvgSafety(entry.data.toString('utf8'))
        }
      }

      // 2. 定位 theme.json 清单文件。
      const manifestEntry = entries.find(e => !e.isDirectory && (e.path === 'theme.json' || e.path.endsWith('/theme.json')))
      if (!manifestEntry) {
        throw new ThemePackageError(400, '主题包中缺少核心 theme.json 描述文件')
      }

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(manifestEntry.data.toString('utf8'))
      } catch {
        throw new ThemePackageError(400, 'theme.json 文件不是有效的 JSON 格式')
      }

      if (!isThemePackageManifest(parsedJson)) {
        throw new ThemePackageError(400, 'theme.json 结构不符合主题包规范')
      }

      const manifest = parsedJson

      // 3. 检查并提取 CSS 内容（来自 manifest 或独立 style.css）。
      let cssContent = manifest.customCss ?? ''
      const styleEntry = entries.find(e => !e.isDirectory && (e.path === 'style.css' || e.path.endsWith('/style.css')))
      if (styleEntry) {
        const fileCss = styleEntry.data.toString('utf8')
        cssContent = cssContent ? `${cssContent}\n${fileCss}` : fileCss
      }

      // 4. CSS 边界安全校验。
      if (cssContent.trim()) {
        try {
          scopedCss(cssContent, '.app-root')
        } catch (err) {
          throw new ThemePackageError(400, `主题 CSS 校验失败：${err instanceof Error ? err.message : '含不支持的规则'}`)
        }
      }

      // 5. 检查壁纸引用文件。
      let wallpaperEntry: ZipEntry | undefined
      if (manifest.wallpaperFile) {
        const cleanWp = manifest.wallpaperFile.replace(/^\/+/, '')
        wallpaperEntry = entries.find(e => !e.isDirectory && e.path === cleanWp)
        if (!wallpaperEntry) {
          throw new ThemePackageError(400, `清单声明的壁纸文件不存在于主题包中：${manifest.wallpaperFile}`)
        }
      }

      return { manifest, wallpaperEntry, cssContent }
    },

    // 导入主题包并持久化应用至指定用户。
    async importTheme(userId: number, buffer: Buffer, applyToCurrent: boolean = true): Promise<ThemeImportResult> {
      const { manifest, wallpaperEntry, cssContent } = this.parseAndValidateTheme(buffer)

      let wallpaperUrl: string | undefined

      // 保存包内附带的壁纸图片。
      if (wallpaperEntry) {
        const saved = await wallpaperStorage.saveUploadFile(new Blob([new Uint8Array(wallpaperEntry.data)]))
        wallpaperUrl = saved.relativeUrl
      }

      if (applyToCurrent) {
        const current = settingsService.get(userId)
        settingsService.update(userId, {
          revision: current.revision,
          title: current.title,
          appearance: current.appearance,
          themeId: 'custom',
          themeConfig: manifest.themeConfig,
          customCss: cssContent ?? '',
          wallpaperType: wallpaperUrl ? 'url' : current.wallpaperType,
          wallpaperValue: wallpaperUrl ?? current.wallpaperValue,
        })
      }

      return {
        manifest,
        wallpaperUrl,
        applied: applyToCurrent,
      }
    },

    // 将当前用户的主题配置、CSS 及壁纸打包导出为标准主题包 ZIP。
    exportTheme(userId: number, themeName: string = '我的自定义主题'): { filename: string; buffer: Buffer } {
      const settings = settingsService.get(userId)
      const files: ZipFileToWrite[] = []

      const manifest: ThemePackageManifest = {
        name: themeName,
        version: '1.0.0',
        description: '从 laull-home 导出的主题包',
        themeConfig: settings.themeConfig ?? { version: 1, seed: '#2563eb', customSeed: false, opacity: 95, blur: 16, radius: 16, gap: 16, wallpaperDim: 0, wallpaperBlur: 0, light: {}, dark: {}, themeColors: {} },
      }

      // 导出自定义 CSS 规则。
      if (settings.customCss && settings.customCss.trim()) {
        files.push({
          path: 'style.css',
          data: Buffer.from(settings.customCss, 'utf8'),
        })
        manifest.customCss = settings.customCss
      }

      // 导出关联的本地壁纸文件。
      if (settings.wallpaperType === 'url' && settings.wallpaperValue && settings.wallpaperValue.startsWith('/api/v1/wallpapers/image/')) {
        const filename = settings.wallpaperValue.replace('/api/v1/wallpapers/image/', '')
        const localImage = wallpaperStorage.getImage(filename)
        if (localImage) {
          const wpPath = `wallpaper.${extname(filename).replace('.', '') || 'jpg'}`
          files.push({
            path: wpPath,
            data: localImage.buffer,
          })
          manifest.wallpaperFile = wpPath
        }
      }

      // 写入 theme.json。
      files.push({
        path: 'theme.json',
        data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
      })

      const zipBuffer = createZip(files)
      const safeName = themeName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_') || 'theme'
      return {
        filename: `laull-theme-${safeName}.zip`,
        buffer: zipBuffer,
      }
    },
  }
}

// 导出 ThemePackageService 类型。
export type ThemePackageService = ReturnType<typeof createThemePackageService>
