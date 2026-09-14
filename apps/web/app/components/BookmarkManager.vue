<script setup lang="ts">
import type { Bookmark, BookmarkGroup } from '@laull-home/shared'

// 保留完整书签与分组管理入口。
const props = defineProps<{ show: boolean; spaceId: string }>()
// 管理窗口关闭事件。
const emit = defineEmits<{ close: [] }>()
// 复用已有数据服务及编辑对话框。
const { groups, bookmarks, createGroup, updateGroup, deleteGroup, deleteBookmark } = useBookmarks()
const editing = ref<Bookmark | null>(null)
const showBookmark = ref(false)
const showGroup = ref(false)
const group = ref<BookmarkGroup | null>(null)
const name = ref('')
const error = ref('')
// 选择新建或已有分组。
function editGroup(value: BookmarkGroup | null) { group.value = value; name.value = value?.name ?? ''; showGroup.value = true }
// 保存分组后保留管理面板。
async function saveGroup(value?: string) {
  try {
    if (group.value) await updateGroup(group.value.id, props.spaceId, { name: value ?? name.value })
    else await createGroup({ spaceId: props.spaceId, name: value ?? name.value })
    showGroup.value = false
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '保存失败' }
}
// 删除前明确目标及级联效果。
async function removeGroup(value: BookmarkGroup) {
  if (!confirm('删除分组「' + value.name + '」及其中全部书签？')) return
  try { await deleteGroup(value.id, props.spaceId) } catch (cause) { error.value = cause instanceof Error ? cause.message : '删除失败' }
}
// 删除单个书签。
async function removeBookmark(value: Bookmark) {
  if (!confirm('删除书签「' + value.title + '」？')) return
  try { await deleteBookmark(value.id, props.spaceId) } catch (cause) { error.value = cause instanceof Error ? cause.message : '删除失败' }
}
</script>
<template>
  <BaseModal :show="show" title="书签与分组" max-width="900px" @close="emit('close')">
    <p v-if="error" role="alert">{{ error }}</p>
    <BookmarkGroupSection :groups="groups" :bookmarks="bookmarks" :is-edit-mode="true" :is-visitor="false" @create-group="editGroup(null)" @edit-group="editGroup" @delete-group="removeGroup" @add-bookmark="editing = null; showBookmark = true" @edit-bookmark="editing = $event; showBookmark = true" @delete-bookmark="removeBookmark" />
  </BaseModal>
  <GroupPromptModal :show="showGroup" :title="group ? '修改分组' : '新建分组'" v-model="name" @close="showGroup = false" @save="saveGroup" />
  <BookmarkModal :show="showBookmark" :editing-bookmark="editing" :groups="groups" :current-space-id="spaceId" @close="showBookmark = false" />
</template>
