import { treaty } from '@elysiajs/eden'
import type { App } from '@laull-home/server'

// 每个 SSR 请求创建独立客户端，避免不同访客之间共享 Cookie。
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const baseURL = import.meta.server ? config.apiInternalUrl : window.location.origin
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  const api = treaty<App>(baseURL, {
    // 浏览器通过同源 API 自动携带 HttpOnly Cookie。
    fetch: { credentials: 'include' },
    // SSR 只转发当前请求的认证 Cookie。
    headers,
  }).api.v1
  return { provide: { api } }
})
