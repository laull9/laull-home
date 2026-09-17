<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { scopedCss, BREAKPOINTS, type WidgetNode, type Bookmark, type BookmarkGroup, type Breakpoint } from '@laull-home/shared'

// 就地配置保留未提交草稿。
const props = defineProps<{ node: WidgetNode | null; breakpoint: Breakpoint; bookmarks: Bookmark[]; groups: BookmarkGroup[] }>()
// 保存、复制与模板操作交给画布统一管理。
const emit = defineEmits<{ close: []; save: [node: WidgetNode]; copy: [node: WidgetNode]; template: [node: WidgetNode]; remove: [id: string] }>()
// 配置草稿、初始快照、错误与代码串。
const draft = ref<WidgetNode | null>(null)
let initialSnapshot: WidgetNode | null = null
const error = ref('')
const code = ref('')

watch(() => props.node, node => {
  draft.value = node ? JSON.parse(JSON.stringify(node)) : null
  initialSnapshot = node ? JSON.parse(JSON.stringify(node)) : null
  error.value = ''
  code.value = ''
}, { immediate: true })

// 当前断点第一次调整时克隆桌面尺寸。
const placement = computed(() => draft.value?.layouts[props.breakpoint] ?? null)

// 监听输入建立当前断点草稿，计算属性仅负责读取。
watch([() => props.node, () => props.breakpoint], () => {
  if (!draft.value || draft.value.layouts[props.breakpoint]) return
  const value = { ...draft.value.layouts.desktop, pinned: false, x: 0, y: 0 }
  value.w = Math.min(BREAKPOINTS[props.breakpoint], value.w)
  draft.value.layouts[props.breakpoint] = value
}, { immediate: true })

// 校验样式和时区后自动同步最新草稿到画布。
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
function autoSave() {
  if (!draft.value || !placement.value) return
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    if (!draft.value || !placement.value) return
    try {
      if (draft.value.css) scopedCss(draft.value.css, '#widget-' + draft.value.id)
      if (draft.value.timezone) new Intl.DateTimeFormat('zh-CN', { timeZone: draft.value.timezone })
      if (placement.value.x + placement.value.w > BREAKPOINTS[props.breakpoint]) throw new Error('位置与宽度超出当前网格')
      error.value = ''
      emit('save', draft.value)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '配置无效'
    }
  }, 150)
}

// 监听草稿变更自动防抖落盘。
watch(draft, () => {
  autoSave()
}, { deep: true })

// 放弃当前修改，回滚至打开配置前的初始快照并关闭。
function cancelChanges() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  if (initialSnapshot) {
    emit('save', initialSnapshot)
  }
  emit('close')
}

// 启用局部样式时快照当前全局参数。
function localStyle() {
  if (!draft.value) return
  draft.value.style = { opacity: 95, blur: 16, radius: 16, padding: 12, border: 1, color: '', background: '', frameless: false }
}

// 切换是否脱离底座卡片。
function toggleFrameless(enabled: boolean) {
  if (!draft.value) return
  if (!draft.value.style) {
    draft.value.style = { opacity: 95, blur: 16, radius: 16, padding: 12, border: 1, color: '', background: '', frameless: enabled }
  } else {
    draft.value.style.frameless = enabled
  }
}

// 导出 UTF-8 配置代码串，保留版本用于后续迁移。
function exportCode() {
  if (!draft.value) return
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, node: draft.value }))
  code.value = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
}
</script>

<template>
  <BaseModal :show="!!node" title="配置组件外观" max-width="600px" @close="emit('close')">
    <form v-if="draft && placement" class="widget-editor" @submit.prevent="emit('close')">
      <label>名称<input v-model="draft.title" maxlength="80" required></label>

      <!-- 时钟显示样式选择 -->
      <label v-if="draft.type === 'clock'">
        显示样式
        <select v-model="draft.variant">
          <option value="">经典数码</option>
          <option value="minimal">极简大字</option>
          <option value="analog">模拟精工表盘</option>
          <option value="flip">复古机械翻牌</option>
          <option value="progress">今日流逝环</option>
        </select>
      </label>

      <!-- 图标书签显示样式选择 -->
      <label v-if="draft.type === 'bookmark'">
        显示样式
        <select v-model="draft.variant">
          <option value="">标准图标 (1×1)</option>
          <option value="large">质感大图标</option>
          <option value="pill">胶囊信息卡 (2×0.5 横向)</option>
          <option value="emblem">字母徽章</option>
        </select>
      </label>

      <!-- 书签文件夹显示样式选择 -->
      <label v-if="draft.type === 'folder'">
        收纳展示方式
        <select v-model="draft.variant">
          <option value="">风琴收纳抽屉 (原生展开)</option>
          <option value="launchpad">启动台九宫格</option>
          <option value="shelf">紧凑横滑书架</option>
          <option value="grid">经典平铺网格</option>
        </select>
      </label>

      <label v-if="draft.type === 'bookmark'">书签<select v-model="draft.referenceId"><option value="">请选择</option><option v-for="item in bookmarks" :key="item.id" :value="item.id">{{ item.title }}</option></select></label>
      <label v-if="draft.type === 'folder'">分组<select v-model="draft.referenceId"><option value="">请选择</option><option v-for="item in groups" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <label v-if="draft.type === 'note'">内容<textarea v-model="draft.content" rows="5" maxlength="8000" /></label>
      <label v-if="draft.type === 'countdown'">目标日期<input v-model="draft.content" type="date" required></label>
      <template v-if="draft.type === 'clock' || draft.type === 'calendar'">
        <label>时区<input v-model="draft.timezone" required list="timezones"></label>
        <datalist id="timezones"><option>Asia/Shanghai</option><option>Asia/Tokyo</option><option>Europe/London</option><option>America/New_York</option><option>UTC</option></datalist>
        <label v-if="draft.type === 'clock'" class="check"><input v-model="draft.hour12" type="checkbox">12 小时制</label>
      </template>
      <fieldset><legend>当前断点位置与尺寸</legend><div class="fields">
        <label>列<input v-model.number="placement.x" type="number" min="0" :max="BREAKPOINTS[breakpoint]-1"></label>
        <label>行<input v-model.number="placement.y" type="number" min="0" max="199"></label>
        <label>宽度<input v-model.number="placement.w" type="number" min="1" :max="BREAKPOINTS[breakpoint]"></label>
        <label>高度<input v-model.number="placement.h" type="number" min="1" :max="draft.type === 'search' ? 1 : 4"></label>
      </div><label class="check"><input v-model="placement.pinned" type="checkbox">固定位置</label></fieldset>

      <!-- 脱离卡片底座选项 -->
      <label class="check">
        <input
          type="checkbox"
          :checked="!!draft.style?.frameless"
          @change="toggleFrameless(($event.target as HTMLInputElement).checked)"
        >
        脱离卡片底座（透明悬浮，无背景与边框）
      </label>
      <fieldset><legend>局部外观</legend>
        <button v-if="!draft.style" type="button" @click="localStyle">单独设置外观</button>
        <template v-else><div class="fields">
          <label>不透明度<input v-model.number="draft.style.opacity" type="number" min="50" max="100"></label>
          <label>模糊<input v-model.number="draft.style.blur" type="number" min="0" max="30"></label>
          <label>圆角<input v-model.number="draft.style.radius" type="number" min="0" max="40"></label>
          <label>内间距<input v-model.number="draft.style.padding" type="number" min="0" max="32"></label>
          <label>边框<input v-model.number="draft.style.border" type="number" min="0" max="4"></label>
          <label>文字颜色<input v-model="draft.style.color" placeholder="#171717" pattern="^$|^#[0-9a-fA-F]{6}$"></label>
          <label>表面颜色<input v-model="draft.style.background" placeholder="#ffffff" pattern="^$|^#[0-9a-fA-F]{6}$"></label>
        </div><button type="button" @click="delete draft.style">恢复全局外观</button></template>
      </fieldset>
      <label>组件 CSS<textarea v-model="draft.css" rows="4" maxlength="4000" spellcheck="false" /></label>
      <div class="actions">
        <button type="button" class="btn-cancel-edit" @click="cancelChanges">取消更改</button>
        <button type="submit" class="btn-done-edit">完成</button>
        <button type="button" @click="emit('copy', draft)">复制</button>
        <button type="button" @click="emit('template', draft)">保存为模板</button>
        <button type="button" @click="exportCode">导出</button>
        <button type="button" class="btn-remove-widget" @click="emit('remove', draft.id); emit('close')">删除组件</button>
      </div>
      <label v-if="code">配置代码串<textarea :value="code" rows="4" readonly @focus="($event.target as HTMLTextAreaElement).select()" /></label>
    </form>
  </BaseModal>
</template>

<style scoped>
.widget-editor, label { display: flex; flex-direction: column; gap: 8px; }
.widget-editor { gap: 16px; }
.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.check { flex-direction: row; align-items: center; margin-top: 8px; }
.check input { width: auto; }
fieldset { border: 1px solid var(--lh-border); border-radius: var(--lh-radius-sm); min-width: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 6px; }
.btn-cancel-edit {
  padding: 6px 14px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  color: var(--lh-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-cancel-edit:hover {
  background: var(--lh-surface-hover);
  color: var(--lh-text);
  border-color: var(--lh-border-hover);
}
.btn-done-edit {
  padding: 6px 16px;
  background: var(--lh-accent);
  border: 1px solid transparent;
  border-radius: var(--lh-radius-sm);
  color: var(--lh-accent-text);
  font-size: 13px;
  cursor: pointer;
}
.btn-remove-widget {
  color: var(--lh-danger);
}
input, select, textarea { min-width: 0; width: 100%; box-sizing: border-box; }
</style>
