import type { CreateWallpaperInput, HomeSettings, UpdateWallpaperInput, WallpaperItem } from '@laull-home/shared'

// 全局自动轮换定时器引用。
let rotateTimer: ReturnType<typeof setInterval> | null = null

// 壁纸池与轮换控制状态管理。
export function useWallpapers() {
  const { $api } = useNuxtApp()
  const { settings, applyTheme } = useTheme()
  const { user } = useAuth()

  // 全局共享壁纸池列表。
  const wallpapers = useState<WallpaperItem[]>('wallpapers:list', () => [])
  // 请求加载中状态。
  const loading = ref(false)
  // 操作错误提示。
  const errorMsg = ref('')

  // 获取壁纸列表。
  async function fetchWallpapers(): Promise<WallpaperItem[]> {
    if (!user.value) return []
    loading.value = true
    errorMsg.value = ''
    try {
      const res = await $api.wallpapers.get()
      if (res.data) {
        wallpapers.value = res.data.wallpapers
        return res.data.wallpapers
      }
      return []
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : '获取壁纸列表失败'
      return []
    } finally {
      loading.value = false
    }
  }

  // 导入外部图片链接。
  async function addWallpaper(input: CreateWallpaperInput): Promise<WallpaperItem | null> {
    errorMsg.value = ''
    try {
      const res = await $api.wallpapers.post(input)
      if (res.data) {
        wallpapers.value = [res.data.wallpaper, ...wallpapers.value]
        return res.data.wallpaper
      }
      throw new Error(res.error?.value ? String(res.error.value) : '添加失败')
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : '添加失败'
      throw err
    }
  }

  // 上传本地图片文件。
  async function uploadWallpaper(file: File, name?: string): Promise<WallpaperItem | null> {
    errorMsg.value = ''
    try {
      const res = await $api.wallpapers.upload.post({ file, name })
      if (res.data) {
        wallpapers.value = [res.data.wallpaper, ...wallpapers.value]
        return res.data.wallpaper
      }
      throw new Error(res.error?.value ? String(res.error.value) : '上传失败')
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : '上传失败'
      throw err
    }
  }

  // 更新壁纸信息。
  async function updateWallpaper(id: string, input: UpdateWallpaperInput): Promise<WallpaperItem | null> {
    errorMsg.value = ''
    try {
      const res = await $api.wallpapers({ id }).put(input)
      if (res.data) {
        const updated = res.data.wallpaper
        wallpapers.value = wallpapers.value.map(item => item.id === id ? updated : item)
        return updated
      }
      throw new Error(res.error?.value ? String(res.error.value) : '更新失败')
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : '更新失败'
      throw err
    }
  }

  // 删除壁纸。
  async function deleteWallpaper(id: string): Promise<boolean> {
    errorMsg.value = ''
    try {
      const res = await $api.wallpapers({ id }).delete()
      if (res.data?.success) {
        wallpapers.value = wallpapers.value.filter(item => item.id !== id)
        return true
      }
      throw new Error(res.error?.value ? String(res.error.value) : '删除失败')
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : '删除失败'
      throw err
    }
  }

  // 轮换切换至下一张壁纸。
  async function rotateNext(): Promise<{ success: boolean; url?: string; reason?: string }> {
    let pool = wallpapers.value
    if (pool.length === 0) {
      pool = await fetchWallpapers()
    }
    if (pool.length === 0) {
      return { success: false, reason: '图片池为空，请先在设置中添加壁纸' }
    }

    const currentUrl = settings.value?.wallpaperValue ?? ''
    const currentIndex = pool.findIndex(item => item.url === currentUrl)
    const nextIndex = (currentIndex + 1) % pool.length
    const nextWallpaper = pool[nextIndex]
    if (!nextWallpaper) return { success: false, reason: '未找到下一张壁纸' }

    if (settings.value) {
      const nextSettings: HomeSettings = {
        ...settings.value,
        wallpaperType: 'pool',
        wallpaperValue: nextWallpaper.url,
      }
      applyTheme(nextSettings)

      // 登录状态在后台同步保存当前选择。
      if (user.value) {
        try {
          const res = await $api.settings.put(nextSettings)
          if (res.data) {
            settings.value.revision = res.data.revision
          }
        } catch {
          // 静默处理轮换保存网络波动
        }
      }
    }

    return { success: true, url: nextWallpaper.url }
  }

  // 启动或更新定时轮换调度。
  function setupAutoRotate() {
    if (import.meta.server) return
    if (rotateTimer) {
      clearInterval(rotateTimer)
      rotateTimer = null
    }

    const current = settings.value
    if (current && current.wallpaperType === 'pool' && current.wallpaperAutoRotate && current.wallpaperRotateInterval) {
      const intervalMs = Math.max(1, current.wallpaperRotateInterval) * 60 * 1000
      rotateTimer = setInterval(() => {
        void rotateNext()
      }, intervalMs)
    }
  }

  return {
    wallpapers,
    loading,
    errorMsg,
    fetchWallpapers,
    addWallpaper,
    uploadWallpaper,
    updateWallpaper,
    deleteWallpaper,
    rotateNext,
    setupAutoRotate,
  }
}
