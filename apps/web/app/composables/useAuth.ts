// 用户身份状态按 SSR 请求隔离，客户端沿用 Nuxt 状态。
export function useAuth() {
  const user = useState<{ id: number; username: string } | null>('auth:user', () => null)
  const { $api } = useNuxtApp()

  // SSR 与客户端均可刷新当前身份，服务异常不伪装成未登录。
  async function refresh() {
    const result = await $api.auth.me.get()
    if (result.error && result.status !== 401) throw new Error('读取登录状态失败')
    user.value = result.data?.user ?? null
    return user.value
  }

  // 登录由浏览器执行，让浏览器接收后端的 Set-Cookie。
  async function login(username: string, password: string) {
    if (import.meta.server) throw new Error('登录操作需要在浏览器执行')
    const result = await $api.auth.login.post({ username, password })
    if (result.error) throw new Error('登录失败，请检查账号或稍后重试')
    user.value = result.data.user
  }

  // 退出成功后清除本地身份状态。
  async function logout() {
    if (import.meta.server) throw new Error('退出操作需要在浏览器执行')
    const result = await $api.auth.logout.post()
    if (result.error && result.status !== 401) throw new Error('退出失败，请稍后重试')
    user.value = null
  }

  return { user: readonly(user), refresh, login, logout }
}
