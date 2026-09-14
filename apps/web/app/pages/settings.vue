<script setup lang="ts">
import type { SessionItem } from '@laull-home/shared'

// 启用身份鉴权守卫。
definePageMeta({
  middleware: 'auth',
})

const { $api } = useNuxtApp()
const { changePassword, fetchSessions, revokeSession, revokeOthers } = useAuth()
const { setupPrivacyPassword } = useSpaces()

// 用户基本设置。
const title = ref('')
const appearance = ref<'system' | 'light' | 'dark'>('system')
const revision = ref(0)
const settingsMsg = ref('')

// 密码修改字段。
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordMsg = ref('')
const passwordError = ref('')

// 独立隐私密码。
const privacyPassword = ref('')
const privacyMsg = ref('')
const privacyError = ref('')

// 设备会话列表。
const sessions = ref<SessionItem[]>([])
const sessionsMsg = ref('')

// 加载基础设置和设备列表。
onMounted(async () => {
  await loadSettings()
  await loadSessions()
})

// 加载用户基础设置。
async function loadSettings() {
  const result = await $api.settings.get()
  if (result.data) {
    title.value = result.data.title
    appearance.value = result.data.appearance
    revision.value = result.data.revision
  }
}

// 保存用户基础设置。
async function saveSettings() {
  settingsMsg.value = ''
  const result = await $api.settings.put({
    revision: revision.value,
    title: title.value,
    appearance: appearance.value,
  })
  if (result.data) {
    revision.value = result.data.revision
    settingsMsg.value = '设置已保存'
  } else {
    settingsMsg.value = '保存冲突，请刷新后重试'
  }
}

// 提交密码修改。
async function handlePasswordChange() {
  passwordMsg.value = ''
  passwordError.value = ''
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = '两次输入的新密码不一致'
    return
  }
  try {
    await changePassword(oldPassword.value, newPassword.value)
    passwordMsg.value = '密码修改成功'
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    await loadSessions()
  } catch (err: unknown) {
    passwordError.value = err instanceof Error ? err.message : '修改失败'
  }
}

// 提交独立隐私密码设置。
async function handlePrivacySetup() {
  privacyMsg.value = ''
  privacyError.value = ''
  try {
    await setupPrivacyPassword(privacyPassword.value)
    privacyMsg.value = '独立隐私密码设置成功'
    privacyPassword.value = ''
  } catch (err: unknown) {
    privacyError.value = err instanceof Error ? err.message : '设置失败'
  }
}

// 刷新设备列表。
async function loadSessions() {
  try {
    sessions.value = await fetchSessions()
  } catch {
    sessionsMsg.value = '读取设备失败'
  }
}

// 撤销指定设备。
async function handleRevokeSession(id: string) {
  try {
    await revokeSession(id)
    await loadSessions()
  } catch {
    sessionsMsg.value = '撤销设备失败'
  }
}

// 撤销其他全部设备。
async function handleRevokeOthers() {
  try {
    await revokeOthers()
    await loadSessions()
  } catch {
    sessionsMsg.value = '撤销其他设备失败'
  }
}
</script>

<template>
  <div class="settings-page">
    <header class="header">
      <NuxtLink to="/" class="back-link">
        返回主页
      </NuxtLink>
      <h1>设置</h1>
    </header>

    <main class="content">
      <section class="card">
        <h2>外观与标题</h2>
        <form @submit.prevent="saveSettings">
          <div class="field">
            <label for="title">主页标题</label>
            <input id="title" v-model="title" type="text" required>
          </div>
          <div class="field">
            <label for="appearance">外观模式</label>
            <select id="appearance" v-model="appearance">
              <option value="system">
                跟随系统
              </option>
              <option value="light">
                浅色
              </option>
              <option value="dark">
                深色
              </option>
            </select>
          </div>
          <p v-if="settingsMsg" class="info-text">
            {{ settingsMsg }}
          </p>
          <button type="submit" class="btn">
            保存设置
          </button>
        </form>
      </section>

      <section class="card">
        <h2>修改登录密码</h2>
        <form @submit.prevent="handlePasswordChange">
          <div class="field">
            <label for="old-pass">原密码</label>
            <input id="old-pass" v-model="oldPassword" type="password" required>
          </div>
          <div class="field">
            <label for="new-pass">新密码</label>
            <input id="new-pass" v-model="newPassword" type="password" required>
          </div>
          <div class="field">
            <label for="confirm-pass">确认新密码</label>
            <input id="confirm-pass" v-model="confirmPassword" type="password" required>
          </div>
          <p v-if="passwordError" class="error-text">
            {{ passwordError }}
          </p>
          <p v-if="passwordMsg" class="info-text">
            {{ passwordMsg }}
          </p>
          <button type="submit" class="btn">
            确认修改
          </button>
        </form>
      </section>

      <section class="card">
        <h2>隐私空间密码</h2>
        <form @submit.prevent="handlePrivacySetup">
          <div class="field">
            <label for="privacy-pass">独立隐私密码</label>
            <input id="privacy-pass" v-model="privacyPassword" type="password" required>
          </div>
          <p v-if="privacyError" class="error-text">
            {{ privacyError }}
          </p>
          <p v-if="privacyMsg" class="info-text">
            {{ privacyMsg }}
          </p>
          <button type="submit" class="btn">
            设置隐私密码
          </button>
        </form>
      </section>

      <section class="card">
        <div class="card-header">
          <h2>活动设备</h2>
          <button type="button" class="btn-secondary" @click="handleRevokeOthers">
            撤销其他设备
          </button>
        </div>
        <p v-if="sessionsMsg" class="info-text">
          {{ sessionsMsg }}
        </p>
        <ul class="session-list">
          <li v-for="item in sessions" :key="item.id" class="session-item">
            <div class="session-info">
              <span class="user-agent">{{ item.userAgent || '未知设备' }}</span>
              <span v-if="item.isCurrent" class="tag-current">当前设备</span>
            </div>
            <button
              v-if="!item.isCurrent"
              type="button"
              class="btn-revoke"
              @click="handleRevokeSession(item.id)"
            >
              撤销
            </button>
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 680px;
  margin: 0 auto;
  padding: 32px 16px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #111827;
}
.header {
  margin-bottom: 24px;
}
.back-link {
  color: #2563eb;
  text-decoration: none;
  font-size: 14px;
  display: inline-block;
  margin-bottom: 8px;
}
.content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 20px;
}
.card h2 {
  font-size: 18px;
  margin-top: 0;
  margin-bottom: 16px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.card-header h2 {
  margin-bottom: 0;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.field label {
  font-size: 13px;
  color: #4b5563;
}
.field input, .field select {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}
.btn {
  padding: 8px 16px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
.btn-secondary {
  padding: 6px 12px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.btn-revoke {
  padding: 4px 10px;
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.session-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.session-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 6px;
}
.session-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tag-current {
  font-size: 12px;
  background: #dbeafe;
  color: #1d4ed8;
  padding: 2px 6px;
  border-radius: 4px;
}
.info-text {
  color: #059669;
  font-size: 13px;
  margin: 6px 0;
}
.error-text {
  color: #dc2626;
  font-size: 13px;
  margin: 6px 0;
}
</style>
