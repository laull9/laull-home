<script setup lang="ts">
// 页面元信息配置。
definePageMeta({
  layout: false,
})

const router = useRouter()
const route = useRoute()
const { user, refresh, login } = useAuth()

// 用户名输入响应式变量。
const username = ref('')
// 密码输入响应式变量。
const password = ref('')
// 提交加载中状态。
const loading = ref(false)
// 错误提示文本。
const errorMessage = ref('')

// 已登录用户直接跳转目标页。
onMounted(async () => {
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
  background: #f3f4f6;
  font-family: system-ui, -apple-system, sans-serif;
}
.login-card {
  width: 100%;
  max-width: 380px;
  padding: 32px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.login-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 24px;
  text-align: center;
  color: #111827;
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
  font-size: 14px;
  color: #374151;
}
.field input {
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
}
.field input:focus {
  border-color: #2563eb;
}
.error-text {
  color: #dc2626;
  font-size: 14px;
  margin: 0;
}
.submit-button {
  padding: 10px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-size: 15px;
  cursor: pointer;
  margin-top: 8px;
}
.submit-button:hover:not(:disabled) {
  background: #1d4ed8;
}
.submit-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
