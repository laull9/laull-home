import { ref, type Ref } from 'vue'
import { BREAKPOINTS, type Breakpoint, type Desktop, type Placement, type WidgetNode, type BookmarkGroup } from '@laull-home/shared'
import { activeDragTreeItem } from '../components/desktop/treeCatalog'

// 画布拖拽放置配置项接口。
export interface UseCanvasLibraryDropOptions {
  canvas: Ref<HTMLElement | null>
  breakpoint: Ref<Breakpoint>
  data: Ref<Desktop | null>
  dirty: Ref<boolean>
  saving: Ref<boolean>
  editing: () => boolean
  spaceId: () => string
  dragged: Ref<string>
  createGroup: (input: { spaceId: string; name: string }) => Promise<BookmarkGroup | null>
  update: (node: WidgetNode) => void
  save: () => Promise<void>
  handleAddWidget: (type: WidgetNode['type'], variant?: string, size?: { w: number; h: number }, frameless?: boolean, refId?: string) => void
  handleDropToFolder: (groupId: string, dragText: string) => Promise<boolean>
  handleDropToCanvas: (dragText: string, targetP: Placement) => Promise<boolean>
}

// 管理组件树与外部条目向画布网格拖放落点及文件夹吸收的组合式函数。
export function useCanvasLibraryDrop(options: UseCanvasLibraryDropOptions) {
  // 组件树与外部条目拖拽网格放置预览。
  const libraryPreview = ref<Placement | null>(null)
  // 原生拖拽悬停的目标文件夹小部件 ID。
  const nativeHoverFolderId = ref<string | null>(null)

  // 原生拖拽进入网格计算落点或悬停文件夹。
  function libraryOver(event: DragEvent) {
    event.preventDefault()
    if (!options.canvas.value) return

    // 检查是否悬停在某个文件夹组件上方。
    const targetEl = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-widget-id]')
    const targetId = targetEl?.dataset.widgetId
    const targetNode = targetId ? options.data.value?.nodes.find(item => item.id === targetId) : null

    if (targetNode?.type === 'folder') {
      nativeHoverFolderId.value = targetNode.id
      libraryPreview.value = null
      return
    }

    nativeHoverFolderId.value = null
    const item = activeDragTreeItem.value
    const w = item?.w ?? 1
    const h = item?.h ?? 1
    const grid = options.canvas.value
    const bounds = grid.getBoundingClientRect()
    const columns = BREAKPOINTS[options.breakpoint.value]
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
    const rowGap = parseFloat(getComputedStyle(grid).rowGap) || 0
    const cell = (bounds.width - gap * (columns - 1)) / columns
    const x = Math.max(0, Math.min(columns - w, Math.floor((event.clientX - bounds.left) / (cell + gap))))
    const y = Math.max(0, Math.min(199, Math.floor((event.clientY - bounds.top) / (96 + rowGap))))
    if (!libraryPreview.value || libraryPreview.value.x !== x || libraryPreview.value.y !== y || libraryPreview.value.w !== w || libraryPreview.value.h !== h) {
      libraryPreview.value = { x, y, w, h, pinned: true }
    }
  }

  // 离开网格清除预览框与高亮目标。
  function libraryLeave() {
    libraryPreview.value = null
    nativeHoverFolderId.value = null
  }

  // 计算松手瞬间的兜底落点。
  function calculateFallbackPlacement(event: DragEvent): Placement | null {
    if (!options.canvas.value) return null
    const grid = options.canvas.value
    const bounds = grid.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      return null
    }
    const columns = BREAKPOINTS[options.breakpoint.value]
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
    const rowGap = parseFloat(getComputedStyle(grid).rowGap) || 0
    const cell = (bounds.width - gap * (columns - 1)) / columns
    const x = Math.max(0, Math.min(columns - 1, Math.floor((event.clientX - bounds.left) / (cell + gap))))
    const y = Math.max(0, Math.min(199, Math.floor((event.clientY - bounds.top) / (96 + rowGap))))
    return { x, y, w: 1, h: 1, pinned: true }
  }

  // 组件树与外部条目拖放后定位到目标网格或放入文件夹。
  async function drop(event: DragEvent) {
    event.preventDefault()
    const hoveredFolderId = nativeHoverFolderId.value
    nativeHoverFolderId.value = null
    let targetP = libraryPreview.value
    libraryPreview.value = null
    const text = event.dataTransfer?.getData('text/plain') || options.dragged.value
    if (!text || options.saving.value || !options.data.value) return

    // 优先判定是否拖入文件夹小部件（拖到文件夹上再次放入）。
    const targetEl = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-widget-id]')
    const targetId = hoveredFolderId || targetEl?.dataset.widgetId
    const targetFolderNode = targetId ? options.data.value.nodes.find(item => item.id === targetId && item.type === 'folder') : null

    if (targetFolderNode) {
      let groupId = targetFolderNode.referenceId
      if (!groupId) {
        const created = await options.createGroup({ spaceId: options.spaceId(), name: targetFolderNode.title || '新文件夹' })
        if (created) {
          groupId = created.id
          options.update({ ...targetFolderNode, referenceId: groupId })
        }
      }
      if (groupId) {
        await options.handleDropToFolder(groupId, text)
        return
      }
    }

    // 兜底计算网格落点，防止松手瞬间由于 dragleave 清空 preview 而导致 drop 丢失。
    if (!targetP) {
      targetP = calculateFallbackPlacement(event)
    }

    if (text.startsWith('folder-item:')) {
      if (targetP) await options.handleDropToCanvas(text, targetP)
      return
    }
    if (!text.startsWith('new:')) return
    const parts = text.slice(4).split(':')
    const type = parts[0] as WidgetNode['type']
    const variant = parts[1] || undefined
    const w = parts[2] ? Number(parts[2]) : undefined
    const h = parts[3] ? Number(parts[3]) : undefined
    const frameless = parts[4] === 'frameless'
    const refId = (parts[4] && parts[4] !== 'frameless' && parts[4] !== 'card') ? parts[4] : (parts[5] || undefined)
    const size = (w && h) ? { w, h } : undefined
    options.handleAddWidget(type, variant, size, frameless, refId)
    const node = options.data.value.nodes.at(-1)
    if (!node) return
    if (targetP) {
      node.layouts[options.breakpoint.value] = { ...targetP }
      node.layouts.desktop = { ...targetP }
    }
    options.dirty.value = true
    if (!options.editing()) await options.save()
  }

  return {
    libraryPreview,
    nativeHoverFolderId,
    libraryOver,
    libraryLeave,
    drop,
  }
}
