<script setup lang="ts">
import type { FolderItemGhost, FolderItemPressLine } from '../../composables/useFolderItemTouchDrag'
import BookmarkIcon from '../BookmarkIcon.vue'

// 触屏手势悬浮层与描边线属性。
defineProps<{
  folderPressLine: FolderItemPressLine | null
  pressProgress: number
  folderGhost: FolderItemGhost | null
}>()
</script>

<template>
  <!-- 触屏手势浮层：挂到 body，否则会被应用根节点的层叠上下文压在文件夹遮罩之下 -->
  <Teleport to="body">
    <div
      v-if="folderPressLine"
      class="folder-item-press"
      :style="{ left: folderPressLine.left + 'px', top: folderPressLine.top + 'px', width: folderPressLine.boxWidth + 'px', height: folderPressLine.boxHeight + 'px' }"
      aria-hidden="true"
    >
      <svg class="press-svg" :viewBox="folderPressLine.viewBox">
        <rect
          :x="folderPressLine.x"
          :y="folderPressLine.y"
          :width="folderPressLine.width"
          :height="folderPressLine.height"
          :rx="folderPressLine.rx"
          :stroke-dasharray="folderPressLine.perimeter"
          :stroke-dashoffset="folderPressLine.perimeter * (1 - pressProgress)"
        />
      </svg>
    </div>
    <div v-if="folderGhost" class="folder-item-ghost" :style="{ left: folderGhost.x + 'px', top: folderGhost.y + 'px' }" aria-hidden="true">
      <BookmarkIcon class="ghost-icon" :title="folderGhost.bookmark.title" :icon-url="folderGhost.bookmark.iconUrl" :site-url="folderGhost.bookmark.url" />
    </div>
  </Teleport>
</template>

<style scoped>
/* 触屏按下文件夹图标的描边线：与组件按压同款单色方框/圆形，固定定位才能盖在文件夹遮罩之上 */
.folder-item-press { position: fixed; z-index: 2900; pointer-events: none; }
.folder-item-press .press-svg { display: block; width: 100%; height: 100%; overflow: visible; }
.folder-item-press rect { fill: none; stroke: color-mix(in srgb, var(--lh-text) 55%, transparent); stroke-width: 2; stroke-linecap: round; }
@media (prefers-reduced-motion: reduce) { .folder-item-press { display: none; } }
.folder-item-ghost { position: fixed; z-index: 3000; display: grid; place-items: center; width: 62px; height: 62px; pointer-events: none; transform: translate(-50%, -50%) scale(1.08); border: 1px solid var(--lh-border); border-radius: var(--lh-radius-md); background: color-mix(in srgb, var(--lh-surface-solid, white) 88%, transparent); box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), var(--lh-shadow-dropdown); backdrop-filter: blur(var(--lh-blur)) saturate(160%); -webkit-backdrop-filter: blur(var(--lh-blur)) saturate(160%); }
.folder-item-ghost .ghost-icon { --bookmark-icon-size: 34px; }
</style>
