<script setup lang="ts">
import type { WallpaperItem } from '@laull-home/shared'

// 填充模式显示文案映射。
const FIT_MODE_LABELS: Record<string, string> = {
  cover: '居中覆盖',
  contain: '完整适应',
  fill: '拉伸填满',
  center: '原始居中',
  tile: '平铺',
}

// 接收单张壁纸卡片数据、激活状态及多选状态。
const props = withDefaults(defineProps<{
  item: WallpaperItem
  isActive: boolean
  isSelecting?: boolean
  isSelected?: boolean
}>(), {
  isSelecting: false,
  isSelected: false,
})

// 派发选择、多选勾选、编辑与删除动作。
const emit = defineEmits<{
  (e: 'select', url: string): void
  (e: 'toggleSelect', id: string): void
  (e: 'edit', item: WallpaperItem): void
  (e: 'delete', item: WallpaperItem): void
}>()

// 点击卡片主区域时的处理。
function handleCardClick() {
  if (props.isSelecting) {
    emit('toggleSelect', props.item.id)
  } else {
    emit('select', props.item.url)
  }
}
</script>

<template>
  <div
    class="wallpaper-card"
    :class="{ active: isActive, selected: isSelected, selecting: isSelecting }"
    @click="handleCardClick"
  >
    <div class="thumb-wrapper">
      <img :src="item.url" :alt="item.name" loading="lazy">
      <!-- 多选勾选按钮 -->
      <button
        v-if="isSelecting"
        type="button"
        class="select-checkbox"
        :class="{ checked: isSelected }"
        :aria-label="isSelected ? '取消勾选' : '勾选图片'"
        @click.stop="emit('toggleSelect', item.id)"
      >
        <svg v-if="isSelected" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
      <span v-if="isActive" class="active-badge">当前使用</span>
      <div class="tags-group">
        <span v-if="item.fitMode" class="fit-tag">{{ FIT_MODE_LABELS[item.fitMode] || item.fitMode }}</span>
        <span class="source-tag">{{ item.sourceType === 'upload' ? '本地' : '外链' }}</span>
      </div>
    </div>
    <div class="card-footer">
      <span class="card-name" :title="item.name && item.name !== 'undefined' ? item.name : '壁纸'">{{ item.name && item.name !== 'undefined' ? item.name : '壁纸' }}</span>
      <div v-if="!isSelecting" class="card-actions" @click.stop>
        <button
          type="button"
          class="action-btn"
          title="修改名称、链接或填充模式"
          @click="emit('edit', item)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button
          type="button"
          class="action-btn text-danger"
          title="删除此壁纸"
          @click="emit('delete', item)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wallpaper-card {
  display: flex;
  flex-direction: column;
  border: 2px solid var(--lh-border);
  border-radius: var(--lh-radius-md);
  overflow: hidden;
  background: var(--lh-surface);
  cursor: pointer;
  transition: all 0.15s ease;
}
.wallpaper-card:hover {
  border-color: var(--lh-border-hover);
  transform: translateY(-2px);
}
.wallpaper-card.active {
  border-color: var(--lh-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lh-accent) 25%, transparent);
}
.wallpaper-card.selected {
  border-color: var(--lh-accent);
  background: color-mix(in srgb, var(--lh-accent) 8%, var(--lh-surface));
}
.thumb-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  background: #000;
  overflow: hidden;
}
.thumb-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.select-checkbox {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 2px solid #ffffff;
  background: rgba(0, 0, 0, 0.45);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.15s ease;
  z-index: 2;
}
.select-checkbox:hover {
  background: rgba(0, 0, 0, 0.7);
}
.select-checkbox.checked {
  background: var(--lh-accent);
  border-color: var(--lh-accent);
}
.select-checkbox svg {
  width: 14px;
  height: 14px;
  color: #ffffff;
}
.active-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}
.tags-group {
  position: absolute;
  bottom: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
}
.fit-tag {
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  color: #60a5fa;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 500;
}
.source-tag {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
}
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  gap: 6px;
}
.card-name {
  font-size: 12px;
  color: var(--lh-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.action-btn {
  background: transparent;
  border: none;
  padding: 3px;
  border-radius: 4px;
  color: var(--lh-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.action-btn:hover {
  background: var(--lh-surface-hover);
  color: var(--lh-text);
}
.action-btn.text-danger:hover {
  color: var(--lh-danger);
  background: var(--lh-danger-bg);
}
.action-btn svg {
  width: 14px;
  height: 14px;
}
</style>
