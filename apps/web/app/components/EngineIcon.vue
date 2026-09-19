<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { extractSiteOrigin } from '@laull-home/shared'

// 搜索引擎图标组件属性声明。
const props = withDefaults(
  defineProps<{
    // 搜索引擎名称。
    name: string
    // 搜索引擎唯一标识。
    id?: string
    // 图标像素尺寸。
    size?: number
    // 搜索引擎网址模板或主站地址。
    url?: string
  }>(),
  {
    id: "",
    size: 20,
    url: "",
  },
)

// 获取明暗主题状态。
const { isDark } = useTheme()

// 获取图标探测方法。
const { fetchFavicon } = useBookmarks()

// 全局内存共享的搜索引擎 Favicon 缓存字典。
const iconCache = useState<Record<string, string>>('lh:engine-favicons', () => ({}))

// 当前组件图片加载失败标志。
const imgFailed = ref(false)

// 标记当前图标是否为深色透明图标。
const isDarkIcon = ref(false)

// 判定是否为已知深色透明图标。
function matchesDarkKeyword(text: string): boolean {
  const s = text.toLowerCase()
  return s.includes('github') || s.includes('apple') || s.includes('notion') || s.includes('vercel') || s.includes('x.com')
}

// 判定是否为特定内置搜索引擎。
const normalized = computed(() => {
  const text = (props.id + " " + props.name + " " + (props.url || "")).toLowerCase()
  if (text.includes("google")) return "google"
  if (text.includes("bing") || text.includes("必应")) return "bing"
  if (text.includes("baidu") || text.includes("百度")) return "baidu"
  if (text.includes("duckduckgo") || text.includes("ddg")) return "duckduckgo"
  if (text.includes("github")) return "github"
  if (text.includes("youtube")) return "youtube"
  if (text.includes("yandex")) return "yandex"
  if (text.includes("bilibili") || text.includes("哔哩哔哩") || text.includes("b站")) return "bilibili"
  if (text.includes("qwant")) return "qwant"
  if (text.includes("wikihow")) return "wikihow"
  return "custom"
})

// 当前生效的目标站点根地址。
const siteOrigin = computed(() => extractSiteOrigin(props.url))

// 从缓存中读取当前站点的 Favicon 图标。
const cachedIconUrl = computed(() => {
  if (!siteOrigin.value) return ""
  return iconCache.value[siteOrigin.value] ?? ""
})

// 正在发起的网络请求池，避免并发重复拉取。
const fetchingPool = useState<Set<string>>('lh:fetching-engine-favicons', () => new Set<string>())

// 抓取并缓存目标站点的真实 Favicon。
async function fetchAndStoreIcon(targetOrigin: string) {
  if (!targetOrigin || iconCache.value[targetOrigin] || fetchingPool.value.has(targetOrigin)) return
  fetchingPool.value.add(targetOrigin)
  try {
    const iconUrl = await fetchFavicon(targetOrigin)
    if (iconUrl) {
      iconCache.value[targetOrigin] = iconUrl
      if (import.meta.client) {
        try {
          window.localStorage.setItem('lh_engine_favicons', JSON.stringify(iconCache.value))
        } catch { /* 忽略本地存储写入配额异常。 */ }
      }
    }
  } catch {
    // 抓取失败保留内置回退。
  } finally {
    fetchingPool.value.delete(targetOrigin)
  }
}

// 监听地址变化触发重置与异步拉取。
watch(siteOrigin, (origin) => {
  imgFailed.value = false
  isDarkIcon.value = matchesDarkKeyword(props.name + " " + props.id + " " + (origin || ""))
  if (origin && !iconCache.value[origin]) {
    void fetchAndStoreIcon(origin)
  }
}, { immediate: true })

// 客户端初始化时读取 LocalStorage 本地持久化缓存。
onMounted(() => {
  if (import.meta.client) {
    try {
      const stored = window.localStorage.getItem('lh_engine_favicons')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed && typeof parsed === 'object') {
          for (const key of Object.keys(parsed)) {
            if (typeof parsed[key] === 'string' && parsed[key].endsWith('.svg')) {
              delete parsed[key]
            }
          }
          Object.assign(iconCache.value, parsed)
        }
      }
    } catch { /* 忽略读取异常。 */ }
  }
  if (siteOrigin.value && !iconCache.value[siteOrigin.value]) {
    void fetchAndStoreIcon(siteOrigin.value)
  }
})

// 动态分析图标像素明暗度。
function analyzeImgLuma(img: HTMLImageElement) {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 16
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.drawImage(img, 0, 0, 16, 16)
    const data = ctx.getImageData(0, 0, 16, 16).data
    let visible = 0
    let dark = 0
    let sumLuma = 0
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) > 45) {
        visible++
        const luma = (0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0)) / 255
        sumLuma += luma
        if (luma < 0.38) dark++
      }
    }
    if (visible > 6 && (sumLuma / visible < 0.40 || dark / visible > 0.65)) {
      isDarkIcon.value = true
    }
  } catch { /* 跨域画布安全降级。 */ }
}

// 图片加载成功后在浏览器空闲调度中执行像素分析。
function handleImgLoad(event: Event) {
  const img = event.target as HTMLImageElement
  if (!img || img.naturalWidth === 0) return
  if (matchesDarkKeyword(props.name + " " + props.id)) {
    isDarkIcon.value = true
    return
  }
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => analyzeImgLuma(img), { timeout: 1000 })
  } else {
    setTimeout(() => analyzeImgLuma(img), 16)
  }
}
</script>

<template>
  <div
    class="engine-icon-container"
    :class="{ 'dark-contrast-plate': isDark && (isDarkIcon || (!cachedIconUrl && normalized === 'github')) }"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <!-- 已拉取到真实站点 Favicon，优先呈现原汁原味真实图标 -->
    <img
      v-if="cachedIconUrl && !imgFailed"
      :src="cachedIconUrl"
      alt=""
      draggable="false"
      loading="lazy"
      crossorigin="anonymous"
      class="engine-img"
      @load="handleImgLoad"
      @error="imgFailed = true"
    >

    <!-- Google 彩色官方矢量图标回退 -->
    <svg v-else-if="normalized === 'google'" viewBox="0 0 24 24" class="engine-svg">
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
    </svg>

    <!-- YouTube 播放官方矢量图标回退 -->
    <svg v-else-if="normalized === 'youtube'" viewBox="0 0 24 24" class="engine-svg">
      <path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
      <polygon fill="#FFFFFF" points="9.545,15.568 15.818,12 9.545,8.432" />
    </svg>

    <!-- Bing 官方标准微软蓝色矢量图标回退 -->
    <svg v-else-if="normalized === 'bing'" viewBox="0 0 24 24" class="engine-svg">
      <path fill="#008AD7" d="M20.176 15.406a6.48 6.48 0 01-1.736 4.414c1.338-1.47.803-3.869-1.003-4.635-.862-.305-2.488-.85-3.367-1.158a1.834 1.834 0 01-.932-.818c-.381-.975-1.163-2.968-1.548-3.948-.095-.285-.31-.625-.265-.938.046-.598.724-1.003 1.276-.754l3.682 1.888c.621.292 1.305.692 1.796 1.172a6.486 6.486 0 012.097 4.777zm-1.44 1.888c-.264-1.194-1.135-1.744-2.216-2.028-1.527.902-4.853 2.878-6.952 4.13-1.103.68-2.13 1.35-2.919 1.242a2.866 2.866 0 01-2.77-2.325c-.012-.048-.008-.03-.001.01a6.4 6.4 0 00.947 2.653 6.498 6.498 0 005.486 3.022c1.908.062 3.536-1.153 5.099-2.096.292-.188.804-.496 1.332-.831l1.423-1.51c.553-.577.764-1.426.571-2.267zm-12.04 2.97c.422 0 .822-.1 1.173-.29.355-.215.964-.579 1.7-1.018L9.57 4.502c0-.99-.497-1.864-1.257-2.382-.08-.059-2.91-1.901-2.99-1.956-.605-.432-1.523.045-1.5.797v14.887l.417 2.36a2.488 2.488 0 002.455 2.056z" />
    </svg>

    <!-- DuckDuckGo 官方标准 Dax 矢量图标回退 -->
    <svg v-else-if="normalized === 'duckduckgo'" viewBox="0 0 24 24" class="engine-svg">
      <circle cx="12" cy="12" r="12" fill="#DE5833" />
      <path fill="#FFFFFF" d="M12 1.781C6.356 1.781 1.781 6.356 1.781 12c0 4.453 2.849 8.239 6.822 9.639-.625-2.976-1.967-9.24-2.29-11.064-.36-2.019.244-3.704 1.611-4.424.046-.024.098-.046.152-.066.018-.01.032-.02.048-.028.426-.224 1.017-.392 1.661-.482-.909-.272-2.151-.332-2.991-.246-.003-.14.127-.435.3-.515a.828.828 0 0 1 .204-.056c.184-.076.422-.116.596-.184-.352-.142-.909-.402-1.057-.418.12-.018.209-.07.357-.098l-.004-.002.034-.004.024-.004a5.772 5.772 0 0 1 3.595.584c.571.306.975.633 1.225.977.652.124 1.227.36 1.603.736 1.154 1.151 2.185 3.784 1.757 5.3.766-.183 2.415-.6 2.889-.82.5-.23 2.619.114 1.125.947-.645.362-2.387 1.026-3.632 1.397-1.243.372-1.997-.355-2.411.256-.328.486-.066 1.152 1.42 1.29 2.007.186 3.93-.904 4.142-.324.211.58-1.723 1.299-2.903 1.323-1.18.023-3.554-.779-3.91-1.027 0 0-.002 0-.002-.002-.257 1.128.163 2.716.733 4.105-.378.038-.806.147-.98.31-.789-.393-2.407-1.139-2.442-.679-.048.612 0 3.1.329 3.288.24.138 1.556-.575 2.25-.971.02.008.042.015.064.02.422.096 1.219 0 1.503-.188a.218.218 0 0 0 .068-.088c.002-.003.003-.009.004-.013.114-.254.048-.85-.03-1.247l-.034-.156c.509-.372 1.803-1.284 2.141-1.209.422.096.516 3.101.14 3.245-.278.103-1.563-.366-2.208-.615.219.421.479.917.749 1.438 4.469-1.092 7.786-5.12 7.786-9.925C22.219 6.356 17.644 1.781 12 1.781z" />
      <circle cx="9.095" cy="10.339" r="0.758" fill="#333333" />
      <circle cx="13.819" cy="9.756" r="0.65" fill="#333333" />
    </svg>

    <!-- 百度 熊掌官方矢量图标回退 -->
    <svg v-else-if="normalized === 'baidu'" viewBox="0 0 24 24" class="engine-svg">
      <path fill="#2932E1" d="M17.8 7.3c-.6-1.5-1.8-2.3-3.1-2.1-1.3.2-2 1.5-2.2 2.9-.2 1.4.3 2.7 1.6 2.9 1.3.2 2.7-.9 3.7-3.7zM6.2 7.3c.6-1.5 1.8-2.3-3.1-2.1 1.3.2 2 1.5 2.2 2.9.2 1.4-.3 2.7-1.6 2.9-1.3.2-2.7-.9-3.7-3.7zM12 11.2c-2.8 0-4.9 2-4.9 4.8s2.2 5 4.9 5 4.9-2.2 4.9-5-2.1-4.8-4.9-4.8z" />
    </svg>

    <!-- GitHub 官方矢量图标回退 -->
    <svg v-else-if="normalized === 'github'" viewBox="0 0 24 24" fill="currentColor" class="engine-svg">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>

    <!-- Yandex 图标 -->
    <svg v-else-if="normalized === 'yandex'" viewBox="0 0 24 24" class="engine-svg">
      <circle cx="12" cy="12" r="11" fill="#FC3F1D" />
      <path fill="#FFFFFF" d="M14.5 18h-2.1l-3.3-8.8h2.3l2.1 6.1 2-6.1h2.2z" />
    </svg>

    <!-- Qwant 图标 -->
    <svg v-else-if="normalized === 'qwant'" viewBox="0 0 24 24" class="engine-svg">
      <rect width="22" height="22" x="1" y="1" rx="5" fill="#1C1C1E" />
      <circle cx="11" cy="11" r="5" fill="none" stroke="#FFFFFF" stroke-width="2" />
      <line x1="14.5" y1="14.5" x2="18" y2="18" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" />
    </svg>

    <!-- WikiHow 图标 -->
    <div v-else-if="normalized === 'wikihow'" class="badge-wikihow" :style="{ width: `${size}px`, height: `${size}px` }">
      wH
    </div>

    <!-- 自定义/其他引擎首字徽章 -->
    <div v-else class="badge-custom" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.max(10, size * 0.55)}px` }">
      {{ (name[0] ?? '#').toUpperCase() }}
    </div>
  </div>
</template>

<style scoped>
.engine-icon-container {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  box-sizing: border-box;
  transition: background-color 0.2s ease, box-shadow 0.2s ease, padding 0.2s ease;
}

/* 暗色模式下深色图标温润高反差衬底 */
.engine-icon-container.dark-contrast-plate {
  background: rgba(255, 255, 255, 0.94) !important;
  color: #1a1a1a !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.36);
  padding: 2px;
}

.engine-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.engine-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.badge-wikihow {
  background: #93B874;
  color: #FFFFFF;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  text-transform: none;
}

.badge-custom {
  background: var(--lh-surface-active);
  border: 1px solid var(--lh-border);
  color: var(--lh-accent);
  border-radius: var(--lh-radius-sm);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
