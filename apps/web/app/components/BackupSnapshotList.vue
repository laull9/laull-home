<script setup lang="ts">
import type { BackupSnapshotItem } from '@laull-home/shared'

// 备份快照列表组件属性。
defineProps<{
  snapshots: BackupSnapshotItem[]
  loading: boolean
  verifying: boolean
}>()

// 备份快照列表事件声明。
const emit = defineEmits<{
  verify: [item: BackupSnapshotItem]
  delete: [filename: string]
  refresh: []
}>()

// 格式化文件体积大小。
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

// 格式化时间戳。
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}
</script>

<template>
  <div class="snapshots-card">
    <div class="snapshots-title">
      <span>已有快照历史</span>
      <button type="button" class="btn-refresh" @click="emit('refresh')">刷新</button>
    </div>

    <div v-if="loading" class="empty-tip">加载中...</div>
    <div v-else-if="snapshots.length === 0" class="empty-tip">暂无备份快照</div>
    <div v-else class="snapshot-list">
      <div v-for="item in snapshots" :key="item.filename" class="snapshot-item">
        <div class="item-info">
          <div class="item-name">
            <span>{{ item.filename }}</span>
            <span v-if="item.encrypted" class="badge enc">加密</span>
            <span v-else class="badge safe">脱敏</span>
          </div>
          <div class="item-meta">
            {{ formatDate(item.createdAt) }} · {{ formatSize(item.sizeBytes) }}
          </div>
        </div>
        <div class="item-actions">
          <button
            type="button"
            class="btn-act"
            :disabled="verifying"
            @click="emit('verify', item)"
          >
            演练校验
          </button>
          <a
            :href="`/api/v1/backups/download/${encodeURIComponent(item.filename)}`"
            download
            class="btn-act download"
          >
            下载
          </a>
          <button
            type="button"
            class="btn-act del"
            @click="emit('delete', item.filename)"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.snapshots-card {
  padding: 16px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: 8px;
}

.snapshots-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--lh-text);
  margin-bottom: 8px;
}

.btn-refresh {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--lh-border);
  background: transparent;
  color: var(--lh-text-secondary);
  cursor: pointer;
}

.snapshot-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.snapshot-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--lh-bg);
  border: 1px solid var(--lh-border);
  border-radius: 6px;
}

.item-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--lh-text);
}

.badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
}

.badge.enc {
  background: rgba(147, 51, 234, 0.15);
  color: #9333ea;
}

.badge.safe {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.item-meta {
  font-size: 11px;
  color: var(--lh-text-secondary);
  margin-top: 2px;
}

.item-actions {
  display: flex;
  gap: 6px;
}

.btn-act {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid var(--lh-border);
  background: var(--lh-surface);
  color: var(--lh-text);
  cursor: pointer;
  text-decoration: none;
}

.btn-act.del {
  color: #ef4444;
}

.btn-act.del:hover {
  border-color: #ef4444;
}

.empty-tip {
  text-align: center;
  padding: 24px;
  font-size: 12px;
  color: var(--lh-text-secondary);
}
</style>
