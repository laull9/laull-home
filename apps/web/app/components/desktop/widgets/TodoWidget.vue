<script setup lang="ts">
import { ref, computed } from 'vue'
import type { WidgetNode } from '@laull-home/shared'

// 待办清单小部件接收配置节点与宽度。
const props = defineProps<{ node: WidgetNode; editing: boolean; width: number }>()

// 原地保存修改并触发草稿更新。
const emit = defineEmits<{ update: [node: WidgetNode] }>()

// 待办单项接口。
interface TodoItem {
  id: string
  text: string
  done: boolean
}

// 新增任务文本输入。
const newTodoText = ref('')

// 解析存储在 content 中的 JSON 任务数组。
const items = computed<TodoItem[]>(() => {
  if (!props.node.content) {
    return [
      { id: '1', text: '规划桌面布局', done: true },
      { id: '2', text: '整理常用书签', done: false },
    ]
  }
  try {
    const parsed = JSON.parse(props.node.content)
    if (Array.isArray(parsed)) return parsed
  } catch {
    // 兼容可能存在的纯文本便签内容
  }
  return []
})

// 提交任务列表序列化更新。
function commitItems(newItems: TodoItem[]) {
  emit('update', { ...props.node, content: JSON.stringify(newItems) })
}

// 切换待办完成状态。
function toggleItem(id: string) {
  const updated = items.value.map(item =>
    item.id === id ? { ...item, done: !item.done } : item,
  )
  commitItems(updated)
}

// 快速新增待办条目。
function addItem() {
  const text = newTodoText.value.trim()
  if (!text) return
  const newItem: TodoItem = { id: crypto.randomUUID(), text, done: false }
  commitItems([...items.value, newItem])
  newTodoText.value = ''
}

// 删除指定待办。
function removeItem(id: string) {
  commitItems(items.value.filter(item => item.id !== id))
}

// 完成任务数量与比例统计。
const stats = computed(() => {
  const total = items.value.length
  const completed = items.value.filter(item => item.done).length
  const percent = total ? Math.round((completed / total) * 100) : 0
  return { total, completed, percent }
})
</script>

<template>
  <div class="todo-root" :class="{ compact: width <= 1 }">
    <div class="todo-header">
      <div class="title-wrap">
        <span class="todo-title">{{ node.title || '待办清单' }}</span>
        <span class="todo-badge">{{ stats.completed }}/{{ stats.total }}</span>
      </div>
      <div class="todo-mini-bar" :title="'完成度 ' + stats.percent + '%'">
        <div class="todo-mini-fill" :style="{ width: stats.percent + '%' }" />
      </div>
    </div>

    <div class="todo-list">
      <div
        v-for="item in items"
        :key="item.id"
        class="todo-item"
        :class="{ completed: item.done }"
      >
        <button
          type="button"
          class="todo-checkbox"
          :class="{ checked: item.done }"
          :aria-label="item.done ? '标记未完成' : '标记已完成'"
          @click="toggleItem(item.id)"
        >
          <span v-if="item.done" class="check-mark">✓</span>
        </button>
        <span class="todo-text" @click="toggleItem(item.id)">{{ item.text }}</span>
        <button
          type="button"
          class="todo-del-btn"
          aria-label="删除任务"
          @click="removeItem(item.id)"
        >
          ×
        </button>
      </div>
      <p v-if="!items.length" class="empty-todo">暂无任务，随手记一件吧</p>
    </div>

    <form class="todo-input-form" @submit.prevent="addItem">
      <input
        v-model="newTodoText"
        type="text"
        placeholder="添加待办..."
        maxlength="100"
        aria-label="新增待办任务"
        class="todo-input"
      >
      <button type="submit" :disabled="!newTodoText.trim()" class="todo-add-btn">+</button>
    </form>
  </div>
</template>

<style scoped>
.todo-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-height: 0;
  gap: 8px;
}

.todo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.todo-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--lh-text);
}

.todo-badge {
  font-size: 11px;
  color: var(--lh-text-secondary);
  background: var(--lh-surface-hover);
  padding: 1px 6px;
  border-radius: 9999px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.todo-mini-bar {
  width: 50px;
  height: 4px;
  border-radius: 9999px;
  background: var(--lh-border);
  overflow: hidden;
}

.todo-mini-fill {
  height: 100%;
  background: var(--lh-success);
  transition: width 0.25s ease;
}

.todo-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 2px;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.todo-item:hover {
  background: color-mix(in srgb, var(--lh-surface-hover) 80%, transparent);
}

.todo-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid var(--lh-border-hover);
  background: transparent;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.todo-checkbox.checked {
  background: var(--lh-success);
  border-color: var(--lh-success);
  color: #ffffff;
}

.check-mark {
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.todo-text {
  flex: 1;
  font-size: 12px;
  color: var(--lh-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.todo-item.completed .todo-text {
  text-decoration: line-through;
  color: var(--lh-text-muted);
}

.todo-del-btn {
  background: transparent;
  border: none;
  color: var(--lh-text-muted);
  cursor: pointer;
  padding: 0 4px;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.todo-item:hover .todo-del-btn {
  opacity: 1;
}

.todo-del-btn:hover {
  color: var(--lh-danger);
}

.empty-todo {
  font-size: 11px;
  color: var(--lh-text-secondary);
  text-align: center;
  margin: auto 0;
}

.todo-input-form {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.todo-input {
  flex: 1;
  font-size: 11px;
  padding: 4px 8px;
  border: 1px solid var(--lh-border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--lh-input-bg) 85%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--lh-text);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.todo-input:focus {
  border-color: var(--lh-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lh-accent) 18%, transparent);
}

.todo-add-btn {
  padding: 0 8px;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 6px color-mix(in srgb, var(--lh-accent) 25%, transparent);
  transition: opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}

.todo-add-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px color-mix(in srgb, var(--lh-accent) 35%, transparent);
}

.todo-add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}
</style>
