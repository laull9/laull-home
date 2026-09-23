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
  document.documentElement.classList.add('preload-no-transition')
  try {
    const [, res] = await Promise.allSettled([
      refresh().catch(() => {}),
      $api.settings.get(),
    ])
    if (res.status === 'fulfilled' && res.value?.data) {
      applyTheme(res.value.data)
      setupAutoRotate()
    } else {
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
  } finally {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('preload-no-transition')
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

.preload-no-transition,
.preload-no-transition * {
  transition: none !important;
}

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
  --lh-danger: #dc2626;
  --lh-danger-hover: #b91c1c;
  --lh-danger-bg: rgba(220, 38, 38, 0.08);
  --lh-danger-border: rgba(220, 38, 38, 0.25);
  --lh-danger-text: #ffffff;
  --lh-success: #15803d;
  --lh-success-hover: #166534;
  --lh-success-bg: rgba(21, 128, 61, 0.08);
  --lh-success-border: rgba(21, 128, 61, 0.25);
  --lh-success-text: #ffffff;
  --lh-warning: #d97706;
  --lh-warning-hover: #b45309;
  --lh-warning-bg: rgba(217, 119, 6, 0.09);
  --lh-warning-border: rgba(217, 119, 6, 0.28);
  --lh-warning-text: #92400e;
}

html.dark {
  --lh-danger: #f87171;
  --lh-danger-hover: #ef4444;
  --lh-danger-bg: rgba(239, 68, 68, 0.16);
  --lh-danger-border: rgba(239, 68, 68, 0.35);
  --lh-danger-text: #000000;
  --lh-success: #4ade80;
  --lh-success-hover: #22c55e;
  --lh-success-bg: rgba(34, 197, 94, 0.16);
  --lh-success-border: rgba(34, 197, 94, 0.35);
  --lh-success-text: #000000;
  --lh-warning: #fbbf24;
  --lh-warning-hover: #f59e0b;
  --lh-warning-bg: rgba(245, 158, 11, 0.16);
  --lh-warning-border: rgba(245, 158, 11, 0.35);
  --lh-warning-text: #fef3c7;
}

html {
  scrollbar-gutter: auto;
  /* 触屏按住不出现浏览器默认高亮遮罩，交互反馈全部由组件自身提供 */
  -webkit-tap-highlight-color: transparent;
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
  min-height: 100dvh;
  transition: background-color 0.2s ease, color 0.2s ease;
}

/* 设置视图下全屏固定，避免双滚动条并保障侧边栏静止 */
.app-root.settings-view {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

@media (max-width: 680px) {
  .app-root.settings-view {
    height: auto;
    overflow: visible;
  }
}

/* 壁纸、暗化和设置页主题遮罩依次叠放，主页保留壁纸原貌不设额外遮罩。
   尺寸固定用 vw/vh，不用 100%/dvh：只要窗口尺寸没变，vw/vh 就恒定，
   不会因为拖动组件把页面撑高导致纵向滚动条出现（视口变窄），也不会因为移动端地址栏
   收放让 dvh 变化，从而避免 cover 背景被重新缩放——看起来就像"一拖动壁纸就被拉伸"。 */
.wallpaper-layer, .wallpaper-shade, .wallpaper-tint { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; }
.wallpaper-layer { z-index: -3; transform: translateZ(0); backface-visibility: hidden; }
.wallpaper-shade { z-index: -2; }
.wallpaper-tint { z-index: -1; background: var(--lh-bg); opacity: .96; }
.wallpaper-layer { filter: blur(var(--lh-wallpaper-blur, 0px)); }
.wallpaper-shade { background: black; opacity: var(--lh-wallpaper-dim, 0); }
.app-root { isolation: isolate; }
*, *::before, *::after { box-sizing: border-box; }
button, input, textarea, select { font: inherit; }
button { cursor: pointer; }
input:not(.search-input):not([type="checkbox"]):not([type="radio"]):not([type="range"]),
textarea:not(.note-editor),
select {
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-input-bg);
  color: var(--lh-text);
  padding: 8px 10px;
}
input[type="checkbox"], input[type="radio"] { accent-color: var(--lh-accent); cursor: pointer; width: 16px; height: 16px; padding: 0; }
input[type="range"] { accent-color: var(--lh-accent); cursor: pointer; padding: 0; }
button:disabled { cursor: default; opacity: .55; }
:focus-visible { outline: 2px solid var(--lh-accent); outline-offset: 2px; }

/* 现代主题全局表单输入控件毛玻璃特效与柔和阴影适配 */
[data-theme="modern"] input:not(.search-input),
[data-theme="modern"] textarea:not(.note-editor),
[data-theme="modern"] select {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}
[data-theme="modern"] input:not(.search-input):focus,
[data-theme="modern"] textarea:not(.note-editor):focus,
[data-theme="modern"] select:focus {
  border-color: var(--lh-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lh-accent) 18%, transparent);
}

@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; scroll-behavior: auto !important; } }
</style>
