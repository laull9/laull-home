<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { WallpaperItem } from '@laull-home/shared'
import { useWallpapers } from '../../composables/useWallpapers'

// 定义组件事件：导入成功与打开批量导入弹窗。
const emit = defineEmits<{
  (e: 'imported', item: WallpaperItem): void
  (e: 'openBatch'): void
}>()

const { addWallpaper, uploadWallpaper, quota, fetchQuota } = useWallpapers()

// 外部 URL 导入表单字段。
const importUrl = ref('')
const importName = ref('')
const importError = ref('')
const isSubmittingUrl = ref(false)

// 本地文件上传引用与状态。
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploadError = ref('')
const isUploading = ref(false)

// 格式化展示已用配额文本。
const quotaText = computed(() => {
  if (!quota.value) return ''
  const usedMb = (quota.value.usedBytes / (1024 * 1024)).toFixed(1)
  const totalMb = Math.round(quota.value.totalBytes / (1024 * 1024))
  return `${usedMb}MB / ${totalMb}MB (${quota.value.usedCount}/${quota.value.maxCount} 张)`
})

// 配额使用百分比。
const quotaPercent = computed(() => {
  if (!quota.value || quota.value.totalBytes === 0) return 0
  return Math.min(100, Math.round((quota.value.usedBytes / quota.value.totalBytes) * 100))
})

// 是否已达到配额上限。
const isQuotaFull = computed(() => {
  if (!quota.value) return false
  return quota.value.usedCount >= quota.value.maxCount || quota.value.usedBytes >= quota.value.totalBytes
})

onMounted(() => {
  if (!quota.value) void fetchQuota()
})

// 唤起本地文件选择。
function triggerFileInput() {
  fileInputRef.value?.click()
}

// 处理本地文件上传。
async function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  uploadError.value = ''
  isUploading.value = true
  try {
    const item = await uploadWallpaper(file)
    if (item) {
      emit('imported', item)
    }
  } catch (err: unknown) {
    uploadError.value = err instanceof Error ? err.message : '上传失败'
  } finally {
    isUploading.value = false
    target.value = ''
  }
}

// 提交外部 URL 导入。
async function handleAddUrl() {
  importError.value = ''
  const url = importUrl.value.trim()
  const name = importName.value.trim() || '外部壁纸'
  if (!url) {
    importError.value = '请输入图片地址'
    return
  }

  isSubmittingUrl.value = true
  try {
    const item = await addWallpaper({ name, url })
    if (item) {
      importUrl.value = ''
      importName.value = ''
      emit('imported', item)
    }
  } catch (err: unknown) {
    importError.value = err instanceof Error ? err.message : '导入失败'
  } finally {
    isSubmittingUrl.value = false
  }
}
</script>

<template>
  <div class="import-panel card-inner">
    <div class="section-title">添加壁纸</div>
    <div class="import-actions">
      <!-- 本地图片上传 -->
      <input
        ref="fileInputRef"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
        style="display: none;"
        @change="handleFileChange"
      >
      <button
        type="button"
        class="btn-upload"
        :class="{ 'is-disabled': isQuotaFull }"
        :disabled="isUploading || isQuotaFull"
        :title="isQuotaFull ? '图库存储配额已满，请先清理图片' : '选择本地图片上传'"
        @click="triggerFileInput"
      >
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span>{{ isUploading ? '正在上传...' : isQuotaFull ? '配额已满' : '本地图片上传' }}</span>
      </button>

      <!-- 批量导入 -->
      <button
        type="button"
        class="btn-batch"
        @click="emit('openBatch')"
      >
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <span>批量导入</span>
      </button>

      <!-- 外部 URL 导入 -->
      <form class="url-form" @submit.prevent="handleAddUrl">
        <input
          v-model="importName"
          type="text"
          placeholder="名称 (可选)"
          class="input-name"
        >
        <input
          v-model="importUrl"
          type="url"
          placeholder="外部图片地址 (https://...)"
          class="input-url"
          required
        >
        <button
          type="submit"
          class="btn-import"
          :disabled="isSubmittingUrl"
        >
          {{ isSubmittingUrl ? '导入中' : '导入链接' }}
        </button>
      </form>
    </div>

    <!-- 配额使用进度展示 -->
    <div v-if="quota" class="quota-container">
      <div class="quota-info">
        <span class="quota-label">图库本地存储配额</span>
        <span class="quota-stat" :class="{ 'is-warn': quotaPercent >= 80, 'is-full': isQuotaFull }">{{ quotaText }}</span>
      </div>
      <div class="quota-bar-track">
        <div
          class="quota-bar-fill"
          :class="{ 'is-warn': quotaPercent >= 80, 'is-full': isQuotaFull }"
          :style="{ width: `${quotaPercent}%` }"
        />
      </div>
    </div>

    <p v-if="uploadError" class="error-text">{{ uploadError }}</p>
    <p v-if="importError" class="error-text">{{ importError }}</p>
  </div>
</template>

<style scoped>
.card-inner {
  padding: 14px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-md);
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--lh-text);
  margin-bottom: 10px;
}

.import-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.btn-upload {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: var(--lh-surface-hover);
  border: 1px dashed var(--lh-border-hover);
  border-radius: var(--lh-radius-sm);
  color: var(--lh-text);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.btn-upload:hover {
  border-color: var(--lh-accent);
  color: var(--lh-accent);
}

.btn-batch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: var(--lh-surface-hover);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  color: var(--lh-text);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.btn-batch:hover {
  border-color: var(--lh-accent);
  color: var(--lh-accent);
}

.url-form {
  display: flex;
  flex: 1;
  min-width: 260px;
  gap: 8px;
}

.input-name {
  width: 100px;
  flex-shrink: 0;
  padding: 7px 10px;
  border-radius: var(--lh-radius-sm);
  border: 1px solid var(--lh-border);
  background: var(--lh-input-bg);
  color: var(--lh-text);
  font-size: 13px;
}

.input-url {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  border-radius: var(--lh-radius-sm);
  border: 1px solid var(--lh-border);
  background: var(--lh-input-bg);
  color: var(--lh-text);
  font-size: 13px;
}

.btn-import {
  padding: 7px 14px;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  border: none;
  border-radius: var(--lh-radius-sm);
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}

.icon {
  width: 14px;
  height: 14px;
}

.error-text {
  color: #ef4444;
  font-size: 12px;
  margin: 4px 0 0 0;
}

.btn-upload.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
  border-color: var(--lh-border);
}

.quota-container {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--lh-border);
}

.quota-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  margin-bottom: 5px;
}

.quota-label {
  color: var(--lh-text-secondary);
}

.quota-stat {
  color: var(--lh-text-secondary);
}

.quota-stat.is-warn {
  color: #f59e0b;
}

.quota-stat.is-full {
  color: #ef4444;
  font-weight: 600;
}

.quota-bar-track {
  width: 100%;
  height: 4px;
  background: var(--lh-surface-hover);
  border-radius: 2px;
  overflow: hidden;
}

.quota-bar-fill {
  height: 100%;
  background: var(--lh-accent);
  border-radius: 2px;
  transition: width 0.3s ease, background-color 0.3s ease;
}

.quota-bar-fill.is-warn {
  background: #f59e0b;
}

.quota-bar-fill.is-full {
  background: #ef4444;
}
</style>
