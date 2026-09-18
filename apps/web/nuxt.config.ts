// Nuxt 只负责页面与同源代理，业务逻辑留在 Elysia。
export default defineNuxtConfig({
  // 固定框架兼容行为。
  compatibilityDate: '2025-07-15',
  // 按环境控制开发工具。
  devtools: { enabled: process.env.NODE_ENV !== 'production' },
  // API 类型依赖仅在编译时使用。
  typescript: { strict: true },
  // 全局 Head 元数据声明与 PWA 清单链接。
  app: {
    head: {
      title: '我的主页',
      meta: [
        { name: 'theme-color', content: '#121316' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
    },
  },
  // 后端地址仅供 Nitro 与 SSR 使用，不公开到客户端；默认自动推导，无需外部手动配置。
  runtimeConfig: {
    // 自动跟随内部后端地址，也可通过 NUXT_API_INTERNAL_URL 显式覆盖。
    apiInternalUrl: process.env.NUXT_API_INTERNAL_URL
      || `http://${process.env.LAULL_HOME_HOST || '127.0.0.1'}:${process.env.LAULL_HOME_PORT || '3001'}`,
  },
})

