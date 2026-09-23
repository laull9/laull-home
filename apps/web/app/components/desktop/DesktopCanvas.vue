<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { arrangeNodes, BREAKPOINTS, isWidget, scopedCss, type WidgetNode, type Bookmark, type BookmarkGroup, type Breakpoint } from '@laull-home/shared'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import { useGridFlip } from '../../composables/useGridFlip'
import { useDesktop } from '../../composables/useDesktop'
import { useFolderItemDrag } from '../../composables/useFolderItemDrag'
import { useFolderItemTouchDrag } from '../../composables/useFolderItemTouchDrag'
import { useCanvasContextMenu } from '../../composables/useCanvasContextMenu'
import AlertModal from '../AlertModal.vue'
import FolderItemTouchOverlay from './FolderItemTouchOverlay.vue'
import WidgetContent from './WidgetContent.vue'
import WidgetEditor from './WidgetEditor.vue'
import ComponentTree from './ComponentTree.vue'
import { useCanvasLibraryDrop } from '../../composables/useCanvasLibraryDrop'
import { useCanvasShortcuts } from '../../composables/useCanvasShortcuts'
import { useCanvasWidgetAdd } from '../../composables/useCanvasWidgetAdd'
import { useCanvasDropCommit } from '../../composables/useCanvasDropCommit'

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
const { updateBookmark, createGroup, updateGroup } = useBookmarks()
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
// 组件添加与文件夹独立性管理。
const { handleAddWidget, handleEditorCopy, ensureFoldersIndependent, addNavigation } = useCanvasWidgetAdd({
  data,
  saving,
  dirty,
  breakpoint,
  spaceId: () => props.spaceId,
  editing: () => props.editing,
  bookmarks: () => props.bookmarks,
  groups: () => props.groups,
  createGroup,
  add,
  save,
  setError: msg => { error.value = msg },
})
const canvas = ref<HTMLElement | null>(null)
// 触屏长按文件夹内图标拖出到画布，与原生拖放共用同一套移出逻辑。
const folderItemDrag = useFolderItemTouchDrag({
  canvas,
  breakpoint,
  nodes: () => data.value?.nodes ?? [],
  bookmarks: () => props.bookmarks,
  enabled: () => !saving.value && (props.editing || props.allowDragWithoutEdit),
  commit: (bookmark, folderWidgetId, placement) => {
    void handleDropToCanvas(`folder-item:${folderWidgetId}:${bookmark.groupId || ''}:${bookmark.id}`, placement)
  },
})
// 触屏拾起的文件夹图标悬浮层与其落点预览。
const folderGhost = computed(() => folderItemDrag.ghost.value)
const folderItemPreview = computed(() => folderItemDrag.preview.value)
// 被按下图标的按压描边线：与组件按压同一套方框/圆形动画。
const folderPressLine = computed(() => folderItemDrag.pressLine.value)
// 拖动产生的无效点击在捕获阶段屏蔽。
function suppressTrailingClick(event: MouseEvent) {
  drag.click(event)
}
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
const importCode = ref(''), dragged = ref('')
const activeStacks = ref<Record<string, number>>({})
let observer: ResizeObserver | undefined, touchStart = 0
// 快捷菜单只作用于已载入且已授权的画布。
const { user } = useAuth()
const { contextPosition, contextItems, openContext, openContextAt, contextAction } = useCanvasContextMenu({
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
  onOpenFolder: (n) => { canvas.value?.querySelector<HTMLElement>('#widget-' + n.id)?.dispatchEvent(new Event('open-folder', { bubbles: true })) },
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
// 供外部控制组件树显隐、取消改动与右键菜单。
defineExpose({ addNavigation, openContext, cancelChanges, reload, toggleTree: () => { showComponentTree.value = !showComponentTree.value }, openTree: () => { showComponentTree.value = true } })
// 自动断点取实际可用宽度。
function resize() {
  if (selectedBreakpoint.value !== 'auto') { breakpoint.value = selectedBreakpoint.value; return }
  const width = canvas.value?.clientWidth ?? window.innerWidth
  breakpoint.value = width >= 1160 ? 'desktop' : width >= 800 ? 'laptop' : width >= 560 ? 'tablet' : 'mobile'
}
watch(selectedBreakpoint, resize)
watch(() => props.spaceId, async id => {
  selected.value = null
  showComponentTree.value = false
  await load(id)
  await ensureFoldersIndependent()
}, { immediate: true })
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

// 主桌面键盘快捷检索、数字快捷跳转与角标显隐。
const { filter, alt, shortcuts } = useCanvasShortcuts({
  canvas,
  visibleNodes,
  positions,
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
// 组件放置与叠放提交逻辑。
const { commitDrop } = useCanvasDropCommit({
  data,
  saving,
  dirty,
  breakpoint,
  positions,
  editing: () => props.editing,
  allowDragWithoutEdit: () => props.allowDragWithoutEdit,
  stackMode: () => stackMode.value,
  spaceId: () => props.spaceId,
  vector: () => drag.vector.value,
  update,
  remove,
  merge,
  createGroup,
  updateBookmark,
  save,
  emitRefresh: () => emit('refresh'),
  setError: msg => { error.value = msg },
})
// 编辑模式允许拖动全部组件，常态只开放书签和文件夹。
function canDrag(node?: WidgetNode) {
  return !saving.value && (props.editing || (props.allowDragWithoutEdit && (node?.type === 'bookmark' || node?.type === 'folder')))
}
// 整个组件在编辑模式或允许的非编辑模式下响应鼠标和触屏拖动。
const drag = useWidgetDrag({ canvas, nodes: () => data.value?.nodes ?? [], breakpoint,
  enabled: canDrag,
  acceptsTarget: (sourceId, targetId) => {
    const source = data.value?.nodes.find(node => node.id === sourceId)
    const target = data.value?.nodes.find(node => node.id === targetId)
    if (!source || !target) return false
    if (!props.editing) return props.allowDragWithoutEdit && source.type === 'bookmark' && target.type === 'folder'
    return stackMode.value || (source.type === 'bookmark' && (target.type === 'bookmark' || target.type === 'folder'))
  },
  commit: (id, position, targetId) => { void commitDrop(id, position, targetId) },
  // 触屏长按未拖动时按按下点弹出菜单，与拖动入口共用同一个判定窗口。
  onTouchHoldMenu: (node, x, y) => openContextAt(x, y, node) })
// 触屏按压描边线的绘制参数：进度换算成描边长度，线从左上角顺时针闭合。
const pressLine = computed(() => {
  const shape = drag.touchHoldShape.value
  return shape ? { ...shape, offset: shape.perimeter * (1 - drag.touchHoldProgress.value) } : null
})
// 触屏按压期间由手势判定接管右键菜单，避免原生长按菜单与拖动入口抢占。
function onWidgetContextMenu(event: MouseEvent, node: WidgetNode) {
  if (drag.touchGesture.value) { event.preventDefault(); event.stopPropagation(); return }
  openContext(event, node)
}
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
const { snapshot: snapshotGrid, play: playGridFlip } = useGridFlip(canvas, {
  duration: 160,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
})
watch(previewPositions, async () => {
  if (!drag.draggingId.value) return
  snapshotGrid(drag.draggingId.value)
  await playGridFlip(drag.draggingId.value)
}, { flush: 'pre' })
// 跨断点时取消旧手势，并用同一套 FLIP 动画衔接响应式重排。
watch(breakpoint, async (next, previous) => {
  if (next === previous) return
  drag.cancel()
  snapshotGrid()
  await playGridFlip()
}, { flush: 'pre' })
// 判断组件是否脱离卡片底座。
function isFrameless(node: WidgetNode) {
  if (node.type === 'bookmark') return node.style?.frameless !== false
  return node.style?.frameless === true
}
// 组件树与外部条目网格放置与文件夹吸收拖拽逻辑。
const { libraryPreview, nativeHoverFolderId, libraryOver, libraryLeave, drop } = useCanvasLibraryDrop({
  canvas,
  breakpoint,
  data,
  dirty,
  saving,
  editing: () => props.editing,
  spaceId: () => props.spaceId,
  dragged,
  createGroup,
  update,
  save,
  handleAddWidget,
  handleDropToFolder,
  handleDropToCanvas,
})
// 画布落点预览：组件拖动、外部拖放与文件夹图标拖出共用同一个网格框。
const dropPreview = computed(() => drag.preview.value ?? libraryPreview.value ?? folderItemPreview.value)
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
onBeforeRouteLeave(() => !dirty.value || confirm('放弃未保存的布局修改并离开？'))
// 页面关闭时保护尚未保存的草稿。
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value) event.preventDefault() }
onMounted(() => {
  resize(); observer = new ResizeObserver(resize)
  if (canvas.value) observer.observe(canvas.value)
  window.addEventListener('beforeunload', beforeUnload)
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
// 响应配置弹窗保存，严格防范文件夹分组重复占用。
function handleEditorSave(node: WidgetNode) {
  const safeNode = { ...node, title: node.title.trim() || '新组件' }
  if (safeNode.type === 'folder' && safeNode.referenceId) {
    const isDuplicate = (data.value?.nodes ?? []).some(
      n => n.type === 'folder' && n.id !== safeNode.id && n.referenceId === safeNode.referenceId,
    )
    if (isDuplicate) {
      error.value = '该分组已被其他文件夹使用，文件夹之间必须独立'
      return
    }
  }
  update(safeNode)
  if (safeNode.type === 'folder' && safeNode.referenceId) {
    void updateGroup(safeNode.referenceId, props.spaceId, { name: safeNode.title })
  }
}
// 响应配置弹窗模板保存。
function handleEditorTemplate(node: WidgetNode) { template(node) }
// 响应配置弹窗删除。
function handleEditorRemove(id: string) { remove(id) }

onUnmounted(() => {
  if (autoSaveCanvasTimer) { clearTimeout(autoSaveCanvasTimer); if (dirty.value) void save() }
  observer?.disconnect()
  window.removeEventListener('beforeunload', beforeUnload)
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
    <div ref="canvas" class="desktop-grid" :class="{ editing, 'is-dragging': drag.draggingId.value }" :style="{ '--columns': BREAKPOINTS[breakpoint] }" @dragover="libraryOver" @dragleave="libraryLeave" @drop="drop($event)" @click.capture="suppressTrailingClick">
      <div v-if="dropPreview" class="drop-preview" :style="{ gridColumn: (dropPreview.x + 1) + ' / span ' + dropPreview.w, gridRow: (dropPreview.y + 1) + ' / span ' + dropPreview.h }" aria-hidden="true" />
      <article
        v-for="entry in visibleNodes"
        :id="'widget-'+entry.node.id"
        :key="entry.key"
        :data-widget-id="entry.node.id"
        class="widget"
        :class="{
          'search-widget': entry.node.type === 'search',
          'frameless-widget': isFrameless(entry.node),
          'draggable-widget': canDrag(entry.node),
          'dragging-widget': drag.draggingId.value === entry.node.id,
          'drop-action-target': drag.hoverTargetId.value === entry.node.id,
          'folder-absorb-target': drag.hoverFolderId.value === entry.node.id || nativeHoverFolderId === entry.node.id,
          'touch-holding': drag.touchHoldNodeId.value === entry.node.id,
          'touch-hold-ready': drag.touchHoldReady.value && drag.touchHoldNodeId.value === entry.node.id,
        }"
        :style="style(entry.node)"
        @pointerdown="drag.start($event, entry.node)"
        @dragstart.prevent
        @contextmenu="onWidgetContextMenu($event, entry.node)"
      >
        <!-- 触屏按压等待反馈：主题单色描边线沿组件外框自绘为方框或圆形 -->
        <svg v-if="pressLine && drag.touchHoldNodeId.value === entry.node.id" class="touch-hold-line" :viewBox="pressLine.viewBox" aria-hidden="true">
          <rect :x="pressLine.x" :y="pressLine.y" :width="pressLine.width" :height="pressLine.height" :rx="pressLine.rx" :stroke-dasharray="pressLine.perimeter" :stroke-dashoffset="pressLine.offset" />
        </svg>
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
    <!-- 触屏手势浮层：挂到 body，否则会被应用根节点的层叠上下文压在文件夹遮罩之下 -->
    <FolderItemTouchOverlay
      :folder-press-line="folderPressLine"
      :press-progress="folderItemDrag.pressProgress.value"
      :folder-ghost="folderGhost"
    />
    <ContextMenu :position="contextPosition" :items="contextItems" @close="contextPosition = null" @action="contextAction" />
    <WidgetEditor :node="selected" :breakpoint="breakpoint" :bookmarks="bookmarks" :groups="groups" @close="selected = null" @save="handleEditorSave" @copy="handleEditorCopy" @template="handleEditorTemplate" @remove="handleEditorRemove" />
    <!-- 重新读取确认弹窗 -->
    <AlertModal :show="showReloadConfirm" title="重新读取布局" message="放弃未保存的布局修改并重新读取？" type="warning" :show-cancel="true" cancel-text="取消" confirm-text="确认重读" @confirm="handleConfirmReload" @close="showReloadConfirm = false" />
  </div>
</template>

<style scoped>
.desktop { position: relative; width: 100%; }
.canvas-banner { position: absolute; top: -36px; left: 50%; transform: translateX(-50%); z-index: 10; display: flex; align-items: center; gap: 8px; padding: 4px 12px; border-radius: var(--lh-radius-full, 9999px); font-size: 12px; box-shadow: var(--lh-shadow-dropdown); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); white-space: nowrap; }
.canvas-error { background: color-mix(in srgb, var(--lh-danger, #ef4444) 12%, var(--lh-surface, #fff)); border: 1px solid var(--lh-danger, #ef4444); color: var(--lh-danger, #ef4444); }
.canvas-error button { background: var(--lh-danger, #ef4444); color: #fff; border: none; border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
.canvas-loading { background: color-mix(in srgb, var(--lh-surface, #fff) 85%, transparent); border: 1px solid var(--lh-border); color: var(--lh-text-secondary); }
.desktop-grid { position: relative; display: grid; grid-template-columns: repeat(var(--columns), minmax(0, 1fr)); grid-auto-rows: 96px; gap: var(--lh-grid-gap, 16px); min-height: 220px; width: 100%; }
.widget { position: relative; min-width: 0; container-type: inline-size; padding: var(--widget-padding, 12px); border: var(--widget-border, 1px) solid var(--lh-border); border-radius: var(--widget-radius, var(--lh-radius-lg)); background: color-mix(in srgb, var(--widget-surface, var(--lh-surface-solid, white)) var(--widget-opacity, var(--lh-surface-opacity, 92%)), transparent); color: var(--widget-text, var(--lh-text)); backdrop-filter: blur(var(--widget-blur, var(--lh-blur))) saturate(160%); -webkit-backdrop-filter: blur(var(--widget-blur, var(--lh-blur))) saturate(160%); box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), var(--lh-shadow-card); transition: box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s, color 0.2s, border-radius 0.2s; }
.draggable-widget { cursor: grab; touch-action: pan-y; -webkit-user-drag: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.drop-action-target { outline: 2px solid var(--lh-accent); outline-offset: 2px; transform: scale(.985); transition: transform .12s ease-out, box-shadow .12s ease-out; }
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
.editing .widget { cursor: grab; touch-action: pan-y; user-select: none; }
.editing .widget input, .editing .widget textarea { cursor: text; touch-action: auto; user-select: text; }
.widget:hover .widget-tools, .widget:focus-within .widget-tools { opacity: 1; }
.dragging-widget { pointer-events: none; cursor: grabbing; touch-action: none; opacity: .94; box-shadow: var(--lh-shadow-dropdown); transition: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; will-change: transform; }
.drop-preview { z-index: 0; pointer-events: none; border: 2px solid var(--lh-accent); background: color-mix(in srgb, var(--lh-accent) 12%, transparent); border-radius: var(--lh-radius-lg); }
.is-dragging::before { content: ''; position: absolute; inset: 0; pointer-events: none; background-image: radial-gradient(circle, var(--lh-border-hover) 1px, transparent 1px); background-size: calc((100% + var(--lh-grid-gap, 16px)) / var(--columns)) 112px; }
@media (hover: none) { .widget-tools { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .drop-action-target { transform: none; transition: none; } .touch-holding { transform: none !important; } .touch-hold-line { display: none; } .desktop-grid :deep(.folder-item-holding) { transform: none !important; } }
/* 触屏按压等待反馈：轻微内收配合主题单色描边线，方框或圆形随组件圆角自适应 */
.touch-holding { transform: scale(0.98); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); z-index: 10; }
.touch-holding.touch-hold-ready { touch-action: none; }
.touch-hold-line { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; z-index: 11; }
.touch-hold-line rect { fill: none; stroke: color-mix(in srgb, var(--lh-text) 55%, transparent); stroke-width: 2; stroke-linecap: round; }
/* 触屏长按文件夹图标：等待期原地放大即进入可拖动状态，拾起后原位淡出并把图标交给悬浮层 */
.desktop-grid :deep([data-folder-item]) { -webkit-touch-callout: none; touch-action: pan-y; }
/* 仅触屏禁用原生拖拽，桌面端继续用 HTML5 拖放把图标拖出文件夹 */
@media (pointer: coarse) { .desktop-grid :deep([data-folder-item]) { -webkit-user-drag: none; } }
.desktop-grid :deep(.folder-item-holding) { transform: scale(1.08) !important; opacity: 1; filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.22)) brightness(1.12); transition: transform 0.18s ease-out, opacity 0.18s ease-out, filter 0.18s ease-out; }
.desktop-grid :deep(.folder-item-picked) { transform: scale(0.9) !important; opacity: 0.25; transition: transform 0.18s ease-out, opacity 0.18s ease-out; }

.empty-state { text-align: center; padding: 48px 0; }
.stack-controls { position: absolute; bottom: 3px; right: 6px; display: flex; align-items: center; gap: 5px; font-size: 10px; background: var(--lh-surface); border-radius: 8px; }
.stack-controls button { padding: 2px 7px; min-height: 24px; }
.filter-bar { display: flex; gap: 8px; margin-bottom: 20px; }
.shortcut { position: absolute; top: 4px; left: 4px; }
@media (max-width: 560px) { .desktop-grid { gap: min(10px, var(--lh-grid-gap, 16px)); } .widget { --widget-padding: 8px; } .widget-tools { top: -10px; right: 0; } .widget-tools button { padding: 2px; font-size: 9px; } }
</style>
