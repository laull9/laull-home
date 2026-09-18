<script setup lang="ts">
import AlertModal from '../components/AlertModal.vue'
import DesktopCanvas from '../components/desktop/DesktopCanvas.vue'
import DesktopEditBar from '../components/desktop/DesktopEditBar.vue'
import { useDesktopEvents } from '../composables/useDesktopEvents'
import type { Bookmark, Breakpoint } from "@laull-home/shared"

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
// 非编辑模式下是否允许拖动图标链接。
const allowDragWithoutEdit = ref(true)

// 编辑模式开关状态。
const isEditMode = ref(false)
// 编辑工具栏断点与叠放状态。
const selectedBreakpoint = ref<'auto' | Breakpoint>('auto')
const stackMode = ref(false)
const isCanvasSaving = ref(false)
const isTreeOpen = ref(false)
// 切换空间前保护画布草稿。
const canvasDirty = ref(false)
const showBookmarkManager = ref(false)
// 快速添加完成后在当前画布建立图标引用。
const desktopCanvas = ref<InstanceType<typeof DesktopCanvas> | null>(null)
const quickAdding = ref(false)
const quickError = ref('')
const targetGroupId = ref<string | null>(null)

// 空间切换确认弹窗状态。
const pendingSpaceId = ref<string | null>(null)
const showSpaceSwitchConfirm = ref(false)

// 快速添加独立桌面图标，不强制开启编辑模式，不自动创建多余分组。
async function quickAdd() {
  if (quickAdding.value || !user.value) return
  quickAdding.value = true
  quickError.value = ''
  try {
    targetGroupId.value = null
    editingBookmark.value = null
    showBookmarkModal.value = true
  } catch (error) { quickError.value = error instanceof Error ? error.message : '添加失败' }
  finally { quickAdding.value = false }
}

// 保存书签：仅当在桌面独立新增时创建图标组件，文件夹内新增或编辑已有书签只刷新数据。
async function bookmarkSaved(bookmark?: Bookmark, isFolderAdd?: boolean, variant?: string) {
  await loadData(activeSpaceId.value)
  if (bookmark && !isFolderAdd && !editingBookmark.value) {
    desktopCanvas.value?.addNavigation(bookmark, variant)
  }
}

// 当前空间有草稿时由用户决定是否放弃。
function selectSpace(id: string) {
  if (id === activeSpaceId.value) return
  if (canvasDirty.value) {
    pendingSpaceId.value = id
    showSpaceSwitchConfirm.value = true
    return
  }
  activeSpaceId.value = id
}

// 确认切换空间并丢弃当前未保存草稿。
function handleConfirmSpaceSwitch() {
  if (pendingSpaceId.value) {
    canvasDirty.value = false
    activeSpaceId.value = pendingSpaceId.value
    pendingSpaceId.value = null
  }
  showSpaceSwitchConfirm.value = false
}

// 右键目标空间先切换并确认授权，再开启对应布局编辑。
function configureSpace(id: string) {
  selectSpace(id)
  if (activeSpaceId.value !== id) return
  const space = spaces.value.find(item => item.id === id)
  if (space?.type === 'privacy' && !space.isUnlocked) { isEditMode.value = false; return }
  isEditMode.value = true
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
      if (res.data.allowDragWithoutEdit !== undefined) {
        allowDragWithoutEdit.value = res.data.allowDragWithoutEdit
      }
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

// 监听 MCP 桌面广播事件并热重载画布或主题。
useDesktopEvents({
  onThemeUpdated: async () => {
    try {
      const res = await $api.settings.get()
      if (res.data) {
        pageTitle.value = res.data.title
        if (res.data.allowDragWithoutEdit !== undefined) {
          allowDragWithoutEdit.value = res.data.allowDragWithoutEdit
        }
        applyTheme(res.data)
      }
    } catch {
      // 忽略拉取错误
    }
  },
  onWidgetUpdated: async () => {
    if (!canvasDirty.value && !isEditMode.value) {
      await loadData(activeSpaceId.value)
      desktopCanvas.value?.reload()
    }
  },
  onLayoutUpdated: async () => {
    if (!canvasDirty.value && !isEditMode.value) {
      desktopCanvas.value?.reload()
    }
  },
})

// 当前选中的空间对象。
const currentSpace = computed(() => {
  return spaces.value.find(s => s.id === activeSpaceId.value)
})

// 打开新增书签对话框，支持指定目标分组。
function handleAddBookmark(groupId?: string) {
  targetGroupId.value = groupId ?? null
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

// 取消主页编辑修改并退出。
async function handleCancelEdit() {
  await desktopCanvas.value?.cancelChanges()
  isEditMode.value = false
}

// 重置当前空间布局。
function handleResetLayout() {
  desktopCanvas.value?.reload()
}
</script>

<template>
  <div class="home-layout" @contextmenu="desktopCanvas?.openContext($event)">
    <!-- 初始密码未修改安全提醒 -->
    <div v-if="user?.isDefaultPassword" class="default-password-banner">
      <span>安全提醒：当前正在使用默认初始密码（admin），请及时修改。</span>
      <NuxtLink to="/settings" class="banner-link">前往修改</NuxtLink>
    </div>

    <!-- 编辑模式生效时的顶部操作提示栏 -->
    <transition name="fade">
      <DesktopEditBar
        v-if="isEditMode && user"
        v-model:selected-breakpoint="selectedBreakpoint"
        v-model:stack-mode="stackMode"
        :saving="isCanvasSaving"
        :tree-open="isTreeOpen"
        @create-group="openCreateGroupModal"
        @toggle-tree="desktopCanvas?.toggleTree()"
        @open-archive="showBookmarkManager = true"
        @cancel-changes="handleCancelEdit"
        @reset-layout="handleResetLayout"
        @finish-edit="isEditMode = false"
      />
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

        <p v-if="quickError" role="alert">{{ quickError }}</p>
        <DesktopCanvas
          ref="desktopCanvas"
          v-model:selected-breakpoint="selectedBreakpoint"
          v-model:stack-mode="stackMode"
          @start-edit="isEditMode = true"
          @quick-add="quickAdd"
          @dirty="canvasDirty = $event"
          @saving="isCanvasSaving = $event"
          @tree-open="isTreeOpen = $event"
          @refresh="loadData(activeSpaceId)"
          :space-id="activeSpaceId"
          :editing="isEditMode"
          :allow-drag-without-edit="allowDragWithoutEdit"
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
      @configure-space="configureSpace"
      @logout="handleLogout"
    />

    <!-- 书签编辑与快速添加弹窗 -->
    <BookmarkModal
      :show="showBookmarkModal"
      :editing-bookmark="editingBookmark"
      :groups="groups"
      :current-space-id="activeSpaceId"
      :target-group-id="targetGroupId"
      @close="showBookmarkModal = false"
      @saved="bookmarkSaved"
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

    <!-- 空间切换放弃草稿确认弹窗 -->
    <AlertModal
      :show="showSpaceSwitchConfirm"
      title="切换空间"
      message="放弃未保存的布局修改并切换空间？"
      type="warning"
      :show-cancel="true"
      cancel-text="取消"
      confirm-text="确认切换"
      @confirm="handleConfirmSpaceSwitch"
      @close="showSpaceSwitchConfirm = false"
    />
  </div>
</template>

<style scoped>
.home-layout { min-height: 100vh; display: flex; flex-direction: column; }
.default-password-banner {
  background: var(--lh-warning-bg); border-bottom: 1px solid var(--lh-warning-border);
  padding: 10px 24px; display: flex; justify-content: center; align-items: center;
  gap: 12px; font-size: 13px; color: var(--lh-warning-text);
}
.banner-link { color: var(--lh-warning); font-weight: 600; text-decoration: underline; }
.btn-accent {
  padding: 6px 14px; border: none; border-radius: var(--lh-radius-full);
  background: var(--lh-accent); color: var(--lh-accent-text); font-size: 12px;
  font-weight: 500; cursor: pointer; transition: opacity 0.15s ease;
}
.btn-accent:hover { opacity: 0.9; }
.main-body { flex: 1; max-width: 1440px; width: 100%; margin: 0 auto; padding: 40px 20px 80px 20px; box-sizing: border-box; }
.privacy-alert-bar {
  display: flex; justify-content: space-between; align-items: center; padding: 10px 16px;
  background: var(--lh-danger-bg); border: 1px solid var(--lh-danger-border);
  border-radius: var(--lh-radius-md); margin-bottom: 24px; color: var(--lh-danger); font-size: 13px;
}
.btn-lock {
  padding: 5px 12px; background: var(--lh-danger); color: var(--lh-danger-text);
  border: none; border-radius: var(--lh-radius-sm); cursor: pointer; font-size: 12px; font-weight: 500; transition: opacity 0.15s ease;
}
.btn-lock:hover { background: var(--lh-danger-hover); }
.privacy-lock-card {
  max-width: 400px; margin: 60px auto; padding: 32px; background: var(--lh-surface);
  border: 1px solid var(--lh-border); border-radius: var(--lh-radius-lg);
  box-shadow: var(--lh-shadow-card); backdrop-filter: blur(var(--lh-blur)); text-align: center;
}
.lock-form { display: flex; flex-direction: column; gap: 12px; margin-top: 20px; }
.lock-form input { padding: 10px 12px; border: 1px solid var(--lh-border); border-radius: var(--lh-radius-sm); background: var(--lh-input-bg); color: var(--lh-text); outline: none; }
.lock-form input:focus { border-color: var(--lh-accent); }
.error-msg { color: var(--lh-danger); font-size: 13px; margin: 0; }
.setup-hint { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 16px; color: var(--lh-text-secondary); font-size: 14px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translate(-50%, -8px) !important; }
</style>
