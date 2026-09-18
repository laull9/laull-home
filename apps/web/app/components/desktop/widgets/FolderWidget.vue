<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Bookmark, WidgetNode } from '@laull-home/shared'
import BookmarkIcon from '../../BookmarkIcon.vue'
import ContextMenu from '../../ContextMenu.vue'
import FolderLaunchpad from './folder/FolderLaunchpad.vue'
import FolderModal from './folder/FolderModal.vue'

// 文件夹组件接收节点配置、已过滤书签列表与当前宽度。
const props = defineProps<{ node: WidgetNode; items: Bookmark[]; editing: boolean; width: number }>()

// 书签点击与新增事件。
const emit = defineEmits<{ editBookmark: [bookmark: Bookmark]; addBookmark: [] }>()

// 弹窗展开状态。
const isModalOpen = ref(false)
// 搜索过滤字符串。
const searchQuery = ref('')
// 文件夹快捷菜单位置。
const contextPosition = ref<{ x: number; y: number } | null>(null)
// 快捷菜单项。
const contextItems = [
  { id: 'add', label: '在此文件夹添加图标' },
  { id: 'open', label: '展开全部内容' },
]

// 按关键词过滤书签列表。
const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.items
  return props.items.filter(item => item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q))
})

// 书签点击处理。
function handleItemClick(event: MouseEvent, item: Bookmark) {
  if (props.editing) {
    event.preventDefault()
    emit('editBookmark', item)
  }
}
// 拖动文件夹内图标移出到桌面。
function handleItemDragStart(event: DragEvent, item: Bookmark) {
  event.stopPropagation()
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `folder-item:${props.node.id}:${props.node.referenceId}:${item.id}`)
  }
}

// 点击文件夹小部件空白区域或标题打开详情视窗。
function handleRootClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, .widget-tools')) return
  isModalOpen.value = true
}

// 文件夹非编辑态右键菜单。
function handleContextMenu(event: MouseEvent) {
  if (props.editing) return
  event.preventDefault()
  event.stopPropagation()
  contextPosition.value = { x: event.clientX, y: event.clientY }
}

// 响应文件夹快捷菜单操作。
function handleContextAction(id: string) {
  if (id === 'add') {
    emit('addBookmark')
  } else if (id === 'open') {
    isModalOpen.value = true
  }
}
</script>

<template>
  <div class="folder-root" :class="['folder-' + (node.variant || 'accordion'), { compact: width === 1 }]" @click="handleRootClick" @contextmenu="handleContextMenu">
    <!-- 极窄 1 列尺寸降级为紧凑微缩按钮 -->
    <button
      v-if="width === 1"
      class="compact-folder-btn"
      type="button"
      :aria-label="'打开文件夹 ' + node.title"
      @click="isModalOpen = true"
    >
      <div class="compact-grid">
        <BookmarkIcon
          v-for="item in items.slice(0, 4)"
          :key="item.id"
          :title="item.title"
          :icon-url="item.iconUrl"
          class="compact-icon"
        />
      </div>
      <span class="compact-title">{{ node.title }}</span>
    </button>

    <!-- 启动台九宫格模式 (launchpad) -->
    <FolderLaunchpad
      v-else-if="node.variant === 'launchpad'"
      :title="node.title"
      :items="items"
      :editing="editing"
      @open-modal="isModalOpen = true"
      @edit-bookmark="emit('editBookmark', $event)"
    />

    <!-- 紧凑横滑书架模式 (shelf) -->
    <template v-else-if="node.variant === 'shelf'">
      <div class="shelf-header">
        <div class="shelf-title-wrap">
          <span class="folder-name">{{ node.title }}</span>
          <span class="folder-count">{{ items.length }}</span>
        </div>
        <button type="button" class="shelf-expand-btn" @click="isModalOpen = true">全部</button>
      </div>
      <div class="shelf-track">
        <a
          v-for="item in items"
          :key="item.id"
          :href="item.url"
          target="_blank"
          rel="noopener noreferrer"
          class="shelf-item"
          data-folder-item="true"
          draggable="true"
          @dragstart="handleItemDragStart($event, item)"
          @click="handleItemClick($event, item)"
        >
          <BookmarkIcon :title="item.title" :icon-url="item.iconUrl" class="shelf-icon" />
          <span class="shelf-label">{{ item.title }}</span>
        </a>
      </div>
    </template>

    <!-- 经典平铺网格模式 (grid) -->
    <template v-else-if="node.variant === 'grid'">
      <div class="folder-heading">
        <button type="button" class="folder-title-btn" @click="isModalOpen = true">
          <span class="folder-name">{{ node.title }}</span>
          <span class="folder-count">{{ items.length }}</span>
        </button>
        <input
          v-if="width >= 3"
          v-model="searchQuery"
          type="search"
          placeholder="筛选..."
          aria-label="筛选文件夹书签"
          class="inline-filter"
        >
      </div>
      <div class="folder-grid">
        <a
          v-for="item in filteredItems"
          :key="item.id"
          :href="item.url"
          target="_blank"
          rel="noopener noreferrer"
          class="folder-item"
          data-folder-item="true"
          draggable="true"
          @dragstart="handleItemDragStart($event, item)"
          @click="handleItemClick($event, item)"
        >
          <BookmarkIcon :title="item.title" :icon-url="item.iconUrl" class="folder-icon" />
          <span class="folder-label">{{ item.title }}</span>
        </a>
      </div>
    </template>

    <!-- 默认文件夹卡片模式 -->
    <template v-else>
      <div class="drawer-header">
        <div class="drawer-title-row" role="button" tabindex="0" title="点击全屏打开容器" @click="isModalOpen = true">
          <span class="folder-name">{{ node.title }}</span>
          <span class="folder-count">{{ items.length }} 项</span>
          <span class="drawer-open-indicator" aria-hidden="true">⤢</span>
        </div>
        <input
          v-if="width >= 3"
          v-model="searchQuery"
          type="search"
          placeholder="快速查找..."
          aria-label="筛选文件夹书签"
          class="inline-filter drawer-input"
        >
      </div>
      <div class="drawer-body">
        <div v-if="items.length > 0" class="drawer-grid">
          <a
            v-for="item in filteredItems"
            :key="item.id"
            :href="item.url"
            target="_blank"
            rel="noopener noreferrer"
            class="drawer-item"
            data-folder-item="true"
            draggable="true"
            @dragstart="handleItemDragStart($event, item)"
            @click="handleItemClick($event, item)"
          >
            <BookmarkIcon :title="item.title" :icon-url="item.iconUrl" class="drawer-icon" />
            <span class="drawer-label">{{ item.title }}</span>
          </a>
        </div>
        <div v-else class="drawer-empty">
          <span class="empty-hint">当前容器暂无条目</span>
          <button type="button" class="empty-add-btn" @click.stop="emit('addBookmark')">+ 添加条目</button>
        </div>
      </div>
    </template>

    <!-- 全局弹窗浏览模式 -->
    <FolderModal
      :show="isModalOpen"
      :title="node.title"
      :items="items"
      :editing="editing"
      :folder-node-id="node.id"
      :folder-group-id="node.referenceId"
      @close="isModalOpen = false"
      @edit-bookmark="emit('editBookmark', $event)"
      @add-bookmark="emit('addBookmark')"
    />

    <ContextMenu :position="contextPosition" :items="contextItems" @close="contextPosition = null" @action="handleContextAction" />
  </div>
</template>

<style scoped>
.folder-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-height: 0;
  overflow: hidden;
  cursor: pointer;
}
.folder-root a,
.folder-root button,
.folder-root input {
  cursor: auto;
}
.folder-root button,
.folder-root a {
  cursor: pointer;
}

/* 标题通用样式 */
.folder-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--lh-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-count {
  font-size: 11px;
  color: var(--lh-text-secondary);
  background: var(--lh-surface-hover);
  padding: 1px 6px;
  border-radius: var(--lh-radius-sm);
  font-weight: 500;
}
.inline-filter {
  font-size: 11px;
  padding: 3px 8px;
  border: 1px solid var(--lh-border);
  border-radius: 6px;
  background: var(--lh-input-bg);
  color: var(--lh-text);
  width: 90px;
}

/* 1列紧凑按钮样式 */
.compact-folder-btn {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
}
.compact-grid {
  display: grid;
  grid-template-columns: repeat(2, 18px);
  grid-template-rows: repeat(2, 18px);
  gap: 3px;
  padding: 4px;
  border-radius: var(--lh-radius-md);
  background: var(--lh-surface-hover);
}
.compact-icon {
  --bookmark-icon-size: 18px;
}
.compact-title {
  font-size: 11px;
  font-weight: 500;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 紧凑书架横滑样式 */
.shelf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.shelf-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}
.shelf-expand-btn {
  font-size: 11px;
  color: var(--lh-accent);
  background: none;
  border: none;
  cursor: pointer;
}
.shelf-track {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}
.shelf-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px; text-decoration: none;
  color: inherit; flex-shrink: 0; width: 54px;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease;
}
.shelf-item:hover { transform: translateY(-3px); }
.shelf-icon { --bookmark-icon-size: 32px; }
.shelf-label { font-size: 10px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }

/* 原生折叠风琴抽屉样式 */
.drawer-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; flex-shrink: 0; }
.drawer-title-row {
  display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 2px 4px;
  border-radius: 6px; transition: background-color 0.15s ease, transform 0.12s ease;
}
.drawer-title-row:hover { background: var(--lh-surface-hover); }
.drawer-title-row:active { transform: scale(0.98); }
.drawer-open-indicator { font-size: 11px; opacity: 0.5; transition: opacity 0.15s, transform 0.15s; }
.drawer-title-row:hover .drawer-open-indicator { opacity: 1; transform: scale(1.15); }
.drawer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--lh-text-secondary) 25%, transparent) transparent;
}
.drawer-body::-webkit-scrollbar {
  width: 4px;
}
.drawer-body::-webkit-scrollbar-track {
  background: transparent;
}
.drawer-body::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--lh-text-secondary) 25%, transparent);
  border-radius: 9999px;
}
.drawer-body::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--lh-text-secondary) 50%, transparent);
}
.drawer-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(58px, 1fr)); gap: 8px; padding-bottom: 4px; }
.drawer-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px; text-decoration: none;
  color: inherit; padding: 4px 2px; border-radius: 8px;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-item:hover { transform: translateY(-3px); }
.drawer-icon { --bookmark-icon-size: 28px; transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), filter 0.2s ease; }
.drawer-item:hover .drawer-icon { transform: scale(1.08); filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.18)) brightness(1.15); }
.drawer-label { font-size: 11px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; transition: color 0.15s ease; }
.drawer-item:hover .drawer-label { color: var(--lh-accent); }
.drawer-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 70px; gap: 6px; }
.empty-hint { font-size: 11px; color: var(--lh-text-secondary); }
.empty-add-btn { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: var(--lh-surface-hover); border: 1px solid var(--lh-border); cursor: pointer; color: var(--lh-text); }

/* 经典平铺网格 */
.folder-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.folder-title-btn { display: flex; align-items: center; gap: 6px; background: transparent; border: none; padding: 0; cursor: pointer; }
.folder-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
  gap: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--lh-text-secondary) 25%, transparent) transparent;
}
.folder-grid::-webkit-scrollbar {
  width: 4px;
}
.folder-grid::-webkit-scrollbar-track {
  background: transparent;
}
.folder-grid::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--lh-text-secondary) 25%, transparent);
  border-radius: 9999px;
}
.folder-grid::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--lh-text-secondary) 50%, transparent);
}
.folder-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px; text-decoration: none;
  color: inherit; font-size: 11px; padding: 4px 2px; border-radius: 8px;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.folder-item:hover { transform: translateY(-3px); }
.folder-icon { --bookmark-icon-size: 28px; transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), filter 0.2s ease; }
.folder-item:hover .folder-icon { transform: scale(1.08); filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.18)) brightness(1.15); }
.folder-label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color 0.15s ease; }
.folder-item:hover .folder-label { color: var(--lh-accent); }
</style>
