<script setup lang="ts">
import type { Bookmark, BookmarkGroup } from "@laull-home/shared"

// 组件属性声明。
const props = defineProps<{
  groups: BookmarkGroup[]
  bookmarks: Bookmark[]
  isEditMode: boolean
}>()

// 组件事件派发。
const emit = defineEmits<{
  (e: "editBookmark", bm: Bookmark): void
  (e: "deleteBookmark", bm: Bookmark): void
  (e: "createGroup"): void
  (e: "editGroup", group: BookmarkGroup): void
  (e: "deleteGroup", group: BookmarkGroup): void
  (e: "addBookmark"): void
}>()

// 按分组过滤书签列表。
function getBookmarksForGroup(groupId: string): Bookmark[] {
  return props.bookmarks.filter(b => b.groupId === groupId)
}
</script>

<template>
  <div class="groups-container">
    <div v-if="groups.length === 0" class="empty-state">
      <p>暂无书签分组</p>
      <button type="button" class="btn-accent" @click="emit('createGroup')">
        创建第一个分组
      </button>
    </div>

    <div v-for="group in groups" :key="group.id" class="group-block">
      <div class="group-header">
        <h3 class="group-title">{{ group.name }}</h3>
        <div v-if="isEditMode" class="group-actions">
          <button type="button" class="btn-group-action" @click="emit('editGroup', group)">重命名</button>
          <button type="button" class="btn-group-action text-danger" @click="emit('deleteGroup', group)">删除</button>
        </div>
      </div>

      <div class="bookmark-grid">
        <div
          v-for="bm in getBookmarksForGroup(group.id)"
          :key="bm.id"
          class="bookmark-card"
          :class="{ 'in-edit': isEditMode }"
        >
          <a
            :href="isEditMode ? undefined : bm.url"
            :target="isEditMode ? undefined : '_blank'"
            rel="noopener noreferrer"
            class="bookmark-link"
          >
            <div class="icon-box">
              <BookmarkIcon :title="bm.title" :icon-url="bm.iconUrl" />
            </div>
            <span class="bookmark-title" :title="bm.title">{{ bm.title }}</span>
          </a>

          <div v-if="isEditMode" class="card-edit-overlay">
            <button type="button" class="btn-card-edit" title="编辑" @click="emit('editBookmark', bm)">✎</button>
            <button type="button" class="btn-card-del" title="删除" @click="emit('deleteBookmark', bm)">×</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.groups-container {
  display: flex;
  flex-direction: column;
  gap: 36px;
}
.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--lh-border);
  padding-bottom: 6px;
}
.group-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--lh-text);
}
.group-actions {
  display: flex;
  gap: 6px;
}
.btn-group-action {
  padding: 2px 8px;
  border: 1px solid var(--lh-border);
  border-radius: 4px;
  background: var(--lh-surface);
  font-size: 12px;
  color: var(--lh-text-secondary);
  cursor: pointer;
}
.btn-group-action.text-danger {
  color: var(--lh-danger);
}
.btn-group-action.text-danger:hover {
  background: var(--lh-danger-bg);
  border-color: var(--lh-danger-border);
}
.bookmark-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 16px;
}
@media (min-width: 768px) {
  .bookmark-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 20px;
  }
}
.bookmark-card {
  position: relative;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  padding: 16px 10px;
  text-align: center;
  box-shadow: var(--lh-shadow-card);
  backdrop-filter: blur(var(--lh-blur));
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.bookmark-card:hover {
  transform: translateY(-3px);
  background: var(--lh-surface-hover);
  border-color: var(--lh-border-hover);
  box-shadow: var(--lh-shadow-dropdown);
}
.bookmark-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--lh-text);
}
.icon-box {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bookmark-icon {
  width: 38px;
  height: 38px;
  object-fit: contain;
  border-radius: var(--lh-radius-sm);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.08));
}
.default-icon {
  width: 38px;
  height: 38px;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  border-radius: var(--lh-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
}
.bookmark-title {
  font-size: 13px;
  font-weight: 500;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--lh-text);
}
.card-edit-overlay {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
}
.btn-card-edit, .btn-card-del {
  width: 24px;
  height: 24px;
  border-radius: var(--lh-radius-sm);
  border: 1px solid var(--lh-border);
  background: var(--lh-surface);
  color: var(--lh-text);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.btn-card-del {
  color: var(--lh-danger);
}
.btn-card-del:hover {
  background: var(--lh-danger-bg);
}
.empty-state {
  text-align: center;
  padding: 48px;
  background: var(--lh-surface);
  border: 1px dashed var(--lh-border);
  border-radius: var(--lh-radius-lg);
  color: var(--lh-text-secondary);
}
.btn-accent {
  padding: 6px 14px;
  border: none;
  border-radius: var(--lh-radius-full);
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  font-size: 13px;
  cursor: pointer;
}
</style>
