<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import type { WidgetNode } from '@laull-home/shared'
import { renderSafeMarkdown } from '@laull-home/shared'

// 便签小部件属性定义。
const props = withDefaults(
  defineProps<{
    node: WidgetNode
    editing?: boolean
    width?: number
  }>(),
  {
    editing: false,
    width: 2,
  },
)

// 触发节点内容更新事件。
const emit = defineEmits<{
  update: [node: WidgetNode]
}>()

// 本地可编辑便签文本。
const content = ref(props.node.content ?? '')

// 是否处于 Markdown 预览状态。
const isPreview = ref(false)

// 定时器引用用于输入防抖。
let debounceTimer: ReturnType<typeof setTimeout> | undefined

// 监听外部属性变更同步本地草稿。
watch(
  () => props.node.content,
  (val) => {
    if (val !== undefined && val !== content.value) {
      content.value = val ?? ''
    }
  },
)

// 经过安全清洗的 Markdown HTML。
const renderedHtml = computed(() => {
  return renderSafeMarkdown(content.value)
})

// 立即提交当前便签变更。
function commitChange() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = undefined
  }
  if (content.value !== (props.node.content ?? '')) {
    emit('update', { ...props.node, content: content.value })
  }
}

// 输入内容时防抖提交变更。
function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  content.value = target.value
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    commitChange()
  }, 800)
}

// 元素失焦时立即固化保存。
function handleBlur() {
  commitChange()
}

// 阻止快捷键和指针事件向上冒泡干扰外层画布。
function handleKeydown(event: KeyboardEvent) {
  event.stopPropagation()
}

// 双击预览区域切换至编辑状态。
function handleDoubleClickPreview() {
  isPreview.value = false
}

// 组件卸载前刷新未提交的输入。
onBeforeUnmount(() => {
  commitChange()
})
</script>

<template>
  <div class="note-root widget-content" :class="{ compact: width <= 1 }">
    <div class="note-header">
      <div class="note-title-wrap">
        <span class="note-title">{{ node.title || '便签备忘' }}</span>
        <button
          v-if="content.length > 0"
          type="button"
          class="btn-toggle-mode"
          :title="isPreview ? '切换为编辑输入' : '切换为 Markdown 预览'"
          @click="isPreview = !isPreview"
          @pointerdown.stop
        >
          {{ isPreview ? '编辑' : '预览' }}
        </button>
      </div>
      <span v-if="content.length > 0" class="note-count">{{ content.length }} 字</span>
    </div>

    <div class="note-body">
      <!-- Markdown 预览模式 -->
      <div
        v-if="isPreview && content.length > 0"
        class="note-preview-scroll"
        @dblclick="handleDoubleClickPreview"
      >
        <div class="markdown-rendered" v-html="renderedHtml" />
      </div>

      <!-- 纯文本/Markdown 原文编辑模式 -->
      <textarea
        v-else
        :value="content"
        :aria-label="node.title || '便签内容'"
        maxlength="8000"
        placeholder="点击输入备忘内容（支持 Markdown 语法）..."
        class="note-editor"
        @input="handleInput"
        @blur="handleBlur"
        @keydown="handleKeydown"
        @pointerdown.stop
      />
    </div>
  </div>
</template>

<style scoped>
.note-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
}

.note-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.note-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.note-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--widget-text, var(--lh-text));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-toggle-mode {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--lh-border);
  background: var(--lh-surface);
  color: var(--lh-text-secondary);
  cursor: pointer;
}

.btn-toggle-mode:hover {
  color: var(--lh-text);
  border-color: var(--lh-accent);
}

.note-count {
  font-size: 11px;
  color: var(--widget-text, var(--lh-text-muted));
  opacity: 0.75;
}

.note-body {
  flex: 1;
  min-height: 0;
  position: relative;
}

.note-editor {
  width: 100%;
  height: 100%;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  color: var(--widget-text, var(--lh-text));
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  outline: none !important;
  padding: 0 !important;
  box-sizing: border-box;
}

.note-preview-scroll {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.markdown-rendered {
  font-size: 13px;
  line-height: 1.6;
  color: var(--widget-text, var(--lh-text));
  word-break: break-word;
}

.markdown-rendered :deep(h1),
.markdown-rendered :deep(h2),
.markdown-rendered :deep(h3),
.markdown-rendered :deep(h4) {
  margin: 8px 0 4px;
  color: var(--widget-text, var(--lh-text));
  font-weight: 600;
}

.markdown-rendered :deep(p) {
  margin: 4px 0;
}

.markdown-rendered :deep(ul),
.markdown-rendered :deep(ol) {
  padding-left: 18px;
  margin: 4px 0;
}

.markdown-rendered :deep(blockquote) {
  margin: 4px 0;
  padding-left: 8px;
  border-left: 3px solid var(--lh-border);
  color: var(--lh-text-secondary);
}

.markdown-rendered :deep(pre) {
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: 4px;
  padding: 6px;
  overflow-x: auto;
}

.markdown-rendered :deep(code) {
  font-family: monospace;
  font-size: 12px;
}

.markdown-rendered :deep(a) {
  color: var(--lh-accent);
  text-decoration: underline;
}

.markdown-rendered :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}
</style>
