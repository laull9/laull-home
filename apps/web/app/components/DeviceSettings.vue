<script setup lang="ts">
import { type SessionItem } from '@laull-home/shared'

// 设备会话操作。
const { fetchSessions, revokeSession, revokeOthers } = useAuth()

// 设备会话列表。
const sessions = ref<SessionItem[]>([])
// 操作提示信息。
const sessionsMsg = ref('')

// 刷新设备列表。
async function loadSessions() {
  try {
    sessions.value = await fetchSessions()
  } catch {
    sessionsMsg.value = '读取设备失败'
  }
}

// 撤销指定设备。
async function handleRevokeSession(id: string) {
  try {
    await revokeSession(id)
    await loadSessions()
  } catch {
    sessionsMsg.value = '撤销设备失败'
  }
}

// 撤销其他全部设备。
async function handleRevokeOthers() {
  try {
    await revokeOthers()
    await loadSessions()
  } catch {
    sessionsMsg.value = '撤销其他设备失败'
  }
}

// 挂载时加载设备列表。
onMounted(async () => {
  await loadSessions()
})
</script>

<template>
  <section class="card">
    <div class="card-header">
      <h2>活动设备</h2>
      <button type="button" class="btn-secondary" @click="handleRevokeOthers">
        撤销其他设备
      </button>
    </div>
    <p v-if="sessionsMsg" class="info-text">
      {{ sessionsMsg }}
    </p>
    <ul class="session-list">
      <li v-for="item in sessions" :key="item.id" class="session-item">
        <div class="session-info">
          <span class="user-agent">{{ item.userAgent || '未知设备' }}</span>
          <span v-if="item.isCurrent" class="tag-current">当前设备</span>
        </div>
        <button
          v-if="!item.isCurrent"
          type="button"
          class="btn-revoke"
          @click="handleRevokeSession(item.id)"
        >
          撤销
        </button>
      </li>
    </ul>
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
.card h2 { font-size: 18px; margin: 0; color: var(--lh-text); }
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.btn-secondary {
  padding: 6px 12px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  color: var(--lh-text);
  cursor: pointer;
  font-size: 13px;
}
.btn-revoke {
  padding: 4px 10px;
  background: var(--lh-danger-bg);
  color: var(--lh-danger);
  border: 1px solid var(--lh-danger-border);
  border-radius: var(--lh-radius-sm);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}
.btn-revoke:hover {
  background: color-mix(in srgb, var(--lh-danger) 22%, transparent);
}
.session-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.session-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--lh-surface-hover);
  border-radius: var(--lh-radius-sm);
}
.session-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.tag-current {
  font-size: 12px;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  padding: 2px 6px;
  border-radius: 4px;
}
.info-text { color: var(--lh-success); font-size: 13px; margin: 6px 0; }
</style>
