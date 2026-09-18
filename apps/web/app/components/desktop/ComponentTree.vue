<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Bookmark, BookmarkGroup, WidgetNode } from '@laull-home/shared'
import { STATIC_TREE_GROUPS, activeDragTreeItem, type TreeItem } from './treeCatalog'
import TreeItemPreview from './TreeItemPreview.vue'

// 实时组件树接收模板列表、分组书签上下文与显隐状态。
const props = defineProps<{
  templates?: WidgetNode[]
  groups?: BookmarkGroup[]
  bookmarks?: Bookmark[]
  open: boolean
}>()

// 节点添加、模板操作、配置导入与收起事件。
const emit = defineEmits<{
  add: [type: WidgetNode['type'], variant?: string, size?: { w: number; h: number }, frameless?: boolean, referenceId?: string]
  addTemplate: [node: WidgetNode]
  deleteTemplate: [id: string]
  importWidget: [code: string]
  close: []
}>()

// 搜索关键词。
const searchQuery = ref('')
// 导入配置代码输入。
const importInput = ref('')
// 分类分支折叠状态。
const expandedGroups = ref<Record<string, boolean>>({
  nav: true,
  myGroups: true,
  time: true,
  tools: true,
  templates: true,
})

// 切换分支折叠。
function toggleGroup(groupId: string) {
  expandedGroups.value[groupId] = !expandedGroups.value[groupId]
}

// 动态将真实分组生成可选收纳组件节点。
const dynamicGroupItems = computed<TreeItem[]>(() => {
  if (!props.groups || !props.groups.length) return []
  return props.groups.map(group => {
    const count = (props.bookmarks || []).filter(b => b.groupId === group.id).length
    return {
      id: 'group-' + group.id,
      type: 'folder' as const,
      variant: '',
      title: group.name,
      desc: `关联分组 · 含 ${count} 项书签`,
      w: 2,
      h: 2,
      tag: `${count}项`,
      referenceId: group.id,
    }
  })
})

// 聚合静态分类与用户真实分组。
const allGroups = computed(() => {
  const list = [...STATIC_TREE_GROUPS]
  if (dynamicGroupItems.value.length > 0) {
    list.splice(1, 0, {
      id: 'myGroups',
      name: '我的书签分组',
      items: dynamicGroupItems.value,
    })
  }
  return list
})

// 按搜索词实时过滤树节点。
const filteredGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return allGroups.value
  return allGroups.value
    .map(group => ({
      ...group,
      items: group.items.filter(item =>
        item.title.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        group.name.toLowerCase().includes(q),
      ),
    }))
    .filter(group => group.items.length > 0)
})

// 搜索状态下默认全部展开。
const isSearching = computed(() => searchQuery.value.trim().length > 0)

// 拖拽起始装配数据。
function onDragStart(event: DragEvent, item: TreeItem) {
  if (!event.dataTransfer) return
  activeDragTreeItem.value = item
  const framelessFlag = item.frameless ? ':frameless' : ''
  const refId = item.referenceId ? `:${item.referenceId}` : ''
  const payload = `new:${item.type}:${item.variant || ''}:${item.w}:${item.h}${framelessFlag}${refId}`
  event.dataTransfer.setData('text/plain', payload)
  event.dataTransfer.effectAllowed = 'copy'
}

// 拖拽结束重置当前节点。
function onDragEnd() {
  activeDragTreeItem.value = null
}

// 点击直接加入桌面。
function onItemClick(item: TreeItem) {
  emit('add', item.type, item.variant, { w: item.w, h: item.h }, item.frameless, item.referenceId)
}

// 提交配置导入。
function submitImport() {
  const code = importInput.value.trim()
  if (!code) return
  emit('importWidget', code)
  importInput.value = ''
}
</script>

<template>
  <aside
    class="component-tree-drawer"
    :class="{ 'is-open': open }"
    aria-label="悬浮组件库面板"
  >
    <!-- 头部搜索与收起 -->
    <div class="tree-header">
      <div class="header-title-row">
        <div class="header-title-group">
          <span class="tree-title">添加组件</span>
          <span class="tree-hint">拖拽或点击加入桌面</span>
        </div>
        <button
          type="button"
          class="tree-close-btn"
          aria-label="收起组件面板"
          title="收起组件面板"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>
      <div class="search-box">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="搜索组件或变体..."
          aria-label="实时搜索组件"
          class="tree-search-input search-input"
        >
        <button v-if="searchQuery" type="button" class="clear-search-btn" @click="searchQuery = ''">✕</button>
      </div>
    </div>

    <!-- 树状内容滚动区 -->
    <div class="tree-body">
      <!-- 分类循环 -->
      <div
        v-for="group in filteredGroups"
        :key="group.id"
        class="tree-group"
      >
        <button
          type="button"
          class="group-header-btn"
          :aria-expanded="isSearching || expandedGroups[group.id] !== false"
          @click="toggleGroup(group.id)"
        >
          <span class="group-arrow" :class="{ rotated: isSearching || expandedGroups[group.id] !== false }">▶</span>
          <span class="group-name">{{ group.name }}</span>
          <span class="group-count">{{ group.items.length }}</span>
        </button>

        <div
          v-show="isSearching || expandedGroups[group.id] !== false"
          class="group-items-grid"
        >
          <div
            v-for="item in group.items"
            :key="item.id"
            class="tree-card"
            draggable="true"
            @dragstart="onDragStart($event, item)"
            @dragend="onDragEnd"
            @click="onItemClick(item)"
          >
            <!-- 实时微缩预览 -->
            <TreeItemPreview :item="item" />

            <div class="card-meta">
              <div class="card-title-row">
                <span class="card-title">{{ item.title }}</span>
                <span v-if="item.tag" class="card-tag">{{ item.tag }}</span>
                <span v-if="item.frameless" class="card-tag frameless-tag">无底座</span>
              </div>
              <p class="card-desc">{{ item.desc }}</p>
            </div>
            <button
              type="button"
              class="card-add-btn"
              :aria-label="'添加' + item.title"
              title="添加到桌面"
              @click.stop="onItemClick(item)"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <!-- 自定义模板分支 -->
      <div v-if="templates && templates.length > 0" class="tree-group">
        <button
          type="button"
          class="group-header-btn"
          @click="toggleGroup('templates')"
        >
          <span class="group-arrow" :class="{ rotated: expandedGroups.templates !== false }">▶</span>
          <span class="group-name">我的模板</span>
          <span class="group-count">{{ templates.length }}</span>
        </button>
        <div v-show="expandedGroups.templates !== false" class="group-items-grid">
          <div
            v-for="tpl in templates"
            :key="tpl.id"
            class="tree-card template-card"
            @click="emit('addTemplate', tpl)"
          >
            <div class="card-meta">
              <span class="card-title">{{ tpl.title || '自定义模板' }}</span>
              <p class="card-desc">类型: {{ tpl.type }}</p>
            </div>
            <button
              type="button"
              class="del-template-btn"
              title="删除模板"
              @click.stop="emit('deleteTemplate', tpl.id)"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      <!-- 底部配置串导入 -->
      <div class="import-section">
        <span class="import-title">导入组件配置串</span>
        <div class="import-row">
          <input
            v-model="importInput"
            type="text"
            placeholder="粘贴 Base64 配置串..."
            class="import-input"
            @keyup.enter="submitImport"
          >
          <button
            type="button"
            class="import-btn"
            :disabled="!importInput.trim()"
            @click="submitImport"
          >
            导入
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.component-tree-drawer {
  position: fixed; left: 20px; top: 76px; bottom: 24px; width: 360px; z-index: 80;
  display: flex; flex-direction: column;
  background: color-mix(in srgb, var(--lh-surface) 92%, transparent);
  backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  -webkit-backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), var(--lh-shadow-dropdown);
  box-sizing: border-box; overflow: hidden;
  color: var(--lh-text);
  transform: translateX(calc(-100% - 30px)); opacity: 0; pointer-events: none;
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease;
}
.component-tree-drawer.is-open { transform: translateX(0); opacity: 1; pointer-events: auto; }

:root[data-theme="pixel"] .component-tree-drawer {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border-radius: 2px;
  box-shadow: 4px 4px 0 var(--lh-border);
}

/* 头部样式 */
.tree-header { padding: 16px 16px 12px; border-bottom: 1px solid var(--lh-border); display: flex; flex-direction: column; gap: 12px; }
.header-title-row { display: flex; align-items: center; justify-content: space-between; }
.header-title-group { display: flex; flex-direction: column; gap: 2px; }
.tree-title { font-size: 15px; font-weight: 700; color: var(--lh-text); }
.tree-hint { font-size: 11px; color: var(--lh-text-secondary); }
.tree-close-btn { width: 28px; height: 28px; border-radius: var(--lh-radius-sm); background: var(--lh-surface-hover); border: 1px solid var(--lh-border); color: var(--lh-text); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: background .15s; }
.tree-close-btn:hover { background: var(--lh-surface-active); }

/* 搜索框 */
.search-box { position: relative; width: 100%; }
.tree-search-input { width: 100%; box-sizing: border-box; padding: 8px 30px 8px 12px !important; border-radius: var(--lh-radius-md); border: 1px solid var(--lh-border); background: color-mix(in srgb, var(--lh-input-bg) 85%, transparent); color: var(--lh-text); font-size: 13px; outline: none; transition: border-color .15s, box-shadow .15s; }
.tree-search-input::-webkit-search-decoration,
.tree-search-input::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }
.tree-search-input:focus { border-color: var(--lh-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--lh-accent) 20%, transparent); }
.clear-search-btn { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--lh-text-secondary); cursor: pointer; padding: 2px; }

/* 滚动体 */
.tree-body { flex: 1; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 16px; }

/* 分组标题与网格 */
.tree-group { display: flex; flex-direction: column; gap: 8px; }
.group-header-btn { display: flex; align-items: center; gap: 8px; background: none; border: none; padding: 4px 6px; cursor: pointer; color: var(--lh-text-secondary); border-radius: var(--lh-radius-sm); font-size: 12px; font-weight: 600; text-align: left; transition: color .15s, background .15s; }
.group-header-btn:hover { color: var(--lh-text); background: var(--lh-surface-hover); }
.group-arrow { font-size: 9px; transition: transform 0.15s ease; display: inline-block; }
.group-arrow.rotated { transform: rotate(90deg); }
.group-name { flex: 1; }
.group-count { font-size: 10px; padding: 1px 6px; border-radius: 999px; background: var(--lh-surface-hover); color: var(--lh-text-secondary); }
.group-items-grid { display: flex; flex-direction: column; gap: 10px; }

/* 组件选项卡 */
.tree-card { position: relative; padding: 10px; border-radius: var(--lh-radius-md); background: color-mix(in srgb, var(--lh-surface) 80%, transparent); border: 1px solid var(--lh-border); display: flex; flex-direction: column; gap: 8px; cursor: grab; transition: transform 0.18s, border-color 0.18s, background-color 0.18s, box-shadow 0.18s; }
.tree-card:hover { transform: translateY(-2px); background: var(--lh-surface-hover); border-color: var(--lh-accent); box-shadow: var(--lh-shadow-hover); }
.tree-card:active { cursor: grabbing; }
:root[data-theme="pixel"] .tree-card { border-radius: 2px; box-shadow: 2px 2px 0 var(--lh-border); }
.card-meta { display: flex; flex-direction: column; gap: 2px; padding-right: 28px; }
.card-title-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.card-title { font-size: 13px; font-weight: 600; color: var(--lh-text); }
.card-tag { font-size: 10px; font-family: monospace; padding: 1px 5px; border-radius: 4px; background: var(--lh-surface-hover); color: var(--lh-text-secondary); border: 1px solid var(--lh-border); }
.card-tag.frameless-tag { background: color-mix(in srgb, var(--lh-accent) 15%, transparent); color: var(--lh-accent); border-color: color-mix(in srgb, var(--lh-accent) 30%, transparent); }
.card-desc { margin: 0; font-size: 11px; color: var(--lh-text-secondary); line-height: 1.3; }
.card-add-btn { position: absolute; right: 10px; bottom: 10px; width: 26px; height: 26px; border-radius: var(--lh-radius-sm); background: var(--lh-accent); color: var(--lh-accent-text); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 2px 6px color-mix(in srgb, var(--lh-accent) 30%, transparent); transition: transform .12s, box-shadow .12s; }
.card-add-btn:hover { transform: scale(1.08); }

/* 自定义模板与导入 */
.template-card { flex-direction: row; align-items: center; justify-content: space-between; }
.del-template-btn { background: none; border: none; color: var(--lh-danger); cursor: pointer; padding: 4px; font-size: 12px; }
.del-template-btn:hover { color: var(--lh-danger-hover); }
.import-section { margin-top: 8px; padding-top: 12px; border-top: 1px dashed var(--lh-border); display: flex; flex-direction: column; gap: 8px; }
.import-title { font-size: 11px; font-weight: 600; color: var(--lh-text-secondary); }
.import-row { display: flex; gap: 6px; }
.import-input { flex: 1; font-size: 11px; padding: 6px 8px; border-radius: var(--lh-radius-sm); border: 1px solid var(--lh-border); background: color-mix(in srgb, var(--lh-input-bg) 85%, transparent); color: var(--lh-text); outline: none; }
.import-btn { padding: 4px 10px; font-size: 11px; border-radius: var(--lh-radius-sm); background: var(--lh-accent); color: var(--lh-accent-text); border: none; cursor: pointer; }
.import-btn:disabled { opacity: .5; cursor: not-allowed; }

@media (max-width: 640px) {
  .component-tree-drawer { left: 8px; right: 8px; width: auto; top: 64px; bottom: 12px; }
}
</style>
