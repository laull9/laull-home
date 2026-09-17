<script setup lang="ts">
import type { Bookmark, BookmarkGroup } from "@laull-home/shared"

// 组件属性声明。
const props = defineProps<{
  show: boolean
  editingBookmark?: Bookmark | null
  groups: BookmarkGroup[]
  currentSpaceId: string
  targetGroupId?: string | null
}>()

// 组件事件派发。
const emit = defineEmits<{
  (e: "close"): void
  (e: "saved", bookmark?: Bookmark, isFolderAdd?: boolean, variant?: string): void
}>()

// 书签领域数据操作接口。
const { createBookmark, updateBookmark, fetchFavicon } = useBookmarks()

// 表单字段绑定。
const formTitle = ref("")
const formUrl = ref("")
const formIconUrl = ref("")
const formGroupId = ref("")
const formVariant = ref("")
const formIsPublic = ref(true)
const fetchingIcon = ref(false)
const errorMessage = ref("")
const submitting = ref(false)

// 监听编辑对象变化，同步表单状态。
watch(() => props.show, (showing) => {
  if (!showing) return
  errorMessage.value = ""
  formVariant.value = ""
  if (props.editingBookmark) {
    formTitle.value = props.editingBookmark.title
    formUrl.value = props.editingBookmark.url
    formIconUrl.value = props.editingBookmark.iconUrl
    formGroupId.value = props.editingBookmark.groupId ?? ""
    formIsPublic.value = props.editingBookmark.isPublic
  } else {
    formTitle.value = ""
    formUrl.value = ""
    formIconUrl.value = ""
    formGroupId.value = props.targetGroupId ?? ""
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
  if (!formTitle.value || !formUrl.value) {
    errorMessage.value = "请填写完整书签信息"
    return
  }
  submitting.value = true
  errorMessage.value = ""
  try {
    let url = formUrl.value.trim()
    if (!/^https?:\/\//i.test(url)) url = "https://" + url

    // 保存前补取缺失图标，抓取失败不阻止书签保存。
    if (!formIconUrl.value.trim()) {
      try { formIconUrl.value = await fetchFavicon(url) } catch { /* 保留本地默认图标。 */ }
    }

    const effectiveGroupId = formGroupId.value.trim() ? formGroupId.value.trim() : null
    let saved: Bookmark | undefined
    if (props.editingBookmark) {
      saved = await updateBookmark(props.editingBookmark.id, props.currentSpaceId, {
        groupId: effectiveGroupId,
        title: formTitle.value.trim(),
        url,
        iconUrl: formIconUrl.value.trim(),
        isPublic: formIsPublic.value,
      })
    } else {
      saved = await createBookmark(props.currentSpaceId, {
        groupId: effectiveGroupId ?? undefined,
        spaceId: props.currentSpaceId,
        title: formTitle.value.trim(),
        url,
        iconUrl: formIconUrl.value.trim(),
        isPublic: formIsPublic.value,
      })
    }
    const isFolderAdd = Boolean(props.targetGroupId || effectiveGroupId)
    emit("saved", saved, isFolderAdd, formVariant.value)
    emit("close")
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : "保存失败"
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseModal
    :show="show"
    :title="editingBookmark ? '编辑书签' : '快速添加书签'"
    max-width="480px"
    @close="emit('close')"
  >
    <form id="bookmark-form" class="bookmark-form" @submit.prevent="handleSubmit">
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
        <select v-model="formGroupId" :disabled="!!targetGroupId">
          <option value="">无（桌面独立图标）</option>
          <option v-for="g in groups" :key="g.id" :value="g.id">
            {{ g.name }}
          </option>
        </select>
      </div>

      <div v-if="!formGroupId" class="field">
        <label>显示方式</label>
        <select v-model="formVariant">
          <option value="">标准图标 (1×1 经典图标)</option>
          <option value="large">质感大图标 (1×1 纯净图标)</option>
          <option value="pill">胶囊信息卡 (横向药丸信息卡)</option>
          <option value="emblem">字母徽章 (1×1 字母徽标)</option>
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
    </form>

    <template #footer>
      <div class="modal-actions">
        <button type="button" class="btn-cancel" @click="emit('close')">取消</button>
        <button type="submit" form="bookmark-form" class="btn-submit" :disabled="submitting">
          {{ submitting ? "保存中..." : "保存" }}
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.bookmark-form {
  display: flex;
  flex-direction: column;
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
  color: var(--lh-danger);
  font-size: 13px;
  margin: 0 0 16px 0;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
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
.btn-cancel:hover {
  background: var(--lh-surface-hover);
  border-color: var(--lh-border-hover);
}
.btn-submit {
  padding: 8px 20px;
  border: 1px solid transparent;
  border-radius: var(--lh-radius-sm);
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  font-size: 14px;
  cursor: pointer;
}
.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
