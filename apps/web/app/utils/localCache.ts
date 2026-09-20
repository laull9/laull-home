// 本地缓存数据包装结构。
export interface CachedItem<T> {
  // 缓存写入时间戳。
  timestamp: number
  // 数据内容。
  data: T
}

// 缓存键名前缀。
const CACHE_PREFIX = 'lh_cache:'

// 检查是否在浏览器环境中运行。
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

// 判断指定空间标识是否属于受保护的隐私空间。
export function isPrivacySpace(spaceId?: string | null): boolean {
  if (!spaceId) return false
  const s = spaceId.trim().toLowerCase()
  return s === 'privacy' || s.includes('privacy')
}

// 读取指定键名的本地持久化缓存。
export function getLocalCache<T>(key: string): T | null {
  if (!isBrowser()) return null
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedItem<T>
    return parsed?.data ?? null
  } catch {
    return null
  }
}

// 写入指定键名的本地持久化缓存。
export function setLocalCache<T>(key: string, data: T): void {
  if (!isBrowser()) return
  try {
    const item: CachedItem<T> = {
      timestamp: Date.now(),
      data,
    }
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item))
  } catch {
    // 捕获配额超限或隐私模式存储异常，静默安全降级。
  }
}

// 移除指定键名的本地缓存。
export function removeLocalCache(key: string): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(CACHE_PREFIX + key)
  } catch {
    // 忽略移除异常
  }
}

// 读取指定空间的桌面画布缓存，隐私空间严格拒绝并返回 null。
export function getCachedDesktop<T>(spaceId: string): T | null {
  if (isPrivacySpace(spaceId)) return null
  return getLocalCache<T>(`desktop:${spaceId}`)
}

// 写入指定空间的桌面画布缓存，隐私空间严格拒绝写入。
export function setCachedDesktop<T>(spaceId: string, data: T): void {
  if (isPrivacySpace(spaceId)) return
  setLocalCache(`desktop:${spaceId}`, data)
}

// 读取指定空间的书签与分组缓存，隐私空间严格拒绝并返回 null。
export function getCachedBookmarks<T>(spaceId: string): T | null {
  if (isPrivacySpace(spaceId)) return null
  return getLocalCache<T>(`bookmarks:${spaceId}`)
}

// 写入指定空间的书签与分组缓存，隐私空间严格拒绝写入。
export function setCachedBookmarks<T>(spaceId: string, data: T): void {
  if (isPrivacySpace(spaceId)) return
  setLocalCache(`bookmarks:${spaceId}`, data)
}

// 读取外观与系统全局设置缓存。
export function getCachedSettings<T>(): T | null {
  return getLocalCache<T>('settings')
}

// 写入外观与系统全局设置缓存。
export function setCachedSettings<T>(data: T): void {
  setLocalCache('settings', data)
}

// 读取搜索引擎列表本地缓存。
export function getCachedSearchEngines<T>(): T | null {
  return getLocalCache<T>('search_engines')
}

// 写入搜索引擎列表本地缓存。
export function setCachedSearchEngines<T>(data: T): void {
  setLocalCache('search_engines', data)
}

// 清除所有已缓存的业务数据（用户登出时统一调用）。
export function clearAllLocalCaches(): void {
  if (!isBrowser()) return
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k)
    }
  } catch {
    // 忽略清理异常
  }
}
