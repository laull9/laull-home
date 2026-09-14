<script setup lang="ts">
// 顶层挂载页面并恢复会话与主题状态。
const { refresh } = useAuth()
const { $api } = useNuxtApp()
const { applyTheme, backgroundStyle, setupSystemThemeListener } = useTheme()

onMounted(async () => {
  setupSystemThemeListener()
  try {
    await refresh()
  } catch {
    // 允许访客状态访问。
  }
  try {
    const res = await $api.settings.get()
    if (res.data) applyTheme(res.data)
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
  <div class="app-root" :style="backgroundStyle">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<style>
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
</style>
