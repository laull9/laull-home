<script setup lang="ts">
import type { Breakpoint } from '@laull-home/shared'

// 桌面编辑顶部胶囊栏属性与双向状态绑定。
const selectedBreakpoint = defineModel<'auto' | Breakpoint>('selectedBreakpoint', { default: 'auto' })
const stackMode = defineModel<boolean>('stackMode', { default: false })

// 外部传入的状态提示参数。
defineProps<{
  // 画布后台静默保存状态。
  saving?: boolean
  // 组件树面板是否处于展开状态。
  treeOpen?: boolean
}>()

// 外部事件通知。
const emit = defineEmits<{
  // 打开新建分组弹窗。
  createGroup: []
  // 切换组件树展开或收起。
  toggleTree: []
  // 打开书签内容归档抽屉。
  openArchive: []
  // 取消本次编辑更改并退出。
  cancelChanges: []
  // 放弃未保存改动并重读布局。
  resetLayout: []
  // 完成主页编辑。
  finishEdit: []
}>()
</script>

<template>
  <div class="edit-mode-bar">
    <div class="edit-status">
      <span class="edit-dot" />
      <span>正在编辑主页</span>
    </div>
    <div class="edit-actions">
      <button type="button" class="btn-sub" @click="emit('createGroup')">+ 新建分组</button>
      <button
        type="button"
        class="btn-sub"
        :class="{ 'btn-tree-active': treeOpen }"
        @click="emit('toggleTree')"
      >
        {{ treeOpen ? '收起组件树' : '+ 添加组件' }}
      </button>
      <select v-model="selectedBreakpoint" class="edit-select" aria-label="编辑布局断点">
        <option value="auto">当前屏幕</option>
        <option value="desktop">桌面 · 12 列</option>
        <option value="laptop">便携本 · 8 列</option>
        <option value="tablet">平板 · 6 列</option>
        <option value="mobile">手机 · 4 列</option>
      </select>
      <label class="edit-checkbox">
        <input v-model="stackMode" type="checkbox">
        <span>拖拽叠放</span>
      </label>
      <span class="save-status">{{ saving ? '保存中…' : '已自动保存' }}</span>
      <button type="button" class="btn-sub" @click="emit('openArchive')">内容归档</button>
      <button type="button" class="btn-sub" @click="emit('cancelChanges')">取消更改</button>
      <button type="button" class="btn-sub" @click="emit('resetLayout')">重置</button>
      <button type="button" class="btn-accent" @click="emit('finishEdit')">完成编辑</button>
    </div>
  </div>
</template>

<style scoped>
.edit-mode-bar {
  position: sticky;
  top: 16px;
  z-index: 50;
  max-width: 980px;
  width: calc(100% - 32px);
  margin: 16px auto 0 auto;
  padding: 8px 16px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-full);
  box-shadow: var(--lh-shadow-dropdown);
  backdrop-filter: blur(var(--lh-blur));
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  box-sizing: border-box;
}

.edit-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--lh-text);
  flex-shrink: 0;
  user-select: none;
}

.edit-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--lh-radius-full);
  background: var(--lh-accent);
  box-shadow: 0 0 8px var(--lh-accent);
  flex-shrink: 0;
}

.edit-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-accent {
  padding: 6px 14px;
  border: none;
  border-radius: var(--lh-radius-full);
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s ease;
}

.btn-accent:hover {
  opacity: 0.9;
}

.btn-sub {
  padding: 6px 12px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-full);
  background: var(--lh-surface);
  color: var(--lh-text);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.btn-sub:hover {
  background: var(--lh-surface-hover);
}

.btn-tree-active {
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  border-color: var(--lh-accent);
}

.btn-tree-active:hover {
  opacity: 0.92;
}

.edit-select {
  padding: 5px 10px;
  font-size: 12px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-full);
  background: var(--lh-surface);
  color: var(--lh-text);
  cursor: pointer;
  outline: none;
  white-space: nowrap;
}

.edit-select:focus {
  border-color: var(--lh-accent);
}

.edit-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--lh-text);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.edit-checkbox input[type="checkbox"] {
  cursor: pointer;
  margin: 0;
  width: auto;
}

.save-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  font-size: 12px;
  color: var(--lh-text-secondary);
  text-align: center;
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
}

@media (max-width: 860px) {
  .edit-mode-bar {
    border-radius: var(--lh-radius-lg, 16px);
  }
}

@media (max-width: 560px) {
  .edit-mode-bar {
    margin: 10px 8px 0 8px;
    width: calc(100% - 16px);
    padding: 10px 12px;
    border-radius: 12px;
  }
  .edit-status {
    width: 100%;
    margin-bottom: 2px;
  }
  .edit-actions {
    width: 100%;
    gap: 6px;
  }
  .btn-sub, .btn-accent, .edit-select {
    padding: 5px 8px;
    font-size: 11px;
  }
}
</style>
