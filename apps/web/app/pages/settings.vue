<script setup lang="ts">
import { DEFAULT_THEME, type ThemeConfig, type SessionItem } from '@laull-home/shared'

// 启用身份鉴权守卫。
definePageMeta({
  middleware: 'auth',
})

const { $api } = useNuxtApp()
const { user, changeUsername, changePassword, fetchSessions, revokeSession, revokeOthers } = useAuth()
const { setupPrivacyPassword } = useSpaces()

// 用户基本设置。
const title = ref('')
const appearance = ref<'system' | 'light' | 'dark'>('system')
const themeId = ref('default')
const wallpaperType = ref<'none' | 'color' | 'gradient' | 'url'>('none')
const wallpaperValue = ref('')
const customCss = ref('')
// 主题参数与原有设置一起提交版本校验。
const themeConfig = ref<ThemeConfig>(JSON.parse(JSON.stringify(DEFAULT_THEME)))
const revision = ref(0)
const settingsMsg = ref('')
const { applyTheme, applyCustomCss, THEME_PRESETS } = useTheme()

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
  await loadSettings()
  await loadSessions()
})

// 加载用户基础设置。
async function loadSettings() {
  const result = await $api.settings.get()
  if (result.data) {
    title.value = result.data.title
    appearance.value = result.data.appearance
    themeId.value = result.data.themeId ?? 'default'
    wallpaperType.value = (result.data.wallpaperType as 'none' | 'color' | 'gradient' | 'url') ?? 'none'
    wallpaperValue.value = result.data.wallpaperValue ?? ''
    customCss.value = result.data.customCss ?? ''
    themeConfig.value = result.data.themeConfig ?? JSON.parse(JSON.stringify(DEFAULT_THEME))
    revision.value = result.data.revision
    applyTheme(result.data)
  }
}

// 保存用户基础设置。
async function saveSettings() {
  settingsMsg.value = ''
  const result = await $api.settings.put({
    revision: revision.value,
    title: title.value,
    appearance: appearance.value,
    themeId: themeId.value,
    wallpaperType: wallpaperType.value,
    wallpaperValue: wallpaperValue.value,
    customCss: customCss.value,
    themeConfig: themeConfig.value,
  })
  if (result.data) {
    revision.value = result.data.revision
    applyTheme(result.data)
    applyCustomCss(customCss.value)
    settingsMsg.value = '设置已保存'
  } else {
    settingsMsg.value = result.error?.value.message ?? '保存失败，请重试'
  }
}

// 结构化主题编辑实时预览，离开页面恢复已保存设置。
watch(themeConfig, () => {
  if (title.value) applyTheme({ revision: revision.value, title: title.value, appearance: appearance.value, themeId: themeId.value, wallpaperType: wallpaperType.value, wallpaperValue: wallpaperValue.value, customCss: customCss.value, themeConfig: themeConfig.value })
}, { deep: true })
onUnmounted(async () => {
  const result = await $api.settings.get()
  if (result.data) applyTheme(result.data)
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

    <main class="content">
      <section class="card">
        <h2>外观、主题与壁纸</h2>
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
          <div class="field">
            <label for="theme">预设主题</label>
            <select id="theme" v-model="themeId">
              <option v-for="preset in THEME_PRESETS" :key="preset.id" :value="preset.id">
                {{ preset.name }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="wallpaper">壁纸类型</label>
            <select id="wallpaper" v-model="wallpaperType">
              <option value="none">无自定义壁纸</option>
              <option value="color">纯色背景</option>
              <option value="gradient">渐变背景</option>
              <option value="url">远程壁纸图片 URL</option>
            </select>
          </div>
          <div v-if="wallpaperType !== 'none'" class="field">
            <label for="wallpaper-val">
              {{ wallpaperType === 'color' ? '背景颜色代码（例如 #0f172a）' : wallpaperType === 'gradient' ? 'CSS 渐变表达式' : '图片链接 URL' }}
            </label>
            <input id="wallpaper-val" v-model="wallpaperValue" type="text" placeholder="输入参数值">
          </div>
          <div class="field">
            <label for="custom-css">自定义 CSS 覆盖</label>
            <textarea
              id="custom-css"
              v-model="customCss"
              class="css-textarea"
              placeholder="自定义 CSS 样式，例如：&#10;.bookmark-card { border-radius: 20px; }"
              rows="4"
            />
          </div>
          <ThemeDesigner v-model="themeConfig" />
          <p v-if="settingsMsg" class="info-text">
            {{ settingsMsg }}
          </p>
          <button type="submit" class="btn">
            保存设置
          </button>
        </form>
      </section>

      <section class="card">
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

      <section class="card">
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

      <section class="card">
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

      <SearchEngineSettings />

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
  color: var(--lh-text);
}
.header { margin-bottom: 24px; }
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
