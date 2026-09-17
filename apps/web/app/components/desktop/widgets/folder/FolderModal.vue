<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { Bookmark } from '@laull-home/shared'
import BookmarkIcon from '../../../BookmarkIcon.vue'
import ContextMenu from '../../../ContextMenu.vue'

// 沉浸式收纳容器视窗参数。
const props = defineProps<{
  show: boolean
  title: string
  items: Bookmark[]
  editing: boolean
}>()

// 容器视窗关闭、书签编辑与新增事件。
const emit = defineEmits<{
  close: []
  editBookmark: [bookmark: Bookmark]
  addBookmark: []
}>()

// 容器内即时过滤关键字。
const filterText = ref('')
// 搜索输入框引用。
const searchInputRef = ref<HTMLInputElement | null>(null)
// 文件夹弹窗右键菜单。
const contextPosition = ref<{ x: number; y: number } | null>(null)
const contextItems = [
  { id: 'add', label: '在此文件夹添加图标' },
]

// 按关键字过滤条目。
const displayedItems = computed(() => {
  const q = filterText.value.trim().toLowerCase()
  if (!q) return props.items
  return props.items.filter(item =>
    item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q),
  )
})

// 处理点击条目：编辑模式打开配置，正常模式跳转。
function onItemClick(event: MouseEvent, item: Bookmark) {
  if (props.editing) {
    event.preventDefault()
    emit('editBookmark', item)
  }
}

// 文件夹视窗内右键快捷菜单。
function handleContextMenu(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  contextPosition.value = { x: event.clientX, y: event.clientY }
}

// 响应快捷操作。
function handleContextAction(id: string) {
  if (id === 'add') {
    emit('addBookmark')
  }
}

// 监听键盘 ESC 快速退出容器，上层弹窗消费后自动忽略。
function handleKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if (props.show && event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

// 点击遮罩空白背景退出容器。
function onBackdropClick(event: MouseEvent) {
  if ((event.target as HTMLElement).classList.contains('container-overlay-backdrop')) {
    emit('close')
  }
}

// 视窗打开时自动聚焦并重置筛选。
watch(() => props.show, async isOpen => {
  if (isOpen) {
    filterText.value = ''
    await nextTick()
    searchInputRef.value?.focus()
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <teleport to="body">
    <transition name="container-zoom">
      <div
        v-if="show"
        class="container-overlay-backdrop"
        role="dialog"
        :aria-label="title || '收纳容器'"
        @click="onBackdropClick"
      >
        <div class="container-viewport" @contextmenu="handleContextMenu">
          <!-- 容器顶栏：名称、条目计数、内嵌搜索与退出把手 -->
          <div class="viewport-header">
            <div class="viewport-title-group">
              <span class="folder-emblem" aria-hidden="true">📂</span>
              <h2 class="viewport-title">{{ title || '收纳容器' }}</h2>
              <span class="viewport-badge">{{ items.length }} 项</span>
            </div>

            <div class="viewport-controls">
              <div class="inline-search-box">
                <span class="search-ico">🔍</span>
                <input
                  ref="searchInputRef"
                  v-model="filterText"
                  type="search"
                  placeholder="快速查找..."
                  aria-label="筛选容器内条目"
                  class="viewport-search-input"
                >
                <button
                  v-if="filterText"
                  type="button"
                  class="search-clear-btn"
                  aria-label="清除搜索"
                  @click="filterText = ''"
                >
                  ✕
                </button>
              </div>

              <button
                type="button"
                class="viewport-close-btn"
                aria-label="关闭容器"
                title="关闭 (ESC)"
                @click="emit('close')"
              >
                ✕
              </button>
            </div>
          </div>

          <!-- 容器内部应用平铺网格 -->
          <div class="viewport-grid-scroller">
            <div v-if="displayedItems.length > 0" class="viewport-items-grid">
              <a
                v-for="item in displayedItems"
                :key="item.id"
                :href="item.url"
                target="_blank"
                rel="noopener noreferrer"
                class="grid-item-card"
                :title="item.title"
                @click="onItemClick($event, item)"
              >
                <div class="item-icon-dock">
                  <BookmarkIcon :title="item.title" :icon-url="item.iconUrl" class="item-icon" />
                </div>
                <span class="item-title">{{ item.title }}</span>
              </a>
            </div>

            <!-- 空结果提示 -->
            <div v-else class="viewport-empty">
              <span class="empty-icon">📁</span>
              <p class="empty-text">{{ filterText ? '未找到相关条目' : '当前容器暂无条目' }}</p>
            </div>
          </div>

          <!-- 底部辅助快捷操作 -->
          <div class="viewport-footer">
            <button type="button" class="btn-quick-add" @click="emit('addBookmark')">
              + 添加条目到当前容器
            </button>
          </div>
        </div>

        <ContextMenu :position="contextPosition" :items="contextItems" @close="contextPosition = null" @action="handleContextAction" />
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
/* 全屏毛玻璃沉浸背景 */
.container-overlay-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 24px; box-sizing: border-box;
  background: color-mix(in srgb, #000 45%, transparent);
  backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  -webkit-backdrop-filter: blur(var(--lh-blur)) saturate(160%);
}

/* 灵动容器视窗主体 */
.container-viewport {
  width: 100%; max-width: 680px; max-height: 85vh; display: flex; flex-direction: column;
  background: color-mix(in srgb, var(--lh-surface) 92%, transparent);
  backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  -webkit-backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), var(--lh-shadow-dropdown);
  color: var(--lh-text);
  overflow: hidden; box-sizing: border-box; transform-origin: center center;
}

:root[data-theme="pixel"] .container-viewport {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border-radius: 2px;
  box-shadow: 4px 4px 0 var(--lh-border);
}

/* 容器顶栏 */
.viewport-header { padding: 18px 24px 14px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--lh-border); }
.viewport-title-group { display: flex; align-items: center; gap: 10px; min-width: 0; }
.folder-emblem { font-size: 22px; line-height: 1; }
.viewport-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--lh-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.viewport-badge { font-size: 11px; font-weight: 600; color: var(--lh-accent); background: color-mix(in srgb, var(--lh-accent) 15%, transparent); padding: 2px 8px; border-radius: 9999px; border: 1px solid color-mix(in srgb, var(--lh-accent) 30%, transparent); white-space: nowrap; }

/* 顶栏操作：搜索与关闭按钮 */
.viewport-controls { display: flex; align-items: center; gap: 12px; }
.inline-search-box { position: relative; display: flex; align-items: center; }
.search-ico { position: absolute; left: 10px; font-size: 12px; pointer-events: none; opacity: .6; color: var(--lh-text-secondary); }
.viewport-search-input { width: 160px; padding: 6px 28px; border-radius: 9999px; border: 1px solid var(--lh-border); background: color-mix(in srgb, var(--lh-input-bg) 85%, transparent); color: var(--lh-text); font-size: 12px; outline: none; transition: width 0.2s, border-color 0.2s, box-shadow 0.2s; }
.viewport-search-input:focus { width: 200px; border-color: var(--lh-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--lh-accent) 20%, transparent); }
.search-clear-btn { position: absolute; right: 8px; background: none; border: none; color: var(--lh-text-secondary); cursor: pointer; padding: 2px; }
.viewport-close-btn { width: 32px; height: 32px; border-radius: 50%; background: var(--lh-surface-hover); border: 1px solid var(--lh-border); color: var(--lh-text); font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s, transform .15s; }
.viewport-close-btn:hover { background: var(--lh-surface-active); transform: scale(1.08); }

/* 内部网格滚动区域 */
.viewport-grid-scroller { flex: 1; overflow-y: auto; padding: 24px; min-height: 180px; box-sizing: border-box; }
.viewport-items-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 18px 12px; }

/* 单个条目卡片设计：应用级图标 + 微浮起 */
.grid-item-card { display: flex; flex-direction: column; align-items: center; gap: 8px; text-decoration: none; color: inherit; padding: 8px 6px; border-radius: 14px; transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.18s; }
.grid-item-card:hover { transform: translateY(-4px); background: var(--lh-surface-hover); }
.item-icon-dock { width: 52px; height: 52px; border-radius: var(--lh-radius-md); background: color-mix(in srgb, var(--lh-surface-hover) 80%, transparent); border: 1px solid var(--lh-border); display: flex; align-items: center; justify-content: center; box-shadow: var(--lh-shadow-sm); transition: box-shadow 0.18s, transform 0.18s; }
.grid-item-card:hover .item-icon-dock { box-shadow: var(--lh-shadow-card); transform: scale(1.04); }
.item-icon { --bookmark-icon-size: 32px; }
.item-title { font-size: 12px; font-weight: 500; color: var(--lh-text); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }

/* 空状态与底部操作 */
.viewport-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 0; color: var(--lh-text-secondary); }
.empty-icon { font-size: 36px; opacity: .6; margin-bottom: 8px; }
.empty-text { margin: 0; font-size: 13px; }
.viewport-footer { padding: 12px 24px; border-top: 1px solid var(--lh-border); display: flex; justify-content: flex-end; background: color-mix(in srgb, var(--lh-surface) 80%, transparent); }
.btn-quick-add { font-size: 12px; padding: 6px 14px; border-radius: var(--lh-radius-sm); background: var(--lh-surface); border: 1px solid var(--lh-border); color: var(--lh-text); cursor: pointer; transition: background .15s; }
.btn-quick-add:hover { background: var(--lh-surface-hover); }

/* 物理弹簧缩放动画 */
.container-zoom-enter-active, .container-zoom-leave-active { transition: opacity 0.22s ease, backdrop-filter 0.22s ease; }
.container-zoom-enter-active .container-viewport { transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease; }
.container-zoom-leave-active .container-viewport { transition: transform 0.18s ease-in, opacity 0.18s ease; }
.container-zoom-enter-from, .container-zoom-leave-to { opacity: 0; }
.container-zoom-enter-from .container-viewport { transform: scale(0.85); opacity: 0; }
.container-zoom-leave-to .container-viewport { transform: scale(0.92); opacity: 0; }

@media (max-width: 600px) {
  .container-overlay-backdrop { padding: 12px; }
  .container-viewport { max-height: 92vh; border-radius: 20px; }
  .viewport-header { padding: 14px 16px; flex-direction: column; align-items: stretch; }
  .viewport-controls { justify-content: space-between; }
  .viewport-search-input, .viewport-search-input:focus { width: 100%; }
}
</style>
