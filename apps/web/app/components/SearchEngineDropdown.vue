<script setup lang="ts">
import type { SearchEngine } from "@laull-home/shared"
import EngineIcon from "./EngineIcon.vue"
import SearchEngineDeleteModal from "./SearchEngineDeleteModal.vue"

// 搜索引擎下拉面板组件属性声明。
const props = defineProps<{
  // 搜索引擎列表。
  engines: SearchEngine[]
  // 当前生效的活动搜索引擎。
  activeEngine: SearchEngine | null
}>()

// 搜索引擎下拉面板组件事件声明。
const emit = defineEmits<{
  (e: "select", engine: SearchEngine): void
  (e: "openAdd"): void
  (e: "openEdit", engine: SearchEngine): void
  (e: "engineDeleted", deletedIds: string[]): void
}>()

const { deleteEngine } = useSearch()

// 是否处于删除选择模式。
const isDeleteMode = ref(false)

// 是否处于编辑选择模式。
const isEditMode = ref(false)

// 勾选待删除的搜索引擎 ID 集合。
const selectedEngineIds = ref<Set<string>>(new Set())

// 是否显示删除确认弹窗。
const showDeleteConfirmModal = ref(false)

// 正在执行批量删除操作。
const isDeletingEngines = ref(false)

// 切换删除选择模式。
function toggleDeleteMode() {
  isDeleteMode.value = !isDeleteMode.value
  if (isDeleteMode.value) {
    isEditMode.value = false
  }
  selectedEngineIds.value = new Set()
}

// 切换编辑选择模式。
function toggleEditMode() {
  isEditMode.value = !isEditMode.value
  if (isEditMode.value) {
    isDeleteMode.value = false
    selectedEngineIds.value = new Set()
  }
}

// 切换单个引擎的勾选状态。
function toggleEngineSelection(engineId: string) {
  const next = new Set(selectedEngineIds.value)
  if (next.has(engineId)) next.delete(engineId)
  else next.add(engineId)
  selectedEngineIds.value = next
}

// 全选或取消全选。
function toggleSelectAll() {
  if (selectedEngineIds.value.size === props.engines.length) {
    selectedEngineIds.value = new Set()
  } else {
    selectedEngineIds.value = new Set(props.engines.map(e => e.id))
  }
}

// 点击卡片时的统一处理。
function handleCardClick(engine: SearchEngine) {
  if (isDeleteMode.value) {
    toggleEngineSelection(engine.id)
  } else if (isEditMode.value) {
    emit("openEdit", engine)
  } else {
    emit("select", engine)
  }
}

// 待删除的引擎列表。
const enginesToDelete = computed(() => {
  return props.engines.filter(e => selectedEngineIds.value.has(e.id))
})

// 执行批量删除提交。
async function handleBatchDelete() {
  if (isDeletingEngines.value || enginesToDelete.value.length === 0) return
  isDeletingEngines.value = true
  const deletedIds = Array.from(selectedEngineIds.value)
  try {
    for (const engine of enginesToDelete.value) {
      await deleteEngine(engine.id)
    }
    emit("engineDeleted", deletedIds)
    selectedEngineIds.value = new Set()
    isDeleteMode.value = false
    showDeleteConfirmModal.value = false
  } catch {
    // 保持状态以便重试
  } finally {
    isDeletingEngines.value = false
  }
}
</script>

<template>
  <div class="engine-dropdown-panel" @click.stop>
    <!-- 搜索引擎网格卡片 -->
    <div class="engine-grid">
      <button
        v-for="engine in engines"
        :key="engine.id"
        type="button"
        class="engine-card"
        :class="{
          active: !isDeleteMode && !isEditMode && activeEngine?.id === engine.id,
          'in-delete': isDeleteMode,
          'selected-delete': isDeleteMode && selectedEngineIds.has(engine.id),
          'in-edit': isEditMode,
        }"
        @click="handleCardClick(engine)"
      >
        <!-- 删除模式下的复选框指示器 -->
        <span
          v-if="isDeleteMode"
          class="card-checkbox"
          :class="{ checked: selectedEngineIds.has(engine.id) }"
        >
          <svg v-if="selectedEngineIds.has(engine.id)" viewBox="0 0 24 24" class="check-icon">
            <polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <EngineIcon :name="engine.name" :id="engine.id" :url="engine.urlTemplate" :size="20" />
        <span class="card-name" :title="engine.name">{{ engine.name }}</span>
        <span v-if="!isDeleteMode && !isEditMode && engine.bang" class="card-bang">!{{ engine.bang }}</span>
        <!-- 编辑模式下的编辑指示器 -->
        <span v-if="isEditMode" class="card-edit-badge" title="点击编辑此引擎">
          <svg viewBox="0 0 24 24" class="edit-icon" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </span>
      </button>
    </div>

    <!-- 底部操作栏 -->
    <div class="dropdown-footer">
      <div v-if="!isDeleteMode && !isEditMode" class="footer-normal">
        <button type="button" class="btn-add-engine" @click.stop="emit('openAdd')">
          + 添加自定义搜索引擎
        </button>
        <div class="footer-actions-right">
          <button
            type="button"
            class="btn-edit-toggle"
            @click.stop="toggleEditMode"
          >
            编辑引擎
          </button>
          <button
            type="button"
            class="btn-delete-toggle"
            :disabled="engines.length <= 1"
            @click.stop="toggleDeleteMode"
          >
            删除引擎
          </button>
        </div>
      </div>

      <div v-else-if="isEditMode" class="footer-edit">
        <span class="edit-tip">点击卡片编辑引擎配置</span>
        <button type="button" class="btn-text-action" @click.stop="toggleEditMode">
          完成
        </button>
      </div>

      <div v-else class="footer-delete">
        <span class="delete-count">已选 {{ selectedEngineIds.size }} 项</span>
        <div class="footer-delete-btns">
          <button type="button" class="btn-text-action" @click.stop="toggleSelectAll">
            {{ selectedEngineIds.size === engines.length ? '取消全选' : '全选' }}
          </button>
          <button type="button" class="btn-text-action" @click.stop="toggleDeleteMode">
            取消
          </button>
          <button
            type="button"
            class="btn-delete-submit"
            :disabled="selectedEngineIds.size === 0"
            @click.stop="showDeleteConfirmModal = true"
          >
            删除所选
          </button>
        </div>
      </div>
    </div>

    <!-- 批量删除确认弹窗 -->
    <SearchEngineDeleteModal
      :show="showDeleteConfirmModal"
      :engines="enginesToDelete"
      :total-count="engines.length"
      :deleting="isDeletingEngines"
      @close="showDeleteConfirmModal = false"
      @confirm="handleBatchDelete"
    />
  </div>
</template>

<style scoped>
.engine-dropdown-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 16px;
  right: 16px;
  background: color-mix(in srgb, var(--lh-surface) 90%, transparent);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), var(--lh-shadow-dropdown);
  backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  -webkit-backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  padding: 14px;
  box-sizing: border-box;
  z-index: 100;
}

.engine-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}

.engine-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--lh-radius-md);
  border: 1px solid transparent;
  background: transparent;
  color: var(--lh-text);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
  user-select: none;
}

.engine-card:hover {
  background: var(--lh-surface-hover);
  border-color: var(--lh-border);
}

.engine-card.active {
  background: var(--lh-surface-active);
  border-color: var(--lh-border);
  font-weight: 500;
}

.engine-card.in-delete:hover {
  border-color: color-mix(in srgb, #ef4444 40%, transparent);
}

.engine-card.in-edit:hover {
  border-color: var(--lh-accent);
  background: color-mix(in srgb, var(--lh-accent) 8%, var(--lh-surface));
}

.engine-card.selected-delete {
  background: color-mix(in srgb, #ef4444 12%, transparent);
  border-color: #ef4444;
}

.card-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid var(--lh-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s ease;
  background: var(--lh-surface);
}

.card-checkbox.checked {
  background: #ef4444;
  border-color: #ef4444;
  color: #ffffff;
}

.card-edit-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--lh-accent);
  flex-shrink: 0;
}

.edit-icon {
  width: 14px;
  height: 14px;
}

.check-icon {
  width: 12px;
  height: 12px;
}

.card-name {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-bang {
  font-size: 11px;
  color: var(--lh-text-muted);
}

.dropdown-footer {
  margin-top: 12px;
  border-top: 1px solid var(--lh-border);
  padding-top: 10px;
}

.footer-normal {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.footer-actions-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-add-engine {
  background: none;
  border: none;
  color: var(--lh-accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: var(--lh-radius-sm);
  transition: background 0.15s ease;
}

.btn-add-engine:hover {
  background: var(--lh-surface-hover);
}

.btn-edit-toggle,
.btn-delete-toggle {
  background: none;
  border: none;
  color: var(--lh-text-secondary);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: var(--lh-radius-sm);
  transition: all 0.15s ease;
}

.btn-edit-toggle:hover {
  color: var(--lh-accent);
  background: var(--lh-surface-hover);
}

.btn-delete-toggle:hover:not(:disabled) {
  color: #ef4444;
  background: var(--lh-surface-hover);
}

.btn-delete-toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.footer-edit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.edit-tip {
  font-size: 13px;
  color: var(--lh-text-secondary);
}

.footer-delete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.delete-count {
  font-size: 13px;
  color: var(--lh-text-secondary);
}

.footer-delete-btns {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-text-action {
  background: none;
  border: none;
  color: var(--lh-text);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--lh-radius-sm);
  transition: background 0.15s ease;
}

.btn-text-action:hover {
  background: var(--lh-surface-hover);
}

.btn-delete-submit {
  background: #ef4444;
  border: none;
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 12px;
  border-radius: var(--lh-radius-sm);
  transition: background 0.15s ease, opacity 0.15s ease;
}

.btn-delete-submit:hover:not(:disabled) {
  background: #dc2626;
}

.btn-delete-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
