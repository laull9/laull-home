<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { arrangeNodes, findBottomRightPlacement, newWidget, BREAKPOINTS, isWidget, scopedCss, type WidgetNode, type Bookmark, type BookmarkGroup, type Breakpoint, type Placement } from '@laull-home/shared'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import { useGridFlip } from '../../composables/useGridFlip'
import { useDesktop } from '../../composables/useDesktop'
import { useFolderItemDrag } from '../../composables/useFolderItemDrag'
import { useCanvasContextMenu } from '../../composables/useCanvasContextMenu'
import AlertModal from '../AlertModal.vue'
import WidgetContent from './WidgetContent.vue'
import WidgetEditor from './WidgetEditor.vue'
import ComponentTree from './ComponentTree.vue'
import { activeDragTreeItem } from './treeCatalog'

// 外部双向同步断点与叠放模式。
const selectedBreakpoint = defineModel<'auto' | Breakpoint>('selectedBreakpoint', { default: 'auto' })
const stackMode = defineModel<boolean>('stackMode', { default: false })
// 画布只接收已授权的空间内容。
const props = withDefaults(defineProps<{
  spaceId: string; editing: boolean; bookmarks: Bookmark[]; groups: BookmarkGroup[]; allowDragWithoutEdit?: boolean
}>(), { allowDragWithoutEdit: true })
// 复用已有书签编辑与新增操作。
const emit = defineEmits<{
  editBookmark: [bookmark: Bookmark]; addBookmark: [groupId?: string]; dirty: [value: boolean]
  saving: [value: boolean]; treeOpen: [value: boolean]; refresh: []; startEdit: []; quickAdd: []
}>()
// 空间画布和编辑状态。
const { data, error, loading, saving, dirty, load, save, merge, update, add, remove, template } = useDesktop()
const { updateBookmark, createGroup } = useBookmarks()
const breakpoint = ref<Breakpoint>('desktop')
const { handleDropToCanvas, handleDropToFolder } = useFolderItemDrag({
  spaceId: computed(() => props.spaceId),
  breakpoint,
  data,
  bookmarks: computed(() => props.bookmarks),
  updateBookmark,
  save,
  refresh: () => emit('refresh'),
})
const canvas = ref<HTMLElement | null>(null)
// 实时组件树面板显隐状态。
const showComponentTree = ref(false)
// 进入编辑模式记录快照，退出编辑模式清空快照并收起组件树。
const initialCanvasSnapshot = ref<string>('')
watch(() => props.editing, isEditing => {
  if (isEditing && data.value && !initialCanvasSnapshot.value) {
    initialCanvasSnapshot.value = JSON.stringify(data.value.nodes)
  }
  if (!isEditing) { initialCanvasSnapshot.value = ''; showComponentTree.value = false }
})
// 异步读取完毕若已在编辑中，记录初始快照。
watch(data, current => {
  if (props.editing && current && !initialCanvasSnapshot.value) initialCanvasSnapshot.value = JSON.stringify(current.nodes)
})
// 向外同步后台静默保存状态与组件树展开收起状态。
watch(saving, isSaving => emit('saving', isSaving), { immediate: true })
watch(showComponentTree, isOpen => emit('treeOpen', isOpen), { immediate: true })
const selected = ref<WidgetNode | null>(null)
const importCode = ref(''), filter = ref(''), alt = ref(false), dragged = ref('')
const activeStacks = ref<Record<string, number>>({})
let observer: ResizeObserver | undefined, touchStart = 0
// 快捷菜单只作用于已载入且已授权的画布。
const { user } = useAuth()
const { contextPosition, contextItems, openContext, contextAction } = useCanvasContextMenu({
  user, data, loading, saving,
  editing: () => props.editing,
  bookmarks: () => props.bookmarks,
  showComponentTree,
  save,
  remove,
  onQuickAdd: () => emit('quickAdd'),
  onAddBookmark: (groupId) => emit('addBookmark', groupId),
  onEditBookmark: (bm) => emit('editBookmark', bm),
  onStartEdit: () => emit('startEdit'),
  onSelectNode: (n) => { selected.value = n },
})
// 取消空间布局修改，还原至进入编辑前的快照并自动持久化。
async function cancelChanges() {
  if (!initialCanvasSnapshot.value || !data.value) return
  if (autoSaveCanvasTimer) clearTimeout(autoSaveCanvasTimer)
  try {
    data.value.nodes = JSON.parse(initialCanvasSnapshot.value)
    dirty.value = false
    await save()
  } catch { /* 忽略还原异常 */ }
}
// 保存新书签后在当前桌面创建脱离底座图标组件，保持非编辑状态。
function addNavigation(bookmark: Bookmark, variant?: string) {
  if (!data.value || saving.value) return
  const w = variant === 'pill' ? 2 : 1
  const placement = findBottomRightPlacement(data.value.nodes, w, 1, breakpoint.value)
  add('bookmark', {
    ...newWidget('bookmark', crypto.randomUUID(), variant),
    title: bookmark.title,
    referenceId: bookmark.id,
    ...(variant ? { variant } : {}),
    layouts: {
      desktop: { x: placement.x, y: placement.y, w, h: 1, pinned: true },
      [breakpoint.value]: { x: placement.x, y: placement.y, w, h: 1, pinned: true },
    },
    style: { opacity: 100, blur: 0, radius: 16, padding: 8, border: 0, color: '', background: '', frameless: true },
  })
  if (!props.editing) void save()
}
// 供外部控制组件树显隐、取消改动与右键菜单。
defineExpose({ addNavigation, openContext, cancelChanges, reload, toggleTree: () => { showComponentTree.value = !showComponentTree.value }, openTree: () => { showComponentTree.value = true } })
// 自动断点取实际可用宽度。
function resize() {
  if (selectedBreakpoint.value !== 'auto') { breakpoint.value = selectedBreakpoint.value; return }
  const width = canvas.value?.clientWidth ?? window.innerWidth
  breakpoint.value = width >= 1160 ? 'desktop' : width >= 800 ? 'laptop' : width >= 560 ? 'tablet' : 'mobile'
}
watch(selectedBreakpoint, resize)
watch(() => props.spaceId, id => { selected.value = null; showComponentTree.value = false; void load(id) }, { immediate: true })
// 每个节点对应无重叠的网格矩形。
const positions = computed(() => arrangeNodes(data.value?.nodes ?? [], breakpoint.value))
// 同尺寸叠放保留一个可见组件。
const visibleNodes = computed(() => {
  const groups = new Map<string, WidgetNode[]>()
  for (const node of data.value?.nodes ?? []) {
    const key = node.stackId || node.id
    groups.set(key, [...(groups.get(key) ?? []), node])
  }
  return Array.from(groups, ([key, nodes]) => ({ node: nodes[(activeStacks.value[key] ?? 0) % nodes.length]!, count: nodes.length, key }))
})
// 提供组件局部变量和网格位置。
function style(node: WidgetNode) {
  const p = (drag.draggingId.value === node.id ? positions.value : previewPositions.value).get(node.id)!
  const local = node.style
  return {
    ...drag.transform(node.id),
    gridColumn: (p.x + 1) + ' / span ' + p.w, gridRow: (p.y + 1) + ' / span ' + p.h,
    ...(local ? {
      '--widget-opacity': local.opacity + '%', '--widget-blur': local.blur + 'px', '--widget-radius': local.radius + 'px',
      '--widget-padding': local.padding + 'px', '--widget-border': local.border + 'px',
      ...(local.color ? { '--widget-text': local.color } : {}), ...(local.background ? { '--widget-surface': local.background } : {}),
    } : {}),
  }
}
// 组件 Scoped CSS 响应式注入文档头部，避免水合时手动操作 DOM 引起闪变。
const widgetCssContent = computed(() => {
  return (data.value?.nodes ?? []).map(node => scopedCss(node.css, '#widget-' + node.id)).filter(Boolean).join('\n')
})
useHead({
  style: [
    {
      id: 'lh-widget-css',
      innerHTML: () => widgetCssContent.value,
    },
  ],
})
// 滚轮、触屏和按钮使用同一轮播操作。
function cycle(key: string, direction = 1) {
  const count = data.value?.nodes.filter(node => (node.stackId || node.id) === key).length ?? 1
  activeStacks.value[key] = ((activeStacks.value[key] ?? 0) + direction + count) % count
}
// 两类拖动统一提交布局、叠放或书签合并/归组。
async function commitDrop(id: string, p: Placement, targetId?: string) {
  if (saving.value || !data.value) return
  const isDraggableType = (t?: string) => t === 'bookmark' || t === 'folder'
  if (!props.editing && (!props.allowDragWithoutEdit || !isDraggableType(data.value.nodes.find(item => item.id === id)?.type))) return
  const node = data.value.nodes.find(item => item.id === id)
  const target = data.value.nodes.find(item => item.id === targetId && item.id !== id)
  if (!node) return
  if (props.editing && !stackMode.value && target && node.type === 'bookmark' && target.type === 'bookmark') {
    // 两个胶囊信息卡相遇直接在当前行并排变为 1x2，不新建文件夹。
    if (node.variant === 'pill' && target.variant === 'pill') {
      const bp = breakpoint.value
      const targetP = positions.value.get(target.id) ?? target.layouts[bp] ?? target.layouts.desktop
      const columns = BREAKPOINTS[bp]
      let targetX = targetP.x
      let sourceX = targetX + 1
      if (sourceX >= columns) {
        targetX = Math.max(0, columns - 2)
        sourceX = targetX + 1
      }
      const tLayout: Placement = { x: targetX, y: targetP.y, w: 1, h: 1, pinned: true }
      const sLayout: Placement = { x: sourceX, y: targetP.y, w: 1, h: 1, pinned: true }
      update({ ...target, layouts: { ...target.layouts, desktop: { ...tLayout }, [bp]: { ...tLayout } } })
      update({ ...node, layouts: { ...node.layouts, desktop: { ...sLayout }, [bp]: { ...sLayout } } })
      dirty.value = true
      return
    }
    if (await merge(node.id, target.id)) emit('refresh')
    return
  }
  if (!stackMode.value && target && node.type === 'bookmark' && target.type === 'folder') {
    let groupId = target.referenceId
    remove(node.id)
    if (!groupId) {
      const created = await createGroup({ spaceId: props.spaceId, name: target.title || '新建文件夹' })
      if (created) {
        groupId = created.id
        update({ ...target, referenceId: groupId })
      }
    }
    if (groupId && node.referenceId) {
      try {
        await updateBookmark(node.referenceId, props.spaceId, { groupId })
        if (!props.editing) await save()
        emit('refresh')
      } catch (cause) {
        update(node)
        error.value = cause instanceof Error ? cause.message : '移入文件夹失败'
      }
    }
    return
  }
  if (props.editing && stackMode.value && target) {
    const sourceSize = positions.value.get(node.id)!, targetSize = positions.value.get(target.id)!
    if (sourceSize.w !== targetSize.w || sourceSize.h !== targetSize.h) { error.value = '叠放需要相同尺寸'; return }
    const stackId = target.stackId || crypto.randomUUID()
    update({ ...target, stackId })
    update({ ...node, stackId, layouts: JSON.parse(JSON.stringify(target.layouts)) })
    return
  }
  const bp = breakpoint.value
  const activeWithP = { ...node, stackId: '', layouts: { ...node.layouts, [bp]: p } }
  const allNodes = data.value.nodes
  const reordered = [activeWithP, ...allNodes.filter(n => n.id !== id)]
  const arrangedMap = arrangeNodes(reordered, bp, drag.vector.value)
  for (const item of allNodes) {
    const finalP = arrangedMap.get(item.id)
    if (finalP) update({ ...item, ...(item.id === id ? { stackId: '' } : {}), layouts: { ...item.layouts, [bp]: { ...finalP } } })
  }
  if (!props.editing) void save()
}
// 整个组件在编辑模式或允许的非编辑模式下响应鼠标和触屏拖动。
const drag = useWidgetDrag({ canvas, nodes: () => data.value?.nodes ?? [], breakpoint,
  enabled: node => !saving.value && (props.editing || (props.allowDragWithoutEdit && (node?.type === 'bookmark' || node?.type === 'folder'))),
  acceptsTarget: (sourceId, targetId) => {
    const source = data.value?.nodes.find(node => node.id === sourceId)
    const target = data.value?.nodes.find(node => node.id === targetId)
    if (!source || !target) return false
    if (!props.editing) return props.allowDragWithoutEdit && source.type === 'bookmark' && target.type === 'folder'
    return stackMode.value || (source.type === 'bookmark' && (target.type === 'bookmark' || target.type === 'folder'))
  },
  commit: (id, position, targetId) => { void commitDrop(id, position, targetId) } })
// 拖拽时将当前组件置首位优先排布，吸附文件夹或无预览时不产生挤位避让。
const previewPositions = computed(() => {
  if (drag.folderAction.value === 'absorb' || !drag.preview.value || !drag.draggingId.value) return positions.value
  const all = data.value?.nodes ?? []
  const cur = all.find(n => n.id === drag.draggingId.value)
  if (!cur) return positions.value
  const activeWithPreview = { ...cur, stackId: '', layouts: { ...cur.layouts, [breakpoint.value]: drag.preview.value! } }
  return arrangeNodes([activeWithPreview, ...all.filter(n => n.id !== drag.draggingId.value)], breakpoint.value, drag.vector.value)
})
// 拖拽避让变动时触发平滑非线性动画。
const { snapshot: snapshotGrid, play: playGridFlip } = useGridFlip(canvas)
watch(previewPositions, async () => {
  if (!drag.draggingId.value) return
  snapshotGrid(drag.draggingId.value)
  await playGridFlip(drag.draggingId.value)
}, { flush: 'pre' })
// 判断组件是否脱离卡片底座。
function isFrameless(node: WidgetNode) {
  if (node.type === 'bookmark') return node.style?.frameless !== false
  return node.style?.frameless === true
}
// 统一处理组件添加，自动补全真实分组与书签绑定。
function handleAddWidget(type: WidgetNode['type'], variant?: string, size?: { w: number; h: number }, frameless?: boolean, refId?: string) {
  let targetRefId = refId
  let targetTitle: string | undefined
  if (type === 'folder') {
    const group = props.groups.find(g => g.id === targetRefId) || props.groups[0]
    if (group) { targetRefId = group.id; targetTitle = group.name }
  } else if (type === 'bookmark') {
    const bm = props.bookmarks.find(b => b.id === targetRefId) || props.bookmarks[0]
    if (bm) { targetRefId = bm.id; targetTitle = bm.title }
  }
  add(type, undefined, variant, size, { frameless, referenceId: targetRefId, title: targetTitle, breakpoint: breakpoint.value })
}
// 组件树拖拽网格放置预览。
// 组件树与外部条目拖拽网格放置预览与文件夹吸收。
const libraryPreview = ref<Placement | null>(null)
const nativeHoverFolderId = ref<string | null>(null)

// 原生拖拽进入网格计算落点或悬停文件夹。
function libraryOver(event: DragEvent) {
  event.preventDefault()
  if (!canvas.value) return

  // 检查是否悬停在某个文件夹组件上方。
  const targetEl = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-widget-id]')
  const targetId = targetEl?.dataset.widgetId
  const targetNode = targetId ? data.value?.nodes.find(item => item.id === targetId) : null

  if (targetNode?.type === 'folder') {
    nativeHoverFolderId.value = targetNode.id
    libraryPreview.value = null
    return
  }

  nativeHoverFolderId.value = null
  const item = activeDragTreeItem.value
  const w = item?.w ?? 1, h = item?.h ?? 1
  const grid = canvas.value
  const bounds = grid.getBoundingClientRect()
  const columns = BREAKPOINTS[breakpoint.value]
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

// 组件树与外部条目拖放后定位到目标网格或放入文件夹。
async function drop(event: DragEvent) {
  event.preventDefault()
  const hoveredFolderId = nativeHoverFolderId.value
  nativeHoverFolderId.value = null
  let targetP = libraryPreview.value
  libraryPreview.value = null
  const text = event.dataTransfer?.getData('text/plain') || dragged.value
  if (!text || saving.value || !data.value) return

  // 优先判定是否拖入文件夹小部件（拖到文件夹上再次放入）。
  const targetEl = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-widget-id]')
  const targetId = hoveredFolderId || targetEl?.dataset.widgetId
  const targetFolderNode = targetId ? data.value.nodes.find(item => item.id === targetId && item.type === 'folder') : null

  if (targetFolderNode) {
    let groupId = targetFolderNode.referenceId
    if (!groupId) {
      const created = await createGroup({ spaceId: props.spaceId, name: targetFolderNode.title || '新文件夹' })
      if (created) {
        groupId = created.id
        update({ ...targetFolderNode, referenceId: groupId })
      }
    }
    if (groupId) {
      await handleDropToFolder(groupId, text)
      return
    }
  }

  // 兜底计算网格落点，防止松手瞬间由于 dragleave 清空 preview 而导致 drop 丢失。
  if (!targetP && canvas.value) {
    const grid = canvas.value
    const bounds = grid.getBoundingClientRect()
    if (event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom) {
      const columns = BREAKPOINTS[breakpoint.value]
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
      const rowGap = parseFloat(getComputedStyle(grid).rowGap) || 0
      const cell = (bounds.width - gap * (columns - 1)) / columns
      const x = Math.max(0, Math.min(columns - 1, Math.floor((event.clientX - bounds.left) / (cell + gap))))
      const y = Math.max(0, Math.min(199, Math.floor((event.clientY - bounds.top) / (96 + rowGap))))
      targetP = { x, y, w: 1, h: 1, pinned: true }
    }
  }

  if (text.startsWith('folder-item:')) {
    if (targetP) await handleDropToCanvas(text, targetP)
    return
  }
  if (!text.startsWith('new:')) return
  const parts = text.slice(4).split(':')
  const type = parts[0] as WidgetNode['type']
  const variant = parts[1] || undefined
  const w = parts[2] ? Number(parts[2]) : undefined
  const h = parts[3] ? Number(parts[3]) : undefined
  const frameless = parts[4] === 'frameless'
  const refId = parts[5] || undefined
  const size = (w && h) ? { w, h } : undefined
  handleAddWidget(type, variant, size, frameless, refId)
  const node = data.value.nodes.at(-1)
  if (!node) return
  if (targetP) {
    node.layouts[breakpoint.value] = { ...targetP }
    node.layouts.desktop = { ...targetP }
  }
  dirty.value = true
  if (!props.editing) await save()
}
// 键盘与移动端可在配置浮层修改位置。
function pin(node: WidgetNode) {
  const p = positions.value.get(node.id)!
  update({ ...node, layouts: { ...node.layouts, [breakpoint.value]: { ...p, pinned: !p.pinned } } })
}
// 删除自定义模板节点。
function deleteTemplate(id: string) {
  if (!data.value) return
  data.value.templates = data.value.templates.filter(node => node.id !== id)
  dirty.value = true
}
// 导入使用严格版本、大小和 Schema 校验。
function importWidget(rawCode?: string) {
  try {
    const codeToUse = (typeof rawCode === 'string' ? rawCode : importCode.value).trim()
    if (!codeToUse) return
    if (codeToUse.length > 24000) throw new Error('配置代码串过长')
    const bytes = Uint8Array.from(atob(codeToUse), char => char.charCodeAt(0))
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (value.version !== 1 || !isWidget(value.node)) throw new Error('配置版本或字段无效')
    scopedCss(value.node.css, '#widget-import')
    add(value.node.type, value.node)
    importCode.value = ''
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '导入失败' }
}
// 重新读取确认弹窗显隐状态。
const showReloadConfirm = ref(false)

// 草稿重读必须由用户主动放弃。
function reload() {
  if (!dirty.value) { void load(props.spaceId); return }
  showReloadConfirm.value = true
}

// 确认放弃修改并重新读取。
function handleConfirmReload() {
  showReloadConfirm.value = false
  void load(props.spaceId)
}
// 编辑输入和弹窗存在时不抢占键盘。
function keyboard(event: KeyboardEvent) {
  alt.value = event.altKey
  if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]') || document.querySelector('[role="dialog"][open]')) return
  if (event.key === '/') { event.preventDefault(); canvas.value?.querySelector<HTMLInputElement>('input')?.focus() }
  else if (event.altKey && /^[1-9]$/.test(event.key)) {
    const node = shortcuts.value[Number(event.key) - 1]
    if (node) document.getElementById('widget-' + node.id)?.querySelector<HTMLAnchorElement>('.icon-link')?.click()
  } else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) filter.value += event.key
  else if (event.key === 'Escape') filter.value = ''
  else if (event.key === 'Backspace' && filter.value) { event.preventDefault(); filter.value = filter.value.slice(0, -1) }
}
// 固定应用的数字角标与键盘操作使用相同列表。
const shortcuts = computed(() => visibleNodes.value.map(entry => entry.node).filter(node => node.type === 'bookmark' && positions.value.get(node.id)?.pinned).slice(0, 9))
// 松开组合键或离开窗口时清除角标。
function releaseAlt() { alt.value = false }
onBeforeRouteLeave(() => !dirty.value || confirm('放弃未保存的布局修改并离开？'))
// 页面关闭时保护尚未保存的草稿。
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value) event.preventDefault() }
onMounted(() => {
  resize(); observer = new ResizeObserver(resize)
  if (canvas.value) observer.observe(canvas.value)
  document.addEventListener('keydown', keyboard); document.addEventListener('keyup', releaseAlt)
  window.addEventListener('blur', releaseAlt); window.addEventListener('beforeunload', beforeUnload)
})

// 自动防抖保存定时器与排队持久化。
let autoSaveCanvasTimer: ReturnType<typeof setTimeout> | undefined
function triggerAutoSave() {
  dirty.value = true
  if (autoSaveCanvasTimer) clearTimeout(autoSaveCanvasTimer)
  autoSaveCanvasTimer = setTimeout(async () => { await save() }, props.editing ? 600 : 1000)
}
watch(dirty, isDirty => {
  emit('dirty', isDirty)
  if (isDirty) triggerAutoSave()
})

// 统一响应组件就地内容变更并在常态下排队自动保存。
function handleWidgetUpdate(node: WidgetNode) { update(node) }
// 响应配置弹窗保存。
function handleEditorSave(node: WidgetNode) { update(node) }
// 响应配置弹窗复制。
function handleEditorCopy(node: WidgetNode) { add(node.type, node) }
// 响应配置弹窗模板保存。
function handleEditorTemplate(node: WidgetNode) { template(node) }
// 响应配置弹窗删除。
function handleEditorRemove(id: string) { remove(id) }

onUnmounted(() => {
  if (autoSaveCanvasTimer) { clearTimeout(autoSaveCanvasTimer); if (dirty.value) void save() }
  observer?.disconnect()
  document.removeEventListener('keydown', keyboard); document.removeEventListener('keyup', releaseAlt)
  window.removeEventListener('blur', releaseAlt); window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<template>
  <div class="desktop" @contextmenu="openContext($event)">
    <div v-if="error" class="canvas-banner canvas-error" role="alert">
      <span>{{ error }}</span>
      <button type="button" @click="reload">重新读取</button>
    </div>
    <div v-if="loading && (!data || !data.nodes.length)" class="canvas-banner canvas-loading" role="status">正在读取桌面…</div>
    <div v-if="filter" class="filter-bar"><label>筛选书签<input v-model="filter" type="search"></label><button type="button" @click="filter = ''">清除</button></div>

    <!-- 实时悬浮组件树抽屉 -->
    <ComponentTree v-if="editing || showComponentTree" :open="showComponentTree" :templates="data?.templates" :groups="groups" :bookmarks="bookmarks" @add="handleAddWidget" @add-template="add($event.type, $event)" @delete-template="deleteTemplate" @import-widget="importWidget" @close="showComponentTree = false" />
    <!-- 主桌面画布网格 -->
    <div ref="canvas" class="desktop-grid" :class="{ editing, 'is-dragging': drag.draggingId.value }" :style="{ '--columns': BREAKPOINTS[breakpoint] }" @dragover="libraryOver" @dragleave="libraryLeave" @drop="drop($event)" @click.capture="drag.click">
      <div v-if="drag.preview.value || libraryPreview" class="drop-preview" :style="{ gridColumn: ((drag.preview.value || libraryPreview)!.x + 1) + ' / span ' + (drag.preview.value || libraryPreview)!.w, gridRow: ((drag.preview.value || libraryPreview)!.y + 1) + ' / span ' + (drag.preview.value || libraryPreview)!.h }" aria-hidden="true" />
      <article
        v-for="entry in visibleNodes"
        :id="'widget-'+entry.node.id"
        :key="entry.key"
        :data-widget-id="entry.node.id"
        class="widget"
        :class="{
          'search-widget': entry.node.type === 'search',
          'frameless-widget': isFrameless(entry.node),
          'dragging-widget': drag.draggingId.value === entry.node.id,
          'folder-absorb-target': drag.hoverFolderId.value === entry.node.id || nativeHoverFolderId === entry.node.id,
        }"
        :style="style(entry.node)"
        @pointerdown="drag.start($event, entry.node)"
        @dragstart.prevent
        @contextmenu="openContext($event, entry.node)"
      >
        <div v-if="editing" class="widget-tools">
          <button type="button" :aria-label="'配置'+entry.node.title" @click="selected = entry.node">配置</button>
          <button type="button" :aria-label="'固定'+entry.node.title" :aria-pressed="positions.get(entry.node.id)?.pinned" @click="pin(entry.node)">{{ positions.get(entry.node.id)?.pinned ? '已固定' : '固定' }}</button>
        </div>
        <span v-if="alt && shortcuts.some(node => node.id === entry.node.id)" class="shortcut">{{ shortcuts.findIndex(node => node.id === entry.node.id) + 1 }}</span>
        <WidgetContent :node="entry.node" :bookmarks="filter ? bookmarks.filter(item => item.title.toLowerCase().includes(filter.toLowerCase())) : bookmarks" :groups="groups" :editing="editing" :width="positions.get(entry.node.id)!.w" @update="handleWidgetUpdate" @edit-bookmark="emit('editBookmark', $event)" @add-bookmark="emit('addBookmark', $event)" @refresh="emit('refresh')" />
        <div v-if="entry.count > 1" class="stack-controls" @wheel.prevent="cycle(entry.key, $event.deltaY > 0 ? 1 : -1)" @touchstart="touchStart = $event.touches[0]!.clientY" @touchend="Math.abs($event.changedTouches[0]!.clientY-touchStart) > 20 && cycle(entry.key, $event.changedTouches[0]!.clientY < touchStart ? 1 : -1)">
          <button type="button" aria-label="上一张" @click="cycle(entry.key, -1)">‹</button><span>{{ (activeStacks[entry.key] ?? 0) % entry.count + 1 }} / {{ entry.count }}</span><button type="button" aria-label="下一张" @click="cycle(entry.key)">›</button>
          <button v-if="editing" type="button" @click="update({ ...entry.node, stackId: '' })">移出叠放</button>
        </div>
      </article>
    </div>
    <p v-if="data && !data.nodes.length" class="empty-state">桌面暂无组件<button v-if="editing" type="button" @click="showComponentTree = true">打开组件树</button></p>
    <ContextMenu :position="contextPosition" :items="contextItems" @close="contextPosition = null" @action="contextAction" />
    <WidgetEditor :node="selected" :breakpoint="breakpoint" :bookmarks="bookmarks" :groups="groups" @close="selected = null" @save="handleEditorSave" @copy="handleEditorCopy" @template="handleEditorTemplate" @remove="handleEditorRemove" />
    <!-- 重新读取确认弹窗 -->
    <AlertModal :show="showReloadConfirm" title="重新读取布局" message="放弃未保存的布局修改并重新读取？" type="warning" :show-cancel="true" cancel-text="取消" confirm-text="确认重读" @confirm="handleConfirmReload" @close="showReloadConfirm = false" />
  </div>
</template>

<style scoped>
.desktop { position: relative; width: 100%; }
.canvas-banner {
  position: absolute;
  top: -36px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-radius: var(--lh-radius-full, 9999px);
  font-size: 12px;
  box-shadow: var(--lh-shadow-dropdown);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  white-space: nowrap;
}
.canvas-error {
  background: color-mix(in srgb, var(--lh-danger, #ef4444) 12%, var(--lh-surface, #fff));
  border: 1px solid var(--lh-danger, #ef4444);
  color: var(--lh-danger, #ef4444);
}
.canvas-error button {
  background: var(--lh-danger, #ef4444);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}
.canvas-loading {
  background: color-mix(in srgb, var(--lh-surface, #fff) 85%, transparent);
  border: 1px solid var(--lh-border);
  color: var(--lh-text-secondary);
}
.desktop-grid { position: relative; display: grid; grid-template-columns: repeat(var(--columns), minmax(0, 1fr)); grid-auto-rows: 96px; gap: var(--lh-grid-gap, 16px); min-height: 220px; width: 100%; }
.widget { position: relative; min-width: 0; container-type: inline-size; padding: var(--widget-padding, 12px); border: var(--widget-border, 1px) solid var(--lh-border); border-radius: var(--widget-radius, var(--lh-radius-lg)); background: color-mix(in srgb, var(--widget-surface, var(--lh-surface-solid, white)) var(--widget-opacity, var(--lh-surface-opacity, 92%)), transparent); color: var(--widget-text, var(--lh-text)); backdrop-filter: blur(var(--widget-blur, var(--lh-blur))) saturate(160%); -webkit-backdrop-filter: blur(var(--widget-blur, var(--lh-blur))) saturate(160%); box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), var(--lh-shadow-card); transition: box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s, color 0.2s, border-radius 0.2s; }
.folder-absorb-target { outline: 2px solid var(--lh-accent) !important; box-shadow: 0 0 14px color-mix(in srgb, var(--lh-accent) 45%, transparent) !important; }
:root[data-theme="modern"] :not(.editing) .widget:not(.frameless-widget):not(.search-widget):hover { transform: translateY(-2px); box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), var(--lh-shadow-hover); transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1); }
:root[data-theme="pixel"] .widget { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
.widget:focus-within { z-index: 5; }
.search-widget { container-type: normal; z-index: 4; display: flex; align-items: center; padding: 0 !important; border: 0 !important; background: transparent !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
.search-widget :deep(.search-container) { width: 100%; margin: 0; max-width: none; }
.frameless-widget { padding: var(--widget-padding, 4px); border: 1px dashed transparent; background: transparent !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
.editing .frameless-widget:hover { border-color: rgba(255, 255, 255, 0.25); background: rgba(255, 255, 255, 0.04) !important; }
.widget-tools { position: absolute; top: -12px; right: 4px; z-index: 6; display: flex; border: 1px solid var(--lh-border); background: color-mix(in srgb, var(--lh-bg) 88%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-radius: 6px; box-shadow: var(--lh-shadow-sm); opacity: 0; transition: opacity .15s; }
.widget-tools button { padding: 3px 5px; font-size: 10px; min-height: 24px; }
.editing .widget { cursor: grab; touch-action: none; user-select: none; }
.editing .widget input, .editing .widget textarea { cursor: text; touch-action: auto; user-select: text; }
.widget:hover .widget-tools, .widget:focus-within .widget-tools { opacity: 1; }
.dragging-widget { pointer-events: none; cursor: grabbing; opacity: .88; box-shadow: var(--lh-shadow-dropdown); transition: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; will-change: transform; }
.drop-preview { z-index: 0; pointer-events: none; border: 2px solid var(--lh-accent); background: color-mix(in srgb, var(--lh-accent) 12%, transparent); border-radius: var(--lh-radius-lg); }
.is-dragging::before { content: ''; position: absolute; inset: 0; pointer-events: none; background-image: radial-gradient(circle, var(--lh-border-hover) 1px, transparent 1px); background-size: calc((100% + var(--lh-grid-gap, 16px)) / var(--columns)) 112px; }
@media (hover: none) { .widget-tools { opacity: 1; } }
.empty-state { text-align: center; padding: 48px 0; }
.stack-controls { position: absolute; bottom: 3px; right: 6px; display: flex; align-items: center; gap: 5px; font-size: 10px; background: var(--lh-surface); border-radius: 8px; }
.stack-controls button { padding: 2px 7px; min-height: 24px; }
.filter-bar { display: flex; gap: 8px; margin-bottom: 20px; }
.shortcut { position: absolute; top: 4px; left: 4px; }
@media (max-width: 560px) { .desktop-grid { gap: min(10px, var(--lh-grid-gap, 16px)); } .widget { --widget-padding: 8px; } .widget-tools { top: -10px; right: 0; } .widget-tools button { padding: 2px; font-size: 9px; } }
</style>
