// 自动将发往前端的 /api/* 请求透明转发至内部后端，并联动客户端中止信号防止长连接泄漏。
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const url = getRequestURL(event)
  const target = new URL(config.apiInternalUrl)
  target.pathname = url.pathname
  target.search = url.search

  // 绑定客户端异常断开信号，避免前端关闭或刷新时后台 SSE/长连接泄漏。
  const controller = new AbortController()
  event.node.res.once('close', () => {
    if (!event.node.res.writableEnded) {
      controller.abort()
    }
  })
  event.node.req.once('aborted', () => {
    controller.abort()
  })

  // 携带中止信号调用透明转发 proxyRequest(event, target.href)。
  return proxyRequest(event, target.href, {
    fetchOptions: {
      signal: controller.signal,
    },
  })
})

