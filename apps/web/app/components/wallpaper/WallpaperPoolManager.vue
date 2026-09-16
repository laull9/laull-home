<script setup lang="ts">
import type { HomeSettings, WallpaperItem } from '@laull-home/shared'
import { useWallpapers } from '../../composables/useWallpapers'
import WallpaperCard from './WallpaperCard.vue'
import WallpaperEditModal from './WallpaperEditModal.vue'

// 接收双向绑定的用户主页设置。
const model = defineModel<HomeSettings>({ required: true })

const { wallpapers, loading, fetchWallpapers, addWallpaper, uploadWallpaper, updateWallpaper, deleteWallpaper } = useWallpapers()

// 外部 URL 导入表单。
const importUrl = ref('')
const importName = ref('')
const importError = ref('')
const isSubmittingUrl = ref(false)

// 本地文件上传。
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploadError = ref('')
const isUploading = ref(false)

// 编辑壁纸条目弹窗。
const editingItem = ref<WallpaperItem | null>(null)

// 组件挂载时获取图片池列表。
onMounted(async () => {
  await fetchWallpapers()
  // 如果尚未选择当前壁纸且图片池有图片，默认填充第一张。
  if (!model.value.wallpaperValue && wallpapers.value.length > 0 && wallpapers.value[0]) {
    model.value.wallpaperValue = wallpapers.value[0].url
  }
})

// 触发本地文件选择器。
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
      model.value.wallpaperValue = item.url
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
      model.value.wallpaperValue = item.url
    }
  } catch (err: unknown) {
    importError.value = err instanceof Error ? err.message : '导入失败'
  } finally {
    isSubmittingUrl.value = false
  }
}

// 设为当前壁纸。
function selectWallpaper(url: string) {
  model.value.wallpaperValue = url
}

// 打开编辑弹窗。
function openEdit(item: WallpaperItem) {
  editingItem.value = item
}

// 操作全局错误反馈。
const operationError = ref('')

// 保存编辑内容。
async function handleSaveEdit(payload: { name: string; url: string }) {
  if (!editingItem.value) return
  operationError.value = ''
  try {
    const updated = await updateWallpaper(editingItem.value.id, payload)
    if (updated && model.value.wallpaperValue === editingItem.value.url) {
      model.value.wallpaperValue = updated.url
    }
    editingItem.value = null
  } catch (err: unknown) {
    operationError.value = err instanceof Error ? err.message : '保存失败'
  }
}

// 删除壁纸。
async function handleDelete(item: WallpaperItem) {
  if (typeof window !== 'undefined' && !window.confirm(`确定删除壁纸「${item.name}」吗？`)) return
  operationError.value = ''
  try {
    await deleteWallpaper(item.id)
    if (model.value.wallpaperValue === item.url) {
      model.value.wallpaperValue = wallpapers.value[0]?.url ?? ''
    }
  } catch (err: unknown) {
    operationError.value = err instanceof Error ? err.message : '删除失败'
  }
}
</script>

<template>
  <div class="wallpaper-pool-manager">
    <!-- 定时轮换与切换规则设置 -->
    <div class="rotate-settings card-inner">
      <div class="section-title">定时轮换</div>
      <div class="rotate-row">
        <label class="toggle-label">
          <input v-model="model.wallpaperAutoRotate" type="checkbox">
          <span>开启定时自动轮换</span>
        </label>
        <div v-if="model.wallpaperAutoRotate" class="interval-select">
          <span>轮换周期</span>
          <select v-model.number="model.wallpaperRotateInterval">
            <option :value="1">1 分钟 (快速轮播)</option>
            <option :value="5">5 分钟</option>
            <option :value="15">15 分钟</option>
            <option :value="30">30 分钟</option>
            <option :value="60">1 小时</option>
            <option :value="360">6 小时</option>
            <option :value="720">12 小时</option>
            <option :value="1440">1 天</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 导入操作区：本地上传与 URL 导入 -->
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
      <p v-if="operationError" class="error-text">{{ operationError }}</p>
    </div>

    <!-- 图片池展示网格 -->
    <div class="pool-grid-section">
      <div class="section-header">
        <div class="section-title">图片池列表 ({{ wallpapers.length }})</div>
        <span v-if="loading" class="loading-hint">加载中...</span>
      </div>

      <div v-if="wallpapers.length === 0 && !loading" class="empty-state">
        图片池暂无图片，请通过本地上传或外部链接添加
      </div>

      <div v-else class="wallpaper-grid">
        <WallpaperCard
          v-for="item in wallpapers"
          :key="item.id"
          :item="item"
          :is-active="model.wallpaperValue === item.url"
          @select="selectWallpaper"
          @edit="openEdit"
          @delete="handleDelete"
        />
      </div>
    </div>

    <!-- 编辑壁纸弹窗 -->
    <WallpaperEditModal
      :item="editingItem"
      @close="editingItem = null"
      @save="handleSaveEdit"
    />
  </div>
</template>

<style scoped>
.wallpaper-pool-manager {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

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

.rotate-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
}

.toggle-label input {
  width: 16px;
  height: 16px;
  accent-color: var(--lh-accent);
}

.interval-select {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--lh-text-secondary);
}

.interval-select select {
  padding: 4px 8px;
  border-radius: var(--lh-radius-sm);
  border: 1px solid var(--lh-border);
  background: var(--lh-input-bg);
  color: var(--lh-text);
  font-size: 13px;
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

.url-form {
  display: flex;
  flex: 1;
  min-width: 260px;
  gap: 8px;
}

.input-name {
  width: 100px;
  flex-shrink: 0;
}

.input-url {
  flex: 1;
  min-width: 0;
}

.btn-import {
  padding: 7px 14px;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  border: none;
  border-radius: var(--lh-radius-sm);
  font-size: 13px;
  white-space: nowrap;
}

.pool-grid-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.loading-hint {
  font-size: 12px;
  color: var(--lh-text-secondary);
}

.empty-state {
  padding: 32px 16px;
  text-align: center;
  color: var(--lh-text-secondary);
  border: 1px dashed var(--lh-border);
  border-radius: var(--lh-radius-md);
  font-size: 13px;
}

.wallpaper-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
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
