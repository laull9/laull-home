<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { arrangeNodes, BREAKPOINTS, WIDGET_CATALOG, isWidget, scopedCss, type WidgetNode, type Bookmark, type BookmarkGroup, type Breakpoint, type Placement } from '@laull-home/shared'
import { useWidgetDrag } from '../../composables/useWidgetDrag'
import { useDesktop } from '../../composables/useDesktop'
import WidgetContent from './WidgetContent.vue'
import WidgetEditor from './WidgetEditor.vue'

// 画布只接收已授权的空间内容。
const props = defineProps<{ spaceId: string; editing: boolean; bookmarks: Bookmark[]; groups: BookmarkGroup[] }>()
// 复用已有书签编辑与新增操作。
const emit = defineEmits<{ editBookmark: [bookmark: Bookmark]; addBookmark: []; dirty: [value: boolean]; refresh: [] }>()
// 空间画布和编辑状态。
const { data, error, loading, saving, dirty, load, save, merge, update, add, remove, template } = useDesktop()
const breakpoint = ref<Breakpoint>('desktop')
const selectedBreakpoint = ref<'auto' | Breakpoint>('auto')
const canvas = ref<HTMLElement | null>(null)
const library = ref(false)
const selected = ref<WidgetNode | null>(null)
const importCode = ref('')
const filter = ref('')
const alt = ref(false)
const dragged = ref('')
const stackMode = ref(false)
const activeStacks = ref<Record<string, number>>({})
let observer: ResizeObserver | undefined
let touchStart = 0
// 自动断点取实际可用宽度。
function resize() {
  if (selectedBreakpoint.value !== 'auto') { breakpoint.value = selectedBreakpoint.value; return }
  const width = canvas.value?.clientWidth ?? window.innerWidth
  breakpoint.value = width >= 1160 ? 'desktop' : width >= 800 ? 'laptop' : width >= 560 ? 'tablet' : 'mobile'
}
watch(selectedBreakpoint, resize)
watch(() => props.spaceId, id => { selected.value = null; library.value = false; void load(id) }, { immediate: true })
watch(dirty, value => emit('dirty', value))
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
// CSS 标签使用文本节点插入，不能通过 HTML 逃逸。
function installCss() {
  let sheet = document.getElementById('lh-widget-css')
  if (!sheet) { sheet = document.createElement('style'); sheet.id = 'lh-widget-css'; document.head.appendChild(sheet) }
  sheet.textContent = (data.value?.nodes ?? []).map(node => scopedCss(node.css, '#widget-' + node.id)).join('\n')
}
watch(data, () => { if (import.meta.client) installCss() }, { deep: true })
// 滚轮、触屏和按钮使用同一轮播操作。
function cycle(key: string, direction = 1) {
  const count = data.value?.nodes.filter(node => (node.stackId || node.id) === key).length ?? 1
  activeStacks.value[key] = ((activeStacks.value[key] ?? 0) + direction + count) % count
}
// 两类拖动统一提交布局、叠放或书签合并。
async function commitDrop(id: string, p: Placement, targetId?: string) {
  if (!props.editing || saving.value || !data.value) return
  const node = data.value.nodes.find(item => item.id === id)
  const target = data.value.nodes.find(item => item.id === targetId && item.id !== id)
  if (!node) return
  if (!stackMode.value && target && node.type === 'bookmark' && target.type === 'bookmark') {
    if (await merge(node.id, target.id)) emit('refresh')
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
    return !!source && !!target && (stackMode.value || (source.type === 'bookmark' && target.type === 'bookmark'))
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
// 组件库保持原生拖放。
function libraryOver(event: DragEvent) {
  if (!props.editing || !dragged.value) return
  event.preventDefault()
}
// 组件库拖放后定位到目标网格。
async function drop(event: DragEvent) {
  if (!props.editing || saving.value || !data.value || !dragged.value.startsWith('new:')) return
  event.preventDefault()
  add(dragged.value.slice(4) as WidgetNode['type'])
  const node = data.value.nodes.at(-1)!
  dragged.value = ''
  const p = drag.placement(node.id, event.clientX, event.clientY)
  if (p) await commitDrop(node.id, p)
}
// 键盘与移动端可在配置浮层修改位置。
function pin(node: WidgetNode) {
  const p = positions.value.get(node.id)!
  update({ ...node, layouts: { ...node.layouts, [breakpoint.value]: { ...p, pinned: !p.pinned } } })
}
// 导入使用严格版本、大小和 Schema 校验。
function importWidget() {
  try {
    if (importCode.value.length > 24000) throw new Error('配置代码串过长')
    const bytes = Uint8Array.from(atob(importCode.value.trim()), char => char.charCodeAt(0))
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (value.version !== 1 || !isWidget(value.node)) throw new Error('配置版本或字段无效')
    scopedCss(value.node.css, '#widget-import')
    add(value.node.type, value.node)
    importCode.value = ''
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '导入失败' }
}
// 草稿重读必须由用户主动放弃。
function reload() {
  if (!dirty.value || confirm('放弃未保存的布局修改并重新读取？')) void load(props.spaceId)
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
  resize()
  observer = new ResizeObserver(resize)
  if (canvas.value) observer.observe(canvas.value)
  document.addEventListener('keydown', keyboard)
  document.addEventListener('keyup', releaseAlt)
  window.addEventListener('blur', releaseAlt)
  window.addEventListener('beforeunload', beforeUnload)
})
onUnmounted(() => {
  observer?.disconnect()
  document.removeEventListener('keydown', keyboard)
  document.removeEventListener('keyup', releaseAlt)
  window.removeEventListener('blur', releaseAlt)
  window.removeEventListener('beforeunload', beforeUnload)
  document.getElementById('lh-widget-css')?.remove()
})
</script>

<template>
  <div class="desktop">
    <div v-if="editing" class="canvas-toolbar">
      <button type="button" @click="library = true">添加组件</button>
      <select v-model="selectedBreakpoint" aria-label="编辑布局断点"><option value="auto">当前屏幕</option><option value="desktop">桌面 · 12 列</option><option value="laptop">便携本 · 8 列</option><option value="tablet">平板 · 6 列</option><option value="mobile">手机 · 4 列</option></select>
      <label><input v-model="stackMode" type="checkbox">拖拽叠放</label>
      <button :disabled="saving || !dirty" type="button" class="primary" @click="save">{{ saving ? '保存中' : dirty ? '保存布局' : '已保存' }}</button>
      <button :disabled="saving" type="button" @click="reload">重新读取</button>
    </div>
    <div v-if="error" class="canvas-error" role="alert">{{ error }} <button type="button" @click="reload">重新读取</button></div>
    <p v-if="loading" role="status">正在读取桌面…</p>
    <div v-if="filter" class="filter-bar"><label>筛选书签<input v-model="filter" type="search"></label><button type="button" @click="filter = ''">清除</button></div>
    <div ref="canvas" class="desktop-grid" :class="{ editing, saving, 'is-dragging': drag.draggingId.value }" :style="{ '--columns': BREAKPOINTS[breakpoint] }" @dragover="libraryOver" @drop="drop($event)" @click.capture="drag.click">
      <div v-if="drag.preview.value" class="drop-preview" :style="{ gridColumn: (drag.preview.value.x + 1) + ' / span ' + drag.preview.value.w, gridRow: (drag.preview.value.y + 1) + ' / span ' + drag.preview.value.h }" aria-hidden="true" />
      <article v-for="entry in visibleNodes" :id="'widget-'+entry.node.id" :key="entry.key" :data-widget-id="entry.node.id" class="widget" :class="{ 'search-widget': entry.node.type === 'search', 'dragging-widget': drag.draggingId.value === entry.node.id }" :style="style(entry.node)" @pointerdown="drag.start($event, entry.node)" @dragstart.prevent>
        <div v-if="editing" class="widget-tools">
          <button type="button" :aria-label="'配置'+entry.node.title" @click="selected = entry.node">配置</button>
          <button type="button" :aria-label="'固定'+entry.node.title" :aria-pressed="positions.get(entry.node.id)?.pinned" @click="pin(entry.node)">{{ positions.get(entry.node.id)?.pinned ? '已固定' : '固定' }}</button>
        </div>
        <span v-if="alt && shortcuts.some(node => node.id === entry.node.id)" class="shortcut">{{ shortcuts.findIndex(node => node.id === entry.node.id) + 1 }}</span>
        <WidgetContent :node="entry.node" :bookmarks="filter ? bookmarks.filter(item => item.title.toLowerCase().includes(filter.toLowerCase())) : bookmarks" :groups="groups" :editing="editing && !saving" :width="positions.get(entry.node.id)!.w" @update="update" @edit-bookmark="emit('editBookmark', $event)" @add-bookmark="emit('addBookmark')" />
        <div v-if="entry.count > 1" class="stack-controls" @wheel.prevent="cycle(entry.key, $event.deltaY > 0 ? 1 : -1)" @touchstart="touchStart = $event.touches[0]!.clientY" @touchend="Math.abs($event.changedTouches[0]!.clientY-touchStart) > 20 && cycle(entry.key, $event.changedTouches[0]!.clientY < touchStart ? 1 : -1)">
          <button type="button" aria-label="上一张" @click="cycle(entry.key, -1)">‹</button><span>{{ (activeStacks[entry.key] ?? 0) % entry.count + 1 }} / {{ entry.count }}</span><button type="button" aria-label="下一张" @click="cycle(entry.key)">›</button>
          <button v-if="editing" type="button" @click="update({ ...entry.node, stackId: '' })">移出叠放</button>
        </div>
      </article>
    </div>
    <p v-if="data && !data.nodes.length" class="empty-state">桌面暂无组件<button v-if="editing" type="button" @click="library = true">添加组件</button></p>
    <BaseModal :show="library" title="组件库" max-width="680px" @close="library = false">
      <div class="catalog"><button v-for="item in WIDGET_CATALOG" :key="item.type" type="button" draggable="true" @dragstart="dragged = 'new:'+item.type; library = false" @click="add(item.type)"><strong>{{ item.title }}</strong><span>{{ item.w }} × {{ item.h }}</span></button></div>
      <h3 v-if="data?.templates.length">我的模板</h3>
      <div class="catalog"><div v-for="item in data?.templates" :key="item.id"><button type="button" @click="add(item.type, item)">{{ item.title }}</button><button type="button" :aria-label="'删除模板'+item.title" @click="data!.templates = data!.templates.filter(node => node.id !== item.id); dirty = true">删除</button></div></div>
      <label class="import-label">组件配置代码串<textarea v-model="importCode" rows="3" maxlength="24000" /></label><button type="button" :disabled="!importCode.trim()" @click="importWidget">导入组件</button>
    </BaseModal>
    <WidgetEditor :node="selected" :breakpoint="breakpoint" :bookmarks="bookmarks" :groups="groups" @close="selected = null" @save="update" @copy="add($event.type, $event)" @template="template" @remove="remove" />
  </div>
</template>

<style scoped>
.desktop-grid { position: relative; display: grid; grid-template-columns: repeat(var(--columns), minmax(0, 1fr)); grid-auto-rows: 96px; gap: var(--lh-grid-gap, 16px); min-height: 220px; }
.widget { position: relative; min-width: 0; container-type: inline-size; padding: var(--widget-padding, 12px); border: var(--widget-border, 1px) solid var(--lh-border); border-radius: var(--widget-radius, var(--lh-radius-lg)); background: color-mix(in srgb, var(--widget-surface, var(--lh-surface-solid, white)) var(--widget-opacity, var(--lh-surface-opacity, 95%)), transparent); color: var(--widget-text, var(--lh-text)); backdrop-filter: blur(var(--widget-blur, var(--lh-blur))); box-shadow: var(--lh-shadow-card); transition: background-color .2s, color .2s, border-radius .2s; }
.widget:focus-within { z-index: 5; }
.search-widget { container-type: normal; z-index: 4; display: flex; align-items: center; padding: 0; border: 0; background: none; box-shadow: none; backdrop-filter: none; }
.search-widget :deep(.search-container) { width: 100%; margin: 0; max-width: none; }
.widget-tools { position: absolute; top: -12px; right: 4px; z-index: 6; display: flex; border: 1px solid var(--lh-border); background: var(--lh-bg); border-radius: 6px; box-shadow: var(--lh-shadow-sm); }
.widget-tools button { padding: 3px 5px; font-size: 10px; min-height: 24px; }
.editing .widget { cursor: grab; touch-action: none; user-select: none; }
.editing .widget input, .editing .widget textarea { cursor: text; touch-action: auto; user-select: text; }
.widget-tools { opacity: 0; transition: opacity .15s; }
.widget:hover .widget-tools, .widget:focus-within .widget-tools { opacity: 1; }
.dragging-widget { pointer-events: none; cursor: grabbing; opacity: .85; box-shadow: var(--lh-shadow-dropdown); }
.drop-preview { z-index: 0; pointer-events: none; border: 2px solid var(--lh-accent); background: color-mix(in srgb, var(--lh-accent) 12%, transparent); border-radius: var(--lh-radius-lg); }
.is-dragging { padding-bottom: 112px; }
.is-dragging::before { content: ''; position: absolute; inset: 0; pointer-events: none; background-image: radial-gradient(circle, var(--lh-border-hover) 1px, transparent 1px); background-size: calc((100% + var(--lh-grid-gap, 16px)) / var(--columns)) 112px; }
@media (hover: none) { .widget-tools { opacity: 1; } }
.canvas-toolbar { font-size: 13px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 0 28px; }
.canvas-toolbar button, .canvas-toolbar select { padding: 7px 10px; }
.canvas-toolbar label { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.canvas-toolbar input { width: auto; }
.primary { background: var(--lh-accent); color: var(--lh-accent-text); }
.canvas-error { padding: 12px; border: 1px solid var(--lh-border); margin-bottom: 20px; }
.catalog { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.catalog > button { min-height: 96px; display: flex; flex-direction: column; justify-content: space-between; align-items: start; padding: 16px; }
.catalog span { color: var(--lh-text-secondary); font-size: 12px; }
.import-label { display: flex; flex-direction: column; gap: 8px; margin: 24px 0 10px; }
.empty-state { text-align: center; padding: 48px 0; }
.stack-controls { position: absolute; bottom: 3px; right: 6px; display: flex; align-items: center; gap: 5px; font-size: 10px; background: var(--lh-surface); border-radius: 8px; }
.stack-controls button { padding: 2px 7px; min-height: 24px; }
.filter-bar { display: flex; gap: 8px; margin-bottom: 20px; }
.saving { pointer-events: none; opacity: .7; }
.shortcut { position: absolute; top: 4px; left: 4px; }
@media (max-width: 560px) { .desktop-grid { gap: min(10px, var(--lh-grid-gap, 16px)); } .widget { --widget-padding: 8px; } .widget-tools { top: -10px; right: 0; } .widget-tools button { padding: 2px; font-size: 9px; } }
</style>
