<script setup lang="ts">
import { nextTick, onMounted, onUnmounted } from 'vue'
// 通用弹窗组件属性声明。
const props = withDefaults(
  defineProps<{
    // 控制弹窗是否可见。
    show: boolean
    // 弹窗标题。
    title?: string
    // 是否支持点击遮罩周围区域关闭。
    closeOnClickOutside?: boolean
    // 是否显示右上角关闭按钮。
    showCloseButton?: boolean
    // 弹窗卡片最大宽度。
    maxWidth?: string
  }>(),
  {
    title: "",
    closeOnClickOutside: true,
    showCloseButton: true,
    maxWidth: "480px",
  },
)

// 通用弹窗组件事件派发。
const emit = defineEmits<{
  (e: "close"): void
}>()

// 对话框节点引用。
const dialogRef = ref<HTMLDialogElement | null>(null)
// DOM 更新后同步对话框展开状态。
watch(() => props.show, async (show) => {
  await nextTick()
  if (show && dialogRef.value && !dialogRef.value.open) dialogRef.value.show()
  if (!show && dialogRef.value?.open) dialogRef.value.close()
}, { immediate: true })

// 监听键盘 ESC 快速退出，上层已处理则忽略。
function handleKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if (props.show && event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// 按配置处理外部点击。
function handleBackdropClick(event: MouseEvent) {
  if (props.closeOnClickOutside && event.target === dialogRef.value) emit('close')
}
</script>

<template>
  <teleport to="body">
      <dialog
        ref="dialogRef"
        role="dialog"
        :aria-label="title || '对话框'"
        class="modal-backdrop"
        @click="handleBackdropClick"
        @cancel.prevent="emit('close')"
      >
        <div class="modal-container" :style="{ maxWidth: maxWidth }">
          <!-- 弹窗头部 -->
          <div v-if="title || $slots.header || showCloseButton" class="modal-header">
            <slot name="header">
              <h3 class="modal-title">{{ title }}</h3>
            </slot>
            <button
              v-if="showCloseButton"
              type="button"
              class="btn-close"
              title="关闭"
              @click="emit('close')"
            >
              <svg class="close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- 弹窗主体内容 -->
          <div class="modal-body">
            <slot />
          </div>

          <!-- 弹窗底部操作区 -->
          <div v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </div>
        </div>
      </dialog>
  </teleport>
</template>

<style scoped>
.modal-backdrop {
  overscroll-behavior: contain;
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  border: 0;
  width: 100vw;
  height: 100dvh;
  max-width: none;
  max-height: none;
  margin: 0;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}

.modal-backdrop[open] { display: flex; }
.modal-backdrop::backdrop { background: transparent; }

.modal-container {
  width: 100%;
  background: color-mix(in srgb, var(--lh-surface) 92%, transparent);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), var(--lh-shadow-dropdown);
  backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  -webkit-backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  color: var(--lh-text);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px 20px;
  border-bottom: 1px solid var(--lh-border);
}

.modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--lh-text);
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--lh-text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--lh-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.btn-close:hover {
  background: var(--lh-surface-hover);
  color: var(--lh-text);
}

.close-icon {
  width: 18px;
  height: 18px;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  max-height: 70vh;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--lh-border);
  background: var(--lh-surface-hover);
}

</style>
