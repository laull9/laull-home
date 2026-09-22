import { clearAllLocalCaches } from '../utils/localCache'

// 用户身份状态按 SSR 请求隔离，客户端沿用 Nuxt 状态。
export function useAuth() {
  const user = useState<{ id: number; username: string; isDefaultPassword?: boolean } | null>('auth:user', () => null)
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
    clearAllLocalCaches()
    user.value = result.data.user
  }

  // 退出成功后清除本地身份状态。
  async function logout() {
    if (import.meta.server) throw new Error('退出操作需要在浏览器执行')
    const result = await $api.auth.logout.post()
    if (result.error && result.status !== 401) throw new Error('退出失败，请稍后重试')
    clearAllLocalCaches()
    user.value = null
  }

  // 修改密码并更新本地会话。
  async function changePassword(oldPassword: string, newPassword: string) {
    if (import.meta.server) throw new Error('修改密码需要在浏览器执行')
    const result = await $api.auth['change-password'].post({ oldPassword, newPassword })
    if (result.error) throw new Error(result.error.value?.message ?? '修改密码失败')
    await refresh()
  }

  // 修改当前用户名并更新本地状态。
  async function changeUsername(newUsername: string) {
    if (import.meta.server) throw new Error('修改用户名需要在浏览器执行')
    const result = await $api.auth['change-username'].post({ newUsername })
    if (result.error) throw new Error(result.error.value?.message ?? '修改用户名失败')
    await refresh()
  }

  // 获取活动会话列表。
  async function fetchSessions() {
    const result = await $api.auth.sessions.get()
    if (result.error) throw new Error('读取设备列表失败')
    return result.data.sessions
  }

  // 撤销指定设备会话。
  async function revokeSession(id: string) {
    if (import.meta.server) throw new Error('操作需要在浏览器执行')
    const result = await $api.auth.sessions({ id }).delete()
    if (result.error) throw new Error('撤销设备会话失败')
  }

  // 撤销除当前会话外的所有设备。
  async function revokeOthers() {
    if (import.meta.server) throw new Error('操作需要在浏览器执行')
    const result = await $api.auth['revoke-others'].post()
    if (result.error) throw new Error('撤销其他设备失败')
  }

  return {
    user: readonly(user),
    refresh,
    login,
    logout,
    changePassword,
    changeUsername,
    fetchSessions,
    revokeSession,
    revokeOthers,
  }
}
