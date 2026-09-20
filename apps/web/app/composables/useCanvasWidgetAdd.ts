import { type Ref } from 'vue'
import {
  findBottomRightPlacement,
  newWidget,
  type Breakpoint,
  type Desktop,
  type WidgetNode,
  type Bookmark,
  type BookmarkGroup,
  type CreateBookmarkGroupInput,
} from '@laull-home/shared'

// 画布组件添加与文件夹独立性管理选项接口。
export interface UseCanvasWidgetAddOptions {
  data: Ref<Desktop | null>
  saving: Ref<boolean>
  dirty: Ref<boolean>
  breakpoint: Ref<Breakpoint>
  spaceId: () => string
  editing: () => boolean
  bookmarks: () => Bookmark[]
  groups: () => BookmarkGroup[]
  createGroup: (input: CreateBookmarkGroupInput) => Promise<BookmarkGroup | null>
  add: (
    type: WidgetNode['type'],
    template?: WidgetNode,
    variant?: string,
    size?: { w: number; h: number },
    options?: { frameless?: boolean; referenceId?: string; title?: string; breakpoint?: Breakpoint },
  ) => void
  save: () => Promise<void>
  setError: (msg: string) => void
}

// 管理组件添加、文件夹分组独立创建与解绑的组合式函数。
export function useCanvasWidgetAdd(options: UseCanvasWidgetAddOptions) {
  // 统一处理组件添加，确保文件夹之间绝对独立，互不串联。
  async function handleAddWidget(
    type: WidgetNode['type'],
    variant?: string,
    size?: { w: number; h: number },
    frameless?: boolean,
    refId?: string,
  ) {
    let targetRefId = refId
    let targetTitle: string | undefined

    if (type === 'folder') {
      if (targetRefId) {
        // 检查当前画布是否已经存在绑定了相同分组的文件夹。
        const isGroupUsed = (options.data.value?.nodes ?? []).some(
          n => n.type === 'folder' && n.referenceId === targetRefId,
        )
        if (isGroupUsed) {
          // 分组已被其他文件夹占用，必须创建全新独立分组，杜绝多文件夹串联。
          const existingGroup = options.groups().find(g => g.id === targetRefId)
          const groupTitle = existingGroup ? `${existingGroup.name} (独立)` : '新文件夹'
          try {
            const created = await options.createGroup({ spaceId: options.spaceId(), name: groupTitle })
            if (created) {
              targetRefId = created.id
              targetTitle = created.name
            }
          } catch (cause) {
            options.setError(cause instanceof Error ? cause.message : '创建独立文件夹分组失败')
          }
        } else {
          const group = options.groups().find(g => g.id === targetRefId)
          if (group) {
            targetRefId = group.id
            targetTitle = group.name
          }
        }
      } else {
        // 未指定 refId 的新建文件夹（如九宫格、风琴抽屉等静态模板），创建全新独立分组。
        const defaultTitle = variant === 'launchpad'
          ? '启动台九宫格'
          : (variant === 'shelf'
              ? '横滑书架'
              : (variant === 'grid' ? '平铺容器' : '新文件夹'))
        try {
          const created = await options.createGroup({ spaceId: options.spaceId(), name: defaultTitle })
          if (created) {
            targetRefId = created.id
            targetTitle = created.name
          }
        } catch (cause) {
          options.setError(cause instanceof Error ? cause.message : '创建文件夹分组失败')
        }
      }
    } else if (type === 'bookmark') {
      const bm = options.bookmarks().find(b => b.id === targetRefId) || options.bookmarks()[0]
      if (bm) {
        targetRefId = bm.id
        targetTitle = bm.title
      }
    }

    options.add(type, undefined, variant, size, {
      frameless,
      referenceId: targetRefId,
      title: targetTitle,
      breakpoint: options.breakpoint.value,
    })
  }

  // 复制组件，若为文件夹则创建独立分组副本，避免与原文件夹串联。
  async function handleEditorCopy(node: WidgetNode) {
    if (node.type === 'folder') {
      const copyTitle = `${node.title || '文件夹'} (副本)`
      try {
        const created = await options.createGroup({ spaceId: options.spaceId(), name: copyTitle })
        const copyNode: WidgetNode = {
          ...node,
          title: created?.name ?? copyTitle,
          referenceId: created?.id ?? '',
        }
        options.add(copyNode.type, copyNode)
      } catch (cause) {
        options.setError(cause instanceof Error ? cause.message : '复制文件夹分组失败')
      }
      return
    }
    options.add(node.type, node)
  }

  // 校验并解开历史画布中可能存在的串联文件夹，确保每个文件夹拥有独立分组。
  async function ensureFoldersIndependent() {
    if (!options.data.value?.nodes) return
    const seenGroupIds = new Set<string>()
    let changed = false
    for (const node of options.data.value.nodes) {
      if (node.type !== 'folder') continue
      if (!node.referenceId) {
        const created = await options.createGroup({
          spaceId: options.spaceId(),
          name: node.title || '新文件夹',
        })
        if (created) {
          node.referenceId = created.id
          changed = true
        }
      } else if (seenGroupIds.has(node.referenceId)) {
        const created = await options.createGroup({
          spaceId: options.spaceId(),
          name: `${node.title || '文件夹'} (独立)`,
        })
        if (created) {
          node.referenceId = created.id
          changed = true
        }
      } else {
        seenGroupIds.add(node.referenceId)
      }
    }
    if (changed) {
      options.dirty.value = true
      await options.save()
    }
  }

  // 保存新书签后在当前桌面创建脱离底座图标组件，保持非编辑状态。
  function addNavigation(bookmark: Bookmark, variant?: string) {
    if (!options.data.value || options.saving.value) return
    const w = variant === 'pill' ? 2 : 1
    const placement = findBottomRightPlacement(options.data.value.nodes, w, 1, options.breakpoint.value)
    options.add('bookmark', {
      ...newWidget('bookmark', crypto.randomUUID(), variant),
      title: bookmark.title,
      referenceId: bookmark.id,
      ...(variant ? { variant } : {}),
      layouts: {
        desktop: { x: placement.x, y: placement.y, w, h: 1, pinned: true },
        [options.breakpoint.value]: { x: placement.x, y: placement.y, w, h: 1, pinned: true },
      },
      style: { opacity: 100, blur: 0, radius: 16, padding: 8, border: 0, color: '', background: '', frameless: true },
    })
    if (!options.editing()) void options.save()
  }

  return {
    handleAddWidget,
    handleEditorCopy,
    ensureFoldersIndependent,
    addNavigation,
  }
}
