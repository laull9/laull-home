<script setup lang="ts">
import type { SearchEngine } from "@laull-home/shared"
import BaseModal from "./BaseModal.vue"
import EngineIcon from "./EngineIcon.vue"

// 删除搜索引擎确认弹窗属性声明。
const props = withDefaults(
  defineProps<{
    // 控制弹窗显隐。
    show: boolean
    // 待删除的搜索引擎列表。
    engines: SearchEngine[]
    // 当前系统内搜索引擎总数。
    totalCount: number
    // 是否正在执行删除操作。
    deleting?: boolean
  }>(),
  {
    deleting: false,
  },
)

// 删除确认弹窗事件声明。
const emit = defineEmits<{
  (e: "close"): void
  (e: "confirm"): void
}>()

// 校验是否允许提交删除。
const isAllowedToDelete = computed(() => {
  if (props.engines.length === 0) return false
  if (props.totalCount - props.engines.length < 1) return false
  return true
})

// 处理取消或关闭。
function handleClose() {
  if (props.deleting) return
  emit("close")
}

// 处理确认删除。
function handleConfirm() {
  if (!isAllowedToDelete.value || props.deleting) return
  emit("confirm")
}
</script>

<template>
  <BaseModal
    :show="show"
    title="删除搜索引擎确认"
    max-width="440px"
    :close-on-click-outside="!deleting"
    :show-close-button="!deleting"
    @close="handleClose"
  >
    <div class="delete-modal-body">
      <!-- 数量超限约束警告 -->
      <div v-if="!isAllowedToDelete" class="warn-box" role="alert">
        系统至少需要保留一个可用搜索引擎，无法删除全部引擎。
      </div>

      <!-- 确认文案 -->
      <p v-else class="confirm-tip">
        确定要删除以下选中的 {{ engines.length }} 个搜索引擎？此操作不可撤销。
      </p>

      <!-- 选中的引擎列表预览 -->
      <div class="delete-engine-list">
        <div
          v-for="engine in engines"
          :key="engine.id"
          class="delete-engine-item"
        >
          <EngineIcon
            :name="engine.name"
            :id="engine.id"
            :url="engine.urlTemplate"
            :size="20"
          />
          <span class="delete-engine-name">{{ engine.name }}</span>
          <span v-if="engine.bang" class="delete-engine-bang">!{{ engine.bang }}</span>
          <span v-if="engine.isDefault" class="delete-engine-default">默认</span>
        </div>
      </div>
    </div>

    <!-- 弹窗底部操作按钮 -->
    <template #footer>
      <div class="modal-actions">
        <button
          type="button"
          class="btn-cancel"
          :disabled="deleting"
          @click="handleClose"
        >
          取消
        </button>
        <button
          type="button"
          class="btn-danger"
          :disabled="!isAllowedToDelete || deleting"
          @click="handleConfirm"
        >
          {{ deleting ? "正在删除..." : `确认删除 (${engines.length})` }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.delete-modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirm-tip {
  margin: 0;
  font-size: 14px;
  color: var(--lh-text);
  line-height: 1.5;
}

.warn-box {
  background: var(--lh-danger-bg);
  border: 1px solid var(--lh-danger-border);
  color: var(--lh-danger);
  border-radius: var(--lh-radius-md);
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.4;
}

.delete-engine-list {
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-md);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--lh-surface-hover);
}

.delete-engine-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-surface);
}

.delete-engine-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--lh-text);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.delete-engine-bang {
  font-size: 11px;
  color: var(--lh-text-muted);
}

.delete-engine-default {
  font-size: 11px;
  color: var(--lh-accent);
  background: color-mix(in srgb, var(--lh-accent) 14%, transparent);
  padding: 1px 6px;
  border-radius: 4px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cancel {
  padding: 8px 16px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-md);
  background: var(--lh-surface);
  color: var(--lh-text);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-cancel:hover:not(:disabled) {
  background: var(--lh-surface-hover);
}

.btn-danger {
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: var(--lh-radius-md);
  background: var(--lh-danger);
  color: var(--lh-danger-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.btn-danger:hover:not(:disabled) {
  background: var(--lh-danger-hover);
}

.btn-danger:disabled,
.btn-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
