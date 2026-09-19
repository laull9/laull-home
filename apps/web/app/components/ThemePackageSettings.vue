<script setup lang="ts">
import { ref } from 'vue'

const uploading = ref(false)
const exporting = ref(false)
const message = ref('')
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const themeExportName = ref('')

// 触发文件选择框。
function triggerFileSelect() {
  fileInput.value?.click()
}

// 上传并导入主题包。
async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  uploading.value = true
  message.value = ''
  error.value = ''

  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('apply', 'true')

    const response = await fetch('/api/v1/themes/import', {
      method: 'POST',
      body: formData,
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.message || '主题包导入失败')
    }

    message.value = `主题包“${data.manifest.name}”导入并应用成功`
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '主题包导入发生异常'
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

// 导出当前主题包 ZIP 下载。
async function handleExportTheme() {
  exporting.value = true
  message.value = ''
  error.value = ''

  try {
    const name = themeExportName.value.trim() || '我的主题'
    const res = await fetch(`/api/v1/themes/export?name=${encodeURIComponent(name)}`)
    if (!res.ok) {
      const errJson = await res.json()
      throw new Error(errJson.message || '导出主题失败')
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `laull-theme-${name}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    message.value = '主题包导出下载成功'
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '导出主题失败'
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="theme-package-card">
    <div class="card-header">
      <h3 class="section-title">主题包导入与导出</h3>
    </div>

    <div v-if="message" class="toast-success">{{ message }}</div>
    <div v-if="error" class="toast-error">{{ error }}</div>

    <div class="card-body">
      <!-- 隐藏的文件选择器 -->
      <input
        ref="fileInput"
        type="file"
        accept=".zip"
        class="hidden-file-input"
        @change="handleFileChange"
      />

      <div class="actions-grid">
        <div class="action-box">
          <div class="action-label">导入第三方主题包</div>
          <button
            type="button"
            class="btn-primary"
            :disabled="uploading"
            @click="triggerFileSelect"
          >
            {{ uploading ? '安全校验与导入中...' : '选择 ZIP 主题包上传' }}
          </button>
        </div>

        <div class="action-box">
          <div class="action-label">导出当前主题包</div>
          <div class="export-row">
            <input
              v-model="themeExportName"
              type="text"
              class="input-text"
              placeholder="自定义主题名称..."
              maxlength="30"
            />
            <button
              type="button"
              class="btn-secondary"
              :disabled="exporting"
              @click="handleExportTheme"
            >
              {{ exporting ? '打包中...' : '导出 ZIP' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.theme-package-card {
  padding: 16px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: 8px;
  margin-top: 16px;
}

.card-header {
  margin-bottom: 12px;
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--lh-text);
}

.hidden-file-input {
  display: none;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.action-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--lh-text-secondary);
}

.export-row {
  display: flex;
  gap: 8px;
}

.input-text {
  flex: 1;
  padding: 6px 10px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid var(--lh-border);
  background: var(--lh-bg);
  color: var(--lh-text);
}

.btn-primary {
  padding: 6px 14px;
  font-size: 13px;
  border-radius: 6px;
  border: none;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 6px 14px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid var(--lh-border);
  background: var(--lh-surface);
  color: var(--lh-text);
  cursor: pointer;
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.toast-success {
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(34, 197, 94, 0.15);
  color: #15803d;
  font-size: 12px;
  margin-bottom: 12px;
}

.toast-error {
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.15);
  color: #b91c1c;
  font-size: 12px;
  margin-bottom: 12px;
}
</style>
