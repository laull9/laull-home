<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import type { WidgetNode } from '@laull-home/shared'

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

// 组件卸载前刷新未提交的输入。
onBeforeUnmount(() => {
  commitChange()
})
</script>

<template>
  <div class="note-root widget-content" :class="{ compact: width <= 1 }">
    <div class="note-header">
      <span class="note-title">{{ node.title || '便签备忘' }}</span>
      <span v-if="content.length > 0" class="note-count">{{ content.length }} 字</span>
    </div>
    <div class="note-body">
      <textarea
        :value="content"
        :aria-label="node.title || '便签内容'"
        maxlength="8000"
        placeholder="点击输入备忘内容..."
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

.note-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--widget-text, var(--lh-text));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  border: none;
  background: transparent;
  color: var(--widget-text, var(--lh-text));
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  outline: none;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  overflow-y: auto;
  word-break: break-word;
}

.note-editor::placeholder {
  color: var(--widget-text, var(--lh-text-muted));
  opacity: 0.55;
}

.note-root.compact .note-title {
  font-size: 12px;
}

.note-root.compact .note-editor {
  font-size: 12px;
  line-height: 1.5;
}
</style>
