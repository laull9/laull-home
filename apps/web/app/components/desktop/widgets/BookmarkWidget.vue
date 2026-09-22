<script setup lang="ts">
import { computed } from 'vue'
import type { Bookmark, WidgetNode } from '@laull-home/shared'
import BookmarkIcon from '../../BookmarkIcon.vue'

// 图标书签接收节点配置、当前书签实体与编辑状态。
const props = defineProps<{ node: WidgetNode; bookmark: Bookmark; editing: boolean; width: number }>()

// 处于编辑模式时向外发送书签修改请求。
const emit = defineEmits<{ editBookmark: [bookmark: Bookmark] }>()

// 提取书签网址的主域名作为副标题。
const host = computed(() => {
  try {
    const url = new URL(props.bookmark.url)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
})

// 为字母徽章计算相对稳定的种子背景色。
const emblemHue = computed(() => {
  let hash = 0
  for (let i = 0; i < props.bookmark.title.length; i++) {
    hash = (hash << 5) - hash + props.bookmark.title.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % 360
})

// 处理点击交互：编辑模式下阻止跳转并打开配置。
function handleClick(event: MouseEvent) {
  if (props.editing) {
    event.preventDefault()
    emit('editBookmark', props.bookmark)
  }
}
</script>

<template>
  <a
    :href="bookmark.url"
    target="_blank"
    rel="noopener noreferrer"
    class="bookmark-link"
    :class="['variant-' + (node.variant || 'standard'), { editing }]"
    @click="handleClick"
  >
    <!-- 胶囊信息卡模式：横向排版，适合 2x1 或更大卡片 -->
    <template v-if="node.variant === 'pill'">
      <div class="pill-layout">
        <BookmarkIcon :title="bookmark.title" :icon-url="bookmark.iconUrl" :site-url="bookmark.url" class="pill-icon" />
        <div class="pill-info">
          <span class="pill-title">{{ bookmark.title }}</span>
          <span v-if="host" class="pill-host">{{ host }}</span>
        </div>
        <span class="pill-arrow" aria-hidden="true">↗</span>
      </div>
    </template>

    <!-- 质感大图标模式：大尺寸圆角图标，纯净无文字 -->
    <template v-else-if="node.variant === 'large'">
      <div class="large-layout">
        <div class="large-icon-wrapper">
          <BookmarkIcon :title="bookmark.title" :icon-url="bookmark.iconUrl" :site-url="bookmark.url" class="large-icon" />
        </div>
      </div>
    </template>

    <!-- 字母徽章模式：突出排版设计，赋予无图标网站专属徽标 -->
    <template v-else-if="node.variant === 'emblem'">
      <div class="emblem-layout">
        <div
          class="emblem-badge"
          :style="{ '--badge-hue': emblemHue + 'deg' }"
        >
          <span>{{ (bookmark.title.trim()[0] ?? 'L').toUpperCase() }}</span>
        </div>
        <span class="emblem-title">{{ bookmark.title }}</span>
      </div>
    </template>

    <!-- 经典标准模式 (默认 1x1) -->
    <template v-else>
      <div class="standard-layout">
        <BookmarkIcon :title="bookmark.title" :icon-url="bookmark.iconUrl" :site-url="bookmark.url" class="standard-icon" />
        <span class="standard-title">{{ bookmark.title }}</span>
      </div>
    </template>
  </a>
</template>

<style scoped>
.bookmark-link {
  display: flex;
  width: 100%;
  height: 100%;
  text-decoration: none;
  color: inherit;
  box-sizing: border-box;
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease;
}

.bookmark-link:not(.editing):hover {
  transform: translateY(-4px);
  opacity: 1;
}

/* 经典标准样式 */
.standard-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.standard-icon {
  --bookmark-icon-size: 38px;
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), filter 0.22s ease;
}
.bookmark-link:not(.editing):hover .standard-icon {
  transform: scale(1.08);
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.2)) brightness(1.15);
}
.standard-title {
  font-size: 12px;
  font-weight: 500;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  transition: color 0.18s ease;
}
.bookmark-link:not(.editing):hover .standard-title {
  color: var(--lh-accent);
}

/* 质感大图标样式 */
.large-layout {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.large-icon-wrapper {
  padding: 2px;
  border-radius: var(--widget-radius, var(--lh-radius-lg));
  transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.bookmark-link:not(.editing):hover .large-icon-wrapper {
  transform: scale(1.05);
}
.large-icon {
  --bookmark-icon-size: 56px;
}

/* 胶囊信息卡横向样式 (支持 1x1 紧凑胶囊与 2x1 完整胶囊) */
.bookmark-link.variant-pill {
  align-items: center;
  justify-content: center;
  width: 100%;
}
.pill-layout {
  width: 100%;
  height: 42px;
  max-height: 42px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-radius: var(--widget-radius, var(--lh-radius-lg));
  background: color-mix(in srgb, var(--lh-surface-hover) 60%, transparent);
  border: 1px solid var(--lh-border);
  box-sizing: border-box;
  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.22s ease;
}
.bookmark-link:not(.editing):hover .pill-layout {
  border-color: var(--lh-accent);
  background: var(--lh-surface-hover);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.1);
}
.pill-icon {
  --bookmark-icon-size: 26px;
}
.pill-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  text-align: left;
}
.pill-title {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pill-host {
  font-size: 10px;
  line-height: 1.2;
  color: var(--lh-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pill-arrow {
  font-size: 12px;
  color: var(--lh-text-muted);
  opacity: 0.6;
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.bookmark-link:hover .pill-arrow {
  opacity: 1;
  transform: translate(2px, -2px);
  color: var(--lh-accent);
}

/* 1 列紧凑或小窗格自适应胶囊 */
@container (max-width: 136px) {
  .pill-layout {
    padding: 0 8px;
    gap: 6px;
  }
  .pill-icon {
    --bookmark-icon-size: 22px;
  }
  .pill-host, .pill-arrow {
    display: none;
  }
  .pill-title {
    font-size: 11px;
  }
}

/* 字母徽章排版样式 */
.emblem-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.emblem-badge {
  width: 44px;
  height: 44px;
  border-radius: var(--widget-radius, var(--lh-radius-md));
  background: hsl(var(--badge-hue) 45% 92%);
  color: hsl(var(--badge-hue) 65% 35%);
  display: grid;
  place-items: center;
  font-size: 18px;
  font-weight: 700;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.4), 0 2px 8px rgba(0, 0, 0, 0.05);
  border: 1px solid hsl(var(--badge-hue) 45% 82%);
  transition: box-shadow 0.22s ease;
}
.bookmark-link:not(.editing):hover .emblem-badge {
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.5), 0 8px 16px rgba(0, 0, 0, 0.14);
}
:global(html.dark) .emblem-badge {
  background: hsl(var(--badge-hue) 35% 22%);
  color: hsl(var(--badge-hue) 65% 85%);
  border-color: hsl(var(--badge-hue) 35% 32%);
}
@media (prefers-color-scheme: dark) {
  .emblem-badge {
    background: hsl(var(--badge-hue) 35% 22%);
    color: hsl(var(--badge-hue) 65% 85%);
    border-color: hsl(var(--badge-hue) 35% 32%);
  }
}
.emblem-title {
  font-size: 12px;
  font-weight: 500;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}
</style>
