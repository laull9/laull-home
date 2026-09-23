<script setup lang="ts">
import { computed } from 'vue'
import type { Bookmark } from '@laull-home/shared'
import BookmarkIcon from '../../../BookmarkIcon.vue'

// 启动台九宫格小部件参数。
const props = defineProps<{
  title: string
  items: Bookmark[]
  editing: boolean
  folderNodeId?: string
}>()

// 展开完整弹窗、编辑单条书签或书签右键事件。
const emit = defineEmits<{
  openModal: []
  editBookmark: [bookmark: Bookmark]
  bookmarkContextmenu: [event: MouseEvent, bookmark: Bookmark]
}>()

// 九宫格显示的前 8 个书签。
const launchpadDirectItems = computed(() => props.items.slice(0, 8))
// 第 9 个格子超出的书签数量。
const launchpadOverflowCount = computed(() => Math.max(0, props.items.length - 8))

// 点击书签交互处理：阻止事件向外冒泡至文件夹根容器。
function onItemClick(event: MouseEvent, item: Bookmark) {
  event.stopPropagation()
  if (props.editing) {
    event.preventDefault()
    emit('editBookmark', item)
  }
}
// 书签右键交互处理。
function onItemContextMenu(event: MouseEvent, item: Bookmark) {
  event.preventDefault()
  event.stopPropagation()
  emit('bookmarkContextmenu', event, item)
}
// 拖动文件夹内图标移出到桌面。
function handleItemDragStart(event: DragEvent, item: Bookmark) {
  event.stopPropagation()
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `folder-item:${props.folderNodeId || ''}:${item.groupId || ''}:${item.id}`)
  }
}

// 点击九宫格空白区域展开详情视窗，排除内部条目与交互控件。
function handleRootClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('a, button, input, textarea, select, .widget-tools, [data-folder-item]')) return
  emit('openModal')
}
</script>

<template>
  <div class="launchpad-root" @click="handleRootClick">
    <div class="launchpad-header" role="button" tabindex="0" :title="'点击展开全部 ' + items.length + ' 项'" @click="emit('openModal')">
      <div class="header-left">
        <span class="folder-name">{{ title }}</span>
        <span class="folder-count">{{ items.length }}</span>
      </div>
      <span class="expand-icon" aria-hidden="true">⤢</span>
    </div>
    <div class="launchpad-grid">
      <a
        v-for="item in launchpadDirectItems"
        :key="item.id"
        :href="item.url"
        target="_blank"
        rel="noopener noreferrer"
        class="launchpad-item"
        :title="item.title"
        data-folder-item="true"
        :data-bookmark-id="item.id"
        draggable="true"
        @dragstart="handleItemDragStart($event, item)"
        @click.stop="onItemClick($event, item)"
        @contextmenu.prevent.stop="onItemContextMenu($event, item)"
      >
        <BookmarkIcon :title="item.title" :icon-url="item.iconUrl" :site-url="item.url" class="launchpad-icon" />
        <span class="launchpad-label">{{ item.title }}</span>
      </a>
      <button
        v-if="launchpadOverflowCount > 0"
        type="button"
        class="launchpad-more-btn"
        :aria-label="'查看全部 ' + items.length + ' 个书签'"
        @click.stop="emit('openModal')"
      >
        <span class="more-plus">+{{ launchpadOverflowCount }}</span>
        <span class="launchpad-label">展开</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.launchpad-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  cursor: pointer;
}
.launchpad-root a,
.launchpad-root button {
  cursor: pointer;
}
.launchpad-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
  transition: background-color 0.15s ease, transform 0.12s ease;
}
.launchpad-header:hover {
  background: var(--lh-surface-hover);
}
.launchpad-header:active {
  transform: scale(0.98);
}
.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.expand-icon {
  font-size: 11px;
  opacity: 0.5;
  transition: opacity 0.15s, transform 0.15s;
}
.launchpad-header:hover .expand-icon {
  opacity: 1;
  transform: scale(1.15);
}
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
.launchpad-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 4px;
  align-items: center;
}
.launchpad-item, .launchpad-more-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  color: inherit;
  gap: 2px;
  min-width: 0;
  padding: 2px;
  border-radius: var(--lh-radius-sm);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.launchpad-item:hover, .launchpad-more-btn:hover {
  transform: translateY(-2px);
}
.launchpad-icon {
  --bookmark-icon-size: 22px;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), filter 0.2s ease;
}
.launchpad-item:hover .launchpad-icon {
  transform: scale(1.1);
  filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.2)) brightness(1.15);
}
.launchpad-label {
  font-size: 10px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.15s ease;
}
.launchpad-item:hover .launchpad-label {
  color: var(--lh-accent);
}
.more-plus {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--lh-surface-hover);
  color: var(--lh-accent);
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
}
</style>
