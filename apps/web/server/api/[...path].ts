// 代理保留 Cookie、Origin 与 Set-Cookie，后端地址不接受请求参数覆盖。
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const path = getRequestURL(event).pathname
  // 只暴露已约定的 API 版本路径。
  if (!path.startsWith('/api/v1/')) throw createError({ statusCode: 404, statusMessage: '接口不存在' })
  const target = new URL(config.apiInternalUrl)
  target.pathname = path
  target.search = getRequestURL(event).search
  return proxyRequest(event, target.href)
})
