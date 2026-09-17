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
  <BaseModal
    :show="props.show"
    :title="props.title"
    max-width="380px"
    @close="emit('close')"
  >
    <div class="prompt-body">
      <input
        :value="props.modelValue"
        type="text"
        placeholder="输入分组名称"
        class="prompt-input"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @keyup.enter="handleSave"
      >
    </div>

    <template #footer>
      <div class="prompt-actions">
        <button type="button" class="btn-cancel" @click="emit('close')">取消</button>
        <button type="button" class="btn-accent" @click="handleSave">保存</button>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.prompt-body {
  display: flex;
  flex-direction: column;
}
.prompt-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-bg);
  color: var(--lh-text);
  box-sizing: border-box;
  font-size: 14px;
}
.prompt-input:focus {
  border-color: var(--lh-accent);
  outline: none;
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
  transition: background 0.15s ease, border-color 0.15s ease;
}
.btn-cancel:hover {
  background: var(--lh-surface-hover);
  border-color: var(--lh-border-hover);
}
.btn-accent {
  padding: 6px 14px;
  border: 1px solid transparent;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
</style>
