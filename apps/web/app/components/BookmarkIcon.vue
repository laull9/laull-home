<script setup lang="ts">
import { computed, ref, watch } from 'vue'

// 书签图标统一处理自定义地址、缓存与失败回退。
const props = defineProps<{ title: string; iconUrl: string }>()
// 失败状态只存在于渲染器，不改写书签数据。
const failed = ref(false)
watch(() => props.iconUrl, () => { failed.value = false })
// 禁止脚本、协议相对路径与未经允许的资源协议。
const source = computed(() => {
  if (/^\/(?!\/)[^\\\s]+$/.test(props.iconUrl)) return props.iconUrl
  try {
    const url = new URL(props.iconUrl)
    if (['http:', 'https:'].includes(url.protocol)) return url.href
  } catch { /* 缺失图标使用本地回退。 */ }
  return ''
})
</script>
<template>
  <span class="bookmark-icon-frame">
    <img v-if="source && !failed" :src="source" alt="" draggable="false" loading="lazy" referrerpolicy="no-referrer" @error="failed = true">
    <span v-else class="bookmark-icon-fallback" aria-hidden="true">{{ (title.trim()[0] ?? '链').toUpperCase() }}</span>
  </span>
</template>
<style scoped>
.bookmark-icon-frame { width: var(--bookmark-icon-size, 36px); height: var(--bookmark-icon-size, 36px); display: inline-grid; place-items: center; flex-shrink: 0; border-radius: 10px; overflow: hidden; }
img { width: 100%; height: 100%; object-fit: contain; }
.bookmark-icon-fallback { width: 100%; height: 100%; display: grid; place-items: center; background: var(--lh-surface-hover); color: var(--lh-text); font-weight: 600; font-size: calc(var(--bookmark-icon-size, 36px) * .44); }
</style>
