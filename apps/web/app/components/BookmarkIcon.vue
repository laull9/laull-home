<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

// 书签图标统一处理自定义地址、缓存与失败回退。
const props = withDefaults(defineProps<{ title: string; iconUrl: string; siteUrl?: string }>(), { siteUrl: '' })

// 获取全局明暗主题偏好。
const { isDark } = useTheme()

// 图标恢复复用站点级内存与持久化缓存，避免同页重复探测。
const recoveredIcons = useState<Record<string, string>>('lh:site-favicons', () => ({}))
const fetchingIcons = useState<Set<string>>('lh:fetching-site-favicons', () => new Set<string>())
const retryAfter = useState<Record<string, number>>('lh:site-favicon-retry', () => ({}))
const { fetchFavicon } = useBookmarks()
const currentSource = ref('')
const failedSources = new Set<string>()

// 标记当前图标是否为深色透明图标。
const isDarkIcon = ref(false)

// 判定文本中是否包含已知深色透明图标站点的特征词。
function matchesDarkKeyword(val: string): boolean {
  const s = val.toLowerCase()
  return s.includes('github') || s.includes('apple') || s.includes('notion') || s.includes('vercel') || s.includes('steam') || s.includes('threads') || s.includes('nextjs') || s.includes('x.com')
}

// 规范化允许渲染的本地或 HTTP 图片地址。
function normalizeSource(value: string): string {
  if (/^\/(?!\/)[^\\\s]+$/.test(value)) return value
  try {
    const url = new URL(value)
    if (['http:', 'https:'].includes(url.protocol)) return url.href
  } catch { /* 地址无效时继续使用文字回退。 */ }
  return ''
}

// 当前书签站点根地址作为恢复缓存键。
const siteOrigin = computed(() => {
  try { return props.siteUrl ? new URL(props.siteUrl).origin : '' } catch { return '' }
})

// 原始图标优先，失败后切换到站点恢复缓存。
const candidates = computed(() => [...new Set([
  normalizeSource(props.iconUrl),
  normalizeSource(recoveredIcons.value[siteOrigin.value] ?? ''),
].filter(Boolean))])

// 监听地址变化重置失败记录与深色判定状态。
watch(() => [props.iconUrl, props.siteUrl], () => {
  failedSources.clear()
  currentSource.value = candidates.value[0] ?? ''
  isDarkIcon.value = matchesDarkKeyword(props.title + ' ' + props.iconUrl)
}, { immediate: true })
// 其他实例完成同站点探测后立即接入共享结果。
watch(candidates, next => {
  if (!currentSource.value) currentSource.value = next.find(url => !failedSources.has(url)) ?? ''
})

// 自动探测缺失图标，同一站点五分钟内只发起一次失败重试。
async function recoverSource() {
  const origin = siteOrigin.value
  if (!origin || fetchingIcons.value.has(origin) || Date.now() < (retryAfter.value[origin] ?? 0)) return
  fetchingIcons.value.add(origin)
  retryAfter.value[origin] = Date.now() + 5 * 60_000
  try {
    const recovered = await fetchFavicon(origin)
    if (!recovered) return
    recoveredIcons.value[origin] = recovered
    retryAfter.value[origin] = 0
    currentSource.value = recovered
    if (import.meta.client) window.localStorage.setItem('lh_site_favicons', JSON.stringify(recoveredIcons.value))
  } catch {
    // 网络不可用时保留首字回退，后续挂载按退避时间再试。
  } finally {
    fetchingIcons.value.delete(origin)
  }
}

// 当前来源失败后尝试缓存中的下一来源，再触发服务端多源恢复。
function handleImageError() {
  if (currentSource.value) failedSources.add(currentSource.value)
  currentSource.value = candidates.value.find(url => !failedSources.has(url)) ?? ''
  if (!currentSource.value) void recoverSource()
}

// 首次挂载恢复持久化的站点图标，并为缺失图标启动后台探测。
onMounted(() => {
  try {
    const stored = window.localStorage.getItem('lh_site_favicons')
    if (stored) Object.assign(recoveredIcons.value, JSON.parse(stored))
  } catch { /* 忽略损坏或不可用的本地缓存。 */ }
  currentSource.value = candidates.value.find(url => !failedSources.has(url)) ?? ''
  if (!currentSource.value) void recoverSource()
})

// 提取可见像素分析亮度以精准识别深色图标。
function analyzeIconLuma(img: HTMLImageElement) {
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

// 图片载入后在空闲调度周期中进行像素分析。
function handleImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  if (!img || img.naturalWidth === 0) return
  if (matchesDarkKeyword(props.title + ' ' + props.iconUrl)) {
    isDarkIcon.value = true
    return
  }
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => analyzeIconLuma(img), { timeout: 1000 })
  } else {
    setTimeout(() => analyzeIconLuma(img), 16)
  }
}
</script>

<template>
  <span
    class="bookmark-icon-frame"
    :class="{ 'dark-contrast-plate': isDark && isDarkIcon }"
  >
    <img
      v-if="currentSource"
      :src="currentSource"
      alt=""
      draggable="false"
      loading="lazy"
      referrerpolicy="no-referrer"
      @load="handleImageLoad"
      @error="handleImageError"
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
  border-radius: var(--lh-radius-md, 10px);
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
