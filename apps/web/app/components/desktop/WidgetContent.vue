<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Bookmark, BookmarkGroup, WidgetNode } from '@laull-home/shared'

// 渲染器只接收当前空间授权后的书签。
const props = defineProps<{ node: WidgetNode; bookmarks: Bookmark[]; groups: BookmarkGroup[]; editing: boolean; width: number }>()
// 便签原地提交配置变更。
const emit = defineEmits<{ update: [node: WidgetNode]; editBookmark: [bookmark: Bookmark]; addBookmark: [] }>()
// 文件夹浮层与筛选状态。
const open = ref(false)
const filter = ref('')
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
// 标签页休眠时停止时钟更新，唤醒立即重读。
function tick() {
  if (!document.hidden) now.value = new Date()
}
onMounted(() => {
  if (props.node.type === 'clock' || props.node.type === 'calendar') {
    timer = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
  }
})
onUnmounted(() => { clearInterval(timer); document.removeEventListener('visibilitychange', tick) })
// 单书签使用真实引用，删除后展示恢复入口。
const bookmark = computed(() => props.bookmarks.find(item => item.id === props.node.referenceId))
// 文件夹内容按原分组顺序显示。
const items = computed(() => props.bookmarks.filter(item => item.groupId === props.node.referenceId && item.title.toLowerCase().includes(filter.value.toLowerCase())))
// 以配置时区生成显示时间。
const time = computed(() => new Intl.DateTimeFormat('zh-CN', { timeZone: props.node.timezone, hour: '2-digit', minute: '2-digit', hour12: props.node.hour12 }).format(now.value))
// 日历月份与日期全部采用相同时区。
const dateParts = computed(() => new Intl.DateTimeFormat('en-CA', { timeZone: props.node.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now.value))
// 按周一为起点计算当月日期格。
const month = computed(() => {
  const part = (type: string) => Number(dateParts.value.find(p => p.type === type)?.value)
  const year = part('year'), month = part('month'), day = part('day')
  return { title: year + '年' + month + '月', day, blank: (new Date(year, month - 1, 1).getDay() + 6) % 7, count: new Date(year, month, 0).getDate() }
})
</script>

<template>
  <QuickSearch v-if="node.type === 'search'" />
  <div v-else-if="node.type === 'clock'" class="clock widget-content">
    <time>{{ time }}</time><span>{{ month.title }}{{ month.day }}日</span>
  </div>
  <div v-else-if="node.type === 'calendar'" class="calendar widget-content">
    <strong>{{ month.title }}</strong>
    <div class="days"><span v-for="day in ['一','二','三','四','五','六','日']" :key="day">{{ day }}</span>
      <span v-for="blank in month.blank" :key="'blank'+blank" />
      <span v-for="day in month.count" :key="day" :class="{ today: day === month.day }">{{ day }}</span>
    </div>
  </div>
  <div v-else-if="node.type === 'note'" class="note widget-content">
    <strong>{{ node.title }}</strong>
    <textarea v-if="editing" :value="node.content" :aria-label="node.title" maxlength="8000" @input="emit('update', { ...node, content: ($event.target as HTMLTextAreaElement).value })" />
    <p v-else>{{ node.content || '空白便签' }}</p>
  </div>
  <a v-else-if="node.type === 'bookmark' && bookmark" class="icon-link widget-content" :href="bookmark.url" target="_blank" rel="noopener noreferrer" @click="editing && ($event.preventDefault(), emit('editBookmark', bookmark))">
    <BookmarkIcon :title="bookmark.title" :icon-url="bookmark.iconUrl" /><span>{{ bookmark.title }}</span>
  </a>
  <div v-else-if="node.type === 'folder'" class="folder widget-content">
    <button v-if="width === 1" class="compact-folder" type="button" :aria-label="'打开'+node.title" @click="open = true">
      <span class="mini-icons"><BookmarkIcon v-for="item in items.slice(0, 4)" :key="item.id" :title="item.title" :icon-url="item.iconUrl" /></span>
      <span>{{ node.title }}</span>
    </button>
    <template v-else>
      <div class="folder-heading"><button type="button" @click="open = true">{{ node.title }} <small>{{ items.length }}</small></button>
        <input v-if="width >= 3" v-model="filter" type="search" aria-label="筛选文件夹书签">
      </div>
      <div class="folder-links"><a v-for="item in items" :key="item.id" :href="item.url" target="_blank" rel="noopener noreferrer" @click="editing && ($event.preventDefault(), emit('editBookmark', item))"><BookmarkIcon :title="item.title" :icon-url="item.iconUrl" /><span>{{ item.title }}</span></a></div>
    </template>
    <BaseModal :show="open" :title="node.title" max-width="640px" @close="open = false">
      <input v-model="filter" type="search" aria-label="筛选文件夹书签" class="folder-filter">
      <div class="folder-links expanded"><a v-for="item in items" :key="item.id" :href="item.url" target="_blank" rel="noopener noreferrer" @click="editing && ($event.preventDefault(), emit('editBookmark', item))"><BookmarkIcon :title="item.title" :icon-url="item.iconUrl" /><span>{{ item.title }}</span></a></div>
      <p v-if="!items.length">暂无书签</p><button v-if="editing" type="button" @click="emit('addBookmark')">添加书签</button>
    </BaseModal>
  </div>
  <div v-else class="missing widget-content">请在组件配置中选择书签</div>
</template>

<style scoped>
.widget-content { height: 100%; min-height: 0; box-sizing: border-box; }
.clock { display: flex; flex-direction: column; justify-content: center; gap: 5px; }
.clock time { font-size: clamp(24px, 6cqw, 42px); font-variant-numeric: tabular-nums; letter-spacing: -.04em; }
.clock span, small { color: var(--lh-text-secondary); font-size: 12px; }
.days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; margin-top: 12px; text-align: center; font-size: 12px; }
.days span { padding: 5px 0; }
.today { background: var(--lh-accent); color: var(--lh-accent-text); border-radius: 50%; }
.note { display: flex; flex-direction: column; gap: 12px; }
.note p { margin: 0; white-space: pre-wrap; overflow: auto; overflow-wrap: anywhere; line-height: 1.7; }
.note textarea { flex: 1; min-height: 30px; width: 100%; resize: none; border: 0; background: transparent; color: inherit; font: inherit; }
.icon-link { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-decoration: none; color: inherit; font-size: 12px; }
.icon-link > span:last-child { max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.icon-link img, .initial { width: 36px; height: 36px; border-radius: 12px; }
.initial { display: grid; place-items: center; flex-shrink: 0; background: var(--lh-surface-hover); color: var(--lh-text); font-weight: 600; }
.folder { display: flex; flex-direction: column; gap: 10px; }
.folder-heading { display: flex; gap: 6px; justify-content: space-between; align-items: center; }
.folder-heading input { width: 36%; min-width: 0; }
.folder button { background: transparent; color: inherit; border: 0; padding: 0; text-align: left; cursor: pointer; }
.folder-links { display: grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap: 12px; overflow: auto; }
.folder-links a { display: flex; flex-direction: column; align-items: center; gap: 6px; color: inherit; text-decoration: none; min-width: 0; font-size: 11px; }
.folder-links a > span:last-child { max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.compact-folder { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 11px; }
.mini-icons { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; }
.mini-icons { --bookmark-icon-size: 20px; }
.expanded { margin-top: 16px; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); }
.folder-filter { width: 100%; box-sizing: border-box; }
@container (max-width: 150px) { .clock span { font-size: 10px; } .days { gap: 0; } }
</style>
