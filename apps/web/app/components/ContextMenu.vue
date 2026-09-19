<script setup lang="ts">
import { nextTick } from 'vue'
// 菜单项目只暴露已授权的操作。
const props = defineProps<{ position: { x: number; y: number } | null; items: { id: string; label: string }[] }>()
// 选中后由所属空间处理操作。
const emit = defineEmits<{ close: []; action: [id: string] }>()
const menu = ref<HTMLElement | null>(null)
const location = ref({ left: '0px', top: '0px' })
const isVisible = ref(false)
let previous: HTMLElement | null = null
// 菜单显示后按真实尺寸限制在视口内，容器承接焦点以便监听键盘。
watch(() => props.position, async position => {
  if (!position) {
    isVisible.value = false
    return
  }
  isVisible.value = false
  previous = document.activeElement as HTMLElement | null
  location.value = { left: position.x + 'px', top: position.y + 'px' }
  await nextTick()
  const rect = menu.value?.getBoundingClientRect()
  location.value = { left: Math.max(8, Math.min(position.x, window.innerWidth - (rect?.width ?? 220) - 8)) + 'px', top: Math.max(8, Math.min(position.y, window.innerHeight - (rect?.height ?? 200) - 8)) + 'px' }
  isVisible.value = true
  menu.value?.focus()
})
// 关闭时把键盘焦点交还触发位置。
function close() { emit('close'); previous?.focus() }
// 方向键环绕菜单，Esc 和 Tab 退出。
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); close(); return }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const buttons = Array.from(menu.value?.querySelectorAll('button') ?? [])
  if (!buttons.length) return
  const index = buttons.indexOf(document.activeElement as (typeof buttons)[number])
  const next = index === -1
    ? (event.key === 'ArrowUp' ? buttons.length - 1 : 0)
    : (event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length)
  buttons[next]?.focus()
}
// 点击菜单外和滚动时关闭，保留正常页面交互。
function outside(event: globalThis.Event) { if (props.position && !menu.value?.contains(event.target as Node)) close() }
onMounted(() => { document.addEventListener('pointerdown', outside); window.addEventListener('scroll', outside, true); window.addEventListener('resize', outside) })
onUnmounted(() => { document.removeEventListener('pointerdown', outside); window.removeEventListener('scroll', outside, true); window.removeEventListener('resize', outside) })
</script>

<template>
  <Teleport to="body"><div v-if="position" ref="menu" class="context-menu" role="menu" tabindex="-1" :style="{ ...location, visibility: isVisible ? 'visible' : 'hidden' }" @keydown="keyboard" @contextmenu.prevent>
    <button v-for="item in items" :key="item.id" type="button" role="menuitem" @click.stop="emit('action', item.id); close()">{{ item.label }}</button>
  </div></Teleport>
</template>

<style scoped>
.context-menu { position: fixed; z-index: 3000; width: 220px; max-width: calc(100vw - 16px); padding: 6px; border: 1px solid var(--lh-border); border-radius: var(--lh-radius-md); background: color-mix(in srgb, var(--lh-surface) 90%, transparent); box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), var(--lh-shadow-dropdown); backdrop-filter: blur(var(--lh-blur)) saturate(160%); -webkit-backdrop-filter: blur(var(--lh-blur)) saturate(160%); outline: none; }
.context-menu button { display: block; width: 100%; text-align: left; border: 0; background: transparent; padding: 10px 12px; font-size: 14px; border-radius: calc(var(--lh-radius-sm) + 2px); transition: background-color .15s ease; outline: none; }
.context-menu button:hover, .context-menu button:focus-visible { background: var(--lh-surface-hover); }
</style>
