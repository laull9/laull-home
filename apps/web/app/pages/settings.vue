<script setup lang="ts">
import { useSettingsDraft } from '../composables/useSettingsDraft'
import { type SessionItem } from '@laull-home/shared'

// 启用身份鉴权守卫。
definePageMeta({
  middleware: 'auth',
})

const { user, changeUsername, changePassword, fetchSessions, revokeSession, revokeOthers } = useAuth()
const { setupPrivacyPassword } = useSpaces()

// 分页由地址参数保留，刷新和浏览器前进后退可恢复。
const route = useRoute()
// 设置导航按使用目的分组。
const pages = [{ id: 'appearance', name: '外观' }, { id: 'wallpaper', name: '壁纸' }, { id: 'search', name: '搜索' }, { id: 'account', name: '账号' }, { id: 'privacy', name: '隐私' }, { id: 'devices', name: '设备' }]
const page = computed(() => pages.find(item => item.id === route.query.page)?.id ?? 'appearance')
const { draft, ready, state, message, chooseTheme, chooseColor, retry, load } = useSettingsDraft()

// 用户主动重读时确认放弃尚未保存的草稿。
function reloadSettings() { if (!ready.value || confirm('放弃当前修改并重新读取？')) void load() }

// 用户名修改字段。
const newUsername = ref('')
const usernameMsg = ref('')
const usernameError = ref('')

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
  await loadSessions()
})

// 提交用户名修改。
async function handleUsernameChange() {
  usernameMsg.value = ''
  usernameError.value = ''
  const name = newUsername.value.trim()
  if (!name) {
    usernameError.value = '请输入新用户名'
    return
  }
  if (name === user.value?.username) {
    usernameError.value = '新用户名与当前用户名一致'
    return
  }
  try {
    await changeUsername(name)
    usernameMsg.value = '用户名修改成功'
    newUsername.value = ''
  } catch (err: unknown) {
    usernameError.value = err instanceof Error ? err.message : '修改失败'
  }
}

// 提交密码修改。
async function handlePasswordChange() {
  passwordMsg.value = ''
  passwordError.value = ''
  if (newPassword.value.length < 5 || newPassword.value.length > 128) {
    passwordError.value = '新密码需为 5 至 128 位'
    return
  }
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
  if (privacyPassword.value.length < 5 || privacyPassword.value.length > 128) {
    privacyError.value = '隐私密码需为 5 至 128 位'
    return
  }
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

    <div class="settings-layout">
      <nav class="settings-nav" aria-label="设置分页">
        <NuxtLink v-for="item in pages" :key="item.id" :to="{ path: '/settings', query: { page: item.id } }" :aria-current="page === item.id ? 'page' : undefined">{{ item.name }}</NuxtLink>
      </nav>
      <main class="content">
        <div class="page-heading"><h2>{{ pages.find(item => item.id === page)?.name }}</h2><span role="status" :class="{ 'error-text': state === 'error' }">{{ message }}</span></div>
        <div v-if="state === 'error'" class="recovery"><button v-if="ready" type="button" @click="retry">重试保存</button><button type="button" @click="reloadSettings">重新读取</button></div>
        <SettingsAppearance v-if="ready && (page === 'appearance' || page === 'wallpaper')" v-model="draft" :page="page" @theme="chooseTheme" @color="chooseColor" />
      <section v-if="page === 'account'" class="card">
        <h2>修改用户名</h2>
        <form @submit.prevent="handleUsernameChange">
          <div class="field">
            <label>当前用户名</label>
            <input :value="user?.username ?? ''" type="text" disabled>
          </div>
          <div class="field">
            <label for="new-username">新用户名</label>
            <input id="new-username" v-model="newUsername" type="text" placeholder="1 至 64 位字母、数字、下划线或连字符" required>
          </div>
          <p v-if="usernameError" class="error-text">
            {{ usernameError }}
          </p>
          <p v-if="usernameMsg" class="info-text">
            {{ usernameMsg }}
          </p>
          <button type="submit" class="btn">
            确认修改用户名
          </button>
        </form>
      </section>

      <section v-if="page === 'account'" class="card">
        <h2>修改登录密码</h2>
        <div v-if="user?.isDefaultPassword" class="warning-box">
          当前账号正在使用初始默认密码（admin），请尽快修改为 5 至 128 位自定义密码。
        </div>
        <form @submit.prevent="handlePasswordChange">
          <div class="field">
            <label for="old-pass">原密码</label>
            <input id="old-pass" v-model="oldPassword" type="password" required>
          </div>
          <div class="field">
            <label for="new-pass">新密码</label>
            <input id="new-pass" v-model="newPassword" type="password" minlength="5" maxlength="128" placeholder="5 至 128 位密码" required>
          </div>
          <div class="field">
            <label for="confirm-pass">确认新密码</label>
            <input id="confirm-pass" v-model="confirmPassword" type="password" minlength="5" maxlength="128" placeholder="再次输入新密码" required>
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

      <section v-if="page === 'privacy'" class="card">
        <h2>隐私空间密码</h2>
        <form @submit.prevent="handlePrivacySetup">
          <div class="field">
            <label for="privacy-pass">独立隐私密码</label>
            <input id="privacy-pass" v-model="privacyPassword" type="password" minlength="5" maxlength="128" placeholder="5 至 128 位独立密码" required>
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

      <SearchEngineSettings v-if="page === 'search'" />

      <section v-if="page === 'devices'" class="card">
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
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 1120px;
  margin: 0 auto;
  padding: 32px 16px;
  color: var(--lh-text);
}
.header { margin-bottom: 32px; display: flex; align-items: center; gap: 32px; }
.header h1 { font-size: 24px; margin: 0; }
.settings-layout { display: grid; grid-template-columns: 156px minmax(0, 1fr); gap: 40px; }
.settings-nav { display: flex; flex-direction: column; gap: 6px; align-self: start; position: sticky; top: 24px; }
.settings-nav a { color: var(--lh-text-secondary); padding: 12px 16px; text-decoration: none; border-radius: var(--lh-radius-sm); }
.settings-nav a[aria-current=page] { background: var(--lh-accent); color: var(--lh-accent-text); }
.page-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.page-heading h2 { margin: 0; font-size: 20px; }
.page-heading span { font-size: 12px; color: var(--lh-text-secondary); }
.recovery { display: flex; gap: 8px; }
.session-info { min-width: 0; overflow-wrap: anywhere; }
@media (max-width: 680px) { .settings-layout { grid-template-columns: minmax(0, 1fr); gap: 24px; } .settings-nav { position: static; flex-direction: row; flex-wrap: wrap; gap: 4px; } .settings-nav a { padding: 9px 12px; } }
.back-link {
  color: var(--lh-accent);
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
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  padding: 20px;
  box-shadow: var(--lh-shadow-sm);
  backdrop-filter: blur(var(--lh-blur));
}
.card h2 { font-size: 18px; margin: 0 0 16px 0; color: var(--lh-text); }
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.card-header h2 { margin-bottom: 0; }
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.field label { font-size: 13px; color: var(--lh-text-secondary); }
.field input, .field select, .css-textarea {
  padding: 8px 10px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-input-bg);
  color: var(--lh-text);
  font-size: 14px;
  outline: none;
}
.css-textarea {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  resize: vertical;
}
.btn {
  padding: 8px 16px;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  border: none;
  border-radius: var(--lh-radius-sm);
  cursor: pointer;
  font-size: 14px;
}
.btn-secondary {
  padding: 6px 12px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  color: var(--lh-text);
  cursor: pointer;
  font-size: 13px;
}
.btn-revoke {
  padding: 4px 10px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
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
  background: var(--lh-surface-hover);
  border-radius: var(--lh-radius-sm);
}
.session-info { display: flex; align-items: center; gap: 8px; }
.tag-current {
  font-size: 12px;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  padding: 2px 6px;
  border-radius: 4px;
}
.info-text { color: #059669; font-size: 13px; margin: 6px 0; }
.error-text { color: #ef4444; font-size: 13px; margin: 6px 0; }
.warning-box {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.25);
  color: #d97706;
  padding: 10px 12px;
  border-radius: var(--lh-radius-sm);
  font-size: 13px;
  margin-bottom: 16px;
}
</style>
