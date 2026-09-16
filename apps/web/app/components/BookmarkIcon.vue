<script setup lang="ts">
import { computed, ref, watch } from 'vue'

// 书签图标统一处理自定义地址、缓存与失败回退。
const props = defineProps<{ title: string; iconUrl: string }>()

// 获取全局明暗主题偏好。
const { isDark } = useTheme()

// 失败状态只存在于渲染器，不改写书签数据。
const failed = ref(false)

// 标记当前图标是否为深色透明图标。
const isDarkIcon = ref(false)

// 判定文本中是否包含已知深色透明图标站点的特征词。
function matchesDarkKeyword(val: string): boolean {
  const s = val.toLowerCase()
  return s.includes('github') || s.includes('apple') || s.includes('notion') || s.includes('vercel') || s.includes('steam') || s.includes('threads') || s.includes('nextjs') || s.includes('x.com')
}

// 监听地址变化重置失败与深色判定状态。
watch(() => props.iconUrl, () => {
  failed.value = false
  isDarkIcon.value = matchesDarkKeyword(props.title + ' ' + props.iconUrl)
}, { immediate: true })

// 禁止脚本、协议相对路径与未经允许的资源协议。
const source = computed(() => {
  if (/^\/(?!\/)[^\\\s]+$/.test(props.iconUrl)) return props.iconUrl
  try {
    const url = new URL(props.iconUrl)
    if (['http:', 'https:'].includes(url.protocol)) return url.href
  } catch { /* 缺失图标使用本地回退。 */ }
  return ''
})

// 图片载入后提取可见像素分析亮度以精准识别深色图标。
function handleImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  if (!img || img.naturalWidth === 0) return
  if (matchesDarkKeyword(props.title + ' ' + props.iconUrl)) {
    isDarkIcon.value = true
    return
  }
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 16
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.drawImage(img, 0, 0, 16, 16)
    const imgData = ctx.getImageData(0, 0, 16, 16)
    const data = imgData.data
    let totalVisible = 0
    let darkVisible = 0
    let totalLuma = 0
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] ?? 0
      if (alpha > 45) {
        totalVisible++
        const luma = (0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0)) / 255
        totalLuma += luma
        if (luma < 0.38) darkVisible++
      }
    }
    if (totalVisible > 6) {
      const avgLuma = totalLuma / totalVisible
      const darkRatio = darkVisible / totalVisible
      if (avgLuma < 0.40 || darkRatio > 0.65) {
        isDarkIcon.value = true
      }
    }
  } catch {
    // 跨域受限降级使用关键词判定。
  }
}
</script>

<template>
  <span
    class="bookmark-icon-frame"
    :class="{ 'dark-contrast-plate': isDark && isDarkIcon }"
  >
    <img
      v-if="source && !failed"
      :src="source"
      alt=""
      draggable="false"
      loading="lazy"
      crossorigin="anonymous"
      referrerpolicy="no-referrer"
      @load="handleImageLoad"
      @error="failed = true"
    >
    <span v-else class="bookmark-icon-fallback" aria-hidden="true">{{ (title.trim()[0] ?? '链').toUpperCase() }}</span>
  </span>
</template>

<style scoped>
.bookmark-icon-frame {
  width: var(--bookmark-icon-size, 36px);
  height: var(--bookmark-icon-size, 36px);
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 10px;
  overflow: hidden;
  box-sizing: border-box;
  transition: background-color 0.2s ease, box-shadow 0.2s ease, padding 0.2s ease;
}

/* 暗色环境下为深色透明图标提供温润的高反差浅底微垫片与柔和内衬 */
.bookmark-icon-frame.dark-contrast-plate {
  background: rgba(255, 255, 255, 0.94) !important;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.38);
  padding: 3px;
}

img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.bookmark-icon-fallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: var(--lh-surface-hover);
  color: var(--lh-text);
  font-weight: 600;
  font-size: calc(var(--bookmark-icon-size, 36px) * .44);
}
</style>
