import { adaptColorForMode, contrast, DEFAULT_THEME, type HomeSettings, type ThemeConfig } from '@laull-home/shared'
import {
  buildTokensFromDefinition,
  THEME_DEFINITIONS,
  type ThemeCategory,
  type ThemeColorSlot,
} from './themeCatalog'

// 预设主题色结构。
export interface ColorPreset {
  id: string
  name: string
  seed: string
}

// 预设风格结构，定义几何与排版。
export interface ThemePreset {
  id: string
  name: string
  category: ThemeCategory
  description: string
  seed: string
  radius: number
  gap: number
  blur: number
  opacity?: number
  fontFamily?: string
  supportsAuxiliary: boolean
  colorSlots: ThemeColorSlot[]
  light: Record<string, string>
  dark: Record<string, string>
}

// 八套独立主题色预设，覆盖主流视觉冷暖调。
export const COLOR_PRESETS: ColorPreset[] = [
  { id: 'ocean', name: '经典蓝', seed: '#2563eb' },
  { id: 'sea-salt', name: '海盐', seed: '#216987' },
  { id: 'graphite', name: '石墨', seed: '#47475c' },
  { id: 'pine', name: '松林', seed: '#356342' },
  { id: 'berry', name: '莓果', seed: '#99497f' },
  { id: 'indigo', name: '靛夜', seed: '#465cb0' },
  { id: 'brass', name: '黄铜', seed: '#826521' },
  { id: 'sakura', name: '樱粉', seed: '#ac4e6b' },
]

// 历史预设到种子色的映射表，用于老版本平滑过渡。
const LEGACY_COLOR_MAP: Record<string, string> = {
  'sea-salt': '#216987',
  graphite: '#47475c',
  pine: '#356342',
  berry: '#99497f',
  indigo: '#465cb0',
  brass: '#826521',
  sakura: '#ac4e6b',
}

// 全部有效主题标识列表。
export const VALID_THEME_IDS = THEME_DEFINITIONS.map(d => d.id) as readonly string[]

// 二十套官方预设主题配置集合。
export const THEME_PRESETS: ThemePreset[] = THEME_DEFINITIONS.map(def => ({
  id: def.id,
  name: def.name,
  category: def.category,
  description: def.description,
  seed: def.seed,
  radius: def.radius,
  gap: def.gap,
  blur: def.blur,
  opacity: def.opacity,
  fontFamily: def.fontFamily,
  supportsAuxiliary: def.supportsAuxiliary ?? true,
  colorSlots: def.colorSlots,
  light: buildTokensFromDefinition(def, false),
  dark: buildTokensFromDefinition(def, true),
}))

// 获取历史主题 ID 对应的旧配色种子。
export function getLegacyColorSeed(id?: string): string | undefined {
  return id ? LEGACY_COLOR_MAP[id] : undefined
}

// 规范化主题 ID，无效或历史颜色 ID 安全归入现代主题。
export function normalizeThemeId(id?: string): string {
  if (id && VALID_THEME_IDS.includes(id)) {
    return id
  }
  return 'modern'
}

// 应用风格预设并清除颜色覆盖，保留壁纸处理与用户自选主题色。
export function presetConfig(id?: string, current: ThemeConfig = DEFAULT_THEME): ThemeConfig {
  const normalized = normalizeThemeId(id)
  const item = THEME_PRESETS.find(p => p.id === normalized) ?? THEME_PRESETS[0]!
  const legacySeed = getLegacyColorSeed(id)
  const seed = legacySeed ?? (current.seed && current.customSeed ? current.seed : item.seed)
  return {
    ...current,
    seed,
    customSeed: Boolean(current.seed && current.customSeed && !legacySeed),
    light: {},
    dark: {},
    themeColors: {},
    radius: item.radius,
    gap: item.gap,
    blur: item.blur,
    opacity: item.opacity ?? 92,
  }
}

// 计算完整主题变量并处理毛玻璃与阴影。
export function resolveThemeTokens(settings: HomeSettings, dark: boolean): Record<string, string> {
  const styleId = normalizeThemeId(settings.themeId)
  const item = THEME_PRESETS.find(p => p.id === styleId) ?? THEME_PRESETS[0]!
  const config = settings.themeConfig ?? presetConfig(item.id)
  const isPixel = styleId === 'pixel'
  const isBrutalist = styleId === 'brutalist'

  const baseTokens = dark ? item.dark : item.light
  const tokens = { ...baseTokens }

  // 应用用户自定义主题特征色彩槽位并按明暗自适应调整。
  if (config.themeColors) {
    const modeKey = dark ? 'dark' : 'light'
    for (const slot of item.colorSlots) {
      const rawUserColor = config.themeColors[`${slot.id}_${modeKey}`] ?? config.themeColors[slot.id]
      if (rawUserColor && /^#[0-9a-fA-F]{6}$/.test(rawUserColor)) {
        const userColor = adaptColorForMode(rawUserColor, slot.role, dark)
        tokens[`--lh-theme-${slot.id}`] = userColor
        if (slot.role === 'accent') {
          tokens['--lh-accent'] = userColor
          tokens['--lh-accent-hover'] = userColor
          tokens['--lh-accent-text'] = contrast(userColor, '#ffffff') >= 4.5 ? '#ffffff' : '#000000'
        } else if (slot.role === 'secondary') {
          tokens['--lh-theme-secondary'] = userColor
          tokens['--lh-border-hover'] = userColor
          if (styleId === 'cyberpunk') {
            tokens['--lh-accent'] = userColor
            tokens['--lh-accent-hover'] = userColor
            tokens['--lh-accent-text'] = contrast(userColor, '#ffffff') >= 4.5 ? '#ffffff' : '#000000'
          }
        } else if (slot.role === 'bg') {
          tokens['--lh-bg'] = userColor
        } else if (slot.role === 'surface') {
          tokens['--lh-surface'] = userColor
          tokens['--lh-input-bg'] = userColor
        } else if (slot.role === 'border') {
          tokens['--lh-border'] = userColor
          tokens['--lh-input-border'] = userColor
        }
      }
    }
  }

  // 若主题支持额外 UI 辅助色且用户指定了辅助色，计算并自适应覆盖 UI 辅助色变量。
  if (item.supportsAuxiliary && config.customSeed && config.seed) {
    const seed = config.seed
    const accent = adaptColorForMode(seed, 'accent', dark)
    tokens['--lh-auxiliary'] = accent
    tokens['--lh-auxiliary-hover'] = accent
    tokens['--lh-auxiliary-text'] = contrast(accent, '#ffffff') >= 4.5 ? '#ffffff' : '#000000'
    tokens['--lh-accent'] = accent
    tokens['--lh-accent-hover'] = accent
    tokens['--lh-accent-text'] = contrast(accent, '#ffffff') >= 4.5 ? '#ffffff' : '#000000'
  }

  // 确保当底色或卡片表面被自定义修改时，正文与次要说明文字维持足够对比度。
  if (contrast(tokens['--lh-text']!, tokens['--lh-bg']!) < 4.5 || contrast(tokens['--lh-text']!, tokens['--lh-surface']!) < 4.5) {
    tokens['--lh-text'] = dark ? '#f8fafc' : '#0f172a'
  }
  if (contrast(tokens['--lh-text-secondary']!, tokens['--lh-surface']!) < 4.5) {
    tokens['--lh-text-secondary'] = dark ? '#cbd5e1' : '#475569'
  }

  // 允许逐项细化覆盖。
  const overrides = dark ? config.dark : config.light
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value) tokens['--lh-' + key] = value
    }
  }

  const radius = config.radius ?? item.radius
  const blur = (isPixel || isBrutalist) ? 0 : (config.blur ?? item.blur)

  return {
    ...tokens,
    '--lh-input-bg': tokens['--lh-surface']!,
    '--lh-input-border': tokens['--lh-border']!,
    '--lh-text-muted': tokens['--lh-text-secondary']!,
    '--lh-surface-hover': tokens['--lh-bg']!,
    '--lh-blur': blur + 'px',
    '--lh-radius-lg': radius + 'px',
    '--lh-radius-md': (isPixel ? 2 : isBrutalist ? 0 : Math.round(radius * 0.65)) + 'px',
    '--lh-radius-sm': (isPixel ? 0 : isBrutalist ? 0 : Math.round(radius * 0.4)) + 'px',
  }
}
