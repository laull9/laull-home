// 注册 Service Worker 实现 PWA 离线支持。
export default defineNuxtPlugin(() => {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    // 页面完成加载后注册；插件延迟执行时直接注册，避免错过 load 事件。
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
        void registration.update()
      }).catch(() => {
        // 静默处理注册失败，不影响核心功能正常运行。
      })
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }
})
