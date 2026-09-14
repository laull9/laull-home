<script setup lang="ts">
const router = useRouter()
const { user, refresh, logout } = useAuth()
const { spaces, activeSpaceId, fetchSpaces, unlockPrivacySpace, lockPrivacySpace } = useSpaces()
const { $api } = useNuxtApp()

// 主页标题。
const pageTitle = ref('我的主页')
// 隐私空间解锁密码。
const privacyInputPassword = ref('')
// 隐私解锁错误提示。
const unlockError = ref('')

// 页面加载时恢复状态。
onMounted(async () => {
  try {
    await refresh()
  } catch {
    // 访客状态。
  }
  if (user.value) {
    try {
      await fetchSpaces()
      const settingsResult = await $api.settings.get()
      if (settingsResult.data) pageTitle.value = settingsResult.data.title
    } catch {
      // 容错处理。
    }
  }
})

// 当前选中的空间对象。
const currentSpace = computed(() => {
  return spaces.value.find(s => s.id === activeSpaceId.value)
})

// 处理登出。
async function handleLogout() {
  await logout()
  activeSpaceId.value = 'default'
  router.push('/')
}

// 处理隐私空间解锁。
async function handleUnlock() {
  unlockError.value = ''
  try {
    await unlockPrivacySpace(privacyInputPassword.value)
    privacyInputPassword.value = ''
  } catch (err: unknown) {
    unlockError.value = err instanceof Error ? err.message : '解锁失败'
  }
}

// 处理锁定隐私空间。
async function handleLock() {
  await lockPrivacySpace()
}
</script>

<template>
  <div class="home-container">
    <header class="navbar">
      <div class="brand">
        {{ pageTitle }}
      </div>

      <nav v-if="user" class="space-tabs">
        <button
          v-for="space in spaces"
          :key="space.id"
          type="button"
          class="tab-button"
          :class="{ active: activeSpaceId === space.id }"
          @click="activeSpaceId = space.id"
        >
          {{ space.name }}
          <span v-if="space.type === 'privacy'" class="lock-indicator">
            {{ space.isUnlocked ? '已解锁' : '已锁定' }}
          </span>
        </button>
      </nav>

      <div class="user-actions">
        <template v-if="user">
          <span class="user-name">{{ user.username }}</span>
          <NuxtLink to="/settings" class="nav-link">
            设置
          </NuxtLink>
          <button type="button" class="btn-text" @click="handleLogout">
            退出
          </button>
        </template>
        <template v-else>
          <NuxtLink to="/login" class="nav-link">
            登录
          </NuxtLink>
        </template>
      </div>
    </header>

    <main class="main-content">
      <div v-if="activeSpaceId === 'privacy' && user" class="privacy-section">
        <div v-if="!currentSpace?.isUnlocked" class="unlock-card">
          <h2>隐私空间已受保护</h2>
          <div v-if="currentSpace?.hasPassword" class="unlock-form">
            <input
              v-model="privacyInputPassword"
              type="password"
              placeholder="请输入独立隐私密码"
              @keyup.enter="handleUnlock"
            >
            <p v-if="unlockError" class="error-text">
              {{ unlockError }}
            </p>
            <button type="button" class="btn-primary" @click="handleUnlock">
              解锁空间
            </button>
          </div>
          <div v-else class="setup-hint">
            <p>尚未设置独立隐私密码</p>
            <NuxtLink to="/settings" class="btn-primary">
              前往设置初始化密码
            </NuxtLink>
          </div>
        </div>
        <div v-else class="privacy-unlocked-content">
          <div class="space-bar">
            <span>当前处于隐私空间（临时授权中）</span>
            <button type="button" class="btn-lock" @click="handleLock">
              锁定并返回
            </button>
          </div>
          <div class="content-body">
            <p>隐私空间已解锁，数据受独立授权与隔离保护。</p>
          </div>
        </div>
      </div>

      <div v-else class="normal-section">
        <div class="welcome-banner">
          <h1>{{ pageTitle }}</h1>
          <p class="subtitle">
            {{ user ? '已登录个人主页' : '公开主页（访客模式）' }}
          </p>
        </div>

        <section class="quick-search">
          <div class="search-box">
            <input type="text" placeholder="输入搜索内容或网址...">
          </div>
        </section>

        <section class="bookmarks-placeholder">
          <p class="placeholder-text">
            {{ user ? '书签功能将在 v0.1 实装' : '未登录访客仅展示公开内容' }}
          </p>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.home-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f9fafb;
  font-family: system-ui, -apple-system, sans-serif;
  color: #111827;
}
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}
.brand {
  font-size: 18px;
  font-weight: 600;
}
.space-tabs {
  display: flex;
  gap: 8px;
}
.tab-button {
  padding: 6px 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tab-button.active {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
}
.lock-indicator {
  font-size: 11px;
  opacity: 0.85;
}
.user-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}
.user-name {
  font-size: 14px;
  color: #4b5563;
}
.nav-link {
  color: #2563eb;
  text-decoration: none;
  font-size: 14px;
}
.btn-text {
  background: none;
  border: none;
  color: #dc2626;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
}
.main-content {
  flex: 1;
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
  padding: 40px 16px;
}
.welcome-banner {
  text-align: center;
  margin-bottom: 32px;
}
.welcome-banner h1 {
  font-size: 28px;
  margin-bottom: 8px;
}
.subtitle {
  color: #6b7280;
  font-size: 15px;
}
.quick-search {
  margin-bottom: 32px;
}
.search-box input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 15px;
  box-sizing: border-box;
}
.bookmarks-placeholder {
  padding: 48px;
  text-align: center;
  background: #ffffff;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
}
.placeholder-text {
  color: #9ca3af;
  margin: 0;
}
.unlock-card {
  max-width: 400px;
  margin: 40px auto;
  padding: 32px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  text-align: center;
}
.unlock-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 20px;
}
.unlock-form input {
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}
.btn-primary {
  display: inline-block;
  padding: 10px 16px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  text-decoration: none;
}
.btn-lock {
  padding: 6px 12px;
  background: #ef4444;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.space-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  margin-bottom: 24px;
}
.content-body {
  padding: 32px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.error-text {
  color: #dc2626;
  font-size: 13px;
  margin: 0;
}
</style>
