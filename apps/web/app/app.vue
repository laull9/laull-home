<script setup lang="ts">
import { useWallpapers } from './composables/useWallpapers'

// 顶层挂载页面并恢复会话与主题状态。
const { refresh } = useAuth()
const { $api } = useNuxtApp()
const { applyTheme, backgroundStyle, setupSystemThemeListener, settings } = useTheme()
const { setupAutoRotate } = useWallpapers()

// 监听壁纸轮换配置变更，自动更新轮换定时器。
watch(
  () => [settings.value?.wallpaperType, settings.value?.wallpaperAutoRotate, settings.value?.wallpaperRotateInterval],
  () => setupAutoRotate(),
)

// 设置页使用更实的主题遮罩，保证壁纸上的表单文字可读。
const route = useRoute()
// 无壁纸时不叠加遮罩，保留主题原始背景。
const hasWallpaper = computed(() => Object.keys(backgroundStyle.value).length > 0)

// 系统监听在顶层卸载时释放。
let stopTheme: (() => void) | undefined
onUnmounted(() => stopTheme?.())
onMounted(async () => {
  stopTheme = setupSystemThemeListener()
  try {
    await refresh()
  } catch {
    // 允许访客状态访问。
  }
  try {
    const res = await $api.settings.get()
    if (res.data) {
      applyTheme(res.data)
      setupAutoRotate()
    }
  } catch {
    // 访客使用默认设置。
    applyTheme({
      revision: 0,
      title: '我的主页',
      appearance: 'system',
      themeId: 'default',
      wallpaperType: 'none',
      wallpaperValue: '',
      customCss: '',
    })
  }
})
</script>

<template>
  <div class="app-root" :class="{ 'settings-view': route.path === '/settings' }">
    <div class="wallpaper-layer" :style="backgroundStyle" aria-hidden="true" />
    <div v-if="hasWallpaper" class="wallpaper-shade" aria-hidden="true" />
    <div v-if="hasWallpaper && route.path === '/settings'" class="wallpaper-tint" aria-hidden="true" />
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<style>
@import './assets/themes.css';

:root {
  --lh-bg: #f8fafc;
  --lh-surface: rgba(255, 255, 255, 0.9);
  --lh-surface-hover: rgba(241, 245, 249, 0.95);
  --lh-surface-active: rgba(226, 232, 240, 0.95);
  --lh-input-bg: rgba(255, 255, 255, 0.85);
  --lh-input-border: rgba(226, 232, 240, 0.9);
  --lh-text: #0f172a;
  --lh-text-secondary: #64748b;
  --lh-text-muted: #94a3b8;
  --lh-accent: #2563eb;
  --lh-accent-hover: #1d4ed8;
  --lh-accent-text: #ffffff;
  --lh-border: #e2e8f0;
  --lh-border-hover: #cbd5e1;
  --lh-radius-sm: 6px;
  --lh-radius-md: 10px;
  --lh-radius-lg: 16px;
  --lh-radius-full: 9999px;
  --lh-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --lh-shadow-card: 0 4px 16px rgba(0, 0, 0, 0.05);
  --lh-shadow-dropdown: 0 12px 32px rgba(15, 23, 42, 0.1);
  --lh-blur: 16px;
  --lh-font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

html {
  scrollbar-gutter: stable;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--lh-bg);
  color: var(--lh-text);
  font-family: var(--lh-font-family);
  -webkit-font-smoothing: antialiased;
}

.app-root {
  min-height: 100vh;
  transition: background-color 0.2s ease, color 0.2s ease;
}

/* 壁纸、暗化和设置页主题遮罩依次叠放，主页保留壁纸原貌不设额外遮罩。 */
.wallpaper-layer, .wallpaper-shade, .wallpaper-tint { position: fixed; inset: 0; pointer-events: none; }
.wallpaper-layer { z-index: -3; }
.wallpaper-shade { z-index: -2; }
.wallpaper-tint { z-index: -1; background: var(--lh-bg); opacity: .96; }
.wallpaper-layer { filter: blur(var(--lh-wallpaper-blur, 0px)); background-size: cover; }
.wallpaper-shade { background: black; opacity: var(--lh-wallpaper-dim, 0); }
.app-root { isolation: isolate; }
*, *::before, *::after { box-sizing: border-box; }
button, input, textarea, select { font: inherit; }
button { cursor: pointer; }
button, input, textarea, select { border: 1px solid var(--lh-border); border-radius: var(--lh-radius-sm); background: var(--lh-input-bg); color: var(--lh-text); padding: 8px 10px; }
button:disabled { cursor: default; opacity: .55; }
:focus-visible { outline: 2px solid var(--lh-accent); outline-offset: 3px; }

/* 现代主题全局组件毛玻璃特效与柔和阴影适配 */
[data-theme="modern"] button,
[data-theme="modern"] input,
[data-theme="modern"] textarea,
[data-theme="modern"] select {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}
[data-theme="modern"] input:focus,
[data-theme="modern"] textarea:focus,
[data-theme="modern"] select:focus {
  border-color: var(--lh-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lh-accent) 18%, transparent);
}

@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; scroll-behavior: auto !important; } }
</style>
