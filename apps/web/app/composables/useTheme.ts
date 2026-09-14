import type { HomeSettings } from "@laull-home/shared"

// 预设主题配置结构，按明暗两套模式细化变量。
export interface ThemePreset {
  // 主题唯一标识。
  id: string
  // 主题展示名称。
  name: string
  // 浅色模式细粒度变量。
  light: Record<string, string>
  // 深色模式细粒度变量。
  dark: Record<string, string>
}

// 基础排版与几何尺寸变量。
const BASE_TOKENS = {
  "--lh-font-family": 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  "--lh-radius-sm": "6px",
  "--lh-radius-md": "10px",
  "--lh-radius-lg": "16px",
  "--lh-radius-full": "9999px",
  "--lh-blur": "16px",
}

// 内置预设主题列表，每个主题包含明暗双模精细色彩。
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "default",
    name: "精工现代",
    light: {
      ...BASE_TOKENS,
      "--lh-bg": "#f8fafc",
      "--lh-surface": "rgba(255, 255, 255, 0.9)",
      "--lh-surface-hover": "rgba(241, 245, 249, 0.95)",
      "--lh-surface-active": "rgba(226, 232, 240, 0.95)",
      "--lh-input-bg": "rgba(255, 255, 255, 0.85)",
      "--lh-input-border": "rgba(226, 232, 240, 0.9)",
      "--lh-text": "#0f172a",
      "--lh-text-secondary": "#64748b",
      "--lh-text-muted": "#94a3b8",
      "--lh-accent": "#2563eb",
      "--lh-accent-hover": "#1d4ed8",
      "--lh-accent-text": "#ffffff",
      "--lh-border": "#e2e8f0",
      "--lh-border-hover": "#cbd5e1",
      "--lh-shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.04)",
      "--lh-shadow-card": "0 4px 16px rgba(0, 0, 0, 0.05)",
      "--lh-shadow-dropdown": "0 12px 32px rgba(15, 23, 42, 0.1)",
    },
    dark: {
      ...BASE_TOKENS,
      "--lh-bg": "#0b0f19",
      "--lh-surface": "rgba(17, 24, 39, 0.82)",
      "--lh-surface-hover": "rgba(31, 41, 55, 0.9)",
      "--lh-surface-active": "rgba(55, 65, 81, 0.9)",
      "--lh-input-bg": "rgba(17, 24, 39, 0.75)",
      "--lh-input-border": "rgba(255, 255, 255, 0.12)",
      "--lh-text": "#f8fafc",
      "--lh-text-secondary": "#94a3b8",
      "--lh-text-muted": "#64748b",
      "--lh-accent": "#38bdf8",
      "--lh-accent-hover": "#0284c7",
      "--lh-accent-text": "#0f172a",
      "--lh-border": "rgba(255, 255, 255, 0.1)",
      "--lh-border-hover": "rgba(255, 255, 255, 0.2)",
      "--lh-shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.2)",
      "--lh-shadow-card": "0 4px 20px rgba(0, 0, 0, 0.35)",
      "--lh-shadow-dropdown": "0 12px 32px rgba(0, 0, 0, 0.5)",
    },
  },
  {
    id: "starry",
    name: "深邃星空",
    light: {
      ...BASE_TOKENS,
      "--lh-bg": "#f1f5f9",
      "--lh-surface": "rgba(255, 255, 255, 0.92)",
      "--lh-surface-hover": "rgba(238, 242, 255, 0.95)",
      "--lh-surface-active": "rgba(224, 231, 255, 0.95)",
      "--lh-input-bg": "rgba(255, 255, 255, 0.9)",
      "--lh-input-border": "#cbd5e1",
      "--lh-text": "#1e1b4b",
      "--lh-text-secondary": "#475569",
      "--lh-text-muted": "#94a3b8",
      "--lh-accent": "#4f46e5",
      "--lh-accent-hover": "#4338ca",
      "--lh-accent-text": "#ffffff",
      "--lh-border": "#e0e7ff",
      "--lh-border-hover": "#c7d2fe",
      "--lh-shadow-sm": "0 1px 2px rgba(79, 70, 229, 0.05)",
      "--lh-shadow-card": "0 4px 16px rgba(79, 70, 229, 0.08)",
      "--lh-shadow-dropdown": "0 12px 32px rgba(30, 27, 75, 0.12)",
    },
    dark: {
      ...BASE_TOKENS,
      "--lh-bg": "#050811",
      "--lh-surface": "rgba(15, 23, 42, 0.85)",
      "--lh-surface-hover": "rgba(30, 41, 59, 0.92)",
      "--lh-surface-active": "rgba(51, 65, 85, 0.92)",
      "--lh-input-bg": "rgba(15, 23, 42, 0.75)",
      "--lh-input-border": "rgba(129, 140, 248, 0.2)",
      "--lh-text": "#f8fafc",
      "--lh-text-secondary": "#94a3b8",
      "--lh-text-muted": "#64748b",
      "--lh-accent": "#818cf8",
      "--lh-accent-hover": "#6366f1",
      "--lh-accent-text": "#050811",
      "--lh-border": "rgba(129, 140, 248, 0.15)",
      "--lh-border-hover": "rgba(129, 140, 248, 0.3)",
      "--lh-shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.3)",
      "--lh-shadow-card": "0 8px 32px rgba(0, 0, 0, 0.45)",
      "--lh-shadow-dropdown": "0 16px 40px rgba(0, 0, 0, 0.6)",
    },
  },
  {
    id: "minimal",
    name: "素雅极简",
    light: {
      ...BASE_TOKENS,
      "--lh-bg": "#fcfbfa",
      "--lh-surface": "#ffffff",
      "--lh-surface-hover": "#f5f5f4",
      "--lh-surface-active": "#e7e5e4",
      "--lh-input-bg": "#ffffff",
      "--lh-input-border": "#e7e5e4",
      "--lh-text": "#1c1917",
      "--lh-text-secondary": "#78716c",
      "--lh-text-muted": "#a8a29e",
      "--lh-accent": "#292524",
      "--lh-accent-hover": "#1c1917",
      "--lh-accent-text": "#fafaf9",
      "--lh-border": "#e7e5e4",
      "--lh-border-hover": "#d6d3d1",
      "--lh-shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.03)",
      "--lh-shadow-card": "0 2px 8px rgba(0, 0, 0, 0.04)",
      "--lh-shadow-dropdown": "0 8px 24px rgba(0, 0, 0, 0.08)",
      "--lh-blur": "0px",
    },
    dark: {
      ...BASE_TOKENS,
      "--lh-bg": "#121212",
      "--lh-surface": "#1c1c1c",
      "--lh-surface-hover": "#262626",
      "--lh-surface-active": "#303030",
      "--lh-input-bg": "#181818",
      "--lh-input-border": "#333333",
      "--lh-text": "#f5f5f4",
      "--lh-text-secondary": "#a8a29e",
      "--lh-text-muted": "#78716c",
      "--lh-accent": "#e7e5e4",
      "--lh-accent-hover": "#f5f5f4",
      "--lh-accent-text": "#171717",
      "--lh-border": "#2e2e2e",
      "--lh-border-hover": "#404040",
      "--lh-shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.2)",
      "--lh-shadow-card": "0 2px 10px rgba(0, 0, 0, 0.3)",
      "--lh-shadow-dropdown": "0 8px 24px rgba(0, 0, 0, 0.4)",
      "--lh-blur": "0px",
    },
  },
  {
    id: "emerald",
    name: "青玉幽谷",
    light: {
      ...BASE_TOKENS,
      "--lh-bg": "#f4fbf7",
      "--lh-surface": "rgba(255, 255, 255, 0.92)",
      "--lh-surface-hover": "rgba(236, 253, 245, 0.95)",
      "--lh-surface-active": "rgba(209, 250, 229, 0.95)",
      "--lh-input-bg": "rgba(255, 255, 255, 0.9)",
      "--lh-input-border": "#a7f3d0",
      "--lh-text": "#064e3b",
      "--lh-text-secondary": "#047857",
      "--lh-text-muted": "#6ee7b7",
      "--lh-accent": "#059669",
      "--lh-accent-hover": "#047857",
      "--lh-accent-text": "#ffffff",
      "--lh-border": "#d1fae5",
      "--lh-border-hover": "#a7f3d0",
      "--lh-shadow-sm": "0 1px 2px rgba(5, 150, 105, 0.05)",
      "--lh-shadow-card": "0 4px 16px rgba(5, 150, 105, 0.08)",
      "--lh-shadow-dropdown": "0 12px 32px rgba(6, 78, 59, 0.12)",
    },
    dark: {
      ...BASE_TOKENS,
      "--lh-bg": "#041510",
      "--lh-surface": "rgba(6, 44, 33, 0.75)",
      "--lh-surface-hover": "rgba(6, 78, 59, 0.85)",
      "--lh-surface-active": "rgba(4, 120, 87, 0.85)",
      "--lh-input-bg": "rgba(6, 44, 33, 0.65)",
      "--lh-input-border": "rgba(52, 211, 153, 0.2)",
      "--lh-text": "#ecfdf5",
      "--lh-text-secondary": "#a7f3d0",
      "--lh-text-muted": "#6ee7b7",
      "--lh-accent": "#34d399",
      "--lh-accent-hover": "#10b981",
      "--lh-accent-text": "#041510",
      "--lh-border": "rgba(52, 211, 153, 0.15)",
      "--lh-border-hover": "rgba(52, 211, 153, 0.3)",
      "--lh-shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.25)",
      "--lh-shadow-card": "0 6px 24px rgba(0, 0, 0, 0.4)",
      "--lh-shadow-dropdown": "0 16px 36px rgba(0, 0, 0, 0.55)",
    },
  },
]

// 客户端主题、系统明暗偏好及自定义 CSS 覆盖管理。
export function useTheme() {
  const settings = useState<HomeSettings | null>("theme:settings", () => null)
  const isDark = useState<boolean>("theme:isDark", () => false)

  // 注入或更新用户自定义 CSS 样式标签。
  function applyCustomCss(cssText?: string) {
    if (import.meta.server) return
    let styleEl = document.getElementById("lh-custom-css")
    if (!styleEl) {
      styleEl = document.createElement("style")
      styleEl.id = "lh-custom-css"
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = cssText?.trim() || ""
  }

  // 计算当前应用的背景样式。
  const backgroundStyle = computed(() => {
    const s = settings.value
    if (!s) return {}
    if (s.wallpaperType === "color" && s.wallpaperValue) {
      return { backgroundColor: s.wallpaperValue }
    }
    if (s.wallpaperType === "gradient" && s.wallpaperValue) {
      return { backgroundImage: s.wallpaperValue }
    }
    if (s.wallpaperType === "url" && s.wallpaperValue) {
      return {
        backgroundImage: "url(" + s.wallpaperValue + ")",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }
    }
    return {}
  })

  // 解析并应用当前外观与预设变量到文档根节点。
  function applyTheme(s: HomeSettings) {
    settings.value = s
    if (import.meta.server) return

    const appearance = s.appearance ?? "system"
    let dark = false
    if (appearance === "dark") {
      dark = true
    } else if (appearance === "light") {
      dark = false
    } else {
      dark = window.matchMedia("(prefers-color-scheme: dark)").matches
    }
    isDark.value = dark

    const root = document.documentElement
    if (dark) {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }

    const preset = THEME_PRESETS.find(p => p.id === s.themeId) ?? THEME_PRESETS[0]!
    const activeTokens = dark ? preset.dark : preset.light
    for (const [key, val] of Object.entries(activeTokens)) {
      root.style.setProperty(key, val)
    }

    applyCustomCss(s.customCss)
  }

  // 监听操作系统明暗模式变化，在跟随系统模式下自动重新应用主题。
  function setupSystemThemeListener() {
    if (import.meta.server) return
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = (e: MediaQueryListEvent) => {
      if (settings.value && (!settings.value.appearance || settings.value.appearance === "system")) {
        isDark.value = e.matches
        applyTheme(settings.value)
      }
    }
    mediaQuery.removeEventListener("change", handler)
    mediaQuery.addEventListener("change", handler)
  }

  return {
    settings,
    isDark,
    backgroundStyle,
    applyTheme,
    setupSystemThemeListener,
    applyCustomCss,
    THEME_PRESETS,
  }
}
