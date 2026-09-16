<script setup lang="ts">
import { nextTick, ref, watch } from "vue"
import type { SearchEngine } from "@laull-home/shared"
import EngineIcon from "./EngineIcon.vue"

// 组件属性声明。
const props = withDefaults(
  defineProps<{
    // 联想建议词列表。
    suggestions: string[]
    // 用户当前输入的查询关键词。
    query: string
    // 键盘选中的建议项索引。
    selectedIndex?: number
    // 当前激活的搜索引擎。
    activeEngine: SearchEngine | null
    // 是否正在远程拉取。
    loading?: boolean
  }>(),
  {
    selectedIndex: -1,
    loading: false,
  }
)

// 建议词列表 DOM 容器引用。
const listRef = ref<HTMLElement | null>(null)

// 监听键盘选中索引变化，自动平滑滚动适应可视区域。
watch(
  () => props.selectedIndex,
  async (newIndex) => {
    if (newIndex < 0 || !listRef.value) {
      if (newIndex === -1 && listRef.value) {
        listRef.value.scrollTop = 0
      }
      return
    }
    await nextTick()
    const container = listRef.value
    const items = container.querySelectorAll<HTMLElement>(".suggestion-item")
    const activeItem = items[newIndex]
    if (!activeItem) return

    const itemTop = activeItem.offsetTop
    const itemBottom = itemTop + activeItem.offsetHeight
    const viewTop = container.scrollTop
    const viewBottom = viewTop + container.clientHeight

    // 选中项超出可视区下方时向下滚动适配
    if (itemBottom > viewBottom) {
      container.scrollTop = itemBottom - container.clientHeight + 4
    }
    // 选中项超出可视区上方时向上滚动适配
    else if (itemTop < viewTop) {
      container.scrollTop = itemTop - 4
    }
  },
)

// 组件事件发射。
const emit = defineEmits<{
  // 确认选中并直接搜索。
  (e: "select", keyword: string): void
  // 仅将关键字填入搜索输入框。
  (e: "fill", keyword: string): void
  // 鼠标悬停同步索引。
  (e: "hover", index: number): void
}>()

// 将建议词根据当前输入拆解为高亮分段。
function splitKeyword(text: string, queryText: string): Array<{ text: string; isMatch: boolean }> {
  if (!queryText || !queryText.trim()) {
    return [{ text, isMatch: false }]
  }
  const q = queryText.trim().toLowerCase()
  const lower = text.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx === -1) {
    return [{ text, isMatch: false }]
  }
  const segments: Array<{ text: string; isMatch: boolean }> = []
  if (idx > 0) {
    segments.push({ text: text.slice(0, idx), isMatch: false })
  }
  segments.push({ text: text.slice(idx, idx + q.length), isMatch: true })
  if (idx + q.length < text.length) {
    segments.push({ text: text.slice(idx + q.length), isMatch: false })
  }
  return segments
}

// 处理点击某项直接执行搜索。
function handleClick(keyword: string) {
  emit("select", keyword)
}

// 处理点击右侧填入箭头。
function handleFill(keyword: string, event: MouseEvent) {
  event.stopPropagation()
  emit("fill", keyword)
}
</script>

<template>
  <div class="suggestions-panel">
    <!-- 顶部搜索引擎提示条 -->
    <div v-if="activeEngine" class="panel-header">
      <EngineIcon
        :name="activeEngine.name"
        :id="activeEngine.id"
        :url="activeEngine.urlTemplate"
        :size="14"
      />
      <span class="engine-hint">{{ activeEngine.name }} 联想建议</span>
      <span v-if="loading" class="loading-indicator">拉取中...</span>
    </div>

    <!-- 建议词列表 -->
    <ul ref="listRef" class="suggestions-list" role="listbox">
      <li
        v-for="(item, index) in suggestions"
        :key="item + index"
        role="option"
        :aria-selected="index === selectedIndex"
        class="suggestion-item"
        :class="{ 'item-selected': index === selectedIndex }"
        @click="handleClick(item)"
        @mouseenter="emit('hover', index)"
      >
        <span class="item-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-search-small">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <span class="item-text">
          <template v-for="(seg, sIdx) in splitKeyword(item, query)" :key="sIdx">
            <span v-if="seg.isMatch" class="highlight-match">{{ seg.text }}</span>
            <template v-else>{{ seg.text }}</template>
          </template>
        </span>
        <button
          type="button"
          class="btn-fill"
          title="填入搜索框"
          @click="handleFill(item, $event)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-fill">
            <line x1="7" y1="17" x2="17" y2="7" />
            <polyline points="7 7 17 7 17 17" />
          </svg>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.suggestions-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 16px;
  right: 16px;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--lh-surface) var(--lh-surface-opacity, 92%), transparent);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg, 16px);
  box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), var(--lh-shadow-card);
  backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  -webkit-backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  overflow: hidden;
  z-index: 50;
  animation: panel-fade-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes panel-fade-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px 4px 14px;
  font-size: 11px;
  color: var(--lh-text-muted);
  border-bottom: 1px solid color-mix(in srgb, var(--lh-border) 40%, transparent);
}

.engine-hint {
  font-weight: 500;
}

.loading-indicator {
  margin-left: auto;
  font-size: 10px;
  color: var(--lh-accent);
}

.suggestions-list {
  position: relative;
  list-style: none;
  margin: 0;
  padding: 4px;
  max-height: 320px;
  overflow-y: auto;
  scroll-behavior: smooth;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--lh-radius-md, 10px);
  cursor: pointer;
  transition: background 0.12s ease;
  user-select: none;
}

.suggestion-item:hover,
.item-selected {
  background: var(--lh-surface-hover);
}

.item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--lh-text-secondary);
  flex-shrink: 0;
}

.icon-search-small {
  width: 14px;
  height: 14px;
}

.item-text {
  flex: 1;
  font-size: 14px;
  color: var(--lh-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.highlight-match {
  color: var(--lh-accent);
  font-weight: 600;
}

.btn-fill {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--lh-text-muted);
  border-radius: var(--lh-radius-sm, 6px);
  cursor: pointer;
  opacity: 0.6;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-fill:hover {
  opacity: 1;
  color: var(--lh-accent);
  background: color-mix(in srgb, var(--lh-accent) 12%, transparent);
}

.icon-fill {
  width: 14px;
  height: 14px;
}
</style>
