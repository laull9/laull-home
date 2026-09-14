<script setup lang="ts">
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

// 遮罩层节点引用。
const backdropRef = ref<HTMLElement | null>(null)

// 处理遮罩层点击事件。
function handleBackdropClick(event: MouseEvent) {
  if (props.closeOnClickOutside && event.target === backdropRef.value) {
    emit("close")
  }
}

// 处理 ESC 键盘按下事件。
function handleKeyDown(event: KeyboardEvent) {
  if (props.show && event.key === "Escape") {
    emit("close")
  }
}

onMounted(() => {
  document.addEventListener("keydown", handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeyDown)
})
</script>

<template>
  <teleport to="body">
    <transition name="modal-fade">
      <div
        v-if="show"
        ref="backdropRef"
        class="modal-backdrop"
        @click="handleBackdropClick"
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
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}

.modal-container {
  width: 100%;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  box-shadow: var(--lh-shadow-dropdown);
  backdrop-filter: blur(var(--lh-blur));
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

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-active .modal-container,
.modal-fade-leave-active .modal-container {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-fade-enter-from .modal-container,
.modal-fade-leave-to .modal-container {
  transform: translateY(10px) scale(0.97);
}
</style>
