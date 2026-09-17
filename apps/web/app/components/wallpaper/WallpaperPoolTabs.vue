<script setup lang="ts">
import type { HomeSettings, WallpaperPool } from '@laull-home/shared'
import { useWallpapers } from '../../composables/useWallpapers'
import AlertModal from '../AlertModal.vue'

// 双向绑定主页设置以同步当前活动图片池与全局默认填充模式。
const model = defineModel<HomeSettings>({ required: true })

const {
  pools,
  selectedPoolId,
  fetchWallpapers,
  createPool,
  updatePool,
  deletePool,
  setActivePool,
} = useWallpapers()

// 新建图片池状态。
const isCreating = ref(false)
const newPoolName = ref('')
const createError = ref('')

// 编辑/重命名图片池状态。
const isEditing = ref(false)
const editPoolId = ref('')
const editPoolName = ref('')
const editError = ref('')

// 切换查看不同的图片池。
async function selectPool(poolId: string) {
  selectedPoolId.value = poolId
  await fetchWallpapers(poolId)
}

// 提交创建新图片池。
async function handleCreatePool() {
  const name = newPoolName.value.trim()
  if (!name) {
    createError.value = '图片池名称不能为空'
    return
  }
  createError.value = ''
  try {
    const created = await createPool(name)
    if (created) {
      newPoolName.value = ''
      isCreating.value = false
    }
  } catch (err: unknown) {
    createError.value = err instanceof Error ? err.message : '创建图片池失败'
  }
}

// 打开重命名弹窗或行内编辑。
function startEdit(pool: WallpaperPool) {
  editPoolId.value = pool.id
  editPoolName.value = pool.name
  editError.value = ''
  isEditing.value = true
}

// 提交重命名。
async function handleUpdatePool() {
  const name = editPoolName.value.trim()
  if (!name) {
    editError.value = '图片池名称不能为空'
    return
  }
  editError.value = ''
  try {
    await updatePool(editPoolId.value, name)
    isEditing.value = false
  } catch (err: unknown) {
    editError.value = err instanceof Error ? err.message : '重命名失败'
  }
}

// 提示与确认弹窗状态。
const alertState = ref<{
  show: boolean
  title: string
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
  showCancel: boolean
  confirmText: string
  onConfirm: () => Promise<void>
}>({
  show: false,
  title: '提示',
  message: '',
  type: 'warning',
  showCancel: false,
  confirmText: '确定',
  onConfirm: async () => {},
})

// 弹出提示弹窗。
function showAlert(message: string, title = '提示', type: 'info' | 'warning' | 'error' | 'success' = 'warning') {
  alertState.value = {
    show: true,
    title,
    message,
    type,
    showCancel: false,
    confirmText: '确定',
    onConfirm: async () => {},
  }
}

// 弹出确认弹窗。
function showConfirm(
  message: string,
  title = '确认操作',
  onConfirm: () => Promise<void> = async () => {},
  type: 'info' | 'warning' | 'error' | 'success' = 'warning',
  confirmText = '确认',
) {
  alertState.value = {
    show: true,
    title,
    message,
    type,
    showCancel: true,
    confirmText,
    onConfirm,
  }
}

// 执行确认操作。
async function handleConfirmAlert() {
  const run = alertState.value.onConfirm
  alertState.value.show = false
  await run()
}

// 关闭提示弹窗。
function closeAlert() {
  alertState.value.show = false
}

// 整个删除图片池。
function handleDeletePool(pool: WallpaperPool) {
  if (pools.value.length <= 1) {
    showAlert('至少保留一个图片池，无法删除', '操作受限', 'warning')
    return
  }
  showConfirm(
    `确定删除图片池「${pool.name}」吗？\n池内的所有壁纸与本地图片文件将被一并彻底清理！`,
    '删除图片池',
    async () => {
      try {
        await deletePool(pool.id)
      } catch (err: unknown) {
        showAlert(err instanceof Error ? err.message : '删除图片池失败', '错误', 'error')
      }
    },
    'warning',
    '确认删除',
  )
}

// 设为当前使用的图片池。
async function handleSetActive(poolId: string) {
  try {
    await setActivePool(poolId)
  } catch (err: unknown) {
    showAlert(err instanceof Error ? err.message : '切换图片池失败', '错误', 'error')
  }
}
</script>

<template>
  <div class="wallpaper-pool-tabs-container card-inner">
    <!-- 顶部行：图片池操作与全局默认填充模式 -->
    <div class="header-row">
      <div class="header-left">
        <span class="section-title">图片池管理</span>
        <button
          v-if="!isCreating"
          type="button"
          class="btn-new-pool"
          @click="isCreating = true"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>新建图片池</span>
        </button>
      </div>

      <!-- 全局默认填充模式选择 -->
      <div class="global-fit-select">
        <label>全局默认填充模式</label>
        <select v-model="model.wallpaperFitMode">
          <option value="cover">居中覆盖 (cover)</option>
          <option value="contain">完整适应 (contain)</option>
          <option value="fill">拉伸填满 (fill)</option>
          <option value="center">原始居中 (center)</option>
          <option value="tile">平铺 (tile)</option>
        </select>
      </div>
    </div>

    <!-- 新建图片池表单 -->
    <div v-if="isCreating" class="inline-form">
      <input
        v-model="newPoolName"
        type="text"
        placeholder="输入新图片池名称（如：风景、二次元）"
        maxlength="64"
        @keyup.enter="handleCreatePool"
      >
      <button type="button" class="btn-action btn-confirm" @click="handleCreatePool">创建</button>
      <button type="button" class="btn-action btn-cancel" @click="isCreating = false; newPoolName = ''">取消</button>
      <span v-if="createError" class="error-inline">{{ createError }}</span>
    </div>

    <!-- 重命名图片池表单 -->
    <div v-if="isEditing" class="inline-form">
      <input
        v-model="editPoolName"
        type="text"
        placeholder="修改图片池名称"
        maxlength="64"
        @keyup.enter="handleUpdatePool"
      >
      <button type="button" class="btn-action btn-confirm" @click="handleUpdatePool">保存</button>
      <button type="button" class="btn-action btn-cancel" @click="isEditing = false">取消</button>
      <span v-if="editError" class="error-inline">{{ editError }}</span>
    </div>

    <!-- 图片池切换 Tabs -->
    <div class="pools-tabs">
      <div
        v-for="pool in pools"
        :key="pool.id"
        class="pool-tab"
        :class="{ active: selectedPoolId === pool.id }"
        @click="selectPool(pool.id)"
      >
        <div class="pool-tab-main">
          <span class="pool-name">{{ pool.name }}</span>
          <span class="pool-count">({{ pool.count ?? 0 }})</span>
          <span v-if="model.activeWallpaperPoolId === pool.id" class="active-badge">当前使用</span>
        </div>

        <div class="pool-tab-actions" @click.stop>
          <button
            v-if="model.activeWallpaperPoolId !== pool.id"
            type="button"
            class="tab-btn btn-use"
            title="将该图片池设为当前轮换与使用的图片池"
            @click="handleSetActive(pool.id)"
          >
            选中为当前
          </button>
          <button
            type="button"
            class="tab-btn"
            title="重命名图片池"
            @click="startEdit(pool)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            v-if="pools.length > 1"
            type="button"
            class="tab-btn text-danger"
            title="删除整个图片池及其壁纸"
            @click="handleDeletePool(pool)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 提示与确认弹窗 -->
    <AlertModal
      :show="alertState.show"
      :title="alertState.title"
      :message="alertState.message"
      :type="alertState.type"
      :show-cancel="alertState.showCancel"
      :confirm-text="alertState.confirmText"
      @confirm="handleConfirmAlert"
      @close="closeAlert"
    />
  </div>
</template>

<style scoped>
.wallpaper-pool-tabs-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card-inner {
  padding: 14px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-md);
}
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--lh-text);
}
.btn-new-pool {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-surface-hover);
  border: 1px solid var(--lh-border);
  color: var(--lh-text);
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-new-pool:hover {
  border-color: var(--lh-accent);
  color: var(--lh-accent);
}
.btn-new-pool svg {
  width: 14px;
  height: 14px;
}
.global-fit-select {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--lh-text-secondary);
}
.global-fit-select select {
  padding: 4px 8px;
  border-radius: var(--lh-radius-sm);
  border: 1px solid var(--lh-border);
  background: var(--lh-input-bg);
  color: var(--lh-text);
  font-size: 12px;
}
.inline-form {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px;
  background: var(--lh-surface-hover);
  border-radius: var(--lh-radius-sm);
}
.inline-form input {
  flex: 1;
  min-width: 180px;
  padding: 6px 10px;
  font-size: 13px;
}
.btn-action {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: var(--lh-radius-sm);
  border: none;
  cursor: pointer;
}
.btn-confirm {
  background: var(--lh-accent);
  color: var(--lh-accent-text);
}
.btn-cancel {
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  color: var(--lh-text);
}
.error-inline {
  color: var(--lh-danger);
  font-size: 12px;
}
.pools-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pool-tab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 12px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-bg);
  cursor: pointer;
  transition: all 0.15s ease;
}
.pool-tab:hover {
  border-color: var(--lh-border-hover);
}
.pool-tab.active {
  border-color: var(--lh-accent);
  background: color-mix(in srgb, var(--lh-accent) 10%, var(--lh-surface));
}
.pool-tab-main {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pool-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--lh-text);
}
.pool-count {
  font-size: 12px;
  color: var(--lh-text-secondary);
}
.active-badge {
  font-size: 10px;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  padding: 1px 5px;
  border-radius: 4px;
}
.pool-tab-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tab-btn {
  background: transparent;
  border: none;
  padding: 3px;
  border-radius: 4px;
  color: var(--lh-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tab-btn:hover {
  background: var(--lh-surface-hover);
  color: var(--lh-text);
}
.tab-btn.btn-use {
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--lh-border);
  background: var(--lh-surface);
}
.tab-btn.btn-use:hover {
  border-color: var(--lh-accent);
  color: var(--lh-accent);
}
.tab-btn.text-danger:hover {
  color: var(--lh-danger);
  background: var(--lh-danger-bg);
}
.tab-btn svg {
  width: 13px;
  height: 13px;
}
</style>
