<script setup lang="ts">
// 搜索引擎图标组件属性声明。
const props = withDefaults(
  defineProps<{
    // 搜索引擎名称。
    name: string
    // 搜索引擎唯一标识。
    id?: string
    // 图标像素尺寸。
    size?: number
  }>(),
  {
    id: "",
    size: 20,
  },
)

// 判定是否为特定搜索引擎。
const normalized = computed(() => {
  const text = (props.id + " " + props.name).toLowerCase()
  if (text.includes("google")) return "google"
  if (text.includes("bing")) return "bing"
  if (text.includes("baidu") || text.includes("百度")) return "baidu"
  if (text.includes("duckduckgo") || text.includes("ddg")) return "duckduckgo"
  if (text.includes("github")) return "github"
  if (text.includes("youtube")) return "youtube"
  if (text.includes("yandex")) return "yandex"
  if (text.includes("qwant")) return "qwant"
  if (text.includes("wikihow")) return "wikihow"
  return "custom"
})
</script>

<template>
  <div class="engine-icon-container" :style="{ width: `${size}px`, height: `${size}px` }">
    <!-- Google 彩色图标 -->
    <svg v-if="normalized === 'google'" viewBox="0 0 24 24" class="engine-svg">
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
    </svg>

    <!-- Bing 微软图标 -->
    <svg v-else-if="normalized === 'bing'" viewBox="0 0 24 24" class="engine-svg">
      <path fill="#008373" d="M5 3v18l5-2.8V9.6l5.7 3.3-2.8 3.5 4.3 2.4L20 14.3 12.5 8 5 3z" />
    </svg>

    <!-- 百度 熊掌图标 -->
    <svg v-else-if="normalized === 'baidu'" viewBox="0 0 24 24" class="engine-svg">
      <path fill="#2932E1" d="M17.8 7.3c-.6-1.5-1.8-2.3-3.1-2.1-1.3.2-2 1.5-2.2 2.9-.2 1.4.3 2.7 1.6 2.9 1.3.2 2.7-.9 3.7-3.7zM6.2 7.3c.6-1.5 1.8-2.3 3.1-2.1 1.3.2 2 1.5 2.2 2.9.2 1.4-.3 2.7-1.6 2.9-1.3.2-2.7-.9-3.7-3.7zM12 11.2c-2.8 0-4.9 2-4.9 4.8s2.2 5 4.9 5 4.9-2.2 4.9-5-2.1-4.8-4.9-4.8z" />
    </svg>

    <!-- DuckDuckGo 鸭子图标 -->
    <svg v-else-if="normalized === 'duckduckgo'" viewBox="0 0 24 24" class="engine-svg">
      <circle cx="12" cy="12" r="10.5" fill="#DE5833" />
      <circle cx="12" cy="11.5" r="7" fill="#FFFFFF" />
      <circle cx="10" cy="10" r="1.5" fill="#333333" />
      <path d="M11 13c1.5 0 3 .5 3.5 1.5H9.5c.5-1 2-1.5 3.5-1.5z" fill="#F49A24" />
    </svg>

    <!-- GitHub 图标 -->
    <svg v-else-if="normalized === 'github'" viewBox="0 0 24 24" fill="currentColor" class="engine-svg">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>

    <!-- YouTube 播放图标 -->
    <svg v-else-if="normalized === 'youtube'" viewBox="0 0 24 24" class="engine-svg">
      <path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
      <polygon fill="#FFFFFF" points="9.545,15.568 15.818,12 9.545,8.432" />
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
