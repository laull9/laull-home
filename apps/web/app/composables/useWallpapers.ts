import type {
  BatchWallpaperItem,
  CreateWallpaperInput,
  HomeSettings,
  UpdateWallpaperInput,
  WallpaperItem,
  WallpaperPool,
  WallpaperQuotaInfo,
} from '@laull-home/shared'

// 全局自动轮换定时器引用。
let rotateTimer: ReturnType<typeof setInterval> | null = null

// 壁纸池与轮换控制状态管理。
export function useWallpapers() {
  const { $api } = useNuxtApp()
  const { settings, applyTheme } = useTheme()
  const { user } = useAuth()

  // 全局共享图片池列表。
  const pools = useState<WallpaperPool[]>('wallpapers:pools', () => [])
  // 当前界面选中的查看图片池标识。
  const selectedPoolId = useState<string>('wallpapers:selectedPoolId', () => '')
  // 全局共享当前选中图片池的壁纸列表。
  const wallpapers = useState<WallpaperItem[]>('wallpapers:list', () => [])
  // 全局图库存储配额使用状态。
  const quota = useState<WallpaperQuotaInfo | null>('wallpapers:quota', () => null)
  // 请求加载中状态。
  const loading = ref(false)
  // 操作错误提示。
  const errorMsg = ref('')

  // 获取当前图库上传配额。
  async function fetchQuota(): Promise<WallpaperQuotaInfo | null> {
    if (!user.value) return null
    try {
      const res = await $api.wallpapers.quota.get()
      if (res.data?.quota) {
        quota.value = res.data.quota
        return res.data.quota
      }
      return null
    } catch {
      return null
    }
  }

  // 获取所有图片池列表。
  async function fetchPools(): Promise<WallpaperPool[]> {
    if (!user.value) return []
    void fetchQuota()
    try {
      const res = await $api.wallpapers.pools.get()
      if (res.data) {
        pools.value = res.data.pools
        if (!selectedPoolId.value || !pools.value.some(p => p.id === selectedPoolId.value)) {
          selectedPoolId.value = settings.value?.activeWallpaperPoolId || pools.value[0]?.id || ''
        }
        return res.data.pools
      }
      return []
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : '获取图片池列表失败'
      return []
    }
  }

  // 创建新图片池。
  async function createPool(name: string): Promise<WallpaperPool | null> {
    errorMsg.value = ''
    try {
      const res = await $api.wallpapers.pools.post({ name })
      if (res.data) {
        const pool = res.data.pool
        pools.value = [...pools.value, pool]
        selectedPoolId.value = pool.id
        wallpapers.value = []
        return pool
      }
      throw new Error(res.error?.value ? String(res.error.value) : '创建图片池失败')
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : '创建图片池失败'
      throw err
    }
  }

  // 更新图片池名称。
  async function updatePool(id: string, name: string): Promise<WallpaperPool | null> {
    errorMsg.value = ''
    try {
      const res = await $api.wallpapers.pools({ id }).put({ name })
      if (res.data) {
        const updated = res.data.pool
        pools.value = pools.value.map(p => p.id === id ? updated : p)
        return updated
      }
      throw new Error(res.error?.value ? String(res.error.value) : '更新图片池失败')
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : '更新图片池失败'
      throw err
    }
  }

  // 删除图片池。
  async function deletePool(id: string): Promise<boolean> {
    errorMsg.value = ''
    try {
      const res = await $api.wallpapers.pools({ id }).delete()
      if (res.data?.success) {
        pools.value = pools.value.filter(p => p.id !== id)
        if (selectedPoolId.value === id) {
          selectedPoolId.value = pools.value[0]?.id || ''
          if (selectedPoolId.value) {
            await fetchWallpapers(selectedPoolId.value)
          } else {
            wallpapers.value = []
          }
        }
        return true
      }
      throw new Error(res.error?.value ? String(res.error.value) : '删除图片池失败')
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : '删除图片池失败'
      throw err
    }
  }

  // 切换并将指定图片池设为当前使用。
  async function setActivePool(poolId: string): Promise<boolean> {
    if (!settings.value) return false
    errorMsg.value = ''
    try {
      const nextSettings: HomeSettings = {
        ...settings.value,
        activeWallpaperPoolId: poolId,
      }
      applyTheme(nextSettings)
      if (user.value) {
        const res = await $api.settings.put(nextSettings)
        if (res.data) {
          settings.value.revision = res.data.revision
          settings.value.activeWallpaperPoolId = poolId
        }
      }
      return true
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : '设置当前使用图片池失败'
      throw err
    }
  }

  // 获取壁纸列表（支持按池筛选）。
  async function fetchWallpapers(poolId?: string): Promise<WallpaperItem[]> {
    if (!user.value) return []
    loading.value = true
    errorMsg.value = ''
    try {
      const targetId = poolId || selectedPoolId.value || settings.value?.activeWallpaperPoolId
      const res = await $api.wallpapers.get({ query: targetId ? { poolId: targetId } : {} })
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
      const targetPool = input.poolId || selectedPoolId.value
      const res = await $api.wallpapers.post({ ...input, poolId: targetPool })
      if (res.data) {
        wallpapers.value = [res.data.wallpaper, ...wallpapers.value]
        const pool = pools.value.find(p => p.id === targetPool)
        if (pool && pool.count !== undefined) pool.count++
        return res.data.wallpaper
      }
      throw new Error(res.error?.value ? String(res.error.value) : '添加失败')
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : '添加失败'
      throw err
    }
  }

  // 批量导入外部图片链接。
  async function addWallpapersBatch(items: BatchWallpaperItem[], poolId?: string): Promise<WallpaperItem[]> {
    errorMsg.value = ''
    try {
      const targetPool = poolId || selectedPoolId.value
      const res = await $api.wallpapers.batch.post({ items, poolId: targetPool })
      if (res.data) {
        const added = res.data.wallpapers
        wallpapers.value = [...added, ...wallpapers.value]
        const pool = pools.value.find(p => p.id === targetPool)
        if (pool && pool.count !== undefined) pool.count += added.length
        return added
      }
      throw new Error(res.error?.value ? String(res.error.value) : '批量导入失败')
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : '批量导入失败'
      throw err
    }
  }

  // 上传本地图片文件。
  async function uploadWallpaper(file: File, name?: string, poolId?: string, fitMode?: string): Promise<WallpaperItem | null> {
    errorMsg.value = ''
    try {
      const targetPool = poolId || selectedPoolId.value
      const res = await $api.wallpapers.upload.post({ file, name, poolId: targetPool, fitMode })
      if (res.data) {
        wallpapers.value = [res.data.wallpaper, ...wallpapers.value]
        const pool = pools.value.find(p => p.id === targetPool)
        if (pool && pool.count !== undefined) pool.count++
        void fetchQuota()
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

  // 删除单张壁纸。
  async function deleteWallpaper(id: string): Promise<boolean> {
    errorMsg.value = ''
    try {
      const res = await $api.wallpapers({ id }).delete()
      if (res.data?.success) {
        wallpapers.value = wallpapers.value.filter(item => item.id !== id)
        const pool = pools.value.find(p => p.id === selectedPoolId.value)
        if (pool && pool.count !== undefined) pool.count = Math.max(0, pool.count - 1)
        void fetchQuota()
        return true
      }
      throw new Error(res.error?.value ? String(res.error.value) : '删除失败')
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : '删除失败'
      throw err
    }
  }

  // 批量删除壁纸。
  async function deleteWallpapersBatch(ids: string[]): Promise<boolean> {
    if (!ids || ids.length === 0) return false
    errorMsg.value = ''
    try {
      const res = await $api.wallpapers['batch-delete'].post({ ids })
      if (res.data?.success) {
        const set = new Set(ids)
        wallpapers.value = wallpapers.value.filter(item => !set.has(item.id))
        const pool = pools.value.find(p => p.id === selectedPoolId.value)
        if (pool && pool.count !== undefined) {
          pool.count = Math.max(0, pool.count - ids.length)
        }
        void fetchQuota()
        return true
      }
      throw new Error(res.error?.value ? String(res.error.value) : '批量删除失败')
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : '批量删除失败'
      throw err
    }
  }

  // 轮换切换至下一张壁纸。
  async function rotateNext(): Promise<{ success: boolean; url?: string; reason?: string }> {
    const activePoolId = settings.value?.activeWallpaperPoolId || pools.value[0]?.id
    let pool = wallpapers.value
    if (pool.length === 0 || (activePoolId && pool[0] && pool[0].poolId !== activePoolId)) {
      pool = await fetchWallpapers(activePoolId)
    }
    if (pool.length === 0) {
      return { success: false, reason: '当前使用的图片池为空，请先添加壁纸' }
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
    pools,
    selectedPoolId,
    wallpapers,
    quota,
    loading,
    errorMsg,
    fetchPools,
    fetchQuota,
    createPool,
    updatePool,
    deletePool,
    setActivePool,
    fetchWallpapers,
    addWallpaper,
    addWallpapersBatch,
    uploadWallpaper,
    updateWallpaper,
    deleteWallpaper,
    deleteWallpapersBatch,
    rotateNext,
    setupAutoRotate,
  }
}
