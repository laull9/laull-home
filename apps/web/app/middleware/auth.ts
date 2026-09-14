// 受保护路由鉴权中间件，未登录跳转登录页。
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, refresh } = useAuth()
  // 若当前无身份状态，先尝试拉取一次。
  if (!user.value) {
    try {
      await refresh()
    } catch {
      // 网络或读取异常保持未登录处理。
    }
  }
  if (!user.value) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },
    })
  }
})
