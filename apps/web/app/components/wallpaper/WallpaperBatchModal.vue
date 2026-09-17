<script setup lang="ts">
import { extractImageUrls, type WallpaperItem } from '@laull-home/shared'
import { useWallpapers } from '../../composables/useWallpapers'

// 接收弹窗展开状态与目标图片池标识。
const props = defineProps<{
  show: boolean
  poolId?: string
}>()

// 定义关闭与批量导入完成事件。
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'success', imported: WallpaperItem[]): void
}>()

const { addWallpapersBatch } = useWallpapers()

// 待提取的原始输入文本。
const rawText = ref('')

// 内部待导入壁纸条目结构。
interface BatchCandidate {
  id: string
  name: string
  url: string
  selected: boolean
}

// 解析提取出的候选壁纸列表。
const candidates = ref<BatchCandidate[]>([])

// 批量提交中状态。
const isSubmitting = ref(false)

// 错误反馈提示。
const errorMessage = ref('')

// 监听输入文本变化，自动识别提取图片链接。
watch(rawText, (newText) => {
  errorMessage.value = ''
  if (!newText.trim()) {
    candidates.value = []
    return
  }
  const extracted = extractImageUrls(newText)
  const existingMap = new Map(candidates.value.map(item => [item.url, item]))

  // 保留用户已编辑的名称与选择状态。
  candidates.value = extracted.map((item, idx) => {
    const prev = existingMap.get(item.url)
    return {
      id: prev?.id ?? `candidate-${idx}-${Date.now()}`,
      name: prev?.name ?? item.name,
      url: item.url,
      selected: prev?.selected ?? true,
    }
  })
})

// 弹窗关闭或打开时重置状态。
watch(() => props.show, (isOpen) => {
  if (!isOpen) {
    rawText.value = ''
    candidates.value = []
    errorMessage.value = ''
    isSubmitting.value = false
  }
})

// 已选中的条目计算属性。
const selectedItems = computed(() => candidates.value.filter(item => item.selected))

// 是否全部选中。
const isAllSelected = computed(() => candidates.value.length > 0 && selectedItems.value.length === candidates.value.length)

// 切换全部选择状态。
function toggleSelectAll() {
  const targetState = !isAllSelected.value
  for (const item of candidates.value) {
    item.selected = targetState
  }
}

// 移除单个候选条目。
function removeCandidate(id: string) {
  candidates.value = candidates.value.filter(item => item.id !== id)
}

// 清空文本输入与候选列表。
function handleClearText() {
  rawText.value = ''
  candidates.value = []
  errorMessage.value = ''
}

// 提交批量导入。
async function submitBatch() {
  errorMessage.value = ''
  const targets = selectedItems.value
  if (targets.length === 0) {
    errorMessage.value = '请至少选择一张要导入的壁纸'
    return
  }

  isSubmitting.value = true
  try {
    const payload = targets.map(item => ({
      name: item.name.trim() || undefined,
      url: item.url.trim(),
    }))
    const imported = await addWallpapersBatch(payload, props.poolId)
    emit('success', imported)
    emit('close')
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : '批量导入失败'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseModal
    :show="show"
    title="批量导入壁纸"
    max-width="620px"
    @close="emit('close')"
  >
    <div class="batch-modal-body">
      <!-- 文本输入区 -->
      <div class="input-section">
        <div class="section-label-bar">
          <label class="label-text">粘贴包含图片链接的文本</label>
          <button
            v-if="rawText"
            type="button"
            class="btn-text-action"
            @click="handleClearText"
          >
            清空文本
          </button>
        </div>
        <textarea
          v-model="rawText"
          rows="4"
          placeholder="可粘贴任意 Markdown、HTML 或包含图片地址的段落，将自动提取有效图片链接..."
          class="raw-textarea"
        />
      </div>

      <!-- 提取结果展示与选择区 -->
      <div v-if="candidates.length > 0" class="candidates-section">
        <div class="section-label-bar">
          <span class="count-badge">已识别到 {{ candidates.length }} 张图片</span>
          <button
            type="button"
            class="btn-text-action"
            @click="toggleSelectAll"
          >
            {{ isAllSelected ? '取消全选' : '全选全部' }}
          </button>
        </div>

        <div class="candidates-list">
          <div
            v-for="item in candidates"
            :key="item.id"
            class="candidate-row"
            :class="{ active: item.selected }"
          >
            <input
              v-model="item.selected"
              type="checkbox"
              class="item-checkbox"
            >

            <div class="thumb-box">
              <img
                :src="item.url"
                :alt="item.name"
                class="thumb-img"
                loading="lazy"
                @error="($event.target as HTMLElement).style.opacity = '0.3'"
              >
            </div>

            <div class="info-box">
              <input
                v-model="item.name"
                type="text"
                class="name-input"
                placeholder="壁纸名称"
                maxlength="100"
              >
              <div class="url-text" :title="item.url">{{ item.url }}</div>
            </div>

            <button
              type="button"
              class="btn-remove"
              title="移除此项"
              @click="removeCandidate(item.id)"
            >
              <svg viewBox="0 0 24 24" class="icon" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="rawText.trim()" class="empty-hint">
        未能从文本中识别到有效图片链接，请检查链接格式
      </div>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </div>

    <template #footer>
      <div class="modal-footer-bar">
        <span class="selected-summary">已选择 {{ selectedItems.length }} / {{ candidates.length }} 项</span>
        <div class="modal-actions">
          <button
            type="button"
            class="btn-cancel"
            :disabled="isSubmitting"
            @click="emit('close')"
          >
            取消
          </button>
          <button
            type="button"
            class="btn-confirm"
            :disabled="isSubmitting || selectedItems.length === 0"
            @click="submitBatch"
          >
            {{ isSubmitting ? '正在导入...' : `确认导入 (${selectedItems.length})` }}
          </button>
        </div>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.batch-modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.input-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-label-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--lh-text);
}

.btn-text-action {
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  color: var(--lh-accent);
  cursor: pointer;
}

.btn-text-action:hover {
  text-decoration: underline;
}

.raw-textarea {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--lh-text);
  background: var(--lh-bg);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  resize: vertical;
  line-height: 1.5;
  box-sizing: border-box;
}

.raw-textarea:focus {
  border-color: var(--lh-accent);
  outline: none;
}

.candidates-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.count-badge {
  font-size: 12px;
  color: var(--lh-text-secondary);
}

.candidates-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
  padding-right: 4px;
}

.candidate-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  transition: border-color 0.15s ease;
}

.candidate-row.active {
  border-color: var(--lh-border-hover);
}

.item-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--lh-accent);
  cursor: pointer;
}

.thumb-box {
  width: 48px;
  height: 32px;
  flex-shrink: 0;
  background: var(--lh-surface-hover);
  border-radius: 3px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.info-box {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name-input {
  width: 100%;
  padding: 2px 6px;
  font-size: 13px;
  color: var(--lh-text);
  background: var(--lh-bg);
  border: 1px solid var(--lh-border);
  border-radius: 3px;
  box-sizing: border-box;
}

.name-input:focus {
  border-color: var(--lh-accent);
  outline: none;
}

.url-text {
  font-size: 11px;
  color: var(--lh-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-remove {
  background: none;
  border: none;
  padding: 4px;
  color: var(--lh-text-secondary);
  cursor: pointer;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease;
}

.btn-remove:hover {
  color: var(--lh-danger);
}

.icon {
  width: 14px;
  height: 14px;
}

.empty-hint {
  padding: 16px;
  font-size: 13px;
  text-align: center;
  color: var(--lh-text-secondary);
  background: var(--lh-surface);
  border: 1px dashed var(--lh-border);
  border-radius: var(--lh-radius-sm);
}

.modal-footer-bar {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
}

.selected-summary {
  font-size: 12px;
  color: var(--lh-text-secondary);
}

.modal-actions {
  display: flex;
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

.btn-cancel:hover:not(:disabled) {
  background: var(--lh-surface-hover);
  border-color: var(--lh-border-hover);
}

.btn-cancel:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-confirm {
  padding: 6px 16px;
  background: var(--lh-accent);
  border: 1px solid transparent;
  border-radius: var(--lh-radius-sm);
  color: var(--lh-accent-text);
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-text {
  color: var(--lh-danger);
  font-size: 12px;
  margin: 0;
}
</style>
