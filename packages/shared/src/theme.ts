import { Value } from '@sinclair/typebox/value'
import { Type, type Static } from '@sinclair/typebox'

// 可编辑语义颜色名称。
export const COLOR_TOKENS = ['bg', 'surface', 'text', 'text-secondary', 'accent', 'accent-text', 'border'] as const
// 语义层颜色只接受十六进制。
const overridesSchema = Type.Object(Object.fromEntries(COLOR_TOKENS.map(key => [key, Type.Optional(Type.String({ pattern: '^#[0-9a-fA-F]{6}$' }))])), { additionalProperties: false })
// 主题参数在前后端使用相同边界。
export const themeConfigSchema = Type.Object({
  version: Type.Literal(1), seed: Type.String({ pattern: '^#[0-9a-fA-F]{6}$' }), customSeed: Type.Boolean(),
  opacity: Type.Number({ minimum: 50, maximum: 100 }), blur: Type.Number({ minimum: 0, maximum: 30 }),
  radius: Type.Number({ minimum: 0, maximum: 40 }), gap: Type.Number({ minimum: 4, maximum: 32 }),
  wallpaperDim: Type.Number({ minimum: 0, maximum: 80 }), wallpaperBlur: Type.Number({ minimum: 0, maximum: 24 }),
  light: overridesSchema, dark: overridesSchema,
}, { additionalProperties: false })
// 主题参数类型。
export type ThemeConfig = Static<typeof themeConfigSchema>
// 默认参数保持旧版主题可读。
export const DEFAULT_THEME: ThemeConfig = { version: 1, seed: '#2563eb', customSeed: false, opacity: 95, blur: 16, radius: 16, gap: 16, wallpaperDim: 0, wallpaperBlur: 0, light: {}, dark: {} }
// 计算线性 sRGB 相对亮度。
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}
// 计算颜色对比度。
export function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0]! + 0.05) / (values[1]! + 0.05)
}
// 混合生成双模背景。
function mix(a: string, b: string, amount: number): string {
  return '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - amount) + parseInt(b.slice(i, i + 2), 16) * amount).toString(16).padStart(2, '0')).join('')
}
// 按种子色生成双模变量并确保按钮文本符合 AA。
export function seedTokens(seed: string, dark: boolean): Record<string, string> {
  const accent = dark ? mix(seed, '#ffffff', 0.35) : seed
  return { '--lh-bg': mix(seed, dark ? '#101010' : '#ffffff', 0.96), '--lh-surface': dark ? '#202020' : '#ffffff',
    '--lh-text': dark ? '#f5f5f5' : '#171717', '--lh-text-secondary': dark ? '#bdbdbd' : '#525252',
    '--lh-text-muted': dark ? '#bdbdbd' : '#525252', '--lh-border': dark ? '#505050' : '#d4d4d4',
    '--lh-accent': accent, '--lh-accent-hover': accent,
    '--lh-accent-text': contrast(accent, '#ffffff') >= 4.5 ? '#ffffff' : '#000000' }
}
// CSS 只接受展示属性和简单选择器，拒绝外部资源、转义及嵌套规则。
export function scopedCss(css: string, scope: string): string {
  if (!css.trim()) return ''
  if (css.length > 32768 || /[@\\<>]|\/\*|url\s*\(|expression\s*\(/i.test(css)) throw new Error('CSS 含不支持的规则')
  let rest = css.trim()
  const output: string[] = []
  while (rest) {
    const match = /^([^{}]+)\{([^{}]*)\}/.exec(rest)
    if (!match) throw new Error('CSS 规则格式不正确')
    const selectors = match[1]!.split(',').map(selector => {
      const value = selector.trim()
      if (scope === '.app-root' && ['body', 'html', ':root'].includes(value)) return scope
      if (!/^(?:\.[a-zA-Z][\w-]*|[a-zA-Z][\w-]*|\*)(?:(?:\s+|\s*>\s*)(?:\.[a-zA-Z][\w-]*|[a-zA-Z][\w-]*|\*))*$/.test(value)) throw new Error('CSS 仅支持元素与类选择器')
      return scope + ' ' + value
    })
    const declarations = match[2]!.split(';').map(value => value.trim()).filter(Boolean)
    for (const declaration of declarations) {
      if (!/^(?:color|background-color|border-color|border-radius|border-width|border-style|padding|gap|font-size|font-weight|letter-spacing|line-height|text-align|opacity|box-shadow|--lh-[\w-]+)\s*:\s*[#\w\s.,()%+-]+$/.test(declaration)) throw new Error('CSS 含不支持的属性或值')
    }
    output.push(selectors.join(',') + ' { ' + declarations.join(';') + ' }')
    rest = rest.slice(match[0].length).trim()
  }
  return output.join('\n')
}

// 主题导入只接受完整的当前版本。
export function isThemeConfig(value: unknown): value is ThemeConfig { return Value.Check(themeConfigSchema, value) }
