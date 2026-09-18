<script setup lang="ts">
import { computed } from 'vue'
import type { Bookmark, BookmarkGroup, WidgetNode } from '@laull-home/shared'
import ClockWidget from './widgets/ClockWidget.vue'
import BookmarkWidget from './widgets/BookmarkWidget.vue'
import FolderWidget from './widgets/FolderWidget.vue'
import CountdownWidget from './widgets/CountdownWidget.vue'
import TodoWidget from './widgets/TodoWidget.vue'
import NoteWidget from './widgets/NoteWidget.vue'
import ServiceWidget from './widgets/ServiceWidget.vue'

// 渲染器只接收当前空间授权后的书签与分组数据。
const props = defineProps<{ node: WidgetNode; bookmarks: Bookmark[]; groups: BookmarkGroup[]; editing: boolean; width: number }>()

// 组件数据变更、书签交互与数据刷新事件。
const emit = defineEmits<{ update: [node: WidgetNode]; editBookmark: [bookmark: Bookmark]; addBookmark: [groupId?: string]; refresh: [] }>()

// 当前时间响应式引用，复用全局时间对齐服务。
const { now } = useCurrentTime()

// 单书签根据 referenceId 关联真实书签，缺失时优雅回退。
const bookmark = computed<Bookmark>(() => {
  if (props.node.referenceId) {
    const found = props.bookmarks.find(item => item.id === props.node.referenceId)
    if (found) return found
  }
  const first = props.bookmarks[0]
  if (first) return first
  return {
    id: 'placeholder',
    spaceId: '',
    groupId: '',
    title: props.node.title || '快捷书签',
    url: 'https://example.com',
    iconUrl: '',
    sortOrder: 0,
    isPublic: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
})

// 文件夹内容严格根据 referenceId 关联真实分组下的书签列表，空文件夹不展示全局条目。
const folderItems = computed(() => {
  if (props.node.referenceId) {
    return props.bookmarks.filter(item => item.groupId === props.node.referenceId)
  }
  return []
})

// 日历年月日期拆分计算。
const dateParts = computed(() =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: props.node.timezone || 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now.value),
)

// 按周一为起点计算当月日历格。
const month = computed(() => {
  const part = (type: string) => Number(dateParts.value.find(p => p.type === type)?.value)
  const year = part('year')
  const monthNum = part('month')
  const day = part('day')
  return {
    title: `${year}年${monthNum}月`,
    day,
    blank: (new Date(year, monthNum - 1, 1).getDay() + 6) % 7,
    count: new Date(year, monthNum, 0).getDate(),
  }
})
</script>

<template>
  <!-- 搜索小部件 -->
  <QuickSearch v-if="node.type === 'search'" />

  <!-- 多风格时钟小部件 -->
  <ClockWidget v-else-if="node.type === 'clock'" :node="node" :width="width" />

  <!-- 图标书签小部件 -->
  <BookmarkWidget
    v-else-if="node.type === 'bookmark' && bookmark"
    :node="node"
    :bookmark="bookmark"
    :editing="editing"
    :width="width"
    @edit-bookmark="emit('editBookmark', $event)"
  />

  <!-- 折叠收纳文件夹小部件 -->
  <FolderWidget
    v-else-if="node.type === 'folder'"
    :node="node"
    :items="folderItems"
    :editing="editing"
    :width="width"
    @edit-bookmark="emit('editBookmark', $event)"
    @add-bookmark="emit('addBookmark', node.referenceId)"
    @refresh="emit('refresh')"
  />

  <!-- 倒数纪念日小部件 -->
  <CountdownWidget
    v-else-if="node.type === 'countdown'"
    :node="node"
    :editing="editing"
    :width="width"
    @update="emit('update', $event)"
  />

  <!-- 待办清单小部件 -->
  <TodoWidget
    v-else-if="node.type === 'todo'"
    :node="node"
    :editing="editing"
    :width="width"
    @update="emit('update', $event)"
  />

  <!-- 日历小部件 -->
  <div v-else-if="node.type === 'calendar'" class="calendar widget-content">
    <strong>{{ month.title }}</strong>
    <div class="days">
      <span v-for="day in ['一','二','三','四','五','六','日']" :key="day">{{ day }}</span>
      <span v-for="blank in month.blank" :key="'blank' + blank" />
      <span v-for="day in month.count" :key="day" :class="{ today: day === month.day }">{{ day }}</span>
    </div>
  </div>

  <!-- 便签备忘小部件 -->
  <NoteWidget
    v-else-if="node.type === 'note'"
    :node="node"
    :editing="editing"
    :width="width"
    @update="emit('update', $event)"
  />

  <!-- 微服务小部件 -->
  <ServiceWidget
    v-else-if="node.type === 'service'"
    :node="node"
    :editing="editing"
    :width="width"
  />

  <!-- 缺失引用提示 -->
  <div v-else class="missing widget-content">请在组件配置中关联对应书签或分组</div>
</template>

<style scoped>
.widget-content {
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
}

.calendar {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.calendar strong {
  font-size: 13px;
  color: var(--lh-text);
  margin-bottom: 6px;
}

.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  text-align: center;
  font-size: 11px;
}

.days span {
  padding: 4px 0;
  border-radius: 4px;
}

.today {
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  font-weight: 700;
}

.missing {
  display: grid;
  place-items: center;
  text-align: center;
  font-size: 12px;
  color: var(--lh-text-muted);
  border: 1px dashed var(--lh-border);
  border-radius: 8px;
  padding: 12px;
}
</style>
