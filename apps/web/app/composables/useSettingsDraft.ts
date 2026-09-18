import { nextTick } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { isThemeConfig, scopedCss, type HomeSettings } from '@laull-home/shared'
import { createAutoSave } from '../utils/autoSave'
import { getLegacyColorSeed, normalizeThemeId, presetConfig } from '../utils/themePresets'

// 外观草稿跨设置分页共享，串行写入并使用服务端版本锁。
export function useSettingsDraft() {
  const { $api } = useNuxtApp()
  const { applyTheme } = useTheme()
  const draft = ref<HomeSettings>({ revision: 0, title: '', appearance: 'system', themeId: 'modern', wallpaperType: 'none', wallpaperValue: '', customCss: '', themeConfig: presetConfig('modern'), allowDragWithoutEdit: true })
  const ready = ref(false)
  const state = ref('saved')
  const message = ref('')
  let revision = 0
  // 验证完整输入后才预览和保存，编辑一半的颜色不会污染主题。
  function validate(value: HomeSettings) {
    if (!value.title.trim() || value.title.length > 80) throw new Error('主页标题需为 1 至 80 个字符')
    if (!isThemeConfig(value.themeConfig)) throw new Error('请补全颜色代码或调整参数范围')
    scopedCss(value.customCss ?? '', '.app-root')
  }
  const queue = createAutoSave(() => JSON.parse(JSON.stringify(draft.value)) as HomeSettings, async value => {
    validate(value)
    const result = await $api.settings.put({ ...value, revision })
    if (!result.data) throw new Error(result.error?.value.message ?? '保存失败，请重试')
    revision = result.data.revision
  }, (next, error) => {
    state.value = next
    message.value = error instanceof Error ? error.message : ({ pending: '等待保存', saving: '保存中', saved: '已自动保存', error: '保存失败，请重试' }[next])
  })
  // 重读须显式放弃草稿，避免覆盖另一设备的新设置。
  async function load() {
    ready.value = false
    queue.reset()
    try {
      const result = await $api.settings.get()
      if (!result.data) throw new Error('读取设置失败')
      revision = result.data.revision
      const loaded = result.data
      const legacySeed = getLegacyColorSeed(loaded.themeId)
      const themeId = normalizeThemeId(loaded.themeId)
      const baseConfig = loaded.themeConfig ?? presetConfig(themeId)
      const seed = baseConfig.seed || legacySeed || '#2563eb'
      draft.value = {
        ...loaded,
        allowDragWithoutEdit: loaded.allowDragWithoutEdit !== undefined ? loaded.allowDragWithoutEdit : true,
        themeId,
        themeConfig: { ...baseConfig, seed, customSeed: true },
      }
      applyTheme(draft.value)
      await nextTick()
      state.value = 'saved'
      message.value = '已自动保存'
      ready.value = true
    } catch (error) { message.value = error instanceof Error ? error.message : '读取设置失败'; state.value = 'error' }
  }
  watch(draft, () => {
    if (!ready.value) return
    try { validate(draft.value); applyTheme(draft.value) } catch { /* 不完整输入继续保留在表单。 */ }
    queue.schedule()
  }, { deep: true })
  // 风格选择一次更新，保留当前自选的主题色并清除旧样式覆盖。
  function chooseTheme(id: string) {
    const currentSeed = draft.value.themeConfig?.seed ?? '#2563eb'
    const newConfig = presetConfig(id, draft.value.themeConfig)
    draft.value = { ...draft.value, themeId: normalizeThemeId(id), themeConfig: { ...newConfig, seed: currentSeed }, customCss: '' }
  }
  // 单独切换主题色，不影响当前选择的现代或像素风格。
  function chooseColor(seed: string) {
    const currentConfig = draft.value.themeConfig ?? presetConfig(draft.value.themeId ?? 'modern')
    draft.value = {
      ...draft.value,
      themeConfig: {
        ...currentConfig,
        seed,
        customSeed: true,
      },
    }
  }
  // 路由离开前等候保存，失败留在当前页继续修正。
  onBeforeRouteLeave(async () => !ready.value || await queue.flush())
  // 浏览器关闭无法等待网络，存在未保存内容时显示原生离页提醒。
  function beforeUnload(event: BeforeUnloadEvent) {
    if (ready.value && state.value !== 'saved') { event.preventDefault(); event.returnValue = '' }
  }
  onMounted(() => { void load(); window.addEventListener('beforeunload', beforeUnload) })
  onUnmounted(() => { queue.dispose(); window.removeEventListener('beforeunload', beforeUnload) })
  return { draft, ready, state, message, chooseTheme, chooseColor, retry: queue.flush, load }
}
