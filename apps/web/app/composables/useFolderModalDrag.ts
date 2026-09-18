import { ref, type Ref } from 'vue'
import type { Bookmark } from '@laull-home/shared'
import { activeDragFolderItem } from './useFolderItemDrag'

// 视窗边界矩形结构。
export interface ViewportBounds {
  left: number
  right: number
  top: number
  bottom: number
}

// 文件夹弹窗拖拽选项。
export interface UseFolderModalDragOptions {
  folderNodeId?: string
  folderGroupId?: string
  items: () => Bookmark[]
  viewportRef: Ref<HTMLElement | null>
  emitClose: () => void
  emitRefresh: () => void
}

// 文件夹弹窗拖拽交互与移出桌面编排。
export function useFolderModalDrag(options: UseFolderModalDragOptions) {
  const { updateBookmark, reorderBookmarks } = useBookmarks()
  const { activeSpaceId } = useSpaces()

  // 当前条目是否已被拖出视窗外部。
  const isDraggedOutside = ref(false)
  // 外部条目拖入悬浮状态。
  const isDragOver = ref(false)
  // 当前正在被拖拽的内部书签对象。
  const draggingBookmark = ref<Bookmark | null>(null)
  // 当前拖拽悬停的目标书签标识。
  const dragOverBookmarkId = ref<string | null>(null)
  // 拖拽插入位置指示。
  const dragInsertPos = ref<'before' | 'after' | null>(null)

  // 视窗边界矩形缓存。
  let cachedViewportRect: ViewportBounds | null = null
  // 独立脱离视窗的拖拽镜像节点引用。
  let dragGhostEl: HTMLElement | null = null
  // 拖拽结束时间戳防遮罩误点击。
  let lastDragEndTime = 0

  // 全局捕获拖拽坐标以精准判定脱离视窗状态。
  function handleGlobalDragOver(event: DragEvent) {
    if (!cachedViewportRect) return
    // 过滤原生拖拽空坐标 (0, 0)，防止拖拽初期误判为外部。
    if (event.clientX === 0 && event.clientY === 0) return

    const { left, right, top, bottom } = cachedViewportRect
    const buffer = 16
    const isFarOutside =
      event.clientX < left - buffer ||
      event.clientX > right + buffer ||
      event.clientY < top - buffer ||
      event.clientY > bottom + buffer

    // 一旦超出边界拖到外部，立即关闭文件夹视窗，绝不再因经过原区域而重新唤出。
    if (isFarOutside && !isDraggedOutside.value) {
      isDraggedOutside.value = true
      options.emitClose()
    }
  }

  // 拖拽文件夹条目开始。
  function handleItemDragStart(event: DragEvent, item: Bookmark) {
    draggingBookmark.value = item
    isDraggedOutside.value = false
    if (options.viewportRef.value) {
      const r = options.viewportRef.value.getBoundingClientRect()
      cachedViewportRect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    }
    document.addEventListener('dragover', handleGlobalDragOver, true)

    // 构建独立拖拽镜像节点，确保在外部拖动时图标始终清晰可见。
    const targetEl = event.currentTarget as HTMLElement | null
    if (targetEl && event.dataTransfer?.setDragImage) {
      const clone = targetEl.cloneNode(true) as HTMLElement
      clone.style.position = 'fixed'
      clone.style.left = '-9999px'
      clone.style.top = '-9999px'
      clone.style.zIndex = '-1'
      clone.style.pointerEvents = 'none'
      clone.style.opacity = '0.95'
      document.body.appendChild(clone)
      dragGhostEl = clone
      const r = targetEl.getBoundingClientRect()
      event.dataTransfer.setDragImage(clone, event.clientX - r.left, event.clientY - r.top)
    }

    activeDragFolderItem.value = {
      folderWidgetId: options.folderNodeId || '',
      folderGroupId: options.folderGroupId || item.groupId || '',
      bookmarkId: item.id,
      bookmark: item,
    }
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copyMove'
      event.dataTransfer.setData('text/plain', `folder-item:${options.folderNodeId || ''}:${options.folderGroupId || item.groupId || ''}:${item.id}`)
    }
  }

  // 内部条目间拖拽悬停计算插入位置。
  function handleItemDragOver(event: DragEvent, targetItem: Bookmark) {
    if (!draggingBookmark.value || draggingBookmark.value.id === targetItem.id) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'

    const targetEl = event.currentTarget as HTMLElement | null
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect()
      const isAfter = event.clientX - rect.left > rect.width / 2
      dragOverBookmarkId.value = targetItem.id
      dragInsertPos.value = isAfter ? 'after' : 'before'
    }
  }

  // 内部条目间拖拽离开清除目标标识。
  function handleItemDragLeave(event: DragEvent, targetItem: Bookmark) {
    if (dragOverBookmarkId.value === targetItem.id) {
      dragOverBookmarkId.value = null
      dragInsertPos.value = null
    }
  }

  // 内部条目间释放完成重新排序。
  async function handleItemDrop(event: DragEvent, targetItem: Bookmark) {
    const source = draggingBookmark.value
    if (!source || source.id === targetItem.id) return
    event.preventDefault()
    event.stopPropagation()

    const currentList = [...options.items()]
    const fromIndex = currentList.findIndex(b => b.id === source.id)
    const toIndex = currentList.findIndex(b => b.id === targetItem.id)
    if (fromIndex !== -1 && toIndex !== -1) {
      currentList.splice(fromIndex, 1)
      const insertIdx = dragInsertPos.value === 'after'
        ? (fromIndex < toIndex ? toIndex : toIndex + 1)
        : (fromIndex < toIndex ? toIndex - 1 : toIndex)
      currentList.splice(Math.max(0, Math.min(currentList.length, insertIdx)), 0, source)

      const targetGroupId = options.folderGroupId || source.groupId || targetItem.groupId
      if (targetGroupId) {
        await reorderBookmarks(activeSpaceId.value, {
          groupId: targetGroupId,
          bookmarkIds: currentList.map(b => b.id),
        })
        options.emitRefresh()
      }
    }

    dragOverBookmarkId.value = null
    dragInsertPos.value = null
    draggingBookmark.value = null
  }

  // 拖拽结束恢复清理状态。
  function handleItemDragEnd() {
    document.removeEventListener('dragover', handleGlobalDragOver, true)
    if (dragGhostEl) {
      dragGhostEl.remove()
      dragGhostEl = null
    }
    lastDragEndTime = Date.now()
    activeDragFolderItem.value = null
    isDraggedOutside.value = false
    cachedViewportRect = null
    draggingBookmark.value = null
    dragOverBookmarkId.value = null
    dragInsertPos.value = null
  }

  // 悬停在容器视窗上方准备拖入外部条目。
  function handleViewportDragOver(event: DragEvent) {
    if (draggingBookmark.value) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    isDragOver.value = true
  }

  // 离开视窗清除高亮。
  function handleViewportDragLeave() {
    isDragOver.value = false
  }

  // 释放外部条目进入当前文件夹。
  async function handleViewportDrop(event: DragEvent) {
    event.preventDefault()
    isDragOver.value = false
    const text = event.dataTransfer?.getData('text/plain') || ''
    const targetGroupId = options.folderGroupId || (options.items()[0]?.groupId ?? '')
    if (!text || !targetGroupId) return

    let bookmarkId = ''
    if (text.startsWith('folder-item:')) {
      bookmarkId = text.split(':')[3] || ''
    } else if (text.startsWith('new:bookmark:')) {
      bookmarkId = text.slice(4).split(':')[5] || ''
    }
    if (bookmarkId) {
      await updateBookmark(bookmarkId, activeSpaceId.value, { groupId: targetGroupId })
      options.emitRefresh()
    }
  }

  // 判断是否处于刚刚拖拽结束的缓冲期内以阻止遮罩误点击。
  function isRecentDragEnd(): boolean {
    return Date.now() - lastDragEndTime < 200
  }

  // 组件卸载时清理全局事件监听与拖拽镜像。
  function cleanup() {
    document.removeEventListener('dragover', handleGlobalDragOver, true)
    if (dragGhostEl) {
      dragGhostEl.remove()
      dragGhostEl = null
    }
  }

  return {
    isDraggedOutside,
    isDragOver,
    draggingBookmark,
    dragOverBookmarkId,
    dragInsertPos,
    handleItemDragStart,
    handleItemDragOver,
    handleItemDragLeave,
    handleItemDrop,
    handleItemDragEnd,
    handleViewportDragOver,
    handleViewportDragLeave,
    handleViewportDrop,
    isRecentDragEnd,
    cleanup,
  }
}
