import { BREAKPOINTS, arrangeNodes, type Bookmark, type BookmarkGroup, type Breakpoint, type Desktop, type Placement, type WidgetNode } from '@laull-home/shared'
import type { ComputedRef, Ref } from 'vue'

// 画布放置提交配置项接口。
export interface UseCanvasDropCommitOptions {
  data: Ref<Desktop | null>
  saving: Ref<boolean>
  dirty: Ref<boolean>
  breakpoint: Ref<Breakpoint>
  positions: ComputedRef<Map<string, Placement>>
  editing: () => boolean
  allowDragWithoutEdit: () => boolean
  stackMode: () => boolean
  spaceId: () => string
  vector: () => { dx: number; dy: number } | undefined
  update: (node: WidgetNode) => void
  remove: (id: string) => void
  merge: (a: string, b: string) => Promise<boolean>
  createGroup: (input: { spaceId: string; name: string }) => Promise<BookmarkGroup | null>
  updateBookmark: (id: string, spaceId: string, input: Partial<Bookmark>) => Promise<Bookmark | null>
  save: () => Promise<void>
  emitRefresh: () => void
  setError: (msg: string) => void
}

// 管理画布放置提交逻辑的组合式函数。
export function useCanvasDropCommit(options: UseCanvasDropCommitOptions) {
  // 两类拖动统一提交布局、叠放或书签合并/归组。
  async function commitDrop(id: string, p: Placement, targetId?: string) {
    if (options.saving.value || !options.data.value) return
    const isDraggableType = (t?: string) => t === 'bookmark' || t === 'folder'
    if (!options.editing() && (!options.allowDragWithoutEdit() || !isDraggableType(options.data.value.nodes.find(item => item.id === id)?.type))) return
    const node = options.data.value.nodes.find(item => item.id === id)
    const target = options.data.value.nodes.find(item => item.id === targetId && item.id !== id)
    if (!node) return
    if (options.editing() && !options.stackMode() && target && node.type === 'bookmark' && target.type === 'bookmark') {
      // 两个胶囊信息卡相遇直接在当前行并排变为 1x2，不新建文件夹。
      if (node.variant === 'pill' && target.variant === 'pill') {
        const bp = options.breakpoint.value
        const targetP = options.positions.value.get(target.id) ?? target.layouts[bp] ?? target.layouts.desktop
        const columns = BREAKPOINTS[bp]
        let targetX = targetP.x
        let sourceX = targetX + 1
        if (sourceX >= columns) {
          targetX = Math.max(0, columns - 2)
          sourceX = targetX + 1
        }
        const tLayout: Placement = { x: targetX, y: targetP.y, w: 1, h: 1, pinned: true }
        const sLayout: Placement = { x: sourceX, y: targetP.y, w: 1, h: 1, pinned: true }
        options.update({ ...target, layouts: { ...target.layouts, desktop: { ...tLayout }, [bp]: { ...tLayout } } })
        options.update({ ...node, layouts: { ...node.layouts, desktop: { ...sLayout }, [bp]: { ...sLayout } } })
        options.dirty.value = true
        return
      }
      if (await options.merge(node.id, target.id)) options.emitRefresh()
      return
    }
    if (!options.stackMode() && target && node.type === 'bookmark' && target.type === 'folder') {
      let groupId = target.referenceId
      options.remove(node.id)
      if (!groupId) {
        const created = await options.createGroup({ spaceId: options.spaceId(), name: target.title || '新建文件夹' })
        if (created) {
          groupId = created.id
          options.update({ ...target, referenceId: groupId })
        }
      }
      if (groupId && node.referenceId) {
        try {
          await options.updateBookmark(node.referenceId, options.spaceId(), { groupId })
          if (!options.editing()) await options.save()
          options.emitRefresh()
        } catch (cause) {
          options.update(node)
          options.setError(cause instanceof Error ? cause.message : '移入文件夹失败')
        }
      }
      return
    }
    if (options.editing() && options.stackMode() && target) {
      const sourceSize = options.positions.value.get(node.id)!, targetSize = options.positions.value.get(target.id)!
      if (sourceSize.w !== targetSize.w || sourceSize.h !== targetSize.h) { options.setError('叠放需要相同尺寸'); return }
      const stackId = target.stackId || crypto.randomUUID()
      options.update({ ...target, stackId })
      options.update({ ...node, stackId, layouts: JSON.parse(JSON.stringify(target.layouts)) })
      return
    }
    const bp = options.breakpoint.value
    const activeWithP = { ...node, stackId: '', layouts: { ...node.layouts, [bp]: p } }
    const allNodes = options.data.value.nodes
    const reordered = [activeWithP, ...allNodes.filter(n => n.id !== id)]
    const arrangedMap = arrangeNodes(reordered, bp, options.vector())
    for (const item of allNodes) {
      const finalP = arrangedMap.get(item.id)
      if (finalP) options.update({ ...item, ...(item.id === id ? { stackId: '' } : {}), layouts: { ...item.layouts, [bp]: { ...finalP } } })
    }
    if (!options.editing()) void options.save()
  }

  return { commitDrop }
}
