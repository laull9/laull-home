// 注册 Service Worker 实现 PWA 离线支持。
export default defineNuxtPlugin(() => {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 静默处理注册失败，不影响核心功能正常运行。
      })
    })
  }
})
