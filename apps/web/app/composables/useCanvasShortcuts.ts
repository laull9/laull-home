import { ref, computed, onMounted, onUnmounted, type Ref, type ComputedRef } from 'vue'
import type { Placement, WidgetNode } from '@laull-home/shared'

// 快捷键管理配置参数接口。
export interface UseCanvasShortcutsOptions {
  canvas: Ref<HTMLElement | null>
  visibleNodes: ComputedRef<{ node: WidgetNode }[]>
  positions: ComputedRef<Map<string, Placement>>
}

// 管理主桌面键盘快捷检索、数字快捷跳转与角标显隐的组合式函数。
export function useCanvasShortcuts(options: UseCanvasShortcutsOptions) {
  // 书签名称瞬时筛选关键字。
  const filter = ref('')
  // 是否按下 Alt 辅助键。
  const alt = ref(false)

  // 固定应用的数字角标与键盘操作使用相同列表。
  const shortcuts = computed(() => {
    return options.visibleNodes.value
      .map(entry => entry.node)
      .filter(node => node.type === 'bookmark' && options.positions.value.get(node.id)?.pinned)
      .slice(0, 9)
  })

  // 编辑输入和弹窗存在时不抢占键盘。
  function keyboard(event: KeyboardEvent) {
    alt.value = event.altKey
    if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]') || document.querySelector('[role="dialog"][open]')) return
    if (event.key === '/') {
      event.preventDefault()
      options.canvas.value?.querySelector<HTMLInputElement>('input')?.focus()
    } else if (event.altKey && /^[1-9]$/.test(event.key)) {
      const node = shortcuts.value[Number(event.key) - 1]
      if (node) document.getElementById('widget-' + node.id)?.querySelector<HTMLAnchorElement>('.icon-link')?.click()
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
      filter.value += event.key
    } else if (event.key === 'Escape') {
      filter.value = ''
    } else if (event.key === 'Backspace' && filter.value) {
      event.preventDefault()
      filter.value = filter.value.slice(0, -1)
    }
  }

  // 松开组合键或离开窗口时清除角标。
  function releaseAlt() {
    alt.value = false
  }

  onMounted(() => {
    document.addEventListener('keydown', keyboard)
    document.addEventListener('keyup', releaseAlt)
    window.addEventListener('blur', releaseAlt)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', keyboard)
    document.removeEventListener('keyup', releaseAlt)
    window.removeEventListener('blur', releaseAlt)
  })

  return {
    filter,
    alt,
    shortcuts,
  }
}
