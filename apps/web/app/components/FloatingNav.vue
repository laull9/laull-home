<script setup lang="ts">
import type { SpaceItem } from "@laull-home/shared"

// 组件属性声明。
defineProps<{
  // 当前登录用户。
  user: { username: string } | null
  // 空间列表。
  spaces: readonly SpaceItem[]
  // 当前活动空间标识。
  activeSpaceId: string
  // 是否处于编辑模式。
  isEditMode: boolean
}>()

// 组件事件派发。
const emit = defineEmits<{
  (e: "toggleEditMode"): void
  (e: "selectSpace", spaceId: string): void
  (e: "logout"): void
}>()

// 浮动菜单展开状态。
const isOpen = ref(false)

// 浮动菜单容器引用，用于处理点击外部关闭。
const menuContainerRef = ref<HTMLElement | null>(null)

// 切换菜单展开与收起。
function toggleMenu() {
  isOpen.value = !isOpen.value
}

// 切换空间。
function handleSpaceClick(spaceId: string) {
  emit("selectSpace", spaceId)
  isOpen.value = false
}

// 切换编辑模式。
function handleToggleEdit() {
  emit("toggleEditMode")
  isOpen.value = false
}

// 处理退出登录。
function handleLogoutClick() {
  emit("logout")
  isOpen.value = false
}

// 点击外部区域自动关闭菜单。
function handleClickOutside(event: MouseEvent) {
  if (menuContainerRef.value && !menuContainerRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener("click", handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside)
})
</script>

<template>
  <div ref="menuContainerRef" class="floating-nav">
    <!-- 展开的操作菜单气泡 -->
    <transition name="pop">
      <div v-if="isOpen" class="nav-popover">
        <!-- 空间切换分段 -->
        <div v-if="user && spaces.length > 0" class="menu-section">
          <div class="section-title">空间切换</div>
          <div class="space-list">
            <button
              v-for="space in spaces"
              :key="space.id"
              type="button"
              class="space-btn"
              :class="{ active: activeSpaceId === space.id }"
              @click="handleSpaceClick(space.id)"
            >
              <span>{{ space.name }}</span>
              <span v-if="space.type === 'privacy'" class="badge">
                {{ space.isUnlocked ? "已解锁" : "锁定" }}
              </span>
            </button>
          </div>
        </div>

        <!-- 常用操作分段 -->
        <div class="menu-section">
          <template v-if="user">
            <button
              type="button"
              class="menu-item"
              :class="{ 'item-active': isEditMode }"
              @click="handleToggleEdit"
            >
              <svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span>{{ isEditMode ? "完成编辑" : "编辑主页" }}</span>
            </button>

            <NuxtLink to="/settings" class="menu-item" @click="isOpen = false">
              <svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>主页设置</span>
            </NuxtLink>

            <button type="button" class="menu-item text-danger" @click="handleLogoutClick">
              <svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>退出登录</span>
            </button>
          </template>

          <template v-else>
            <NuxtLink to="/login" class="menu-item" @click="isOpen = false">
              <svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              <span>登录账号</span>
            </NuxtLink>
          </template>
        </div>
      </div>
    </transition>

    <!-- 右下角悬浮触发按钮 -->
    <button
      type="button"
      class="fab-button"
      :class="{ 'fab-active': isOpen }"
      title="操作菜单"
      @click="toggleMenu"
    >
      <svg class="fab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="19" r="1" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.floating-nav {
  position: fixed;
  bottom: 28px;
  right: 28px;
  z-index: 100;
}

.fab-button {
  width: 44px;
  height: 44px;
  border-radius: var(--lh-radius-full);
  border: 1px solid var(--lh-border);
  background: var(--lh-surface);
  color: var(--lh-text);
  box-shadow: var(--lh-shadow-card);
  backdrop-filter: blur(var(--lh-blur));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.fab-button:hover {
  background: var(--lh-surface-hover);
  transform: scale(1.05);
  border-color: var(--lh-border-hover);
}

.fab-active {
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  border-color: var(--lh-accent);
}

.fab-icon {
  width: 20px;
  height: 20px;
}

.nav-popover {
  position: absolute;
  bottom: 56px;
  right: 0;
  width: 200px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  box-shadow: var(--lh-shadow-dropdown);
  backdrop-filter: blur(var(--lh-blur));
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.menu-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-title {
  font-size: 11px;
  color: var(--lh-text-muted);
  padding: 4px 8px 2px 8px;
  font-weight: 500;
}

.space-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.space-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border: none;
  border-radius: var(--lh-radius-sm);
  background: transparent;
  color: var(--lh-text);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.space-btn:hover {
  background: var(--lh-surface-hover);
}

.space-btn.active {
  background: var(--lh-surface-active);
  font-weight: 500;
  color: var(--lh-accent);
}

.badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--lh-border);
  color: var(--lh-text-secondary);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: none;
  border-radius: var(--lh-radius-sm);
  background: transparent;
  color: var(--lh-text);
  font-size: 13px;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.15s ease;
  width: 100%;
  box-sizing: border-box;
}

.menu-item:hover {
  background: var(--lh-surface-hover);
}

.item-active {
  color: var(--lh-accent);
  background: var(--lh-surface-active);
}

.item-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.text-danger {
  color: #ef4444;
}

.text-danger:hover {
  background: rgba(239, 68, 68, 0.1);
}

.pop-enter-active,
.pop-leave-active {
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.95);
}
</style>
