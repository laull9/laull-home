<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { arrangeNodes, findBottomRightPlacement, newWidget, BREAKPOINTS, isWidget, scopedCss, type WidgetNode, type Bookmark, type BookmarkGroup, type Breakpoint, type Placement } from '@laull-home/shared'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import { useDesktop } from '../../composables/useDesktop'
import AlertModal from '../AlertModal.vue'
import WidgetContent from './WidgetContent.vue'
import WidgetEditor from './WidgetEditor.vue'
import ComponentTree from './ComponentTree.vue'
import { activeDragTreeItem } from './treeCatalog'

// 画布只接收已授权的空间内容。
const props = defineProps<{ spaceId: string; editing: boolean; bookmarks: Bookmark[]; groups: BookmarkGroup[] }>()
// 复用已有书签编辑与新增操作。
const emit = defineEmits<{ editBookmark: [bookmark: Bookmark]; addBookmark: [groupId?: string]; dirty: [value: boolean]; refresh: []; startEdit: []; quickAdd: [] }>()
// 空间画布和编辑状态。
const { data, error, loading, saving, dirty, load, save, merge, update, add, remove, template } = useDesktop()
const { updateBookmark, createGroup } = useBookmarks()
const breakpoint = ref<Breakpoint>('desktop')
const selectedBreakpoint = ref<'auto' | Breakpoint>('auto')
const canvas = ref<HTMLElement | null>(null)
// 实时组件树面板显隐状态。
const showComponentTree = ref(false)
// 进入编辑模式记录快照，退出编辑模式自动收起组件树。
const initialCanvasSnapshot = ref<string>('')
watch(() => props.editing, isEditing => {
  if (isEditing && data.value) initialCanvasSnapshot.value = JSON.stringify(data.value.nodes)
  if (!isEditing) showComponentTree.value = false
})
const selected = ref<WidgetNode | null>(null)
const importCode = ref(''), filter = ref(''), alt = ref(false), dragged = ref(''), stackMode = ref(false)
const activeStacks = ref<Record<string, number>>({})
let observer: ResizeObserver | undefined, touchStart = 0
// 快捷菜单只作用于已载入且已授权的画布。
const { user } = useAuth()
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
  { id: 'layout', label: '编辑当前空间布局' }, { id: 'add', label: '添加图标导航' },
  { id: 'library', label: showComponentTree.value ? '收起组件树' : '添加组件' }, { id: 'settings', label: '打开全局外观设置' },
])
// 输入框保留原生菜单，其他位置记录右键目标。
function openContext(event: MouseEvent, node: WidgetNode | null = null) {
  if (!user.value || !data.value || loading.value || saving.value || (event.target as HTMLElement).closest('input, textarea, select, [role=dialog], .modal-backdrop')) return
  event.preventDefault()
  event.stopPropagation()
  contextNode.value = node
  contextPosition.value = { x: event.clientX, y: event.clientY }
}
// 操作使用打开菜单时的目标，避免误改其他组件。
function contextAction(id: string) {
  if (!user.value || !data.value || saving.value) return
  if (id === 'settings') { void navigateTo('/settings?page=appearance'); return }
  if (id === 'add') { emit('quickAdd'); return }
  if (id === 'add-to-folder' && contextNode.value) {
    emit('addBookmark', contextNode.value.referenceId)
    return
  }
  if (id === 'delete' && contextNode.value) {
    remove(contextNode.value.id)
    if (!props.editing) void save()
    return
  }
  if (id === 'configure') { selected.value = contextNode.value; return }
  if (id === 'bookmark') {
    const bookmark = props.bookmarks.find(item => item.id === contextNode.value?.referenceId)
    if (bookmark) emit('editBookmark', bookmark)
    return
  }
  if (id === 'library') { showComponentTree.value = !showComponentTree.value; return }
  emit('startEdit')
}
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
// 保存新书签后在当前桌面创建 1x1 脱离底座图标组件，保持非编辑状态。
function addNavigation(bookmark: Bookmark) {
  if (!data.value || saving.value) return
  const placement = findBottomRightPlacement(data.value.nodes, 1, 1, breakpoint.value)
  add('bookmark', {
    ...newWidget('bookmark', crypto.randomUUID()),
    title: bookmark.title,
    referenceId: bookmark.id,
    layouts: {
      desktop: { x: placement.x, y: placement.y, w: 1, h: 1, pinned: true },
      [breakpoint.value]: { x: placement.x, y: placement.y, w: 1, h: 1, pinned: true },
    },
    style: { opacity: 100, blur: 0, radius: 16, padding: 8, border: 0, color: '', background: '', frameless: true },
  })
  if (!props.editing) void save()
}
// 供外部控制组件树显隐、取消改动与右键菜单。
defineExpose({
  addNavigation,
  openContext,
  cancelChanges,
  toggleTree: () => { showComponentTree.value = !showComponentTree.value },
  openTree: () => { showComponentTree.value = true },
})
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
// 缓存已插入样式的快照，样式无变化时不触碰 DOM 避免页面闪烁。
let lastWidgetCss = ''
function installCss() {
  const css = (data.value?.nodes ?? []).map(node => scopedCss(node.css, '#widget-' + node.id)).filter(Boolean).join('\n')
  if (css === lastWidgetCss) return
  lastWidgetCss = css
  let sheet = document.getElementById('lh-widget-css')
  if (!sheet) { sheet = document.createElement('style'); sheet.id = 'lh-widget-css'; document.head.appendChild(sheet) }
  sheet.textContent = css
}
watch(data, () => { if (import.meta.client) installCss() }, { deep: true })
// 滚轮、触屏和按钮使用同一轮播操作。
function cycle(key: string, direction = 1) {
  const count = data.value?.nodes.filter(node => (node.stackId || node.id) === key).length ?? 1
  activeStacks.value[key] = ((activeStacks.value[key] ?? 0) + direction + count) % count
}
// 两类拖动统一提交布局、叠放或书签合并/归组。
async function commitDrop(id: string, p: Placement, targetId?: string) {
  if (!props.editing || saving.value || !data.value) return
  const node = data.value.nodes.find(item => item.id === id)
  const target = data.value.nodes.find(item => item.id === targetId && item.id !== id)
  if (!node) return
  if (!stackMode.value && target && node.type === 'bookmark' && target.type === 'bookmark') {
    if (await merge(node.id, target.id)) emit('refresh')
    return
  }
  if (!stackMode.value && target && node.type === 'bookmark' && target.type === 'folder') {
    let groupId = target.referenceId
    if (!groupId) {
      const created = await createGroup({ spaceId: props.spaceId, name: target.title || '新建文件夹' })
      if (created) {
        groupId = created.id
        update({ ...target, referenceId: groupId })
      }
    }
    if (groupId && node.referenceId) {
      await updateBookmark(node.referenceId, props.spaceId, { groupId })
      remove(node.id)
      emit('refresh')
    }
    return
  }
  if (stackMode.value && target) {
    const sourceSize = positions.value.get(node.id)!, targetSize = positions.value.get(target.id)!
    if (sourceSize.w !== targetSize.w || sourceSize.h !== targetSize.h) { error.value = '叠放需要相同尺寸'; return }
    const stackId = target.stackId || crypto.randomUUID()
    update({ ...target, stackId })
    update({ ...node, stackId, layouts: JSON.parse(JSON.stringify(target.layouts)) })
    return
  }
  update({ ...node, stackId: '', layouts: { ...node.layouts, [breakpoint.value]: p } })
}
// 整个组件在编辑模式响应鼠标和触屏拖动。
const drag = useWidgetDrag({ canvas, nodes: () => data.value?.nodes ?? [], breakpoint,
  enabled: () => props.editing && !saving.value,
  acceptsTarget: (sourceId, targetId) => {
    const source = data.value?.nodes.find(node => node.id === sourceId)
    const target = data.value?.nodes.find(node => node.id === targetId)
    return !!source && !!target && (
      stackMode.value ||
      (source.type === 'bookmark' && target.type === 'bookmark') ||
      (source.type === 'bookmark' && target.type === 'folder')
    )
  },
  commit: (id, position, targetId) => { void commitDrop(id, position, targetId) } })
// 其他组件同步展示避让后的排布，避免落点看起来仍被占用。
const previewPositions = computed(() => {
  if (!drag.preview.value || !drag.draggingId.value) return positions.value
  const nodes = (data.value?.nodes ?? []).map(node => node.id === drag.draggingId.value
    ? { ...node, stackId: '', layouts: { ...node.layouts, [breakpoint.value]: drag.preview.value! } }
    : node)
  return arrangeNodes(nodes, breakpoint.value)
})
// 判断组件是否脱离卡片底座。
function isFrameless(node: WidgetNode) { return node.style?.frameless === true }

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
const libraryPreview = ref<Placement | null>(null)
// 原生拖拽进入网格计算落点。
function libraryOver(event: DragEvent) {
  event.preventDefault()
  if (!canvas.value) return
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
// 离开网格清除预览框。
function libraryLeave() { libraryPreview.value = null }
// 组件树拖放后定位到目标网格并持久化。
async function drop(event: DragEvent) {
  event.preventDefault()
  const targetP = libraryPreview.value
  libraryPreview.value = null
  activeDragTreeItem.value = null
  const text = event.dataTransfer?.getData('text/plain') || dragged.value
  if (saving.value || !data.value || !text.startsWith('new:')) return
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
  document.getElementById('lh-widget-css')?.remove()
})
</script>

<template>
  <div class="desktop" @contextmenu="openContext($event)">
    <div v-if="editing" class="canvas-toolbar">
      <button type="button" :class="{ primary: showComponentTree }" @click="showComponentTree = !showComponentTree">
        {{ showComponentTree ? '收起组件树' : '添加组件' }}
      </button>
      <select v-model="selectedBreakpoint" aria-label="编辑布局断点"><option value="auto">当前屏幕</option><option value="desktop">桌面 · 12 列</option><option value="laptop">便携本 · 8 列</option><option value="tablet">平板 · 6 列</option><option value="mobile">手机 · 4 列</option></select>
      <label><input v-model="stackMode" type="checkbox">拖拽叠放</label>
      <span class="save-status">{{ saving ? '保存中…' : '已自动保存' }}</span>
      <button :disabled="saving || !initialCanvasSnapshot" type="button" class="btn-cancel-layout" @click="cancelChanges">取消更改</button>
      <button :disabled="saving" type="button" @click="reload">重置</button>
    </div>
    <div v-if="error" class="canvas-error" role="alert">{{ error }} <button type="button" @click="reload">重新读取</button></div>
    <p v-if="loading" role="status">正在读取桌面…</p>
    <div v-if="filter" class="filter-bar"><label>筛选书签<input v-model="filter" type="search"></label><button type="button" @click="filter = ''">清除</button></div>

    <!-- 实时悬浮组件树抽屉 -->
    <ComponentTree
      v-if="editing || showComponentTree"
      :open="showComponentTree"
      :templates="data?.templates"
      :groups="groups"
      :bookmarks="bookmarks"
      @add="handleAddWidget"
      @add-template="add($event.type, $event)"
      @delete-template="deleteTemplate"
      @import-widget="importWidget"
      @close="showComponentTree = false"
    />

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
        <WidgetContent :node="entry.node" :bookmarks="filter ? bookmarks.filter(item => item.title.toLowerCase().includes(filter.toLowerCase())) : bookmarks" :groups="groups" :editing="editing" :width="positions.get(entry.node.id)!.w" @update="handleWidgetUpdate" @edit-bookmark="emit('editBookmark', $event)" @add-bookmark="emit('addBookmark', $event)" />
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
    <AlertModal
      :show="showReloadConfirm"
      title="重新读取布局"
      message="放弃未保存的布局修改并重新读取？"
      type="warning"
      :show-cancel="true"
      cancel-text="取消"
      confirm-text="确认重读"
      @confirm="handleConfirmReload"
      @close="showReloadConfirm = false"
    />
  </div>
</template>

<style scoped>
.desktop-grid { position: relative; display: grid; grid-template-columns: repeat(var(--columns), minmax(0, 1fr)); grid-auto-rows: 96px; gap: var(--lh-grid-gap, 16px); min-height: 220px; width: 100%; }
.widget { position: relative; min-width: 0; container-type: inline-size; padding: var(--widget-padding, 12px); border: var(--widget-border, 1px) solid var(--lh-border); border-radius: var(--widget-radius, var(--lh-radius-lg)); background: color-mix(in srgb, var(--widget-surface, var(--lh-surface-solid, white)) var(--widget-opacity, var(--lh-surface-opacity, 92%)), transparent); color: var(--widget-text, var(--lh-text)); backdrop-filter: blur(var(--widget-blur, var(--lh-blur))) saturate(160%); -webkit-backdrop-filter: blur(var(--widget-blur, var(--lh-blur))) saturate(160%); box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), var(--lh-shadow-card); transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s, color 0.2s, border-radius 0.2s; }
:root[data-theme="modern"] :not(.editing) .widget:not(.frameless-widget):not(.search-widget):hover { transform: translateY(-2px); box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), var(--lh-shadow-hover); }
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
.canvas-toolbar { font-size: 13px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 0 28px; }
.canvas-toolbar button, .canvas-toolbar select { padding: 7px 10px; }
.canvas-toolbar label { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.canvas-toolbar input { width: auto; }
.primary { background: var(--lh-accent); color: var(--lh-accent-text); }
.save-status { font-size: 12px; color: var(--lh-text-secondary); margin: 0 4px; }
.btn-cancel-layout { color: var(--lh-text-secondary); }
.empty-state { text-align: center; padding: 48px 0; }
.stack-controls { position: absolute; bottom: 3px; right: 6px; display: flex; align-items: center; gap: 5px; font-size: 10px; background: var(--lh-surface); border-radius: 8px; }
.stack-controls button { padding: 2px 7px; min-height: 24px; }
.filter-bar { display: flex; gap: 8px; margin-bottom: 20px; }
.shortcut { position: absolute; top: 4px; left: 4px; }
@media (max-width: 560px) { .desktop-grid { gap: min(10px, var(--lh-grid-gap, 16px)); } .widget { --widget-padding: 8px; } .widget-tools { top: -10px; right: 0; } .widget-tools button { padding: 2px; font-size: 9px; } }
</style>
