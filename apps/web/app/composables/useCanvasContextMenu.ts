import { ref, computed, type Ref } from 'vue'
import type { Bookmark, WidgetNode, Desktop } from '@laull-home/shared'

// 桌面右键上下文快捷菜单管理。
export function useCanvasContextMenu(options: {
  user: Ref<unknown>
  data: Ref<Desktop | null>
  loading: Ref<boolean>
  saving: Ref<boolean>
  editing: () => boolean
  bookmarks: () => Bookmark[]
  showComponentTree: Ref<boolean>
  save: () => Promise<void>
  remove: (id: string) => void
  onQuickAdd: () => void
  onAddBookmark: (groupId?: string) => void
  onEditBookmark: (bookmark: Bookmark) => void
  onStartEdit: () => void
  onSelectNode: (node: WidgetNode) => void
}) {
  const contextPosition = ref<{ x: number; y: number } | null>(null)
  const contextNode = ref<WidgetNode | null>(null)

  // 根据目标显示组件操作、删除或当前空间布局操作。
  const contextItems = computed(() => [
    ...(contextNode.value ? [
      { id: 'configure', label: '配置组件外观' },
      ...(contextNode.value.type === 'bookmark' ? [{ id: 'bookmark', label: '编辑此书签' }] : []),
      ...(contextNode.value.type === 'folder' ? [{ id: 'add-to-folder', label: '在此文件夹添加图标' }] : []),
      { id: 'delete', label: '删除此组件' },
    ] : []),
    { id: 'layout', label: '编辑当前空间布局' },
    { id: 'add', label: '添加图标导航' },
    { id: 'library', label: options.showComponentTree.value ? '收起组件树' : '添加组件' },
    { id: 'settings', label: '打开全局外观设置' },
  ])

  // 菜单只在已载入且未保存中的画布上出现。
  function canOpen() {
    return Boolean(options.user.value && options.data.value && !options.loading.value && !options.saving.value)
  }

  // 按坐标直接记录菜单目标，供触屏长按判定完成后调用。
  function openContextAt(x: number, y: number, node: WidgetNode | null = null) {
    if (!canOpen()) return
    contextNode.value = node
    contextPosition.value = { x, y }
  }

  // 输入框保留原生菜单，其他位置记录右键目标。
  function openContext(event: MouseEvent, node: WidgetNode | null = null) {
    if (!canOpen() || (event.target as HTMLElement).closest('input, textarea, select, [role=dialog], .modal-backdrop')) return
    event.preventDefault()
    event.stopPropagation()
    openContextAt(event.clientX, event.clientY, node)
  }

  // 操作使用打开菜单时的目标，避免误改其他组件。
  function contextAction(id: string) {
    if (!options.user.value || !options.data.value || options.saving.value) return
    if (id === 'settings') { void navigateTo('/settings?page=appearance'); return }
    if (id === 'add') { options.onQuickAdd(); return }
    if (id === 'add-to-folder' && contextNode.value) {
      options.onAddBookmark(contextNode.value.referenceId)
      return
    }
    if (id === 'delete' && contextNode.value) {
      options.remove(contextNode.value.id)
      if (!options.editing()) void options.save()
      return
    }
    if (id === 'configure' && contextNode.value) { options.onSelectNode(contextNode.value); return }
    if (id === 'bookmark') {
      const bookmark = options.bookmarks().find(item => item.id === contextNode.value?.referenceId)
      if (bookmark) options.onEditBookmark(bookmark)
      return
    }
    if (id === 'library') { options.showComponentTree.value = !options.showComponentTree.value; return }
    options.onStartEdit()
  }

  return {
    contextPosition,
    contextNode,
    contextItems,
    openContext,
    openContextAt,
    contextAction,
  }
}
