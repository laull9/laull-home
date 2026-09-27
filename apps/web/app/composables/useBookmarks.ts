import { findBrowserIcon, persistBrowserIcon } from "../utils/favicon"
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
      groups.value = []
      bookmarks.value = []
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

  // 服务端缓存优先，网络或跨域受限时用浏览器验证图片直链。
  async function fetchFavicon(targetUrl: string, forceRefresh = false): Promise<string> {
    let site: URL
    try {
      site = new URL(targetUrl)
      if (!["http:", "https:"].includes(site.protocol) || site.username || site.password) return ""
    } catch {
      return ""
    }
    const candidates: string[] = []
    try {
      const res = await $api.favicon.fetch.post({ url: targetUrl, forceRefresh })
      if (res.data?.iconUrl) return res.data.iconUrl
      candidates.push(...(res.data?.candidateUrls ?? []))
      if (res.data?.svgUrl) candidates.push(res.data.svgUrl)
    } catch {
      // 浏览器可访问的站点未必能由服务器访问。
    }
    const direct: string[] = []
    for (const path of ["favicon.ico", "favicon.svg", "favicon.png", "apple-touch-icon.png"]) {
      direct.push(new URL(path, site).href, new URL('/' + path, site.origin).href)
    }
    // 已发现的声明优先；公共图标源放在本站路径之后。
    const providers = new Set(['favicon.im', 'www.google.com', 'icon.horse', 'unavatar.io'])
    const declared = candidates.filter(url => {
      try { return !providers.has(new URL(url).hostname) } catch { return false }
    })
    const publicUrls = candidates.filter(url => !declared.includes(url))
    const host = site.hostname.toLowerCase()
    const privateHost = !host.includes('.') || host.includes(':') || /^(?:127|10|0|192\.168|169\.254|172\.(?:1[6-9]|2\d|3[01]))\./.test(host) || /\.(?:local|lan|localhost)$/.test(host)
    if (!privateHost) {
      publicUrls.push(`https://favicon.im/${host}?larger=true`, `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`, `https://icon.horse/icon/${host}`)
    }
    const icon = await findBrowserIcon([...declared, ...direct, ...publicUrls])
    return persistBrowserIcon(icon, uploadFavicon)
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
