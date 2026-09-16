<script setup lang="ts">
import { extractSiteOrigin, type SearchEngine } from "@laull-home/shared"

// 自定义搜索引擎弹窗属性声明。
const props = withDefaults(
  defineProps<{
    // 控制弹窗显隐。
    show: boolean
    // 是否允许点击遮罩周围区域关闭。
    closeOnClickOutside?: boolean
    // 当前编辑的引擎（若为 null/undefined 则为新增模式）。
    engine?: SearchEngine | null
  }>(),
  {
    closeOnClickOutside: true,
    engine: null,
  },
)

// 自定义搜索引擎弹窗事件声明。
const emit = defineEmits<{
  // 关闭弹窗事件。
  (e: "close"): void
  // 创建搜索引擎成功事件。
  (e: "created", engine: SearchEngine): void
  // 更新搜索引擎成功事件。
  (e: "updated", engine: SearchEngine): void
}>()

const { createEngine, updateEngine } = useSearch()

// 是否处于编辑模式。
const isEditMode = computed(() => !!props.engine)

// 弹窗标题。
const modalTitle = computed(() => isEditMode.value ? "编辑搜索引擎" : "添加自定义搜索引擎")

// 保存提交按钮文字。
const submitButtonText = computed(() => {
  if (isSubmitting.value) return isEditMode.value ? "保存中..." : "创建中..."
  return isEditMode.value ? "保存修改" : "保存引擎"
})

// 引擎名称输入绑定。
const newName = ref("")

// 搜索模板输入绑定。
const newTemplate = ref("")

// 快捷 Bang 输入绑定。
const newBang = ref("")

// 搜索建议模板输入绑定。
const newSuggestionUrl = ref("")

// 是否设为默认引擎。
const newIsDefault = ref(false)

// 获取全局 Nuxt API 客户端实例。
const { $api } = useNuxtApp()

// 全局内存共享的搜索引擎 Favicon 缓存字典。
const iconCache = useState<Record<string, string>>('lh:engine-favicons', () => ({}))

// 错误提示信息。
const addError = ref("")

// 提交状态锁。
const isSubmitting = ref(false)

// 正在手动拉取图标标志。
const isFetchingIcon = ref(false)

// 手动拉取图标操作反馈提示。
const fetchFeedback = ref("")

// 手动拉取图标操作失败标志。
const fetchFailed = ref(false)

// 当前输入的模板是否可以提取有效站点地址。
const canFetchIcon = computed(() => {
  return !!extractSiteOrigin(newTemplate.value)
})

// 填充或重置表单字段。
function populateForm() {
  if (props.engine) {
    newName.value = props.engine.name
    newTemplate.value = props.engine.urlTemplate
    newSuggestionUrl.value = props.engine.suggestionUrl ?? ""
    newBang.value = props.engine.bang ?? ""
    newIsDefault.value = props.engine.isDefault
  } else {
    newName.value = ""
    newTemplate.value = ""
    newSuggestionUrl.value = ""
    newBang.value = ""
    newIsDefault.value = false
  }
  addError.value = ""
  fetchFeedback.value = ""
  fetchFailed.value = false
  isFetchingIcon.value = false
}

// 监听弹窗打开时重置或填充表单状态。
watch(
  () => props.show,
  (val) => {
    if (val) populateForm()
  },
)

// 监听编辑目标引擎变更。
watch(
  () => props.engine,
  () => {
    if (props.show) populateForm()
  },
)

// 处理手动拉取目标站点图标。
async function handleManualFetchIcon() {
  const origin = extractSiteOrigin(newTemplate.value)
  if (!origin) {
    fetchFeedback.value = "请输入合法的搜索地址模板（如 https://example.com/search?q=%s）"
    fetchFailed.value = true
    return
  }

  isFetchingIcon.value = true
  fetchFeedback.value = ""
  fetchFailed.value = false

  try {
    const res = await $api.favicon.fetch.post({ url: origin, forceRefresh: true })
    if (res.data?.iconUrl) {
      const refreshedUrl = `${res.data.iconUrl}?t=${Date.now()}`
      iconCache.value[origin] = refreshedUrl
      if (import.meta.client) {
        try {
          window.localStorage.setItem('lh_engine_favicons', JSON.stringify(iconCache.value))
        } catch { /* 忽略本地存储写入异常。 */ }
      }
      fetchFeedback.value = "已成功拉取最新站点图标"
      fetchFailed.value = false
    } else {
      fetchFeedback.value = "未探测到站点图标，将使用默认首字徽章"
      fetchFailed.value = true
    }
  } catch (err: unknown) {
    fetchFeedback.value = err instanceof Error ? err.message : "拉取图标失败"
    fetchFailed.value = true
  } finally {
    isFetchingIcon.value = false
  }
}

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
    if (props.engine) {
      const updated = await updateEngine(props.engine.id, {
        name,
        urlTemplate: template,
        suggestionUrl: newSuggestionUrl.value.trim() || undefined,
        bang: bang || undefined,
        isDefault: newIsDefault.value,
      })
      if (updated) {
        emit("updated", updated)
      }
      emit("close")
    } else {
      const created = await createEngine({
        name,
        urlTemplate: template,
        suggestionUrl: newSuggestionUrl.value.trim() || undefined,
        bang: bang || undefined,
        isDefault: newIsDefault.value,
      })
      if (created) {
        emit("created", created)
      }
      emit("close")
    }
  } catch (err: unknown) {
    addError.value = err instanceof Error ? err.message : (isEditMode.value ? "更新失败" : "添加失败")
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseModal
    :show="show"
    :close-on-click-outside="closeOnClickOutside"
    :title="modalTitle"
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
        <div class="field-label-row">
          <label>搜索地址模板（须含 %s 占位符）</label>
          <div v-if="newTemplate" class="modal-preview-badge">
            <EngineIcon :name="newName || '预览'" :url="newTemplate" :size="18" />
            <span class="preview-hint">图标预览</span>
          </div>
        </div>
        <div class="template-input-group">
          <input
            v-model="newTemplate"
            type="text"
            class="input-control"
            placeholder="例如：https://toutiao.io/search?q=%s"
          >
          <button
            type="button"
            class="btn-fetch-icon"
            :disabled="!canFetchIcon || isFetchingIcon"
            @click="handleManualFetchIcon"
          >
            {{ isFetchingIcon ? "拉取中..." : "拉取图标" }}
          </button>
        </div>
        <span v-if="fetchFeedback" class="fetch-tip" :class="{ error: fetchFailed }">
          {{ fetchFeedback }}
        </span>
      </div>

      <div class="form-field">
        <label>搜索建议地址模板（可选，含 %s 占位符）</label>
        <input
          v-model="newSuggestionUrl"
          type="text"
          class="input-control"
          placeholder="例如：https://api.bing.com/osjson.aspx?query=%s"
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
        {{ submitButtonText }}
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

.field-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-preview-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-surface-hover);
  border: 1px solid var(--lh-border);
}

.preview-hint {
  font-size: 11px;
  color: var(--lh-text-secondary);
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

.template-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.template-input-group .input-control {
  flex: 1;
}

.btn-fetch-icon {
  padding: 8px 12px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-surface-hover);
  color: var(--lh-accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-fetch-icon:hover:not(:disabled) {
  background: var(--lh-surface-active);
  border-color: var(--lh-accent);
}

.btn-fetch-icon:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.fetch-tip {
  font-size: 12px;
  color: #10b981;
}

.fetch-tip.error {
  color: #ef4444;
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
