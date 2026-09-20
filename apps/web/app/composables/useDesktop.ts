import { ref } from 'vue'
import { findBottomRightPlacement, newWidget, type Desktop, type WidgetNode, type Breakpoint } from '@laull-home/shared'
import { getCachedDesktop, setCachedDesktop, isPrivacySpace } from '../utils/localCache'

// 画布在普通空间优先使用本地缓存秒开与静默校验，隐私空间仅存内存。
export function useDesktop() {
  const { $api } = useNuxtApp()
  const data = ref<Desktop | null>(null)
  const error = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const dirty = ref(false)
  let generation = 0
  let currentSpace = ''
  // 读取指定空间画布，普通空间应用 SWR 策略，隐私空间严格纯内存化。
  async function load(spaceId: string) {
    const request = ++generation
    // 跨空间加载时清空旧数据。
    if (currentSpace !== spaceId) {
      data.value = null
    }
    currentSpace = spaceId
    dirty.value = false
    error.value = ''

    // 1. 普通空间优先尝试从本地持久化缓存瞬间还原桌面，实现零等待秒开。
    let hasLocalSnapshot = false
    if (!isPrivacySpace(spaceId)) {
      const cached = getCachedDesktop<Desktop>(spaceId)
      if (cached && cached.nodes) {
        data.value = cached
        hasLocalSnapshot = true
      }
    }

    // 仅在完全没有本地快照可展示时才对外呈现阻塞式 loading 状态。
    if (!hasLocalSnapshot) {
      loading.value = true
    }

    try {
      const result = await $api.desktop({ spaceId }).get()
      if (request !== generation) return
      if (result.status === 304) return
      const errObj = result.error?.value
      const errMsg = (typeof errObj === 'object' && errObj && 'message' in errObj ? String(errObj.message) : undefined) ?? '读取画布失败'
      if (!result.data) throw new Error(errMsg)

      // 服务端最新快照返回，平滑更新并同步至本地缓存。
      data.value = result.data
      if (!isPrivacySpace(spaceId)) {
        setCachedDesktop(spaceId, result.data)
      }
    } catch (cause) {
      // 离线断网且已有本地快照可用时宽容放行，避免阻断离线使用。
      if (request === generation && !hasLocalSnapshot) {
        error.value = cause instanceof Error ? cause.message : '读取画布失败'
      }
    } finally {
      if (request === generation) loading.value = false
    }
  }
  let queuedSave = false
  // 保存失败保留草稿供重试或主动重读，支持在写入期间排队下一次最新快照。
  async function save() {
    if (!data.value) return
    if (saving.value) {
      queuedSave = true
      return
    }
    saving.value = true
    error.value = ''
    const request = generation
    try {
      const result = await $api.desktop({ spaceId: currentSpace }).put(data.value)
      if (request !== generation) return
      if (!result.data) throw new Error(result.error?.value.message ?? '保存失败')
      if (data.value) {
        data.value.revision = result.data.revision
        if (!isPrivacySpace(currentSpace)) {
          setCachedDesktop(currentSpace, data.value)
        }
      }
      dirty.value = false
    } catch (cause) {
      if (request === generation) error.value = cause instanceof Error ? cause.message : '保存失败'
    } finally {
      saving.value = false
      if (queuedSave) {
        queuedSave = false
        void save()
      }
    }
  }
  // 书签合并由服务端在同一事务中完成，失败保留原草稿。
  async function merge(sourceId: string, targetId: string): Promise<boolean> {
    if (!data.value || saving.value) return false
    saving.value = true
    error.value = ''
    const request = generation
    try {
      const result = await $api.desktop({ spaceId: currentSpace }).merge.post({ desktop: data.value, sourceId, targetId })
      if (request !== generation) return false
      if (!result.data) throw new Error(result.error?.value.message ?? '合并失败')
      data.value = result.data
      if (!isPrivacySpace(currentSpace)) {
        setCachedDesktop(currentSpace, data.value)
      }
      dirty.value = false
      return true
    } catch (cause) { error.value = cause instanceof Error ? cause.message : '合并失败'; return false }
    finally { saving.value = false }
  }
  // 修改节点时保持原编号与其他配置。
  function update(node: WidgetNode) {
    if (!data.value) return
    const updated = { ...node }
    if (typeof updated.title === 'string') {
      updated.title = updated.title.trim()
    }
    const index = data.value.nodes.findIndex(item => item.id === node.id)
    if (index !== -1) {
      data.value.nodes[index] = { ...data.value.nodes[index]!, ...updated }
    } else {
      data.value.nodes.push(updated)
    }
    dirty.value = true
  }
  // 添加目录组件、预设形态或模板副本。
  function add(
    type: WidgetNode['type'],
    template?: WidgetNode,
    variant?: string,
    size?: { w: number; h: number },
    options?: { frameless?: boolean; referenceId?: string; title?: string; breakpoint?: Breakpoint },
  ) {
    if (!data.value || saving.value) return
    if (data.value.nodes.length >= 120) { error.value = '最多保存 120 个组件'; return }
    const node: WidgetNode = template ? JSON.parse(JSON.stringify(template)) : newWidget(type, crypto.randomUUID(), variant)
    node.id = crypto.randomUUID()
    node.stackId = ''
    if (variant && !template) node.variant = variant
    if (size && !template) {
      node.layouts.desktop.w = size.w
      node.layouts.desktop.h = size.h
    }
    if (options?.frameless) {
      node.style = { opacity: 100, blur: 0, radius: 16, padding: 8, border: 0, color: '', background: '', frameless: true }
    }
    if (options?.referenceId) node.referenceId = options.referenceId
    if (options?.title !== undefined && options.title.trim()) {
      node.title = options.title.trim()
    }
    if (node.type === 'countdown' && !node.content) {
      node.content = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0] ?? ''
    }
    if (node.type === 'todo' && !node.content) {
      node.content = JSON.stringify([
        { id: crypto.randomUUID(), text: '探索桌面新组件', done: true },
        { id: crypto.randomUUID(), text: '添加常用网站与分组', done: false },
      ])
    }
    const bp = options?.breakpoint ?? 'desktop'
    const targetW = size?.w ?? node.layouts.desktop.w
    const targetH = size?.h ?? node.layouts.desktop.h
    const placement = findBottomRightPlacement(data.value.nodes, targetW, targetH, bp)
    node.layouts.desktop = {
      x: placement.x,
      y: placement.y,
      w: targetW,
      h: targetH,
      pinned: true,
    }
    if (bp !== 'desktop') {
      node.layouts[bp] = {
        x: placement.x,
        y: placement.y,
        w: targetW,
        h: targetH,
        pinned: true,
      }
    }
    data.value.nodes.push(node)
    dirty.value = true
  }
  // 删除节点无需改动原书签实体。
  function remove(id: string) {
    if (!data.value || saving.value) return
    data.value.nodes = data.value.nodes.filter(node => node.id !== id)
    dirty.value = true
  }
  // 模板随所属空间保存，隐私空间模板不会泄露到普通空间。
  function template(node: WidgetNode) {
    if (!data.value || saving.value) return
    if (data.value.templates.length >= 40) { error.value = '最多保存 40 个模板'; return }
    data.value.templates.push({ ...JSON.parse(JSON.stringify(node)), id: crypto.randomUUID(), stackId: '' })
    dirty.value = true
  }
  return { data, error, loading, saving, dirty, load, save, merge, update, add, remove, template }
}
