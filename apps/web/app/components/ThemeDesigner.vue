<script setup lang="ts">
import { ref } from 'vue'
import { COLOR_TOKENS, DEFAULT_THEME, isThemeConfig, type ThemeConfig } from '@laull-home/shared'

// 主题编辑器使用父表单统一保存。
const model = defineModel<ThemeConfig>({ required: true })
// 当前颜色覆盖模式。
const mode = ref<'light' | 'dark'>('light')
const code = ref('')
const error = ref('')
// 控件名称与范围共用一个配置。
const ranges = [
  { key: 'opacity', label: '卡片不透明度', min: 50, max: 100, unit: '%' },
  { key: 'blur', label: '卡片模糊', min: 0, max: 30, unit: 'px' },
  { key: 'radius', label: '圆角', min: 0, max: 40, unit: 'px' },
  { key: 'gap', label: '网格间距', min: 4, max: 32, unit: 'px' },
  { key: 'wallpaperDim', label: '壁纸暗化', min: 0, max: 80, unit: '%' },
  { key: 'wallpaperBlur', label: '壁纸模糊', min: 0, max: 24, unit: 'px' },
] as const
// 语义名称保持中文可读。
const labels: Record<string, string> = { bg: '页面背景', surface: '卡片表面', text: '正文', 'text-secondary': '次要文字', accent: '强调色', 'accent-text': '强调色文字', border: '边框' }
// 代码串导入仅允许当前版本和已知字段。
function importTheme() {
  try {
    if (code.value.length > 8000) throw new Error('主题代码过长')
    const value = JSON.parse(code.value)
    if (!isThemeConfig(value)) throw new Error('主题版本、字段或参数范围无效')
    model.value = value
    error.value = ''
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '主题导入失败' }
}
</script>

<template>
  <fieldset class="theme-designer"><legend>主题设计</legend>
    <label class="seed"><input v-model="model.customSeed" type="checkbox">使用种子色<input v-model="model.seed" type="color" aria-label="主题种子色"></label>
    <div class="ranges"><label v-for="item in ranges" :key="item.key">{{ item.label }} <output>{{ model[item.key] }}{{ item.unit }}</output><input v-model.number="model[item.key]" type="range" :min="item.min" :max="item.max"></label></div>
    <div class="mode"><label>颜色覆盖<select v-model="mode"><option value="light">浅色</option><option value="dark">深色</option></select></label></div>
    <div class="colors"><label v-for="key in COLOR_TOKENS" :key="key">{{ labels[key] }}<input :value="model[mode][key] ?? ''" :aria-label="labels[key]" pattern="^$|^#[0-9a-fA-F]{6}$" placeholder="继承主题" @input="($event.target as HTMLInputElement).value ? model[mode][key] = ($event.target as HTMLInputElement).value : delete model[mode][key]"></label></div>
    <details><summary>导入与导出</summary><textarea v-model="code" aria-label="主题 JSON 代码串" rows="5" maxlength="8000" /><div class="buttons"><button type="button" @click="code = JSON.stringify(model, null, 2)">导出主题</button><button type="button" @click="importTheme">导入主题</button><button type="button" @click="model = JSON.parse(JSON.stringify(DEFAULT_THEME))">重置参数</button></div></details>
    <p v-if="error" role="alert">{{ error }}</p>
  </fieldset>
</template>

<style scoped>
.theme-designer { border: 1px solid var(--lh-border); border-radius: var(--lh-radius-md); padding: 16px; margin-bottom: 20px; }
.ranges, .colors { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 20px 0; }
.ranges label, .colors label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
output { color: var(--lh-text-secondary); }
.seed { display: flex; gap: 12px; align-items: center; }
.seed input[type=checkbox] { width: auto; }
.seed input[type=color] { width: 48px; height: 36px; }
textarea { width: 100%; box-sizing: border-box; margin: 12px 0; }
.buttons { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
