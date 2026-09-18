// 自动将发往前端的 /api/* 请求透明转发至内部后端，无需外部配置反代分流。
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const url = getRequestURL(event)
  const target = new URL(config.apiInternalUrl)
  target.pathname = url.pathname
  target.search = url.search
  return proxyRequest(event, target.href)
})

