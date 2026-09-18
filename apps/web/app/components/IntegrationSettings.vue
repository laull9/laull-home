<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { IntegrationItem, IntegrationManifest, IntegrationAuthType } from '@laull-home/shared'

const { $api } = useNuxtApp()

const list = ref<IntegrationItem[]>([])
const loading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

// 新建或编辑表单状态。
const showModal = ref(false)
const isEditing = ref(false)
const editId = ref('')
const formName = ref('')
const formSlug = ref('')
const formBaseUrl = ref('')
const formAuthType = ref<IntegrationAuthType>('none')
const formSecret = ref('')
const formAllowedHosts = ref('')
const formTimeout = ref(5000)
const formMaxConcurrency = ref(5)
const discoveredManifest = ref<IntegrationManifest | null>(null)
const discovering = ref(false)
const formError = ref('')

// 主密钥轮换表单。
const showRotateModal = ref(false)
const oldMasterKey = ref('')
const newMasterKey = ref('')
const rotateMsg = ref('')
const rotateError = ref('')

// 加载微服务列表。
async function loadIntegrations() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await $api.integrations.get({})
    if (res.data?.integrations) {
      list.value = res.data.integrations
    }
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '读取微服务列表失败'
  } finally {
    loading.value = false
  }
}

// 探测并发现微服务清单。
async function handleDiscover() {
  formError.value = ''
  if (!formBaseUrl.value.trim()) {
    formError.value = '请输入微服务基准地址'
    return
  }
  discovering.value = true
  try {
    const hosts = formAllowedHosts.value.split(',').map(s => s.trim()).filter(Boolean)
    const res = await $api.integrations.discover.post({
      baseUrl: formBaseUrl.value.trim(),
      authType: formAuthType.value,
      secret: formSecret.value ? formSecret.value.trim() : undefined,
      allowedHosts: hosts.length > 0 ? hosts : undefined,
    })
    if (res.error) {
      formError.value = (res.error.value as { message?: string })?.message || '探测微服务清单失败'
      return
    }
    discoveredManifest.value = (res.data as { manifest: IntegrationManifest })?.manifest ?? null
    if (discoveredManifest.value) {
      if (!formName.value) formName.value = discoveredManifest.value.name
      if (!formSlug.value) formSlug.value = discoveredManifest.value.id
    }
  } catch (err: unknown) {
    formError.value = err instanceof Error ? err.message : '探测连接失败'
  } finally {
    discovering.value = false
  }
}

// 打开新增弹窗。
function openAddModal() {
  isEditing.value = false
  editId.value = ''
  formName.value = ''
  formSlug.value = ''
  formBaseUrl.value = ''
  formAuthType.value = 'none'
  formSecret.value = ''
  formAllowedHosts.value = ''
  formTimeout.value = 5000
  formMaxConcurrency.value = 5
  discoveredManifest.value = null
  formError.value = ''
  showModal.value = true
}

// 保存微服务配置。
async function handleSaveIntegration() {
  formError.value = ''
  if (!formName.value.trim() || !formSlug.value.trim() || !formBaseUrl.value.trim()) {
    formError.value = '请填写完整名称、代号与基准地址'
    return
  }
  const hosts = formAllowedHosts.value.split(',').map(s => s.trim()).filter(Boolean)

  try {
    if (isEditing.value) {
      const res = await $api.integrations({ id: editId.value }).put({
        name: formName.value.trim(),
        slug: formSlug.value.trim(),
        baseUrl: formBaseUrl.value.trim(),
        authType: formAuthType.value,
        allowedHosts: hosts.length > 0 ? hosts : undefined,
        timeout: formTimeout.value,
        maxConcurrency: formMaxConcurrency.value,
        secret: formSecret.value ? formSecret.value.trim() : undefined,
      })
      if (res.error) {
        formError.value = (res.error.value as { message?: string })?.message || '更新微服务失败'
        return
      }
    } else {
      const res = await $api.integrations.post({
        name: formName.value.trim(),
        slug: formSlug.value.trim(),
        baseUrl: formBaseUrl.value.trim(),
        authType: formAuthType.value,
        allowedHosts: hosts.length > 0 ? hosts : undefined,
        timeout: formTimeout.value,
        maxConcurrency: formMaxConcurrency.value,
        secret: formSecret.value ? formSecret.value.trim() : undefined,
      })
      if (res.error) {
        formError.value = (res.error.value as { message?: string })?.message || '创建微服务失败'
        return
      }
    }
    showModal.value = false
    await loadIntegrations()
  } catch (err: unknown) {
    formError.value = err instanceof Error ? err.message : '保存失败'
  }
}

// 删除微服务。
async function handleDelete(id: string) {
  if (!confirm('确定要删除此微服务接入吗？')) return
  try {
    await $api.integrations({ id }).delete()
    await loadIntegrations()
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '删除失败'
  }
}

// 执行主密钥轮换。
async function handleRotateKeys() {
  rotateError.value = ''
  rotateMsg.value = ''
  if (!oldMasterKey.value || !newMasterKey.value) {
    rotateError.value = '请提供旧主密钥和新主密钥'
    return
  }
  try {
    const res = await $api.integrations['rotate-key'].post({
      oldMasterKey: oldMasterKey.value,
      newMasterKey: newMasterKey.value,
    })
    if (res.error) {
      rotateError.value = (res.error.value as { message?: string })?.message || '轮换失败'
      return
    }
    rotateMsg.value = `主密钥轮换成功，已更新 ${(res.data as { count: number })?.count ?? 0} 个加密凭据`
    oldMasterKey.value = ''
    newMasterKey.value = ''
  } catch (err: unknown) {
    rotateError.value = err instanceof Error ? err.message : '轮换失败'
  }
}

onMounted(() => {
  void loadIntegrations()
})
</script>

<template>
  <div class="integration-settings">
    <div class="card-header">
      <div>
        <h2>微服务接入</h2>
        <span class="sub-text">连接自托管受控服务，安全代理指标与动作</span>
      </div>
      <div class="header-actions">
        <button type="button" class="btn-secondary" @click="showRotateModal = true">密钥轮换</button>
        <button type="button" class="btn" @click="openAddModal">+ 接入服务</button>
      </div>
    </div>

    <p v-if="errorMsg" class="error-text">{{ errorMsg }}</p>
    <p v-if="successMsg" class="info-text">{{ successMsg }}</p>

    <!-- 微服务卡片列表 -->
    <div v-if="list.length === 0 && !loading" class="empty-list">
      暂未接入任何微服务。点击“接入服务”开始连接您的第一个私有服务。
    </div>

    <div v-else class="service-list">
      <div v-for="item in list" :key="item.id" class="service-card">
        <div class="service-header">
          <div class="service-title-box">
            <span class="service-name">{{ item.name }}</span>
            <span class="service-slug">({{ item.slug }})</span>
            <span class="badge" :class="item.authType">{{ item.authType }}</span>
            <span v-if="item.hasSecret" class="badge-secret">已配凭据</span>
          </div>
          <button type="button" class="btn-delete" @click="handleDelete(item.id)">删除</button>
        </div>

        <div class="service-details">
          <span class="url-text">基准地址: {{ item.baseUrl }}</span>
          <span class="stat-text">小部件: {{ item.manifest?.widgets?.length ?? 0 }} 个 | 操作动作: {{ item.manifest?.actions?.length ?? 0 }} 个</span>
        </div>
      </div>
    </div>

    <!-- 接入微服务弹窗 -->
    <BaseModal :show="showModal" :title="isEditing ? '修改微服务接入' : '接入新微服务'" max-width="580px" @close="showModal = false">
      <form class="modal-form" @submit.prevent="handleSaveIntegration">
        <div class="field">
          <label>基准地址 (Base URL)</label>
          <div class="input-with-btn">
            <input v-model="formBaseUrl" type="url" placeholder="http://192.168.1.100:8080 或 http://ltrade:8080" required>
            <button type="button" class="btn-secondary" :disabled="discovering" @click="handleDiscover">
              {{ discovering ? '探测中...' : '发现清单' }}
            </button>
          </div>
        </div>

        <div class="form-row">
          <div class="field">
            <label>认证方式</label>
            <select v-model="formAuthType">
              <option value="none">无 (None)</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth</option>
              <option value="api-key">API Key (X-API-Key)</option>
            </select>
          </div>
          <div class="field">
            <label>认证凭据 (Secret)</label>
            <input v-model="formSecret" type="password" placeholder="仅保存在后端密文库">
          </div>
        </div>

        <div class="form-row">
          <div class="field">
            <label>服务名称</label>
            <input v-model="formName" type="text" placeholder="例如：LTrade 交易服务" required>
          </div>
          <div class="field">
            <label>唯一代号 (Slug)</label>
            <input v-model="formSlug" type="text" placeholder="ltrade" pattern="^[a-zA-Z0-9_-]+$" required>
          </div>
        </div>

        <div class="field">
          <label>目标允许主机 (逗号分隔，缺省自动包含 BaseURL 主机)</label>
          <input v-model="formAllowedHosts" type="text" placeholder="ltrade:8080, 192.168.1.100:8080">
        </div>

        <div class="form-row">
          <div class="field">
            <label>超时时间 (毫秒)</label>
            <input v-model.number="formTimeout" type="number" min="500" max="30000" step="500">
          </div>
          <div class="field">
            <label>最大并发请求数</label>
            <input v-model.number="formMaxConcurrency" type="number" min="1" max="20">
          </div>
        </div>

        <!-- 发现的清单预览 -->
        <div v-if="discoveredManifest" class="manifest-preview">
          <h4>已解析清单: {{ discoveredManifest.name }}</h4>
          <span class="manifest-stat">包含 {{ discoveredManifest.widgets.length }} 个可用小部件，{{ discoveredManifest.actions?.length ?? 0 }} 个操作动作</span>
        </div>

        <p v-if="formError" class="error-text">{{ formError }}</p>

        <div class="modal-actions">
          <button type="button" class="btn-secondary" @click="showModal = false">取消</button>
          <button type="submit" class="btn">确认接入</button>
        </div>
      </form>
    </BaseModal>

    <!-- 主密钥轮换弹窗 -->
    <BaseModal :show="showRotateModal" title="微服务凭据主密钥轮换" max-width="500px" @close="showRotateModal = false">
      <form class="modal-form" @submit.prevent="handleRotateKeys">
        <div class="field">
          <label>当前旧主密钥</label>
          <input v-model="oldMasterKey" type="password" required>
        </div>
        <div class="field">
          <label>新主密钥</label>
          <input v-model="newMasterKey" type="password" minlength="16" required>
        </div>
        <p v-if="rotateError" class="error-text">{{ rotateError }}</p>
        <p v-if="rotateMsg" class="info-text">{{ rotateMsg }}</p>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" @click="showRotateModal = false">关闭</button>
          <button type="submit" class="btn">执行轮换</button>
        </div>
      </form>
    </BaseModal>
  </div>
</template>

<style scoped>
.integration-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.card-header h2 {
  font-size: 18px;
  margin: 0 0 4px 0;
  color: var(--lh-text);
}

.sub-text {
  font-size: 13px;
  color: var(--lh-text-secondary);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.empty-list {
  padding: 32px;
  text-align: center;
  color: var(--lh-text-secondary);
  border: 1px dashed var(--lh-border);
  border-radius: var(--lh-radius-md);
  font-size: 14px;
}

.service-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.service-card {
  padding: 14px 16px;
  background: var(--lh-surface-hover);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-md);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.service-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.service-title-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.service-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--lh-text);
}

.service-slug {
  font-size: 12px;
  color: var(--lh-text-secondary);
}

.badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  color: var(--lh-text-secondary);
}

.badge-secret {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--lh-success) 20%, transparent);
  color: var(--lh-success);
}

.btn-delete {
  padding: 3px 8px;
  font-size: 12px;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-danger-bg);
  color: var(--lh-danger);
  border: 1px solid var(--lh-danger-border);
  cursor: pointer;
}

.service-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--lh-text-secondary);
}

.url-text {
  font-family: monospace;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
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

.field input, .field select {
  padding: 8px 10px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-input-bg);
  color: var(--lh-text);
  font-size: 13px;
  outline: none;
}

.input-with-btn {
  display: flex;
  gap: 8px;
}

.input-with-btn input {
  flex: 1;
}

.manifest-preview {
  padding: 10px 12px;
  background: color-mix(in srgb, var(--lh-accent) 10%, transparent);
  border: 1px solid var(--lh-accent);
  border-radius: var(--lh-radius-sm);
}

.manifest-preview h4 {
  margin: 0 0 4px 0;
  font-size: 13px;
  color: var(--lh-accent);
}

.manifest-stat {
  font-size: 12px;
  color: var(--lh-text);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.btn {
  padding: 8px 16px;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  border: none;
  border-radius: var(--lh-radius-sm);
  cursor: pointer;
  font-size: 13px;
}

.btn-secondary {
  padding: 8px 14px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  color: var(--lh-text);
  cursor: pointer;
  font-size: 13px;
}

.info-text {
  color: var(--lh-success);
  font-size: 13px;
}

.error-text {
  color: var(--lh-danger);
  font-size: 13px;
}
</style>
