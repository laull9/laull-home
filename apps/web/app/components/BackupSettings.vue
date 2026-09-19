<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { BackupSnapshotItem, VerifyBackupResult } from '@laull-home/shared'
import BackupSnapshotList from './BackupSnapshotList.vue'

const loading = ref(false)
const snapshots = ref<BackupSnapshotItem[]>([])
const message = ref('')
const error = ref('')

// 创建快照表单。
const includeSecrets = ref(false)
const encryptionPassword = ref('')
const creating = ref(false)

// 恢复演练校验弹窗。
const verifyResult = ref<VerifyBackupResult | null>(null)
const verifying = ref(false)
const verifyTarget = ref<string | null>(null)
const verifyPassword = ref('')
const showPasswordInput = ref(false)

// 加载快照列表。
async function loadSnapshots() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/api/v1/backups')
    if (!res.ok) {
      throw new Error('获取快照列表失败')
    }
    const data = await res.json()
    snapshots.value = data.snapshots ?? []
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '获取快照失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadSnapshots()
})

// 立即创建一致性快照。
async function handleCreateSnapshot() {
  creating.value = true
  message.value = ''
  error.value = ''

  if (includeSecrets.value && (!encryptionPassword.value || encryptionPassword.value.length < 8)) {
    error.value = '加密备份必须设置至少 8 位的加密密码'
    creating.value = false
    return
  }

  try {
    const res = await fetch('/api/v1/backups/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        includeSecrets: includeSecrets.value,
        encryptionPassword: includeSecrets.value ? encryptionPassword.value : undefined,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.message || '创建快照失败')
    }

    message.value = `快照 ${data.filename} 创建成功`
    encryptionPassword.value = ''
    includeSecrets.value = false
    await loadSnapshots()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '创建快照失败'
  } finally {
    creating.value = false
  }
}

// 删除快照。
async function handleDeleteSnapshot(filename: string) {
  if (!confirm(`确定要删除快照 ${filename} 吗？`)) return

  try {
    const res = await fetch(`/api/v1/backups/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      throw new Error('删除快照失败')
    }
    await loadSnapshots()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '删除失败'
  }
}

// 触发恢复演练验证。
async function handleVerifyClick(item: BackupSnapshotItem) {
  verifyTarget.value = item.filename
  if (item.encrypted) {
    showPasswordInput.value = true
    verifyPassword.value = ''
    return
  }
  await executeVerify(item.filename)
}

// 执行演练验证请求。
async function executeVerify(filename: string, password?: string) {
  verifying.value = true
  verifyResult.value = null
  showPasswordInput.value = false

  try {
    const res = await fetch('/api/v1/backups/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, password }),
    })
    const data = await res.json()
    verifyResult.value = data
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '演练验证失败'
  } finally {
    verifying.value = false
  }
}
</script>

<template>
  <div class="backup-settings">
    <!-- 头部说明与提示 -->
    <div class="header-card">
      <h3 class="section-title">数据库一致性快照与归档</h3>
      <div class="card-desc">
        在线备份采用 SQLite <code>VACUUM INTO</code> 机制，完整捕获事务数据并连同壁纸、图标等附件打包。
      </div>
    </div>

    <div v-if="message" class="toast-success">{{ message }}</div>
    <div v-if="error" class="toast-error">{{ error }}</div>

    <!-- 创建快照面板 -->
    <div class="create-card">
      <div class="create-title">创建新备份</div>
      <div class="options-row">
        <label class="checkbox-label">
          <input v-model="includeSecrets" type="checkbox" />
          <span>包含微服务凭据（生成加密备份）</span>
        </label>
      </div>

      <div v-if="includeSecrets" class="password-box">
        <input
          v-model="encryptionPassword"
          type="password"
          placeholder="输入至少 8 位备份加密密码..."
          class="input-pwd"
        />
        <div class="pwd-tip">加密备份恢复时必须提供此密码；若遗忘密码将无法解密凭据。</div>
      </div>

      <button
        type="button"
        class="btn-create"
        :disabled="creating"
        @click="handleCreateSnapshot"
      >
        {{ creating ? '快照生成与附件归档中...' : (includeSecrets ? '创建加密快照' : '创建默认脱敏快照') }}
      </button>
    </div>

    <!-- 演练校验密码输入浮层 -->
    <div v-if="showPasswordInput" class="modal-backdrop">
      <div class="modal-box">
        <h4>该备份已加密</h4>
        <input
          v-model="verifyPassword"
          type="password"
          placeholder="请输入创建时设置的密码..."
          class="input-pwd-modal"
          @keydown.enter="executeVerify(verifyTarget!, verifyPassword)"
        />
        <div class="modal-actions">
          <button type="button" class="btn-primary" @click="executeVerify(verifyTarget!, verifyPassword)">开始演练验证</button>
          <button type="button" class="btn-secondary" @click="showPasswordInput = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 演练校验结果面板 -->
    <div v-if="verifyResult" class="verify-card" :class="{ ok: verifyResult.valid, fail: !verifyResult.valid }">
      <div class="verify-header">
        <span class="verify-status">{{ verifyResult.valid ? '✓ 恢复演练通过' : '✕ 演练未通过' }}</span>
        <button type="button" class="btn-close-verify" @click="verifyResult = null">关闭</button>
      </div>
      <div class="verify-msg">{{ verifyResult.message }}</div>
      <div class="verify-details">
        <div>数据库完整性检查 (PRAGMA integrity_check)：{{ verifyResult.integrityOk ? '正常' : '异常' }}</div>
        <div v-if="verifyResult.dbVersion">快照迁移版本：v{{ verifyResult.dbVersion }}（当前程序最高支持 v{{ verifyResult.currentAppMaxVersion }}）</div>
        <div>归档附件数量：{{ verifyResult.attachmentCount }} 个文件</div>
        <div>敏感凭据状态：{{ verifyResult.secretsExcluded ? '已脱敏排除' : '包含在内（加密保护）' }}</div>
      </div>
    </div>

    <!-- 快照列表组件 -->
    <BackupSnapshotList
      :snapshots="snapshots"
      :loading="loading"
      :verifying="verifying"
      @verify="handleVerifyClick"
      @delete="handleDeleteSnapshot"
      @refresh="loadSnapshots"
    />

    <!-- 恢复说明指南 -->
    <div class="guide-card">
      <div class="guide-title">恢复演练与密钥恢复指引</div>
      <ul class="guide-list">
        <li><strong>默认脱敏备份</strong>：导出的快照数据库已清除微服务凭据密文，还原后需在微服务设置中重新输入 Token/密码。</li>
        <li><strong>加密备份恢复</strong>：使用基于密码加盐的 AES-256-GCM 加密，恢复时必须提供创建时设置的密码；密码遗失时仅能恢复基础主页数据。</li>
        <li><strong>停机离线恢复</strong>：生产环境还原建议停止服务进程，执行 <code>bun scripts/restore.ts &lt;备份文件&gt;</code> 自动检验完整性并落盘。</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.backup-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.header-card, .create-card, .guide-card {
  padding: 16px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: 8px;
}

.section-title, .create-title, .guide-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--lh-text);
  margin-bottom: 8px;
}

.card-desc {
  font-size: 12px;
  color: var(--lh-text-secondary);
  line-height: 1.5;
}

.options-row {
  margin: 10px 0;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--lh-text);
  cursor: pointer;
}

.password-box {
  margin: 10px 0;
}

.input-pwd, .input-pwd-modal {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid var(--lh-border);
  background: var(--lh-bg);
  color: var(--lh-text);
  box-sizing: border-box;
}

.pwd-tip {
  font-size: 11px;
  color: var(--lh-text-secondary);
  margin-top: 4px;
}

.btn-create, .btn-primary {
  padding: 8px 16px;
  font-size: 13px;
  border-radius: 6px;
  border: none;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  cursor: pointer;
}

.btn-secondary {
  padding: 8px 14px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid var(--lh-border);
  background: transparent;
  color: var(--lh-text);
  cursor: pointer;
}

.verify-card {
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--lh-border);
}

.verify-card.ok {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.3);
}

.verify-card.fail {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
}

.verify-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.verify-status {
  font-weight: 600;
  font-size: 13px;
}

.verify-msg {
  font-size: 12px;
  margin-bottom: 6px;
}

.verify-details {
  font-size: 11px;
  color: var(--lh-text-secondary);
  line-height: 1.6;
}

.btn-close-verify {
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--lh-text-secondary);
  cursor: pointer;
}

.guide-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--lh-text-secondary);
  line-height: 1.6;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-box {
  width: 320px;
  padding: 20px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: 8px;
}

.modal-box h4 {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--lh-text);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.toast-success {
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(34, 197, 94, 0.15);
  color: #15803d;
  font-size: 12px;
}

.toast-error {
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.15);
  color: #b91c1c;
  font-size: 12px;
}
</style>
