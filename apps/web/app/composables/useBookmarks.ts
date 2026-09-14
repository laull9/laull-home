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

// 书签与分组客户端数据管理。
export function useBookmarks() {
  const groups = useState<BookmarkGroup[]>("bookmarks:groups", () => [])
  const bookmarks = useState<Bookmark[]>("bookmarks:list", () => [])
  const loading = ref(false)
  const error = ref("")
  const { $api } = useNuxtApp()
  // 多处发起重读时只接纳最新请求。
  const readVersion = useState<number>('bookmarks:read-version', () => 0)

  // 读取指定空间下的分组与书签。
  async function loadData(spaceId = "default") {
    const requestVersion = ++readVersion.value
    groups.value = []
    bookmarks.value = []
    loading.value = true
    error.value = ""
    try {
      const [groupsRes, bookmarksRes] = await Promise.all([
        $api.bookmarks.groups.get({ query: { spaceId } }),
        $api.bookmarks.get({ query: { spaceId } }),
      ])
      if (requestVersion !== readVersion.value) return
      if (groupsRes.error || bookmarksRes.error) throw new Error('书签读取失败或空间授权已过期')
      if (groupsRes.data) groups.value = groupsRes.data.groups
      if (bookmarksRes.data) bookmarks.value = bookmarksRes.data.bookmarks
    } catch (err: unknown) {
      if (requestVersion === readVersion.value) error.value = err instanceof Error ? err.message : "加载书签失败"
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

  // 探测站点 Favicon 图标并缓存。
  async function fetchFavicon(targetUrl: string): Promise<string> {
    const res = await $api.favicon.fetch.post({ url: targetUrl })
    if (res.error) throw new Error(res.error.value?.message ?? "获取图标失败")
    return res.data?.iconUrl ?? ""
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
  }
}
