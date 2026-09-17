<script setup lang="ts">
import { ref, computed } from 'vue'
import type { HomeSettings } from '@laull-home/shared'
import { THEME_CATEGORIES } from '../utils/themeCatalog'
import { COLOR_PRESETS, THEME_PRESETS } from '../utils/themePresets'
import WallpaperPoolManager from './wallpaper/WallpaperPoolManager.vue'

// 外观与壁纸共用自动保存草稿。
const model = defineModel<HomeSettings>({ required: true })
// 页面只挂载当前分区。
defineProps<{ page: string }>()
// 独立发出主题风格切换与主题色切换事件。
const emit = defineEmits<{
  theme: [id: string]
  color: [seed: string]
}>()
const { isDark } = useTheme()

// 当前选中的主题分类筛选。
const selectedCategory = ref<string>('all')

// 按分类过滤后的主题清单。
const filteredThemes = computed(() => {
  if (selectedCategory.value === 'all') return THEME_PRESETS
  return THEME_PRESETS.filter(p => p.category === selectedCategory.value)
})

// 当前选中的主题预设对象。
const currentPreset = computed(() => {
  const themeId = model.value.themeId ?? 'modern'
  return THEME_PRESETS.find(p => p.id === themeId) ?? THEME_PRESETS[0]!
})

// 当前正在编辑的色彩明暗模式，初始跟随当前显示。
const colorMode = ref<'light' | 'dark'>(isDark.value ? 'dark' : 'light')
watch(isDark, val => { colorMode.value = val ? 'dark' : 'light' })

// 获取指定槽位在当前编辑明暗模式下生效的色值。
function getSlotColor(slotId: string, lightDefault: string, darkDefault: string): string {
  const modeKey = colorMode.value
  return model.value.themeConfig?.themeColors?.[`${slotId}_${modeKey}`]
    ?? model.value.themeConfig?.themeColors?.[slotId]
    ?? (modeKey === 'dark' ? darkDefault : lightDefault)
}

// 用户手动调整主题特征色彩槽位。
function onSlotColorInput(slotId: string, value: string) {
  if (!model.value.themeConfig) return
  if (!model.value.themeConfig.themeColors) {
    model.value.themeConfig.themeColors = {}
  }
  const modeKey = colorMode.value
  model.value.themeConfig.themeColors[`${slotId}_${modeKey}`] = value
  model.value.themeConfig.themeColors[slotId] = value
}

// 恢复当前主题的所有特征色为默认值。
function resetThemeColors() {
  if (!model.value.themeConfig?.themeColors) return
  const modeKey = colorMode.value
  for (const slot of currentPreset.value.colorSlots) {
    delete model.value.themeConfig.themeColors[`${slot.id}_${modeKey}`]
    delete model.value.themeConfig.themeColors[slot.id]
  }
}

// 判断当前预设主题色是否与当前配置种子色匹配。
function isCurrentColor(seed: string): boolean {
  return (model.value.themeConfig?.seed?.toLowerCase() ?? '#2563eb') === seed.toLowerCase()
}

// 用户手动输入或拾取自定义主题色。
function onCustomColor(e: globalThis.Event) {
  const target = e.target as HTMLInputElement | null
  if (target?.value) emit('color', target.value)
}
</script>

<template>
  <div class="appearance-fields">
    <template v-if="page === 'appearance'">
      <label class="field">主页标题<input v-model="model.title" maxlength="80" required></label>
      <fieldset class="mode">
        <legend>明暗模式</legend>
        <label v-for="item in [{ id: 'system', name: '跟随系统' }, { id: 'light', name: '浅色' }, { id: 'dark', name: '深色' }]" :key="item.id">
          <input v-model="model.appearance" type="radio" :value="item.id">{{ item.name }}
        </label>
      </fieldset>

      <section class="section-group">
        <h3 class="section-title">主题风格</h3>
        <div class="category-tabs" role="tablist" aria-label="主题分类筛选">
          <button
            type="button"
            class="category-tab"
            :class="{ active: selectedCategory === 'all' }"
            @click="selectedCategory = 'all'"
          >
            全部 ({{ THEME_PRESETS.length }})
          </button>
          <button
            v-for="cat in THEME_CATEGORIES"
            :key="cat"
            type="button"
            class="category-tab"
            :class="{ active: selectedCategory === cat }"
            @click="selectedCategory = cat"
          >
            {{ cat }}
          </button>
        </div>

        <div class="themes" aria-label="主题风格选择">
          <button
            v-for="preset in filteredThemes"
            :key="preset.id"
            type="button"
            class="theme-choice"
            :class="{ 'is-selected': model.themeId === preset.id }"
            :aria-pressed="model.themeId === preset.id"
            :title="preset.description"
            @click="emit('theme', preset.id)"
          >
            <span
              class="preview"
              :style="{ ...(isDark ? preset.dark : preset.light), '--preview-radius': Math.min(preset.radius / 2, 8) + 'px' }"
              aria-hidden="true"
            >
              <span class="preview-search" />
              <span class="preview-grid"><i /><i /><i /><i /></span>
            </span>
            <span class="theme-caption">
              <span class="preset-name">{{ preset.name }}</span>
              <span v-if="model.themeId === preset.id" class="badge-selected">已选</span>
            </span>
          </button>
        </div>
      </section>

      <section class="section-group">
        <div class="section-title-row">
          <div class="title-with-mode">
            <h3 class="section-title">主题色彩</h3>
            <div class="color-mode-tabs" role="tablist" aria-label="主题色彩明暗模式切换">
              <button
                type="button"
                class="mode-pill"
                :class="{ active: colorMode === 'light' }"
                @click="colorMode = 'light'"
              >
                浅色
              </button>
              <button
                type="button"
                class="mode-pill"
                :class="{ active: colorMode === 'dark' }"
                @click="colorMode = 'dark'"
              >
                深色
              </button>
            </div>
          </div>
          <button
            type="button"
            class="btn-reset-colors"
            @click="resetThemeColors"
          >
            重置默认色
          </button>
        </div>
        <div class="theme-slots-grid" aria-label="主题色彩自定义">
          <div
            v-for="slot in currentPreset.colorSlots"
            :key="slot.id"
            class="slot-card"
          >
            <label class="slot-swatch" :title="slot.name">
              <input
                type="color"
                :value="getSlotColor(slot.id, slot.defaultLight, slot.defaultDark)"
                :aria-label="slot.name"
                @input="onSlotColorInput(slot.id, ($event.target as HTMLInputElement).value)"
              >
              <span
                class="slot-color-preview"
                :style="{ backgroundColor: getSlotColor(slot.id, slot.defaultLight, slot.defaultDark) }"
              />
            </label>
            <div class="slot-info">
              <span class="slot-name">{{ slot.name }}</span>
              <span class="slot-hex">{{ getSlotColor(slot.id, slot.defaultLight, slot.defaultDark) }}</span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="currentPreset.supportsAuxiliary" class="section-group">
        <h3 class="section-title">UI 辅助色</h3>
        <div class="colors-palette" aria-label="UI辅助色选择">
          <button
            v-for="colorItem in COLOR_PRESETS"
            :key="colorItem.id"
            type="button"
            class="color-btn"
            :aria-pressed="isCurrentColor(colorItem.seed)"
            :title="colorItem.name"
            @click="emit('color', colorItem.seed)"
          >
            <span class="color-dot" :style="{ backgroundColor: colorItem.seed }">
              <span v-if="isCurrentColor(colorItem.seed)" class="check-icon">✓</span>
            </span>
            <span class="color-label">{{ colorItem.name }}</span>
          </button>
          <label class="color-custom" title="自定义UI辅助色">
            <input
              type="color"
              :value="model.themeConfig?.seed ?? '#2563eb'"
              aria-label="自定义UI辅助色拾色器"
              @input="onCustomColor"
            >
            <span class="color-label">自定义</span>
          </label>
        </div>
      </section>

      <details class="customize">
        <summary>细节调整</summary>
        <ThemeDesigner v-if="model.themeConfig" v-model="model.themeConfig" />
        <label class="field">自定义 CSS<textarea v-model="model.customCss" rows="5" maxlength="32768" spellcheck="false" /></label>
      </details>
    </template>

    <template v-else>
      <label class="field">
        壁纸类型
        <select v-model="model.wallpaperType">
          <option value="none">使用主题背景</option>
          <option value="color">纯色</option>
          <option value="gradient">渐变</option>
          <option value="url">单张图片</option>
          <option value="pool">图片池</option>
        </select>
      </label>

      <WallpaperPoolManager v-if="model.wallpaperType === 'pool'" v-model="model" />

      <label v-else-if="model.wallpaperType !== 'none'" class="field">
        {{ model.wallpaperType === 'color' ? '背景颜色' : model.wallpaperType === 'gradient' ? '渐变表达式' : '图片地址' }}
        <input v-model="model.wallpaperValue" :type="model.wallpaperType === 'color' ? 'color' : 'text'">
      </label>

      <template v-if="model.themeConfig">
        <label class="field">暗化 {{ model.themeConfig.wallpaperDim }}%<input v-model.number="model.themeConfig.wallpaperDim" type="range" min="0" max="80"></label>
        <label class="field">模糊 {{ model.themeConfig.wallpaperBlur }}px<input v-model.number="model.themeConfig.wallpaperBlur" type="range" min="0" max="24"></label>
      </template>
    </template>
  </div>
</template>

<style scoped>
.appearance-fields { display: grid; gap: 24px; }
.field { display: flex; flex-direction: column; gap: 10px; font-size: 14px; }
.field input, textarea { width: 100%; min-width: 0; }
.field input[type=color] { height: 48px; }
.mode { display: flex; flex-wrap: wrap; gap: 20px; border: 0; padding: 0; margin: 0; }
.mode legend { margin-bottom: 12px; font-size: 14px; font-weight: 500; }
.mode label { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.mode input { accent-color: var(--lh-accent); }

.section-group { display: flex; flex-direction: column; gap: 12px; }
.section-title { font-size: 14px; font-weight: 600; margin: 0; color: var(--lh-text); }

.category-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 2px; }
.category-tab { padding: 5px 12px; border-radius: 9999px; border: 1px solid var(--lh-border); background: var(--lh-surface); color: var(--lh-text-secondary); font-size: 12px; cursor: pointer; transition: all .15s ease; }
.category-tab:hover { border-color: var(--lh-border-hover); color: var(--lh-text); }
.category-tab.active { background: var(--lh-accent); border-color: var(--lh-accent); color: var(--lh-accent-text); font-weight: 500; }

.themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(136px, 1fr)); gap: 12px; }
.theme-choice { padding: 6px; background: transparent; border: 2px solid transparent; border-radius: 14px; text-align: left; min-width: 0; cursor: pointer; transition: border-color .15s ease, transform .15s ease; }
.theme-choice:hover { transform: translateY(-1px); }
.theme-choice.is-selected { border-color: var(--lh-accent); }

.preview { display: flex; flex-direction: column; justify-content: center; gap: 10px; height: 96px; padding: 12px; background: var(--lh-bg); border: 1px solid var(--lh-border); border-radius: 10px; box-shadow: var(--lh-shadow-card); }
.preview-search { height: 12px; width: 100%; background: var(--lh-surface); border: 1px solid var(--lh-border); border-radius: var(--preview-radius); }
.preview-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.preview-grid i { aspect-ratio: 1; background: var(--lh-surface); border: 1px solid var(--lh-border); border-radius: var(--preview-radius); }
.preview-grid i:first-child { background: var(--lh-accent); border-color: var(--lh-accent); }

.theme-caption { display: flex; justify-content: space-between; align-items: center; padding: 6px 2px 2px; font-size: 13px; }
.preset-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge-selected { font-size: 11px; font-weight: 600; color: var(--lh-accent); flex-shrink: 0; }

.colors-palette { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.color-btn { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 9999px; border: 1px solid var(--lh-border); background: var(--lh-surface); color: var(--lh-text); cursor: pointer; font-size: 13px; transition: border-color .15s ease, background-color .15s ease; }
.color-btn:hover { border-color: var(--lh-border-hover); background: var(--lh-surface-hover); }
.color-btn[aria-pressed=true] { border-color: var(--lh-accent); background: color-mix(in srgb, var(--lh-accent) 12%, var(--lh-surface)); }
.color-dot { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1); }
.check-icon { font-size: 11px; font-weight: 700; color: #fff; line-height: 1; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }
.color-label { font-size: 13px; }

.color-custom { display: flex; align-items: center; gap: 8px; padding: 4px 10px; border-radius: 9999px; border: 1px dashed var(--lh-border); cursor: pointer; background: var(--lh-surface); font-size: 13px; }
.color-custom:hover { border-color: var(--lh-accent); }
.color-custom input[type=color] { width: 22px; height: 22px; padding: 0; border: none; border-radius: 50%; cursor: pointer; background: none; }

.section-title-row { display: flex; justify-content: space-between; align-items: center; }
.title-with-mode { display: flex; align-items: center; gap: 10px; }
.color-mode-tabs { display: flex; background: var(--lh-border); padding: 2px; border-radius: 9999px; gap: 2px; }
.mode-pill { border: none; background: transparent; border-radius: 9999px; padding: 2px 8px; font-size: 11px; color: var(--lh-text-secondary); cursor: pointer; transition: all .15s ease; }
.mode-pill:hover { color: var(--lh-text); }
.mode-pill.active { background: var(--lh-surface); color: var(--lh-text); font-weight: 500; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08); }
.btn-reset-colors { background: transparent; border: 1px solid var(--lh-border); border-radius: 9999px; padding: 2px 10px; font-size: 12px; color: var(--lh-text-secondary); cursor: pointer; transition: all .15s ease; }
.btn-reset-colors:hover { border-color: var(--lh-border-hover); color: var(--lh-text); }

.theme-slots-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
.slot-card { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: var(--lh-radius-md); border: 1px solid var(--lh-border); background: var(--lh-surface); }
.slot-swatch { position: relative; width: 28px; height: 28px; flex-shrink: 0; cursor: pointer; }
.slot-swatch input[type=color] { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.slot-color-preview { display: block; width: 100%; height: 100%; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15); }
.slot-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.slot-name { font-size: 13px; font-weight: 500; color: var(--lh-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.slot-hex { font-size: 11px; font-family: monospace; color: var(--lh-text-secondary); }

.customize { border-top: 1px solid var(--lh-border); padding-top: 20px; }
summary { cursor: pointer; margin-bottom: 20px; }
</style>
