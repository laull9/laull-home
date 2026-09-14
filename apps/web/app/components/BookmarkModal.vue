<script setup lang="ts">
import type { Bookmark, BookmarkGroup } from "@laull-home/shared"

// 组件属性声明。
const props = defineProps<{
  show: boolean
  editingBookmark?: Bookmark | null
  groups: BookmarkGroup[]
  currentSpaceId: string
}>()

// 组件事件派发。
const emit = defineEmits<{
  (e: "close"): void
  (e: "saved"): void
}>()

const { createBookmark, updateBookmark, fetchFavicon } = useBookmarks()

// 表单字段绑定。
const formTitle = ref("")
const formUrl = ref("")
const formIconUrl = ref("")
const formGroupId = ref("")
const formIsPublic = ref(true)
const fetchingIcon = ref(false)
const errorMessage = ref("")
const submitting = ref(false)

// 监听编辑对象变化，同步表单状态。
watch(() => props.show, (showing) => {
  if (!showing) return
  errorMessage.value = ""
  if (props.editingBookmark) {
    formTitle.value = props.editingBookmark.title
    formUrl.value = props.editingBookmark.url
    formIconUrl.value = props.editingBookmark.iconUrl
    formGroupId.value = props.editingBookmark.groupId
    formIsPublic.value = props.editingBookmark.isPublic
  } else {
    formTitle.value = ""
    formUrl.value = ""
    formIconUrl.value = ""
    formGroupId.value = props.groups[0]?.id ?? ""
    formIsPublic.value = true
  }
})

// 自动探测站点 Favicon 图标。
async function handleFetchFavicon() {
  if (!formUrl.value) return
  fetchingIcon.value = true
  errorMessage.value = ""
  try {
    let url = formUrl.value.trim()
    if (!/^https?:\/\//i.test(url)) url = "https://" + url
    formUrl.value = url
    const cachedUrl = await fetchFavicon(url)
    if (cachedUrl) formIconUrl.value = cachedUrl
    if (!formTitle.value) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "")
        formTitle.value = host
      } catch {
        // 忽略主机名解析错误
      }
    }
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : "获取图标失败"
  } finally {
    fetchingIcon.value = false
  }
}

// 提交保存书签。
async function handleSubmit() {
  if (!formTitle.value || !formUrl.value || !formGroupId.value) {
    errorMessage.value = "请填写完整书签信息"
    return
  }
  submitting.value = true
  errorMessage.value = ""
  try {
    let url = formUrl.value.trim()
    if (!/^https?:\/\//i.test(url)) url = "https://" + url

    if (props.editingBookmark) {
      await updateBookmark(props.editingBookmark.id, props.currentSpaceId, {
        groupId: formGroupId.value,
        title: formTitle.value.trim(),
        url,
        iconUrl: formIconUrl.value.trim(),
        isPublic: formIsPublic.value,
      })
    } else {
      await createBookmark(props.currentSpaceId, {
        groupId: formGroupId.value,
        title: formTitle.value.trim(),
        url,
        iconUrl: formIconUrl.value.trim(),
        isPublic: formIsPublic.value,
      })
    }
    emit("saved")
    emit("close")
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : "保存失败"
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div v-if="show" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <h3>{{ editingBookmark ? "编辑书签" : "快速添加书签" }}</h3>
        <button type="button" class="btn-close" @click="emit('close')">×</button>
      </div>

      <form @submit.prevent="handleSubmit">
        <div class="field">
          <label>网页链接</label>
          <div class="url-input-group">
            <input
              v-model="formUrl"
              type="text"
              placeholder="例如 https://github.com"
              required
              @blur="!formIconUrl && handleFetchFavicon()"
            >
            <button
              type="button"
              class="btn-fetch"
              :disabled="fetchingIcon || !formUrl"
              @click="handleFetchFavicon"
            >
              {{ fetchingIcon ? "获取中..." : "探测图标" }}
            </button>
          </div>
        </div>

        <div class="field">
          <label>书签名称</label>
          <input v-model="formTitle" type="text" placeholder="书签显示名称" required>
        </div>

        <div class="field">
          <label>所属分组</label>
          <select v-model="formGroupId" required>
            <option v-for="g in groups" :key="g.id" :value="g.id">
              {{ g.name }}
            </option>
          </select>
        </div>

        <div class="field">
          <label>图标链接（可选）</label>
          <div class="icon-preview-row">
            <img
              v-if="formIconUrl"
              :src="formIconUrl"
              alt="预览"
              class="icon-preview"
              @error="formIconUrl = ''"
            >
            <input v-model="formIconUrl" type="text" placeholder="输入图标地址或使用上方探测">
          </div>
        </div>

        <div v-if="currentSpaceId === 'default'" class="checkbox-field">
          <label>
            <input v-model="formIsPublic" type="checkbox">
            公开此书签（未登录访客可见）
          </label>
        </div>

        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="emit('close')">取消</button>
          <button type="submit" class="btn-submit" :disabled="submitting">
            {{ submitting ? "保存中..." : "保存" }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-card {
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  box-shadow: var(--lh-shadow-card);
  width: 90%;
  max-width: 480px;
  padding: 24px;
  color: var(--lh-text);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.modal-header h3 {
  margin: 0;
  font-size: 18px;
}
.btn-close {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--lh-text-secondary);
  cursor: pointer;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
.field label {
  font-size: 13px;
  color: var(--lh-text-secondary);
}
.field input, .field select {
  padding: 10px 12px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-bg);
  color: var(--lh-text);
  font-size: 14px;
}
.url-input-group {
  display: flex;
  gap: 8px;
}
.url-input-group input {
  flex: 1;
}
.btn-fetch {
  padding: 0 14px;
  background: var(--lh-surface-hover);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  color: var(--lh-text);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.btn-fetch:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.icon-preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.icon-preview-row input {
  flex: 1;
}
.icon-preview {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--lh-border);
}
.checkbox-field {
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--lh-text-secondary);
}
.checkbox-field label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.error-text {
  color: #ef4444;
  font-size: 13px;
  margin: 0 0 16px 0;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}
.btn-cancel {
  padding: 8px 16px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-surface);
  color: var(--lh-text);
  font-size: 14px;
  cursor: pointer;
}
.btn-submit {
  padding: 8px 20px;
  border: none;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  font-size: 14px;
  cursor: pointer;
}
</style>
