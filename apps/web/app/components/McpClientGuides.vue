<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  // 当前使用的密钥或占位符。
  token: string
  // 当前服务主机根地址。
  serverOrigin: string
}>()

// 复制成功目标标识。
const copySuccessTarget = ref<string | null>(null)
// 复制错误提示。
const copyError = ref('')

// 写入剪贴板。
async function copyText(text: string, targetId: string) {
  copyError.value = ''
  try {
    if (typeof window !== 'undefined' && window.navigator?.clipboard) {
      await window.navigator.clipboard.writeText(text)
      copySuccessTarget.value = targetId
      setTimeout(() => {
        if (copySuccessTarget.value === targetId) copySuccessTarget.value = null
      }, 2000)
    }
  } catch {
    copyError.value = '复制失败，请手动选取代码块复制'
  }
}

// Cursor 客户端远程 SSE 配置。
const cursorConfigJson = computed(() => {
  const origin = props.serverOrigin || 'http://localhost:3000'
  return JSON.stringify({
    mcpServers: {
      'laull-home': {
        url: `${origin}/api/v1/mcp/sse`,
        headers: {
          Authorization: `Bearer ${props.token}`,
        },
      },
    },
  }, null, 2)
})

// Claude Desktop 客户端本地 Stdio 配置。
const claudeStdioConfigJson = computed(() => {
  return JSON.stringify({
    mcpServers: {
      'laull-home': {
        command: 'bun',
        args: ['run', 'mcp'],
      },
    },
  }, null, 2)
})
</script>

<template>
  <section class="card">
    <div class="card-header">
      <h2>客户端配置指引</h2>
    </div>

    <p v-if="copyError" class="error-text">{{ copyError }}</p>

    <div class="config-tabs">
      <!-- Cursor 远程 SSE 方式 -->
      <div class="config-block">
        <div class="config-header">
          <div>
            <h3>Cursor (远程 SSE)</h3>
            <p class="config-desc">通过 SSE 实时协议远程连接，适合全平台 Cursor 编辑器</p>
          </div>
          <button
            type="button"
            class="btn-secondary"
            @click="copyText(cursorConfigJson, 'cursor-config')"
          >
            {{ copySuccessTarget === 'cursor-config' ? '已复制 JSON' : '复制配置' }}
          </button>
        </div>
        <pre class="code-block"><code>{{ cursorConfigJson }}</code></pre>
      </div>

      <!-- Claude Desktop 本地 Stdio 方式 -->
      <div class="config-block">
        <div class="config-header">
          <div>
            <h3>Claude Desktop / 本地 Stdio</h3>
            <p class="config-desc">在与 laull-home 相同主机环境下通过标准输入输出交互</p>
          </div>
          <button
            type="button"
            class="btn-secondary"
            @click="copyText(claudeStdioConfigJson, 'stdio-config')"
          >
            {{ copySuccessTarget === 'stdio-config' ? '已复制 JSON' : '复制配置' }}
          </button>
        </div>
        <pre class="code-block"><code>{{ claudeStdioConfigJson }}</code></pre>
      </div>
    </div>
  </section>
</template>

<style scoped>
.card {
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  padding: 20px;
  box-shadow: var(--lh-shadow-sm);
  backdrop-filter: blur(var(--lh-blur));
}

.card-header h2 {
  font-size: 18px;
  margin: 0 0 16px 0;
  color: var(--lh-text);
}

.config-tabs {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.config-header h3 {
  font-size: 14px;
  margin: 0;
  color: var(--lh-text);
}

.config-desc {
  margin: 4px 0 0 0;
  font-size: 12px;
  color: var(--lh-text-secondary);
}

.code-block {
  margin: 0;
  padding: 12px 14px;
  background: var(--lh-input-bg);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--lh-text);
}

.btn-secondary {
  padding: 6px 12px;
  background: var(--lh-surface);
  color: var(--lh-text);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s ease;
}

.btn-secondary:hover {
  background: var(--lh-surface-hover);
}

.error-text {
  color: var(--lh-danger);
  font-size: 13px;
  margin: 0 0 12px 0;
}
</style>
