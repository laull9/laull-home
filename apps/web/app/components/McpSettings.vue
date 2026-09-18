<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { McpKeyMetadata } from '@laull-home/shared'
import AlertModal from './AlertModal.vue'
import McpClientGuides from './McpClientGuides.vue'

const { $api } = useNuxtApp()

// 密钥元数据。
const keyMeta = ref<McpKeyMetadata | null>(null)
// 正在加载元数据状态。
const loading = ref(false)
// 正在刷新或生成密钥。
const refreshing = ref(false)
// 正在吊销密钥。
const revoking = ref(false)
// 单次明文展示的高熵密钥（仅生成时呈现）。
const newKeyPlain = ref<string | null>(null)
// 复制成功提示标识。
const copySuccessTarget = ref<string | null>(null)
// 错误提示。
const errorMsg = ref('')
// 成功提示。
const infoMsg = ref('')

// 吊销确认弹窗。
const showRevokeConfirm = ref(false)
// 重新生成确认弹窗。
const showRefreshConfirm = ref(false)

// 当前服务协议与主机地址。
const serverOrigin = ref('')

// 读取当前用户的密钥元数据。
async function fetchKeyMeta() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await $api.mcp.key.get()
    if (res.data) {
      keyMeta.value = res.data
    }
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '获取 MCP 密钥信息失败'
  } finally {
    loading.value = false
  }
}

// 触发生成或刷新流程。
function handleRefreshClick() {
  if (keyMeta.value?.hasKey) {
    showRefreshConfirm.value = true
    return
  }
  void executeRefresh()
}

// 执行密钥签发或重新生成。
async function executeRefresh() {
  refreshing.value = true
  errorMsg.value = ''
  infoMsg.value = ''
  try {
    const res = await $api.mcp.key.refresh.post()
    if (res.data) {
      newKeyPlain.value = res.data.key
      keyMeta.value = {
        hasKey: true,
        keyMask: res.data.keyMask,
        createdAt: res.data.createdAt,
        updatedAt: res.data.createdAt,
      }
      infoMsg.value = 'MCP 密钥已生成'
    }
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '生成密钥失败'
  } finally {
    refreshing.value = false
  }
}

// 执行密钥吊销。
async function executeRevoke() {
  revoking.value = true
  errorMsg.value = ''
  infoMsg.value = ''
  try {
    const res = await $api.mcp.key.delete()
    if (res.data?.success) {
      newKeyPlain.value = null
      keyMeta.value = {
        hasKey: false,
        keyMask: null,
        createdAt: null,
        updatedAt: null,
      }
      infoMsg.value = 'MCP 密钥已停用'
    }
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '停用密钥失败'
  } finally {
    revoking.value = false
  }
}

// 写入剪贴板。
async function copyText(text: string, targetId: string) {
  if (!text) return
  try {
    if (typeof window !== 'undefined' && window.navigator?.clipboard) {
      await window.navigator.clipboard.writeText(text)
      copySuccessTarget.value = targetId
      setTimeout(() => {
        if (copySuccessTarget.value === targetId) copySuccessTarget.value = null
      }, 2000)
    }
  } catch {
    errorMsg.value = '复制失败，请手动选取复制'
  }
}

// 格式化时间戳。
function formatTime(timestamp?: number | null) {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleString()
}

// 提取当前使用的密钥或占位符。
const activeToken = computed(() => {
  if (newKeyPlain.value) return newKeyPlain.value
  return '<YOUR_MCP_KEY>'
})

// 挂载时初始化主机地址与拉取密钥状态。
onMounted(() => {
  if (import.meta.client) {
    serverOrigin.value = window.location.origin
  }
  void fetchKeyMeta()
})
</script>

<template>
  <div class="mcp-settings">
    <!-- 密钥凭据管理卡片 -->
    <section class="card">
      <div class="card-header">
        <div>
          <h2>Model Context Protocol (MCP)</h2>
          <p class="subtitle">让外部智能助手安全读取并编排你的主页桌面与主题</p>
        </div>
      </div>

      <!-- 提示信息 -->
      <p v-if="errorMsg" class="error-text">{{ errorMsg }}</p>
      <p v-if="infoMsg" class="info-text">{{ infoMsg }}</p>

      <!-- 密钥状态与操作 -->
      <div class="key-status-area">
        <div v-if="keyMeta?.hasKey" class="key-detail">
          <div class="field">
            <label>当前密钥掩码</label>
            <div class="mask-box">
              <code>{{ keyMeta.keyMask }}</code>
              <span class="status-tag active">生效中</span>
            </div>
          </div>
          <div class="time-meta">
            <span>初次创建：{{ formatTime(keyMeta.createdAt) }}</span>
            <span>最近刷新：{{ formatTime(keyMeta.updatedAt) }}</span>
          </div>
        </div>

        <div v-else-if="loading" class="loading-state">
          <p>正在读取 MCP 密钥状态…</p>
        </div>

        <div v-else class="no-key-state">
          <p>尚未创建 MCP 访问密钥。生成密钥后，外部 AI 助手即可通过 Bearer 凭据连接服务端。</p>
        </div>

        <!-- 操作按钮组 -->
        <div class="actions">
          <button
            type="button"
            class="btn"
            :disabled="refreshing || revoking"
            @click="handleRefreshClick"
          >
            {{ keyMeta?.hasKey ? '重新生成密钥' : '生成 MCP 密钥' }}
          </button>
          <button
            v-if="keyMeta?.hasKey"
            type="button"
            class="btn-revoke"
            :disabled="refreshing || revoking"
            @click="showRevokeConfirm = true"
          >
            停用并吊销
          </button>
        </div>
      </div>

      <!-- 单次明文高亮呈现 -->
      <div v-if="newKeyPlain" class="one-time-key-box">
        <div class="one-time-header">
          <strong>新密钥已生成</strong>
          <span class="warning-tag">仅显示一次</span>
        </div>
        <p class="warning-desc">离开当前页面后无法再次查看明文，请立即复制并写入客户端配置文件：</p>
        <div class="plain-input-row">
          <input type="text" readonly :value="newKeyPlain" class="plain-key-input" />
          <button
            type="button"
            class="btn copy-btn"
            @click="copyText(newKeyPlain, 'plain-key')"
          >
            {{ copySuccessTarget === 'plain-key' ? '已复制' : '复制密钥' }}
          </button>
        </div>
      </div>
    </section>

    <!-- 客户端接入模板卡片 -->
    <McpClientGuides :token="activeToken" :server-origin="serverOrigin" />

    <!-- 确认吊销弹窗 -->
    <AlertModal
      :show="showRevokeConfirm"
      title="停用 MCP 密钥"
      message="确认停用并吊销当前的 MCP 密钥？停用后，所有配置该密钥的外部 AI 客户端将无法继续访问主页工具。"
      type="warning"
      :show-cancel="true"
      cancel-text="取消"
      confirm-text="确认停用"
      @confirm="executeRevoke"
      @close="showRevokeConfirm = false"
    />

    <!-- 确认刷新弹窗 -->
    <AlertModal
      :show="showRefreshConfirm"
      title="重新生成密钥"
      message="重新生成将立即吊销现有密钥，使用旧密钥的外部助手将断开连接，确认继续？"
      type="warning"
      :show-cancel="true"
      cancel-text="取消"
      confirm-text="确认生成"
      @confirm="executeRefresh"
      @close="showRefreshConfirm = false"
    />
  </div>
</template>

<style scoped>
.mcp-settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.card {
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  padding: 20px;
  box-shadow: var(--lh-shadow-sm);
  backdrop-filter: blur(var(--lh-blur));
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.card-header h2 {
  font-size: 18px;
  margin: 0;
  color: var(--lh-text);
}

.subtitle {
  margin: 6px 0 0 0;
  font-size: 13px;
  color: var(--lh-text-secondary);
}

.key-status-area {
  margin-top: 12px;
  min-height: 80px;
}

.loading-state {
  padding: 16px;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-input-bg);
  border: 1px dashed var(--lh-border);
  font-size: 13px;
  color: var(--lh-text-secondary);
}

.loading-state p {
  margin: 0;
}

.mask-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--lh-input-bg);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
}

.mask-box code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
  color: var(--lh-text);
  letter-spacing: 1px;
}

.status-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
}

.status-tag.active {
  background: color-mix(in srgb, #10b981 15%, transparent);
  color: #10b981;
}

.time-meta {
  display: flex;
  gap: 24px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--lh-text-secondary);
}

.no-key-state {
  padding: 16px;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-input-bg);
  border: 1px dashed var(--lh-border);
  font-size: 13px;
  color: var(--lh-text-secondary);
}

.no-key-state p {
  margin: 0;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.btn {
  padding: 8px 16px;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  border: none;
  border-radius: var(--lh-radius-sm);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: opacity 0.15s ease;
}

.btn:hover:not(:disabled) {
  opacity: 0.9;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-revoke {
  padding: 8px 16px;
  background: transparent;
  color: var(--lh-danger);
  border: 1px solid var(--lh-danger);
  border-radius: var(--lh-radius-sm);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s ease;
}

.btn-revoke:hover:not(:disabled) {
  background: var(--lh-danger-bg);
}

.one-time-key-box {
  margin-top: 20px;
  padding: 16px;
  background: color-mix(in srgb, #f59e0b 10%, transparent);
  border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
  border-radius: var(--lh-radius-md);
}

.one-time-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  color: #d97706;
}

.warning-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f59e0b;
  color: #fff;
  font-weight: 500;
}

.warning-desc {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--lh-text);
}

.plain-input-row {
  display: flex;
  gap: 8px;
}

.plain-key-input {
  flex: 1;
  padding: 8px 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  color: var(--lh-text);
  outline: none;
}

.copy-btn {
  flex-shrink: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 13px;
  color: var(--lh-text-secondary);
}

.error-text {
  color: var(--lh-danger);
  font-size: 13px;
  margin: 0 0 12px 0;
}

.info-text {
  color: #10b981;
  font-size: 13px;
  margin: 0 0 12px 0;
}
</style>
