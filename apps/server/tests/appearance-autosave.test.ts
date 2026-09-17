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

test('主题色彩与辅助色解耦：支持所有主题槽位自定义、无辅助色主题隐藏保护与对比度', () => {
  // 1. 验证二十套主题槽位数量不低于 2，且正确声明是否支持外部 UI 辅助色。
  const unsupportedAuxiliary = ['cyberpunk', 'matrix', 'brutalist', 'parchment', 'solarized']
  for (const preset of THEME_PRESETS) {
    expect(preset.colorSlots.length).toBeGreaterThanOrEqual(2)
    if (unsupportedAuxiliary.includes(preset.id)) {
      expect(preset.supportsAuxiliary).toBe(false)
    } else {
      expect(preset.supportsAuxiliary).toBe(true)
    }
  }

  // 2. 自定义主题色彩槽位生效：黑客帝国修改主题代码绿为琥珀金。
  const matrixCustom = resolveThemeTokens({
    title: '主页', revision: 0, appearance: 'system', themeId: 'matrix',
    themeConfig: {
      ...presetConfig('matrix'),
      themeColors: { color1: '#ffb000', color2: '#100c00' },
    },
  }, true)
  expect(matrixCustom['--lh-theme-color1']).toBe('#ffb000')
  expect(matrixCustom['--lh-theme-color2']).toBe('#100c00')
  expect(matrixCustom['--lh-accent']).toBe('#ffb000')
  expect(matrixCustom['--lh-bg']).toBe('#100c00')
  expect(contrast(matrixCustom['--lh-accent']!, matrixCustom['--lh-accent-text']!)).toBeGreaterThanOrEqual(4.5)

  // 3. 不支持辅助色的主题，传入种子色不会破坏原主题色彩体系。
  const matrixWithSeed = resolveThemeTokens({
    title: '主页', revision: 0, appearance: 'system', themeId: 'matrix',
    themeConfig: {
      ...presetConfig('matrix'),
      seed: '#ff0000', customSeed: true,
    },
  }, true)
  expect(matrixWithSeed['--lh-accent']).not.toBe('#ff0000')

  // 4. 支持辅助色的主题，辅助色生效并设置 --lh-auxiliary。
  const modernWithAux = resolveThemeTokens({
    title: '主页', revision: 0, appearance: 'system', themeId: 'modern',
    themeConfig: {
      ...presetConfig('modern'),
      seed: '#99497f', customSeed: true,
    },
  }, false)
  expect(modernWithAux['--lh-auxiliary']).toBe('#99497f')
  expect(modernWithAux['--lh-accent']).toBe('#99497f')
  expect(contrast(modernWithAux['--lh-auxiliary']!, modernWithAux['--lh-auxiliary-text']!)).toBeGreaterThanOrEqual(4.5)
})

test('主题色彩明暗自适应：过暗强调色在深色模式提亮、过亮强调色在浅色模式加深、底色调光防护与分模配置', () => {
  // 1. 深色模式下设置深蓝，自适应提亮保证 AA 对比度。
  const darkNavyTokens = resolveThemeTokens({
    title: '主页', revision: 0, appearance: 'dark', themeId: 'modern',
    themeConfig: {
      ...presetConfig('modern'),
      themeColors: { color1: '#1e3a8a' }, // 极深蓝
    },
  }, true)
  expect(contrast(darkNavyTokens['--lh-accent']!, '#111827')).toBeGreaterThanOrEqual(4.5)
  expect(contrast(darkNavyTokens['--lh-accent']!, darkNavyTokens['--lh-accent-text']!)).toBeGreaterThanOrEqual(4.5)

  // 2. 浅色模式下设置荧光磷绿，自适应压深保证 AA 对比度。
  const lightNeonTokens = resolveThemeTokens({
    title: '主页', revision: 0, appearance: 'light', themeId: 'modern',
    themeConfig: {
      ...presetConfig('modern'),
      themeColors: { color1: '#00ff66' }, // 荧光绿
    },
  }, false)
  expect(contrast(lightNeonTokens['--lh-accent']!, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  expect(contrast(lightNeonTokens['--lh-accent']!, lightNeonTokens['--lh-accent-text']!)).toBeGreaterThanOrEqual(4.5)

  // 3. 深色模式误配纯白背景自适应压暗，浅色模式误配纯黑背景自适应提亮，且正文均清晰可读。
  const darkInvertedTokens = resolveThemeTokens({
    title: '主页', revision: 0, appearance: 'dark', themeId: 'modern',
    themeConfig: {
      ...presetConfig('modern'),
      themeColors: { color2: '#ffffff' },
    },
  }, true)
  expect(contrast(darkInvertedTokens['--lh-text']!, darkInvertedTokens['--lh-bg']!)).toBeGreaterThanOrEqual(4.5)

  const lightInvertedTokens = resolveThemeTokens({
    title: '主页', revision: 0, appearance: 'light', themeId: 'modern',
    themeConfig: {
      ...presetConfig('modern'),
      themeColors: { color2: '#000000' },
    },
  }, false)
  expect(contrast(lightInvertedTokens['--lh-text']!, lightInvertedTokens['--lh-bg']!)).toBeGreaterThanOrEqual(4.5)

  // 4. 支持分模独立色彩槽位设置：color1_light 与 color1_dark。
  const splitModeTokensLight = resolveThemeTokens({
    title: '主页', revision: 0, appearance: 'light', themeId: 'dracula',
    themeConfig: {
      ...presetConfig('dracula'),
      themeColors: { color1_light: '#6d28d9', color1_dark: '#c084fc' },
    },
  }, false)
  expect(splitModeTokensLight['--lh-accent']).toBe('#6d28d9')

  const splitModeTokensDark = resolveThemeTokens({
    title: '主页', revision: 0, appearance: 'dark', themeId: 'dracula',
    themeConfig: {
      ...presetConfig('dracula'),
      themeColors: { color1_light: '#6d28d9', color1_dark: '#c084fc' },
    },
  }, true)
  expect(splitModeTokensDark['--lh-accent']).toBe('#c084fc')
})

test('语义状态色彩：所有二十套预设双模均包含完整危险/成功/警告 Token，且文字与对应状态实体背景符合对比度规范', () => {
  for (const preset of THEME_PRESETS) {
    for (const dark of [false, true]) {
      const tokens = resolveThemeTokens({
        title: '主页', revision: 0, appearance: 'system', themeId: preset.id,
        themeConfig: presetConfig(preset.id),
      }, dark)

      // 验证核心状态色定义完备性。
      expect(tokens['--lh-danger']).toBeDefined()
      expect(tokens['--lh-danger-hover']).toBeDefined()
      expect(tokens['--lh-danger-bg']).toBeDefined()
      expect(tokens['--lh-danger-border']).toBeDefined()
      expect(tokens['--lh-danger-text']).toBeDefined()

      expect(tokens['--lh-success']).toBeDefined()
      expect(tokens['--lh-success-hover']).toBeDefined()
      expect(tokens['--lh-success-bg']).toBeDefined()
      expect(tokens['--lh-success-border']).toBeDefined()
      expect(tokens['--lh-success-text']).toBeDefined()

      expect(tokens['--lh-warning']).toBeDefined()
      expect(tokens['--lh-warning-hover']).toBeDefined()
      expect(tokens['--lh-warning-bg']).toBeDefined()
      expect(tokens['--lh-warning-border']).toBeDefined()
      expect(tokens['--lh-warning-text']).toBeDefined()

      // 验证各状态实体背景上的文字对比度达到 AA 级标准。
      expect(contrast(tokens['--lh-danger-text']!, tokens['--lh-danger']!)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens['--lh-success-text']!, tokens['--lh-success']!)).toBeGreaterThanOrEqual(4.5)
      // 警告提示文本在对应提示卡片底色上达到 AA 级标准。
      if (dark) {
        expect(contrast(tokens['--lh-warning-text']!, tokens['--lh-bg']!)).toBeGreaterThanOrEqual(4.5)
      } else {
        expect(contrast(tokens['--lh-warning-text']!, '#fef3c7')).toBeGreaterThanOrEqual(4.5)
      }
    }
  }

  // 验证终端与新丑主题的专用状态色配置。
  const brutalistTokens = resolveThemeTokens({
    title: '主页', revision: 0, appearance: 'system', themeId: 'brutalist',
    themeConfig: presetConfig('brutalist'),
  }, false)
  expect(brutalistTokens['--lh-danger']).toBe('#ff1744')
  expect(brutalistTokens['--lh-danger-border']).toBe('#000000')

  const matrixTokens = resolveThemeTokens({
    title: '主页', revision: 0, appearance: 'system', themeId: 'matrix',
    themeConfig: presetConfig('matrix'),
  }, true)
  expect(matrixTokens['--lh-success']).toBe('#00ff66')
})

