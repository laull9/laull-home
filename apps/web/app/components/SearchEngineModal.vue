<script setup lang="ts">
import type { SearchEngine } from "@laull-home/shared"

// 自定义搜索引擎弹窗属性声明。
const props = withDefaults(
  defineProps<{
    // 控制弹窗显隐。
    show: boolean
    // 是否允许点击遮罩周围区域关闭。
    closeOnClickOutside?: boolean
  }>(),
  {
    closeOnClickOutside: true,
  },
)

// 自定义搜索引擎弹窗事件声明。
const emit = defineEmits<{
  // 关闭弹窗事件。
  (e: "close"): void
  // 创建搜索引擎成功事件。
  (e: "created", engine: SearchEngine): void
}>()

const { createEngine } = useSearch()

// 引擎名称输入绑定。
const newName = ref("")

// 搜索模板输入绑定。
const newTemplate = ref("")

// 快捷 Bang 输入绑定。
const newBang = ref("")

// 是否设为默认引擎。
const newIsDefault = ref(false)

// 错误提示信息。
const addError = ref("")

// 提交状态锁。
const isSubmitting = ref(false)

// 监听弹窗打开时重置表单状态。
watch(
  () => props.show,
  (val) => {
    if (val) {
      newName.value = ""
      newTemplate.value = ""
      newBang.value = ""
      newIsDefault.value = false
      addError.value = ""
    }
  },
)

// 处理关闭弹窗。
function handleClose() {
  emit("close")
}

// 提交保存自定义搜索引擎。
async function handleSave() {
  addError.value = ""
  const name = newName.value.trim()
  const template = newTemplate.value.trim()
  const bang = newBang.value.trim().toLowerCase()

  if (!name || !template) {
    addError.value = "请填写引擎名称和搜索模板"
    return
  }
  if (!template.includes("%s")) {
    addError.value = "搜索模板必须包含 %s 占位符"
    return
  }

  isSubmitting.value = true
  try {
    const created = await createEngine({
      name,
      urlTemplate: template,
      bang: bang || undefined,
      isDefault: newIsDefault.value,
    })
    if (created) {
      emit("created", created)
    }
    emit("close")
  } catch (err: unknown) {
    addError.value = err instanceof Error ? err.message : "添加失败"
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseModal
    :show="show"
    :close-on-click-outside="closeOnClickOutside"
    title="添加自定义搜索引擎"
    @close="handleClose"
  >
    <div class="modal-form">
      <div class="form-field">
        <label>引擎名称</label>
        <input
          v-model="newName"
          type="text"
          class="input-control"
          placeholder="例如：开发者头条"
        >
      </div>

      <div class="form-field">
        <label>搜索地址模板（须含 %s 占位符）</label>
        <input
          v-model="newTemplate"
          type="text"
          class="input-control"
          placeholder="例如：https://toutiao.io/search?q=%s"
        >
      </div>

      <div class="form-field">
        <label>快捷 Bang（可选）</label>
        <input
          v-model="newBang"
          type="text"
          class="input-control"
          placeholder="例如：tt，支持在搜索栏输入 !tt"
        >
      </div>

      <div class="checkbox-row">
        <label class="checkbox-label">
          <input v-model="newIsDefault" type="checkbox">
          <span>设为默认搜索引擎</span>
        </label>
      </div>

      <p v-if="addError" class="form-error">{{ addError }}</p>
    </div>

    <template #footer>
      <button type="button" class="btn-cancel" @click="handleClose">
        取消
      </button>
      <button
        type="button"
        class="btn-save"
        :disabled="isSubmitting"
        @click="handleSave"
      >
        {{ isSubmitting ? "保存中..." : "保存引擎" }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.modal-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field label {
  font-size: 13px;
  color: var(--lh-text-secondary);
}

.input-control {
  padding: 8px 12px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-input-bg);
  color: var(--lh-text);
  font-size: 14px;
  outline: none;
}

.input-control:focus {
  border-color: var(--lh-accent);
}

.checkbox-row {
  margin-top: 2px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--lh-text);
  cursor: pointer;
}

.form-error {
  color: #ef4444;
  font-size: 12px;
  margin: 0;
}

.btn-cancel {
  padding: 7px 14px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-surface);
  color: var(--lh-text);
  font-size: 13px;
  cursor: pointer;
}

.btn-save {
  padding: 7px 16px;
  border: none;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  font-size: 13px;
  cursor: pointer;
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
