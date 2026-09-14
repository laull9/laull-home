<script setup lang="ts">
// 分组弹窗属性定义。
const props = defineProps<{
  // 弹窗显隐控制。
  show: boolean
  // 弹窗标题。
  title: string
  // 分组名称初始值。
  modelValue: string
}>()

// 抛出保存与关闭事件。
const emit = defineEmits<{
  // 关闭弹窗。
  close: []
  // 保存分组名称。
  save: [name: string]
  // 双向绑定输入。
  'update:modelValue': [val: string]
}>()

// 提交分组保存。
function handleSave() {
  const name = props.modelValue.trim()
  if (!name) return
  emit('save', name)
}
</script>

<template>
  <div v-if="props.show" class="prompt-backdrop" @click.self="emit('close')">
    <div class="prompt-card">
      <h3>{{ props.title }}</h3>
      <input
        :value="props.modelValue"
        type="text"
        placeholder="输入分组名称"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @keyup.enter="handleSave"
      >
      <div class="prompt-actions">
        <button type="button" class="btn-cancel" @click="emit('close')">取消</button>
        <button type="button" class="btn-accent" @click="handleSave">保存</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prompt-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.prompt-card {
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-md);
  padding: 24px;
  width: 90%;
  max-width: 360px;
}
.prompt-card h3 {
  margin: 0 0 16px 0;
}
.prompt-card input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-bg);
  color: var(--lh-text);
  box-sizing: border-box;
  margin-bottom: 16px;
}
.prompt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn-cancel {
  padding: 6px 14px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-surface);
  color: var(--lh-text);
  font-size: 13px;
  cursor: pointer;
}
.btn-accent {
  padding: 6px 14px;
  border: none;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  font-size: 13px;
  cursor: pointer;
}
</style>
