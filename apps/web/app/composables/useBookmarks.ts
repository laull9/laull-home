import type {
  Bookmark,
  BookmarkGroup,
  CreateBookmarkGroupInput,
  CreateBookmarkInput,
  ReorderBookmarkGroupsInput,
  ReorderBookmarksInput,
  UpdateBookmarkGroupInput,
  UpdateBookmarkInput,
} from "@laull-home/shared"
import { getCachedBookmarks, setCachedBookmarks, isPrivacySpace } from '../utils/localCache'

// 书签与分组客户端数据管理。
export function useBookmarks() {
  const groups = useState<BookmarkGroup[]>("bookmarks:groups", () => [])
  const bookmarks = useState<Bookmark[]>("bookmarks:list", () => [])
  const loading = ref(false)
  const error = ref("")
  const { $api } = useNuxtApp()
  // 多处发起重读时只接纳最新请求。
  const readVersion = useState<number>('bookmarks:read-version', () => 0)

  // 读取指定空间下的分组与书签，普通空间优先使用本地缓存，隐私空间严格隔离。
  async function loadData(spaceId = "default") {
    const requestVersion = ++readVersion.value
    error.value = ""

    // 1. 普通空间优先尝试从本地持久化缓存还原书签与分组，实现即时上屏。
    let hasLocalSnapshot = false
    if (!isPrivacySpace(spaceId)) {
      const cached = getCachedBookmarks<{ groups: BookmarkGroup[]; bookmarks: Bookmark[] }>(spaceId)
      if (cached) {
        if (Array.isArray(cached.groups)) groups.value = cached.groups
        if (Array.isArray(cached.bookmarks)) bookmarks.value = cached.bookmarks
        hasLocalSnapshot = true
      }
    }

    if (!hasLocalSnapshot) {
      loading.value = true
    }

    try {
      const [groupsRes, bookmarksRes] = await Promise.all([
        $api.bookmarks.groups.get({ query: { spaceId } }),
        $api.bookmarks.get({ query: { spaceId } }),
      ])
      if (requestVersion !== readVersion.value) return
      const isGroups304 = groupsRes.status === 304
      const isBookmarks304 = bookmarksRes.status === 304
      if ((groupsRes.error && !isGroups304) || (bookmarksRes.error && !isBookmarks304)) {
        throw new Error('书签读取失败或空间授权已过期')
      }
      if (groupsRes.data) groups.value = groupsRes.data.groups
      if (bookmarksRes.data) bookmarks.value = bookmarksRes.data.bookmarks

      // 普通空间同步更新最新快照到本地缓存。
      if (!isPrivacySpace(spaceId) && groupsRes.data && bookmarksRes.data) {
        setCachedBookmarks(spaceId, {
          groups: groupsRes.data.groups,
          bookmarks: bookmarksRes.data.bookmarks,
        })
      }
    } catch (err: unknown) {
      if (requestVersion === readVersion.value && !hasLocalSnapshot) {
        error.value = err instanceof Error ? err.message : "加载书签失败"
      }
    } finally {
      if (requestVersion === readVersion.value) loading.value = false
    }
  }

  // 创建新书签分组。
  async function createGroup(input: CreateBookmarkGroupInput) {
    const res = await $api.bookmarks.groups.post(input)
    if (res.error) throw new Error(res.error.value?.message ?? "创建分组失败")
    await loadData(input.spaceId)
    return res.data?.group
  }

  // 更新书签分组。
  async function updateGroup(id: string, spaceId: string, input: UpdateBookmarkGroupInput) {
    const res = await $api.bookmarks.groups({ id }).put(input)
    if (res.error) throw new Error(res.error.value?.message ?? "更新分组失败")
    await loadData(spaceId)
    return res.data?.group
  }

  // 删除书签分组。
  async function deleteGroup(id: string, spaceId: string) {
    const res = await $api.bookmarks.groups({ id }).delete()
    if (res.error) throw new Error(res.error.value?.message ?? "删除分组失败")
    await loadData(spaceId)
  }

  // 批量重排分组。
  async function reorderGroups(spaceId: string, input: ReorderBookmarkGroupsInput) {
    const res = await $api.bookmarks.groups.reorder.post(input, { query: { spaceId } })
    if (res.error) throw new Error(res.error.value?.message ?? "重排分组失败")
    await loadData(spaceId)
  }

  // 创建新书签。
  async function createBookmark(spaceId: string, input: CreateBookmarkInput) {
    const res = await $api.bookmarks.post(input)
    if (res.error) throw new Error(res.error.value?.message ?? "创建书签失败")
    await loadData(spaceId)
    return res.data?.bookmark
  }

  // 更新书签。
  async function updateBookmark(id: string, spaceId: string, input: UpdateBookmarkInput) {
    const res = await $api.bookmarks({ id }).put(input)
    if (res.error) throw new Error(res.error.value?.message ?? "更新书签失败")
    await loadData(spaceId)
    return res.data?.bookmark
  }

  // 删除书签。
  async function deleteBookmark(id: string, spaceId: string) {
    const res = await $api.bookmarks({ id }).delete()
    if (res.error) throw new Error(res.error.value?.message ?? "删除书签失败")
    await loadData(spaceId)
  }

  // 批量重读书签。
  async function reorderBookmarks(spaceId: string, input: ReorderBookmarksInput) {
    const res = await $api.bookmarks.reorder.post(input)
    if (res.error) throw new Error(res.error.value?.message ?? "重读书签顺序失败")
    await loadData(spaceId)
  }

  // 上传自定义图标文件并返回持久化访问路径。
  async function uploadFavicon(file: File | Blob): Promise<string> {
    const payloadFile = file instanceof File ? file : new File([file], "icon.bin", { type: file.type || "application/octet-stream" })
    const res = await $api.favicon.upload.post({ file: payloadFile })
    if (res.error) throw new Error(res.error.value?.message ?? "上传图标失败")
    return res.data?.iconUrl ?? ""
  }

  // 探测站点 Favicon 图标并缓存：优先使用 Favicon.im，并在客户端环境嗅探下载与自动上传保存。
  async function fetchFavicon(targetUrl: string): Promise<string> {
    if (!targetUrl) return ""
    let origin = ""
    let hostname = ""
    try {
      const parsed = new URL(targetUrl)
      origin = parsed.origin
      hostname = parsed.hostname.toLowerCase()
    } catch {
      // 忽略非法 URL 格式
    }

    const isPrivate = !hostname || hostname === "localhost" || hostname === "127.0.0.1" ||
      hostname.endsWith(".local") || hostname.endsWith(".lan") ||
      /^192\.168\./.test(hostname) || /^10\./.test(hostname) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)

    // 1. 整理候选嗅探地址列表：公网站点优先使用 Favicon.im 高清接口
    const candidates: string[] = []
    if (hostname && !isPrivate) {
      candidates.push(`https://favicon.im/${hostname}?larger=true`)
      candidates.push(`https://favicon.im/${hostname}`)
      if (hostname.startsWith("www.")) {
        candidates.push(`https://favicon.im/${hostname.slice(4)}?larger=true`)
      }
      candidates.push(`https://icon.horse/icon/${hostname}`)
      candidates.push(`https://unavatar.io/${hostname}`)
    }
    if (origin) {
      candidates.push(
        new URL("/favicon.ico", origin).toString(),
        new URL("/favicon.png", origin).toString(),
        new URL("/favicon.svg", origin).toString(),
        new URL("/apple-touch-icon.png", origin).toString(),
      )
    }

    // 2. 向服务端请求解析 HTML 页面声明的候选地址或读取已有缓存
    try {
      const res = await $api.favicon.fetch.post({ url: targetUrl })
      if (res.data?.iconUrl) {
        return res.data.iconUrl
      }
      if (res.data?.candidateUrls) {
        for (const u of res.data.candidateUrls) {
          if (!candidates.includes(u)) {
            // Favicon.im 始终保持最前，其余地址按顺序追加
            if (u.includes("favicon.im")) {
              candidates.unshift(u)
            } else {
              candidates.push(u)
            }
          }
        }
      } else if (res.data?.svgUrl && !candidates.includes(res.data.svgUrl)) {
        candidates.push(res.data.svgUrl)
      }
    } catch {
      // 若服务端解析失败（如境外站点无代理或内网拦截），由客户端依靠浏览器网络直探
    }

    // 3. 客户端依次在浏览器端嗅探下载候选图标并自动上传
    for (const probeUrl of candidates) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 4000)
        const probeRes = await fetch(probeUrl, { signal: controller.signal })
        clearTimeout(timer)

        if (probeRes.ok) {
          const blob = await probeRes.blob()
          // 过滤空文件及误把错误页 HTML 当成图片的情况
          if (blob.size > 0 && !blob.type.includes("text/html")) {
            const uploaded = await uploadFavicon(blob)
            if (uploaded) return uploaded
          }
        }
      } catch {
        // 忽略跨域阻断、超时或单个地址异常
      }
    }

    return ""
  }

  return {
    groups,
    bookmarks,
    loading,
    error,
    loadData,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
    createBookmark,
    updateBookmark,
    deleteBookmark,
    reorderBookmarks,
    fetchFavicon,
    uploadFavicon,
  }
}
