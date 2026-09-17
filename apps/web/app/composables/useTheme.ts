import { DEFAULT_THEME, scopedCss, type HomeSettings, type WallpaperItem } from '@laull-home/shared'
import { COLOR_PRESETS, normalizeThemeId, resolveThemeTokens, THEME_PRESETS } from '../utils/themePresets'

// 根据填充模式解析对应的 CSS 背景图样式对象。
function resolveFitModeStyles(mode?: string | null) {
  switch (mode) {
    case 'contain':
      return {
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }
    case 'fill':
      return {
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }
    case 'center':
      return {
        backgroundSize: 'auto',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }
    case 'tile':
      return {
        backgroundSize: 'auto',
        backgroundPosition: 'top left',
        backgroundRepeat: 'repeat',
        backgroundAttachment: 'fixed',
      }
    case 'cover':
    default:
      return {
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }
  }
}

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
    try { styleEl.textContent = scopedCss(cssText ?? '', '.app-root') }
    catch { styleEl.textContent = '' }
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
    if ((s.wallpaperType === "url" || s.wallpaperType === "pool") && s.wallpaperValue) {
      const cachedWallpapers = useState<WallpaperItem[]>('wallpapers:list').value
      const matched = cachedWallpapers?.find(w => w.url === s.wallpaperValue)
      const effectiveMode = matched?.fitMode || s.wallpaperFitMode || 'cover'
      return {
        backgroundImage: "url(" + s.wallpaperValue + ")",
        ...resolveFitModeStyles(effectiveMode),
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

    const styleId = normalizeThemeId(s.themeId)
    root.dataset.theme = styleId

    const config = s.themeConfig ?? DEFAULT_THEME
    const activeTokens = resolveThemeTokens(s, dark)
    root.style.colorScheme = dark ? 'dark' : 'light'
    root.style.setProperty('--lh-seed', config.seed)
    root.style.setProperty('--lh-surface-solid', activeTokens['--lh-surface']!)
    root.style.setProperty('--lh-surface-opacity', config.opacity + '%')
    root.style.setProperty('--lh-grid-gap', config.gap + 'px')
    root.style.setProperty('--lh-wallpaper-dim', String(config.wallpaperDim / 100))
    root.style.setProperty('--lh-wallpaper-blur', config.wallpaperBlur + 'px')
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
    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }

  return {
    settings,
    isDark,
    backgroundStyle,
    applyTheme,
    setupSystemThemeListener,
    applyCustomCss,
    THEME_PRESETS,
    COLOR_PRESETS,
    normalizeThemeId,
  }
}
