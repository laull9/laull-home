// Nuxt 只负责页面与同源代理，业务逻辑留在 Elysia。
export default defineNuxtConfig({
  // 固定框架兼容行为。
  compatibilityDate: '2025-07-15',
  // 按环境控制开发工具。
  devtools: { enabled: process.env.NODE_ENV !== 'production' },
  // API 类型依赖仅在编译时使用。
  typescript: { strict: true },
  // 后端地址仅供 Nitro 与 SSR 使用，不公开到客户端。
  runtimeConfig: {
    // 可通过 NUXT_API_INTERNAL_URL 覆盖。
    apiInternalUrl: 'http://127.0.0.1:3001',
  },
})
