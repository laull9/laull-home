<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WidgetNode } from '@laull-home/shared'
import { verifyIframeUrl } from '@laull-home/shared'

// 网页嵌入小部件属性定义。
const props = withDefaults(
  defineProps<{
    node: WidgetNode
    editing?: boolean
    width?: number
  }>(),
  {
    editing: false,
    width: 4,
  },
)

// 触发组件节点更新事件。
const emit = defineEmits<{
  update: [node: WidgetNode]
}>()

// 读取当前用户设置中的域名白名单。
const { data: settingsData } = useAsyncData('user-settings-iframe', async () => {
  const { $api } = useNuxtApp()
  const res = await $api.settings.get()
  return res.data ?? null
})

// 本地可编辑的目标 URL。
const targetUrl = ref(props.node.content ?? '')
const isEditingUrl = ref(false)

// 校验目标 URL 的合规性与受控状态。
const verification = computed(() => {
  const url = props.node.content ?? ''
  if (!url.trim()) return { safe: false, reason: '未配置嵌入网页地址' }
  const allowlist = (settingsData.value as { iframeAllowlist?: string[] } | null)?.iframeAllowlist ?? []
  return verifyIframeUrl(url, allowlist)
})

// 保存并提交目标 URL。
function handleSaveUrl() {
  isEditingUrl.value = false
  emit('update', { ...props.node, content: targetUrl.value.trim() })
}

// 放弃编辑恢复现值。
function handleCancelEdit() {
  targetUrl.value = props.node.content ?? ''
  isEditingUrl.value = false
}
</script>

<template>
  <div class="iframe-root widget-content">
    <!-- 头部工具栏 -->
    <div class="iframe-header">
      <div class="header-left">
        <span class="iframe-title">{{ node.title || '网页嵌入' }}</span>
        <span v-if="verification.safe" class="safe-badge">受控沙箱</span>
      </div>
      <div v-if="editing" class="header-actions">
        <button
          type="button"
          class="btn-config"
          :title="isEditingUrl ? '取消配置' : '修改网页地址'"
          @click="isEditingUrl = !isEditingUrl"
        >
          {{ isEditingUrl ? '关闭' : '配置地址' }}
        </button>
      </div>
    </div>

    <!-- URL 配置编辑表单 -->
    <div v-if="isEditingUrl" class="iframe-config-panel">
      <input
        v-model="targetUrl"
        type="url"
        class="input-url"
        placeholder="https://example.com"
        @keydown.enter="handleSaveUrl"
        @pointerdown.stop
      />
      <div class="config-buttons">
        <button type="button" class="btn-save" @click="handleSaveUrl">保存</button>
        <button type="button" class="btn-cancel" @click="handleCancelEdit">取消</button>
      </div>
    </div>

    <!-- 主体区域：合规时渲染沙箱 iframe，不合规时渲染友好阻断提示 -->
    <div v-else class="iframe-body">
      <iframe
        v-if="verification.safe && verification.normalizedUrl"
        :src="verification.normalizedUrl"
        sandbox="allow-scripts allow-forms allow-popups"
        referrerpolicy="strict-origin-when-cross-origin"
        loading="lazy"
        class="iframe-frame"
      />
      <div v-else class="iframe-blocked">
        <div class="blocked-icon">🔒</div>
        <div class="blocked-title">外部网页加载受限</div>
        <div class="blocked-reason">{{ verification.reason }}</div>
        <button
          v-if="editing && !isEditingUrl"
          type="button"
          class="btn-edit-inline"
          @click="isEditingUrl = true"
        >
          输入目标地址
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.iframe-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
}

.iframe-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.iframe-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--widget-text, var(--lh-text));
}

.safe-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--lh-surface);
  color: var(--lh-text-secondary);
  border: 1px solid var(--lh-border);
}

.btn-config {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--lh-border);
  background: var(--lh-surface);
  color: var(--lh-text);
  cursor: pointer;
}

.iframe-config-panel {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}

.input-url {
  flex: 1;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--lh-border);
  background: var(--lh-surface);
  color: var(--lh-text);
  font-size: 12px;
}

.config-buttons {
  display: flex;
  gap: 4px;
}

.btn-save {
  padding: 4px 10px;
  border-radius: 4px;
  border: none;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  font-size: 12px;
  cursor: pointer;
}

.btn-cancel {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--lh-border);
  background: transparent;
  color: var(--lh-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.iframe-body {
  flex: 1;
  min-height: 0;
  position: relative;
  border-radius: 6px;
  overflow: hidden;
}

.iframe-frame {
  width: 100%;
  height: 100%;
  border: none;
  background: #ffffff;
}

.iframe-blocked {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 6px;
}

.blocked-icon {
  font-size: 24px;
  margin-bottom: 6px;
}

.blocked-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--widget-text, var(--lh-text));
  margin-bottom: 4px;
}

.blocked-reason {
  font-size: 11px;
  color: var(--lh-text-secondary);
  margin-bottom: 10px;
}

.btn-edit-inline {
  padding: 4px 12px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid var(--lh-border);
  background: var(--lh-surface);
  color: var(--lh-text);
  cursor: pointer;
}
</style>
