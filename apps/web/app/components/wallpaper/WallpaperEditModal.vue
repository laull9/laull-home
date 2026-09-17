<script setup lang="ts">
import type { WallpaperItem } from '@laull-home/shared'

// 接收编辑目标壁纸项。
const props = defineProps<{
  item: WallpaperItem | null
}>()

// 定义保存与关闭事件。
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', payload: { name: string; url: string; fitMode: string | null }): void
}>()

// 壁纸名称表单项。
const editName = ref('')

// 壁纸 URL 表单项。
const editUrl = ref('')

// 独立填充模式表单项。
const editFitMode = ref<string>('auto')

// 校验与提交错误提示。
const editError = ref('')

// 同步初始表单字段。
watch(() => props.item, (curr) => {
  if (curr) {
    editName.value = curr.name
    editUrl.value = curr.url
    editFitMode.value = curr.fitMode || 'auto'
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
  emit('save', {
    name,
    url,
    fitMode: editFitMode.value === 'auto' ? null : editFitMode.value,
  })
}
</script>

<template>
  <BaseModal
    :show="!!item"
    title="编辑壁纸信息"
    max-width="440px"
    @close="emit('close')"
  >
    <div v-if="item" class="edit-modal-body">
      <div class="field">
        <label>壁纸名称</label>
        <input v-model="editName" type="text" maxlength="100">
      </div>
      <div class="field">
        <label>图片访问地址</label>
        <input v-model="editUrl" type="url" maxlength="1024">
      </div>
      <div class="field">
        <label>填充模式</label>
        <select v-model="editFitMode">
          <option value="auto">跟随全局配置</option>
          <option value="cover">居中覆盖 (裁剪填满)</option>
          <option value="contain">完整适应 (按比例全显)</option>
          <option value="fill">拉伸填满 (拉伸变形)</option>
          <option value="center">原始居中 (原图大小居中)</option>
          <option value="tile">平铺 (原图重复平铺)</option>
        </select>
      </div>
      <p v-if="editError" class="error-text">{{ editError }}</p>
    </div>

    <template #footer>
      <div class="modal-buttons">
        <button type="button" class="btn-cancel" @click="emit('close')">取消</button>
        <button type="button" class="btn-save" @click="submitSave">保存</button>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.edit-modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field label {
  font-size: 13px;
  color: var(--lh-text-secondary);
}
.field input {
  padding: 8px 12px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-bg);
  color: var(--lh-text);
  font-size: 14px;
}
.field input:focus {
  border-color: var(--lh-accent);
  outline: none;
}
.modal-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn-cancel {
  padding: 6px 14px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  color: var(--lh-text);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.btn-cancel:hover {
  background: var(--lh-surface-hover);
  border-color: var(--lh-border-hover);
}
.btn-save {
  padding: 6px 16px;
  background: var(--lh-accent);
  border: 1px solid transparent;
  border-radius: var(--lh-radius-sm);
  color: var(--lh-accent-text);
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.error-text {
  color: var(--lh-danger);
  font-size: 12px;
  margin: 4px 0 0 0;
}
</style>
