<script setup lang="ts">
import DesktopCanvas from '../components/desktop/DesktopCanvas.vue'
import type { Bookmark } from "@laull-home/shared"

// 启用身份鉴权守卫，未登录直接进入独立登录页面。
definePageMeta({
  middleware: 'auth',
})

const { user, refresh, logout } = useAuth()
const { spaces, activeSpaceId, fetchSpaces, unlockPrivacySpace, lockPrivacySpace } = useSpaces()
const { groups, bookmarks, loadData, createGroup, updateGroup } = useBookmarks()
const { $api } = useNuxtApp()
const { applyTheme } = useTheme()

// 主页标题。
const pageTitle = ref("我的主页")

// 编辑模式开关状态。
const isEditMode = ref(false)
// 切换空间前保护画布草稿。
const canvasDirty = ref(false)
const showBookmarkManager = ref(false)
// 当前空间有草稿时由用户决定是否放弃。
function selectSpace(id: string) {
  if (id === activeSpaceId.value) return
  if (canvasDirty.value && !confirm('放弃未保存的布局修改并切换空间？')) return
  canvasDirty.value = false
  activeSpaceId.value = id
}

// 书签弹窗控制。
const showBookmarkModal = ref(false)
const editingBookmark = ref<Bookmark | null>(null)

// 隐私空间密码与错误信息。
const privacyInputPassword = ref("")
const unlockError = ref("")

// 分组新建与重命名状态。
const showGroupPrompt = ref(false)
const groupPromptTitle = ref("")
const groupPromptValue = ref("")
const editingGroupId = ref<string | null>(null)

// 页面加载恢复状态并获取数据。
onMounted(async () => {
  try {
    await refresh()
  } catch {
    // 忽略异常
  }

  try {
    const res = await $api.settings.get()
    if (res.data) {
      pageTitle.value = res.data.title
      applyTheme(res.data)
    }
  } catch {
    // 访客读取失败保持默认
  }

  if (user.value) {
    try {
      await fetchSpaces()
    } catch {
      // 容错处理
    }
  }
  await loadData(activeSpaceId.value)
})

// 监听活动空间变更，重新加载分组与书签。
watch(activeSpaceId, async (newSpaceId) => {
  await loadData(newSpaceId)
})

// 当前选中的空间对象。
const currentSpace = computed(() => {
  return spaces.value.find(s => s.id === activeSpaceId.value)
})

// 打开新增书签对话框。
function handleAddBookmark() {
  if (groups.value.length === 0) {
    openCreateGroupModal()
    return
  }
  editingBookmark.value = null
  showBookmarkModal.value = true
}

// 打开编辑书签对话框。
function handleEditBookmark(bm: Bookmark) {
  editingBookmark.value = bm
  showBookmarkModal.value = true
}

// 打开新建分组对话框。
function openCreateGroupModal() {
  editingGroupId.value = null
  groupPromptTitle.value = "新建分组"
  groupPromptValue.value = ""
  showGroupPrompt.value = true
}

// 提交分组保存。
async function handleSaveGroup(name?: string) {
  const groupName = (name ?? groupPromptValue.value).trim()
  if (!groupName) return
  if (editingGroupId.value) {
    await updateGroup(editingGroupId.value, activeSpaceId.value, { name: groupName })
  } else {
    await createGroup({ spaceId: activeSpaceId.value, name: groupName })
  }
  showGroupPrompt.value = false
}

// 处理用户登出，跳转独立登录页面。
async function handleLogout() {
  await logout()
  await navigateTo('/login')
}

// 处理隐私空间解锁。
async function handleUnlock() {
  unlockError.value = ""
  try {
    await unlockPrivacySpace(privacyInputPassword.value)
    privacyInputPassword.value = ""
    await loadData("privacy")
  } catch (err: unknown) {
    unlockError.value = err instanceof Error ? err.message : "解锁失败"
  }
}

// 处理隐私空间锁定。
async function handleLock() {
  await lockPrivacySpace()
  await loadData("default")
}
</script>

<template>
  <div class="home-layout">
    <!-- 初始密码未修改安全提醒 -->
    <div v-if="user?.isDefaultPassword" class="default-password-banner">
      <span>安全提醒：当前正在使用默认初始密码（admin），请及时修改。</span>
      <NuxtLink to="/settings" class="banner-link">前往修改</NuxtLink>
    </div>

    <!-- 编辑模式生效时的顶部操作提示栏 -->
    <transition name="fade">
      <div v-if="isEditMode && user" class="edit-mode-bar">
        <div class="edit-status">
          <span class="edit-dot" />
          <span>正在编辑主页</span>
        </div>
        <div class="edit-actions">
          <button type="button" class="btn-sub" @click="showBookmarkManager = true">管理书签</button>
          <button type="button" class="btn-sub" @click="openCreateGroupModal">新建分组</button>
          <button type="button" class="btn-sub" @click="handleAddBookmark">+ 添加书签</button>
          <button type="button" class="btn-accent" @click="isEditMode = false">完成编辑</button>
        </div>
      </div>
    </transition>

    <main class="main-body">
      <!-- 隐私空间锁定保护提示 -->
      <section v-if="activeSpaceId === 'privacy' && user && !currentSpace?.isUnlocked" class="privacy-lock-card">
        <h2>隐私空间已受保护</h2>
        <div v-if="currentSpace?.hasPassword" class="lock-form">
          <input
            v-model="privacyInputPassword"
            type="password"
            placeholder="请输入独立隐私密码"
            @keyup.enter="handleUnlock"
          >
          <p v-if="unlockError" class="error-msg">{{ unlockError }}</p>
          <button type="button" class="btn-accent" @click="handleUnlock">解锁空间</button>
        </div>
        <div v-else class="setup-hint">
          <p>尚未初始化独立隐私密码</p>
          <NuxtLink to="/settings" class="btn-accent">前往设置</NuxtLink>
        </div>
      </section>

      <!-- 普通主页或已解锁的隐私空间 -->
      <section v-else class="content-section">
        <div v-if="activeSpaceId === 'privacy' && user" class="privacy-alert-bar">
          <span>当前处于隐私空间（临时授权中）</span>
          <button type="button" class="btn-lock" @click="handleLock">锁定并返回</button>
        </div>

        <DesktopCanvas
          :key="activeSpaceId"
          @dirty="canvasDirty = $event"
          @refresh="loadData(activeSpaceId)"
          :space-id="activeSpaceId"
          :editing="isEditMode"
          :bookmarks="bookmarks"
          :groups="groups"
          @edit-bookmark="handleEditBookmark"
          @add-bookmark="handleAddBookmark"
        />
      </section>
    </main>

    <!-- 右下角收纳悬浮操作菜单 -->
    <FloatingNav
      :user="user"
      :spaces="spaces"
      :active-space-id="activeSpaceId"
      :is-edit-mode="isEditMode"
      @toggle-edit-mode="isEditMode = !isEditMode"
      @select-space="selectSpace"
      @logout="handleLogout"
    />

    <!-- 书签编辑与快速添加弹窗 -->
    <BookmarkModal
      :show="showBookmarkModal"
      :editing-bookmark="editingBookmark"
      :groups="groups"
      :current-space-id="activeSpaceId"
      @close="showBookmarkModal = false"
      @saved="loadData(activeSpaceId)"
    />

    <BookmarkManager :show="showBookmarkManager" :space-id="activeSpaceId" @close="showBookmarkManager = false" />

    <!-- 分组新建与重命名弹窗 -->
    <GroupPromptModal
      :show="showGroupPrompt"
      :title="groupPromptTitle"
      v-model="groupPromptValue"
      @close="showGroupPrompt = false"
      @save="handleSaveGroup"
    />
  </div>
</template>

<style scoped>
.home-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.default-password-banner {
  background: #fffbeb;
  border-bottom: 1px solid #fef3c7;
  padding: 10px 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #92400e;
}

.banner-link {
  color: #b45309;
  font-weight: 600;
  text-decoration: underline;
}

.edit-mode-bar {
  position: sticky;
  top: 16px;
  z-index: 50;
  max-width: 780px;
  margin: 16px auto 0 auto;
  padding: 8px 16px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-full);
  box-shadow: var(--lh-shadow-dropdown);
  backdrop-filter: blur(var(--lh-blur));
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.edit-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--lh-text);
}

.edit-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--lh-radius-full);
  background: var(--lh-accent);
  box-shadow: 0 0 8px var(--lh-accent);
}

.edit-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-accent {
  padding: 6px 14px;
  border: none;
  border-radius: var(--lh-radius-full);
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.btn-accent:hover {
  opacity: 0.9;
}

.btn-sub {
  padding: 6px 12px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-full);
  background: var(--lh-surface);
  color: var(--lh-text);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-sub:hover {
  background: var(--lh-surface-hover);
}

.main-body {
  flex: 1;
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  padding: 40px 20px 80px 20px;
  box-sizing: border-box;
}

.privacy-alert-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: var(--lh-radius-md);
  margin-bottom: 24px;
  color: #ef4444;
  font-size: 13px;
}

.btn-lock {
  padding: 4px 10px;
  background: #ef4444;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.privacy-lock-card {
  max-width: 400px;
  margin: 60px auto;
  padding: 32px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  box-shadow: var(--lh-shadow-card);
  backdrop-filter: blur(var(--lh-blur));
  text-align: center;
}

.lock-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 20px;
}

.lock-form input {
  padding: 10px 12px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-input-bg);
  color: var(--lh-text);
  outline: none;
}

.lock-form input:focus {
  border-color: var(--lh-accent);
}

.error-msg {
  color: #ef4444;
  font-size: 13px;
  margin: 0;
}

.setup-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  color: var(--lh-text-secondary);
  font-size: 14px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
@media (max-width: 560px) {
  .edit-mode-bar { margin: 12px 12px 0; padding: 10px 12px; border-radius: 16px; display: block; }
  .edit-status { margin-bottom: 8px; white-space: nowrap; }
  .edit-actions { flex-wrap: wrap; gap: 6px; }
  .btn-sub, .btn-accent { white-space: nowrap; padding: 6px 9px; }
}
</style>
