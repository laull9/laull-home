import { ref, type Ref } from 'vue'
import { newWidget, type Bookmark, type Breakpoint, type Desktop, type Placement } from '@laull-home/shared'

// 记录当前正在从文件夹拖拽出的书签条目上下文。
export interface DragFolderItemContext {
  folderWidgetId: string
  folderGroupId: string
  bookmarkId: string
  bookmark?: Bookmark
}

// 全局响应式记录当前被拖动的文件夹内书签。
export const activeDragFolderItem = ref<DragFolderItemContext | null>(null)

// 文件夹子图标拖拽落盘与移出组合式函数。
export function useFolderItemDrag(options: {
  spaceId: Ref<string>
  breakpoint: Ref<Breakpoint>
  data: Ref<Desktop | null>
  bookmarks: Ref<Bookmark[]>
  updateBookmark: (id: string, spaceId: string, payload: { groupId: string | null }) => Promise<Bookmark | null>
  save: () => Promise<void>
  refresh: () => void
}) {
  // 解析文件夹拖拽数据协议串。
  function parseFolderDragData(text: string): DragFolderItemContext | null {
    if (!text || !text.startsWith('folder-item:')) return null
    const parts = text.split(':')
    if (parts.length < 4) return null
    const folderWidgetId = parts[1] || ''
    const folderGroupId = parts[2] || ''
    const bookmarkId = parts[3] || ''
    const bookmark = options.bookmarks.value.find(item => item.id === bookmarkId)
    return { folderWidgetId, folderGroupId, bookmarkId, bookmark }
  }

  // 处理子图标拖拽落入主桌面画布网格。
  async function handleDropToCanvas(dragText: string, targetP: Placement): Promise<boolean> {
    const ctx = parseFolderDragData(dragText) || activeDragFolderItem.value
    activeDragFolderItem.value = null
    if (!ctx || !options.data.value) return false

    const bookmark = ctx.bookmark || options.bookmarks.value.find(item => item.id === ctx.bookmarkId)
    if (!bookmark) return false

    // 1. 将书签从所属分组中移出为独立书签。
    await options.updateBookmark(bookmark.id, options.spaceId.value, { groupId: null })

    // 2. 在桌面落点网格生成脱离底座的独立书签组件。
    const bp = options.breakpoint.value
    const newId = crypto.randomUUID()
    const widget = {
      ...newWidget('bookmark', newId),
      title: bookmark.title,
      referenceId: bookmark.id,
      layouts: {
        desktop: { x: targetP.x, y: targetP.y, w: 1, h: 1, pinned: true },
        [bp]: { x: targetP.x, y: targetP.y, w: 1, h: 1, pinned: true },
      },
      style: { opacity: 100, blur: 0, radius: 16, padding: 8, border: 0, color: '', background: '', frameless: true },
    }

    options.data.value.nodes.push(widget)
    await options.save()
    options.refresh()
    return true
  }

  // 处理外部桌面图标拖入文件夹视窗。
  async function handleDropToFolder(folderGroupId: string, dragText: string): Promise<boolean> {
    if (!folderGroupId || !options.data.value) return false
    // 兼容组件树与桌面已有组件拖入。
    let bookmarkId = ''
    let sourceWidgetId = ''

    if (dragText.startsWith('folder-item:')) {
      const parts = dragText.split(':')
      sourceWidgetId = parts[1] || ''
      bookmarkId = parts[3] || ''
    } else if (dragText.startsWith('new:bookmark:')) {
      const parts = dragText.slice(4).split(':')
      bookmarkId = parts[5] || ''
    }

    if (!bookmarkId) return false
    // 1. 更新书签的分组为当前文件夹分组。
    await options.updateBookmark(bookmarkId, options.spaceId.value, { groupId: folderGroupId })

    // 2. 若来自桌面独立组件，从桌面移除该独立组件。
    if (sourceWidgetId) {
      options.data.value.nodes = options.data.value.nodes.filter(node => node.id !== sourceWidgetId)
      await options.save()
    }

    options.refresh()
    return true
  }

  return {
    activeDragFolderItem,
    parseFolderDragData,
    handleDropToCanvas,
    handleDropToFolder,
  }
}
