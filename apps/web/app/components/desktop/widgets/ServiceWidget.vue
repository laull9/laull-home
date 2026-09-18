<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type { WidgetNode } from '@laull-home/shared'

// 接收组件节点、窗格宽度与编辑态。
const props = defineProps<{
  node: WidgetNode
  width: number
  editing: boolean
}>()

const { $api } = useNuxtApp()

// 指标字段项接口。
interface MetricField {
  key: string
  label: string
  type: 'status' | 'number' | 'text' | 'progress'
  unit?: string
}

// 动作操作项接口。
interface ServiceAction {
  id: string
  label: string
  method: string
  path: string
}

// 小部件完整数据结构。
interface ServicePayload {
  state?: string
  status?: string
  metrics?: Record<string, unknown>
  fields?: MetricField[]
  actions?: ServiceAction[]
  [key: string]: unknown
}

const loading = ref(false)
const errorMsg = ref('')
const payload = ref<ServicePayload | null>(null)
const actionRunning = ref<string | null>(null)
const actionResult = ref<{ id: string; success: boolean; msg: string } | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null

// 从受控代理拉取微服务小部件数据。
async function loadData() {
  if (!props.node.integrationId || !props.node.widgetId) {
    errorMsg.value = '请在组件编辑中绑定微服务与小部件'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await $api.integrations({ id: props.node.integrationId }).widgets({ widgetId: props.node.widgetId }).data.get()
    if (res.error) {
      errorMsg.value = (res.error.value as { message?: string })?.message || '读取服务数据失败'
      return
    }
    payload.value = (res.data as { data: ServicePayload })?.data ?? null
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '网络连接失败'
  } finally {
    loading.value = false
  }
}

// 触发微服务受控动作。
async function handleAction(actionId: string) {
  if (!props.node.integrationId || actionRunning.value) return
  actionRunning.value = actionId
  actionResult.value = null
  try {
    const res = await $api.integrations({ id: props.node.integrationId }).actions({ actionId }).post({})
    if (res.error) {
      actionResult.value = { id: actionId, success: false, msg: (res.error.value as { message?: string })?.message || '操作失败' }
    } else {
      actionResult.value = { id: actionId, success: true, msg: '执行成功' }
      await loadData()
    }
  } catch (err: unknown) {
    actionResult.value = { id: actionId, success: false, msg: err instanceof Error ? err.message : '执行失败' }
  } finally {
    actionRunning.value = null
    setTimeout(() => {
      if (actionResult.value?.id === actionId) actionResult.value = null
    }, 3000)
  }
}

// 启动定时轮询。
function startPolling() {
  stopPolling()
  const interval = Math.max(1000, props.node.refreshInterval || 10000)
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      void loadData()
    }
  }, interval)
}

// 停止定时轮询。
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 处理页面可见性切换：后台挂起，前台静默拉取。
function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void loadData()
  }
}

onMounted(() => {
  void loadData()
  startPolling()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  stopPolling()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

watch(() => [props.node.integrationId, props.node.widgetId, props.node.refreshInterval], () => {
  void loadData()
  startPolling()
})
</script>

<template>
  <div class="service-widget widget-content">
    <div v-if="!node.integrationId || !node.widgetId" class="empty-state">
      <span>微服务未配置</span>
      <small>进入编辑模式点击齿轮绑定服务</small>
    </div>

    <div v-else-if="errorMsg" class="error-state">
      <span class="error-icon">⚠</span>
      <span class="error-text">{{ errorMsg }}</span>
      <button v-if="!editing" type="button" class="btn-retry" @click="loadData">重试</button>
    </div>

    <div v-else class="content-body">
      <!-- 头部：标题与状态标签 -->
      <div class="header-row">
        <span class="service-title">{{ node.title || '微服务监控' }}</span>
        <span v-if="payload?.state || payload?.status" class="status-badge" :class="String(payload?.state || payload?.status).toLowerCase()">
          {{ payload?.state || payload?.status }}
        </span>
      </div>

      <!-- 指标数据展示（metric-grid） -->
      <div v-if="payload" class="metrics-grid">
        <template v-if="payload.fields && payload.fields.length > 0">
          <div v-for="field in payload.fields" :key="field.key" class="metric-item">
            <span class="metric-label">{{ field.label }}</span>
            <div class="metric-value-row">
              <span v-if="field.type === 'progress'" class="progress-bar-container">
                <span class="progress-bar-fill" :style="{ width: Math.min(100, Math.max(0, Number(payload[field.key] ?? 0))) + '%' }" />
              </span>
              <span v-else class="metric-value">
                {{ payload[field.key] ?? '-' }}{{ field.unit ?? '' }}
              </span>
            </div>
          </div>
        </template>
        <template v-else-if="payload.metrics">
          <div v-for="(val, key) in payload.metrics" :key="key" class="metric-item">
            <span class="metric-label">{{ key }}</span>
            <span class="metric-value">{{ val }}</span>
          </div>
        </template>
      </div>

      <!-- 动作操作按钮组 -->
      <div v-if="payload?.actions && payload.actions.length > 0" class="actions-row">
        <button
          v-for="act in payload.actions"
          :key="act.id"
          type="button"
          class="btn-action"
          :disabled="actionRunning === act.id"
          @click="handleAction(act.id)"
        >
          <span v-if="actionRunning === act.id" class="spinner" />
          {{ act.label }}
        </button>
      </div>

      <!-- 动作执行结果浮层反馈 -->
      <div v-if="actionResult" class="action-toast" :class="{ success: actionResult.success, fail: !actionResult.success }">
        {{ actionResult.msg }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.service-widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 12px;
  overflow: hidden;
  position: relative;
}

.empty-state, .error-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 6px;
  color: var(--lh-text-secondary);
  font-size: 13px;
}

.error-state {
  color: var(--lh-danger);
}

.error-icon {
  font-size: 20px;
}

.btn-retry {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-surface-hover);
  border: 1px solid var(--lh-border);
  color: var(--lh-text);
  cursor: pointer;
}

.content-body {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.service-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--lh-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
  background: var(--lh-surface-hover);
  color: var(--lh-text-secondary);
}

.status-badge.running, .status-badge.ok, .status-badge.active, .status-badge.online {
  background: color-mix(in srgb, var(--lh-success) 20%, transparent);
  color: var(--lh-success);
}

.status-badge.error, .status-badge.failed, .status-badge.offline {
  background: color-mix(in srgb, var(--lh-danger) 20%, transparent);
  color: var(--lh-danger);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 8px;
  flex: 1;
  align-content: center;
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-label {
  font-size: 11px;
  color: var(--lh-text-secondary);
}

.metric-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--lh-text);
  font-variant-numeric: tabular-nums;
}

.progress-bar-container {
  height: 6px;
  background: var(--lh-border);
  border-radius: 3px;
  overflow: hidden;
  display: block;
  margin-top: 4px;
}

.progress-bar-fill {
  height: 100%;
  background: var(--lh-accent);
  display: block;
  transition: width 0.3s ease;
}

.actions-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: auto;
}

.btn-action {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.btn-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 10px;
  height: 10px;
  border: 2px solid var(--lh-accent-text);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.action-toast {
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  box-shadow: var(--lh-shadow-sm);
}

.action-toast.success {
  color: var(--lh-success);
}

.action-toast.fail {
  color: var(--lh-danger);
}
</style>
