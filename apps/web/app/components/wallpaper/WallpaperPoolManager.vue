<script setup lang="ts">
import type { HomeSettings, WallpaperItem } from '@laull-home/shared'
import { useWallpapers } from '../../composables/useWallpapers'
import AlertModal from '../AlertModal.vue'
import WallpaperBatchModal from './WallpaperBatchModal.vue'
import WallpaperCard from './WallpaperCard.vue'
import WallpaperEditModal from './WallpaperEditModal.vue'
import WallpaperImportPanel from './WallpaperImportPanel.vue'
import WallpaperPoolTabs from './WallpaperPoolTabs.vue'

// 接收双向绑定的用户主页设置。
const model = defineModel<HomeSettings>({ required: true })

const {
  selectedPoolId,
  wallpapers,
  loading,
  fetchPools,
  fetchWallpapers,
  updateWallpaper,
  deleteWallpaper,
  deleteWallpapersBatch,
} = useWallpapers()

// 批量导入弹窗展示状态。
const isBatchModalOpen = ref(false)

// 批量多选状态。
const isSelecting = ref(false)
const selectedIds = ref<Set<string>>(new Set())

// 切换多选勾选。
function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
}

// 全选或取消全选。
function toggleSelectAll() {
  if (selectedIds.value.size === wallpapers.value.length) {
    selectedIds.value.clear()
  } else {
    selectedIds.value = new Set(wallpapers.value.map(w => w.id))
  }
}

// 退出多选模式。
function exitSelectMode() {
  isSelecting.value = false
  selectedIds.value.clear()
}

// 删除确认弹窗状态。
const confirmState = ref<{
  show: boolean
  title: string
  message: string
  action: () => Promise<void>
}>({
  show: false,
  title: '删除确认',
  message: '',
  action: async () => {},
})

// 执行弹窗确认操作。
async function handleExecuteConfirm() {
  const run = confirmState.value.action
  confirmState.value.show = false
  await run()
}

// 批量删除选中的壁纸。
function handleBatchDelete() {
  const ids = Array.from(selectedIds.value)
  if (ids.length === 0) return
  confirmState.value = {
    show: true,
    title: '批量删除壁纸',
    message: `确定删除选中的 ${ids.length} 张壁纸吗？`,
    action: async () => {
      operationError.value = ''
      try {
        const success = await deleteWallpapersBatch(ids)
        if (success) {
          const currentWallpaper = wallpapers.value.find(w => w.url === model.value.wallpaperValue)
          if (!currentWallpaper) {
            model.value.wallpaperValue = wallpapers.value[0]?.url ?? ''
          }
          exitSelectMode()
        }
      } catch (err: unknown) {
        operationError.value = err instanceof Error ? err.message : '批量删除失败'
      }
    },
  }
}

// 编辑壁纸条目弹窗。
const editingItem = ref<WallpaperItem | null>(null)

// 操作全局错误反馈。
const operationError = ref('')

// 批量导入成功后的回调处理。
function handleBatchSuccess(imported: WallpaperItem[]) {
  if (imported.length > 0 && !model.value.wallpaperValue && imported[0]) {
    model.value.wallpaperValue = imported[0].url
  }
}

// 单张壁纸导入成功后的回调处理。
function handleSingleImport(item: WallpaperItem) {
  model.value.wallpaperValue = item.url
}

// 组件挂载时获取图片池列表与壁纸数据。
onMounted(async () => {
  await fetchPools()
  await fetchWallpapers()
  // 如果尚未选择当前壁纸且图片池有图片，默认填充第一张。
  if (!model.value.wallpaperValue && wallpapers.value.length > 0 && wallpapers.value[0]) {
    model.value.wallpaperValue = wallpapers.value[0].url
  }
})

// 设为当前壁纸。
function selectWallpaper(url: string) {
  model.value.wallpaperValue = url
}

// 打开编辑弹窗。
function openEdit(item: WallpaperItem) {
  editingItem.value = item
}

// 保存编辑内容（包含填充模式）。
async function handleSaveEdit(payload: { name: string; url: string; fitMode: string | null }) {
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
function handleDelete(item: WallpaperItem) {
  const displayName = item.name && item.name !== 'undefined' ? item.name : '此壁纸'
  confirmState.value = {
    show: true,
    title: '删除壁纸',
    message: `确定删除壁纸「${displayName}」吗？`,
    action: async () => {
      operationError.value = ''
      try {
        await deleteWallpaper(item.id)
        if (model.value.wallpaperValue === item.url) {
          model.value.wallpaperValue = wallpapers.value[0]?.url ?? ''
        }
      } catch (err: unknown) {
        operationError.value = err instanceof Error ? err.message : '删除失败'
      }
    },
  }
}
</script>

<template>
  <div class="wallpaper-pool-manager">
    <!-- 图片池管理选项卡与全局填充模式 -->
    <WallpaperPoolTabs v-model="model" />

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

    <!-- 导入操作区：本地上传与外部链接 -->
    <WallpaperImportPanel
      @imported="handleSingleImport"
      @open-batch="isBatchModalOpen = true"
    />
    <p v-if="operationError" class="error-text">{{ operationError }}</p>

    <!-- 图片展示网格与批量操作 -->
    <div class="pool-grid-section">
      <div class="section-header">
        <div class="header-left">
          <div class="section-title">壁纸列表 ({{ wallpapers.length }})</div>
          <span v-if="loading" class="loading-hint">加载中...</span>
        </div>

        <div v-if="wallpapers.length > 0" class="batch-controls">
          <template v-if="isSelecting">
            <button type="button" class="btn-batch-action" @click="toggleSelectAll">
              {{ selectedIds.size === wallpapers.length ? '取消全选' : '全选全部' }}
            </button>
            <button
              type="button"
              class="btn-batch-action btn-danger"
              :disabled="selectedIds.size === 0"
              @click="handleBatchDelete"
            >
              批量删除 ({{ selectedIds.size }})
            </button>
            <button type="button" class="btn-batch-action" @click="exitSelectMode">
              完成
            </button>
          </template>
          <button v-else type="button" class="btn-batch-action" @click="isSelecting = true">
            批量管理
          </button>
        </div>
      </div>

      <div v-if="wallpapers.length === 0 && !loading" class="empty-state">
        该图片池暂无图片，请通过本地上传或外部链接添加
      </div>

      <div v-else class="wallpaper-grid">
        <WallpaperCard
          v-for="item in wallpapers"
          :key="item.id"
          :item="item"
          :is-active="model.wallpaperValue === item.url"
          :is-selecting="isSelecting"
          :is-selected="selectedIds.has(item.id)"
          @select="selectWallpaper"
          @toggle-select="toggleSelect"
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

    <!-- 批量导入壁纸弹窗 -->
    <WallpaperBatchModal
      :show="isBatchModalOpen"
      :pool-id="selectedPoolId"
      @close="isBatchModalOpen = false"
      @success="handleBatchSuccess"
    />

    <!-- 操作确认弹窗 -->
    <AlertModal
      :show="confirmState.show"
      :title="confirmState.title"
      :message="confirmState.message"
      type="warning"
      :show-cancel="true"
      cancel-text="取消"
      confirm-text="确认删除"
      @confirm="handleExecuteConfirm"
      @close="confirmState.show = false"
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
  margin-bottom: 0;
}

.rotate-settings .section-title {
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

.pool-grid-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.batch-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-batch-action {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-surface-hover);
  border: 1px solid var(--lh-border);
  color: var(--lh-text);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-batch-action:hover:not(:disabled) {
  border-color: var(--lh-accent);
  color: var(--lh-accent);
}

.btn-batch-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-batch-action.btn-danger {
  color: var(--lh-danger);
  border-color: var(--lh-danger-border);
  background: var(--lh-danger-bg);
}

.btn-batch-action.btn-danger:hover:not(:disabled) {
  background: var(--lh-danger);
  color: var(--lh-danger-text);
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
