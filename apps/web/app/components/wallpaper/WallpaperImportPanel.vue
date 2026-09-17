<script setup lang="ts">
import type { WallpaperItem } from '@laull-home/shared'
import { useWallpapers } from '../../composables/useWallpapers'

// 定义组件事件：导入成功与打开批量导入弹窗。
const emit = defineEmits<{
  (e: 'imported', item: WallpaperItem): void
  (e: 'openBatch'): void
}>()

const { addWallpaper, uploadWallpaper } = useWallpapers()

// 外部 URL 导入表单字段。
const importUrl = ref('')
const importName = ref('')
const importError = ref('')
const isSubmittingUrl = ref(false)

// 本地文件上传引用与状态。
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploadError = ref('')
const isUploading = ref(false)

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
        :disabled="isUploading"
        @click="triggerFileInput"
      >
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span>{{ isUploading ? '正在上传...' : '本地图片上传' }}</span>
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
</style>
