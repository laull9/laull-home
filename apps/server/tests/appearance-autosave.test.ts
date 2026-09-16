import { expect, test } from 'bun:test'
import { contrast, DEFAULT_THEME } from '@laull-home/shared'
import { COLOR_PRESETS, getLegacyColorSeed, normalizeThemeId, THEME_PRESETS, presetConfig, resolveThemeTokens } from '../../web/app/utils/themePresets'
import { createAutoSave } from '../../web/app/utils/autoSave'

test('预设主题系统：包含二十套双模主题、八套独立主题色、历史 ID 兼容与 AA 对比度', () => {
  expect(THEME_PRESETS).toHaveLength(20)
  expect(COLOR_PRESETS).toHaveLength(8)

  // 验证二十套主题 ID 与分类命名完整性。
  const ids = THEME_PRESETS.map(p => p.id)
  expect(new Set(ids).size).toBe(20)
  expect(ids).toContain('dracula')
  expect(ids).toContain('nord')
  expect(ids).toContain('gruvbox')
  expect(ids).toContain('catppuccin')
  expect(ids).toContain('tokyo-night')
  expect(ids).toContain('brutalist')
  expect(ids).toContain('cyberpunk')
  expect(ids).toContain('glass')
  expect(ids).toContain('matrix')
  expect(ids).toContain('parchment')

  // 历史主题 ID 除像素及有效主题外全部归拢到现代主题，并映射对应颜色种子。
  expect(normalizeThemeId('pixel')).toBe('pixel')
  expect(normalizeThemeId('dracula')).toBe('dracula')
  expect(normalizeThemeId('nord')).toBe('nord')
  expect(normalizeThemeId('sea-salt')).toBe('modern')
  expect(normalizeThemeId('pine')).toBe('modern')
  expect(normalizeThemeId('default')).toBe('modern')
  expect(normalizeThemeId(undefined)).toBe('modern')
  expect(getLegacyColorSeed('pine')).toBe('#356342')
  expect(getLegacyColorSeed('sea-salt')).toBe('#216987')

  // 风格切换清除旧覆盖并保留壁纸设置与当前色调种子。
  for (const preset of THEME_PRESETS) {
    const config = presetConfig(preset.id, { ...DEFAULT_THEME, seed: '#10b981', customSeed: true, light: { bg: '#ff0000' }, wallpaperDim: 30 })
    expect(config.seed).toBe('#10b981')
    expect(config.light).toEqual({})
    expect(config.wallpaperDim).toBe(30)
    expect(config.radius).toBe(preset.radius)
    expect(config.blur).toBe(preset.blur)
  }

  // 验证现代主题的柔和阴影与毛玻璃变量、像素与新丑主题的硬投影与无模糊、通透玻璃的高模糊。
  const modernTokens = resolveThemeTokens({ title: '主页', revision: 0, appearance: 'system', themeId: 'modern', themeConfig: presetConfig('modern') }, false)
  expect(modernTokens['--lh-shadow-card']).toContain('rgba(')
  expect(modernTokens['--lh-blur']).toBe('16px')

  const pixelTokens = resolveThemeTokens({ title: '主页', revision: 0, appearance: 'system', themeId: 'pixel', themeConfig: presetConfig('pixel') }, false)
  expect(pixelTokens['--lh-shadow-card']).toContain('3px 3px 0')
  expect(pixelTokens['--lh-blur']).toBe('0px')

  const brutalistTokens = resolveThemeTokens({ title: '主页', revision: 0, appearance: 'system', themeId: 'brutalist', themeConfig: presetConfig('brutalist') }, false)
  expect(brutalistTokens['--lh-shadow-card']).toContain('3px 3px 0')
  expect(brutalistTokens['--lh-blur']).toBe('0px')

  const glassTokens = resolveThemeTokens({ title: '主页', revision: 0, appearance: 'system', themeId: 'glass', themeConfig: presetConfig('glass') }, false)
  expect(glassTokens['--lh-blur']).toBe('24px')

  // 验证所有二十套预设主题在浅色和深色模式下的 AA 对比度。
  for (const preset of THEME_PRESETS) {
    for (const dark of [false, true]) {
      const tokens = resolveThemeTokens({ title: '主页', revision: 0, appearance: 'system', themeId: preset.id, themeConfig: presetConfig(preset.id) }, dark)
      expect(contrast(tokens['--lh-text']!, tokens['--lh-bg']!)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens['--lh-text-secondary']!, tokens['--lh-surface']!)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens['--lh-accent']!, tokens['--lh-accent-text']!)).toBeGreaterThanOrEqual(4.5)
    }
  }

  // 验证当用户覆盖自选种子色时，在预设主题与双模下的强调色 AA 对比度。
  for (const colorItem of COLOR_PRESETS) {
    for (const preset of [THEME_PRESETS[0]!, THEME_PRESETS[1]!, THEME_PRESETS[2]!]) {
      const config = { ...presetConfig(preset.id), seed: colorItem.seed, customSeed: true }
      for (const dark of [false, true]) {
        const tokens = resolveThemeTokens({ title: '主页', revision: 0, appearance: 'system', themeId: preset.id, themeConfig: config }, dark)
        expect(contrast(tokens['--lh-accent']!, tokens['--lh-accent-text']!)).toBeGreaterThanOrEqual(4.5)
      }
    }
  }
})

test('自动保存串行提交，正在保存时的新输入不会丢失', async () => {
  let value = '甲'
  let finish!: () => void
  const calls: string[] = []
  const queue = createAutoSave(() => value, async snapshot => {
    calls.push(snapshot)
    if (calls.length === 1) await new Promise<void>(resolve => { finish = resolve })
  }, () => {}, 10000)
  queue.schedule()
  const first = queue.flush()
  value = '乙'
  queue.schedule()
  value = '丙'
  queue.schedule()
  expect(queue.flush()).toBe(first)
  expect(calls).toEqual(['甲'])
  finish()
  expect(await first).toBe(true)
  expect(calls).toEqual(['甲', '丙'])
  queue.dispose()
})

test('保存失败保留待提交内容，重试成功后重读可清空队列', async () => {
  let fails = true
  let calls = 0
  const states: string[] = []
  const queue = createAutoSave(() => '草稿', async () => { calls++; if (fails) throw new Error('版本冲突') }, state => states.push(state), 10000)
  queue.schedule()
  expect(await queue.flush()).toBe(false)
  expect(states.at(-1)).toBe('error')
  fails = false
  expect(await queue.flush()).toBe(true)
  expect(calls).toBe(2)
  queue.schedule()
  queue.reset()
  await queue.flush()
  expect(calls).toBe(2)
  queue.dispose()
})

test('主题样式规范：大边框主题必须严格排除无底座组件与搜索组件，杜绝样式穿透', async () => {
  const css = await Bun.file(new URL('../../web/app/assets/themes.css', import.meta.url).pathname).text()

  // 1. 包含全局强力重置规则。
  expect(css).toContain('.widget.frameless-widget')
  expect(css).toContain('.widget.search-widget')
  expect(css).toContain('border: 0 !important')
  expect(css).toContain('box-shadow: none !important')

  // 2. 所有对 .widget 的定制选择器必须同时排除 frameless-widget 和 search-widget。
  const widgetSelectorRegex = /:root\[data-theme=[^\]]+\][^{]*\.widget[^{]*\{/g
  const matches = css.match(widgetSelectorRegex) ?? []
  expect(matches.length).toBeGreaterThan(5)
  for (const sel of matches) {
    expect(sel).toContain(':not(.frameless-widget)')
    expect(sel).toContain(':not(.search-widget)')
  }
})

