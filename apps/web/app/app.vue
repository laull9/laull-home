<script setup lang="ts">
// 顶层挂载页面并恢复会话状态。
const { refresh } = useAuth()
onMounted(async () => {
  try {
    await refresh()
  } catch {
    // 允许访客状态访问。
  }
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>
