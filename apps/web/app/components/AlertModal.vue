<script setup lang="ts">
import BaseModal from './BaseModal.vue'

// 提示弹窗组件属性声明。
const props = withDefaults(
  defineProps<{
    // 控制弹窗显隐。
    show: boolean
    // 弹窗标题。
    title?: string
    // 提示主体内容。
    message: string
    // 提示类型：info、warning、error、success。
    type?: 'info' | 'warning' | 'error' | 'success'
    // 是否显示取消按钮。
    showCancel?: boolean
    // 取消按钮文字。
    cancelText?: string
    // 确认按钮文字。
    confirmText?: string
    // 弹窗最大宽度。
    maxWidth?: string
  }>(),
  {
    title: '提示',
    type: 'info',
    showCancel: false,
    cancelText: '取消',
    confirmText: '确定',
    maxWidth: '400px',
  },
)

// 提示弹窗组件事件派发。
const emit = defineEmits<{
  // 关闭弹窗事件。
  (e: 'close'): void
  // 确认操作事件。
  (e: 'confirm'): void
}>()

// 处理确认操作。
function handleConfirm() {
  emit('confirm')
  emit('close')
}

// 处理关闭。
function handleClose() {
  emit('close')
}
</script>

<template>
  <BaseModal
    :show="props.show"
    :title="props.title"
    :max-width="props.maxWidth"
    @close="handleClose"
  >
    <div class="alert-modal-content">
      <!-- 状态图标 -->
      <div class="alert-icon-wrap" :class="`icon-${props.type}`">
        <svg v-if="props.type === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        <svg v-else-if="props.type === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <svg v-else-if="props.type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </div>

      <!-- 提示文本 -->
      <div class="alert-text-body">
        <p class="alert-message">{{ props.message }}</p>
      </div>
    </div>

    <!-- 底部操作按钮 -->
    <template #footer>
      <div class="alert-modal-actions">
        <button
          v-if="props.showCancel"
          type="button"
          class="btn-cancel"
          @click="handleClose"
        >
          {{ props.cancelText }}
        </button>
        <button
          type="button"
          class="btn-confirm"
          :class="{ 'btn-danger': props.type === 'error' || props.type === 'warning' }"
          @click="handleConfirm"
        >
          {{ props.confirmText }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.alert-modal-content {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.alert-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
}

.alert-icon {
  width: 20px;
  height: 20px;
}

.icon-info {
  background: color-mix(in srgb, var(--lh-accent) 15%, transparent);
  color: var(--lh-accent);
}

.icon-warning {
  background: color-mix(in srgb, #f59e0b 15%, transparent);
  color: #f59e0b;
}

.icon-error {
  background: var(--lh-danger-bg);
  color: var(--lh-danger);
}

.icon-success {
  background: color-mix(in srgb, #10b981 15%, transparent);
  color: #10b981;
}

.alert-text-body {
  flex: 1;
  min-width: 0;
}

.alert-message {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--lh-text);
  word-break: break-word;
  white-space: pre-wrap;
  padding-top: 6px;
}

.alert-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-cancel {
  padding: 6px 14px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-surface);
  color: var(--lh-text);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.btn-cancel:hover {
  background: var(--lh-surface-hover);
  border-color: var(--lh-border-hover);
}

.btn-confirm {
  padding: 6px 18px;
  border: 1px solid transparent;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.btn-confirm:hover {
  opacity: 0.9;
}

.btn-confirm.btn-danger {
  background: var(--lh-danger);
  color: var(--lh-danger-text);
}

.btn-confirm.btn-danger:hover {
  background: var(--lh-danger-hover);
}
</style>
