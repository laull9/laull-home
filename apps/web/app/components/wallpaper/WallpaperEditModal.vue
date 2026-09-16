<script setup lang="ts">
import type { WallpaperItem } from '@laull-home/shared'

// 接收编辑目标壁纸项。
const props = defineProps<{
  item: WallpaperItem | null
}>()

// 定义保存与关闭事件。
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', payload: { name: string; url: string }): void
}>()

const editName = ref('')
const editUrl = ref('')
const editError = ref('')

// 同步初始表单字段。
watch(() => props.item, (curr) => {
  if (curr) {
    editName.value = curr.name
    editUrl.value = curr.url
    editError.value = ''
  }
}, { immediate: true })

// 校验并提交保存。
function submitSave() {
  editError.value = ''
  const name = editName.value.trim()
  const url = editUrl.value.trim()
  if (!name) {
    editError.value = '壁纸名称不能为空'
    return
  }
  if (!url) {
    editError.value = '图片地址不能为空'
    return
  }
  emit('save', { name, url })
}
</script>

<template>
  <div v-if="item" class="edit-modal-mask" @click.self="emit('close')">
    <div class="edit-modal">
      <h3>编辑壁纸信息</h3>
      <div class="field">
        <label>壁纸名称</label>
        <input v-model="editName" type="text" maxlength="100">
      </div>
      <div class="field">
        <label>图片访问地址</label>
        <input v-model="editUrl" type="url" maxlength="1024">
      </div>
      <p v-if="editError" class="error-text">{{ editError }}</p>
      <div class="modal-buttons">
        <button type="button" class="btn-cancel" @click="emit('close')">取消</button>
        <button type="button" class="btn-save" @click="submitSave">保存</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.edit-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.edit-modal {
  width: 90%;
  max-width: 400px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  padding: 20px;
  box-shadow: var(--lh-shadow-dropdown);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.edit-modal h3 {
  margin: 0;
  font-size: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field label {
  font-size: 12px;
  color: var(--lh-text-secondary);
}
.modal-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}
.btn-cancel {
  padding: 6px 12px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  color: var(--lh-text);
}
.btn-save {
  padding: 6px 16px;
  background: var(--lh-accent);
  border: none;
  border-radius: var(--lh-radius-sm);
  color: var(--lh-accent-text);
}
.error-text {
  color: #ef4444;
  font-size: 12px;
  margin: 4px 0 0 0;
}
</style>
