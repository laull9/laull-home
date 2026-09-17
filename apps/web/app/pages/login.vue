<script setup lang="ts">
// 页面元信息配置。
definePageMeta({
  layout: false,
})

const router = useRouter()
const route = useRoute()
const { user, refresh, login } = useAuth()
const { $api } = useNuxtApp()
const { applyTheme, setupSystemThemeListener } = useTheme()

// 用户名输入响应式变量。
const username = ref('')
// 密码输入响应式变量。
const password = ref('')
// 提交加载中状态。
const loading = ref(false)
// 错误提示文本。
const errorMessage = ref('')

// 系统明暗偏好监听在卸载时释放。
let stopTheme: (() => void) | undefined
onUnmounted(() => stopTheme?.())

// 已登录用户直接跳转目标页，并预先恢复主题外观。
onMounted(async () => {
  stopTheme = setupSystemThemeListener()
  try {
    const res = await $api.settings.get()
    if (res.data) {
      applyTheme(res.data)
    }
  } catch {
    // 访客状态保持默认系统主题。
  }
  if (!user.value) {
    try {
      await refresh()
    } catch {
      // 忽略检查异常。
    }
  }
  if (user.value) {
    const redirect = (route.query.redirect as string) || '/'
    router.replace(redirect)
  }
})

// 处理登录表单提交。
async function handleSubmit() {
  if (!username.value || !password.value) {
    errorMessage.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    await login(username.value, password.value)
    const redirect = (route.query.redirect as string) || '/'
    router.replace(redirect)
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-container">
    <div class="login-card">
      <h1 class="login-title">登录</h1>
      <form class="login-form" @submit.prevent="handleSubmit">
        <div class="field">
          <label for="username">用户名</label>
          <input
            id="username"
            v-model="username"
            type="text"
            autocomplete="username"
            required
            :disabled="loading"
          >
        </div>
        <div class="field">
          <label for="password">密码</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            :disabled="loading"
          >
        </div>
        <p v-if="errorMessage" class="error-text">
          {{ errorMessage }}
        </p>
        <button type="submit" class="submit-button" :disabled="loading">
          {{ loading ? '正在登录...' : '登录' }}
        </button>
      </form>
    </div>
  </main>
</template>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: var(--lh-bg);
  font-family: var(--lh-font-family);
  color: var(--lh-text);
  padding: 16px;
  box-sizing: border-box;
}

.login-card {
  width: 100%;
  max-width: 380px;
  padding: 32px 28px;
  background: color-mix(in srgb, var(--lh-surface) 94%, transparent);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), var(--lh-shadow-card);
  backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  -webkit-backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  color: var(--lh-text);
}

.login-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 24px 0;
  text-align: center;
  color: var(--lh-text);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--lh-text-secondary);
}

.field input {
  padding: 10px 12px;
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-sm);
  background: var(--lh-input-bg);
  color: var(--lh-text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.field input:focus {
  border-color: var(--lh-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lh-accent) 20%, transparent);
}

.error-text {
  color: var(--lh-danger);
  font-size: 13px;
  margin: 0;
}

.submit-button {
  padding: 10px 16px;
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  border: none;
  border-radius: var(--lh-radius-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 6px;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--lh-accent) 30%, transparent);
  transition: opacity 0.15s ease, transform 0.15s ease, background 0.15s ease;
}

.submit-button:hover:not(:disabled) {
  background: var(--lh-accent-hover);
  transform: translateY(-1px);
}

.submit-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
</style>
