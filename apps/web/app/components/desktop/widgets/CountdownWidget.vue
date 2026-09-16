<script setup lang="ts">
import { computed } from 'vue'
import type { WidgetNode } from '@laull-home/shared'

// 倒数纪念日小部件接收配置节点、编辑状态与宽度。
const props = defineProps<{ node: WidgetNode; editing: boolean; width: number }>()

// 原地保存修改。
const emit = defineEmits<{ update: [node: WidgetNode] }>()

// 获取今天凌晨时间戳。
const today = computed(() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
})

// 解析目标日期；未设置时默认取下一个元旦。
const targetDateStr = computed(() => {
  if (props.node.content && /^\d{4}-\d{2}-\d{2}$/.test(props.node.content.trim())) {
    return props.node.content.trim()
  }
  const nextYear = new Date().getFullYear() + 1
  return `${nextYear}-01-01`
})

// 目标日时间戳。
const targetTime = computed(() => {
  const parts = targetDateStr.value.split('-').map(Number)
  return new Date(parts[0]!, parts[1]! - 1, parts[2]!).getTime()
})

// 计算天数差距与状态描述。
const daysDiff = computed(() => {
  const diff = Math.round((targetTime.value - today.value) / 86400000)
  return diff
})

// 状态标签与大数字文本。
const statusMeta = computed(() => {
  const diff = daysDiff.value
  if (diff > 0) return { label: '还有', days: diff, unit: '天', isPast: false, isToday: false }
  if (diff === 0) return { label: '就是', days: 0, unit: '今天', isPast: false, isToday: true }
  return { label: '已过去', days: Math.abs(diff), unit: '天', isPast: true, isToday: false }
})

// 目标日中文格式展示。
const formattedTarget = computed(() => {
  const parts = targetDateStr.value.split('-')
  return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`
})

// 倒计时周期进度计算 (基于 100 天或当年度基准)。
const progressPercent = computed(() => {
  const diff = daysDiff.value
  if (diff <= 0) return 100
  if (diff >= 365) return 10
  return Math.min(95, Math.max(8, Math.round(((365 - diff) / 365) * 100)))
})
</script>

<template>
  <div class="countdown-root" :class="{ compact: width <= 1 }">
    <div class="countdown-header">
      <span class="countdown-title">{{ node.title || '目标倒计时' }}</span>
      <input
        v-if="editing"
        type="date"
        :value="targetDateStr"
        aria-label="选择目标日期"
        class="countdown-date-picker"
        @change="emit('update', { ...node, content: ($event.target as HTMLInputElement).value })"
      >
      <span v-else class="countdown-date-text">{{ formattedTarget }}</span>
    </div>

    <div class="countdown-body">
      <span class="status-prefix">{{ statusMeta.label }}</span>
      <div class="num-wrapper">
        <span class="days-num" :class="{ today: statusMeta.isToday }">
          {{ statusMeta.days }}
        </span>
        <span class="days-unit">{{ statusMeta.unit }}</span>
      </div>
    </div>

    <div class="progress-bar-track">
      <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }" />
    </div>
  </div>
</template>

<style scoped>
.countdown-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-sizing: border-box;
  padding: 4px;
}

.countdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.countdown-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--lh-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.countdown-date-text {
  font-size: 11px;
  color: var(--lh-text-secondary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.countdown-date-picker {
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--lh-border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--lh-input-bg) 85%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--lh-text);
}

.countdown-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 4px 0;
}

.status-prefix {
  font-size: 11px;
  color: var(--lh-text-secondary);
  font-weight: 500;
}

.num-wrapper {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.days-num {
  font-size: clamp(32px, 7cqw, 48px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
  color: var(--lh-accent);
  line-height: 1;
}

.days-num.today {
  color: #10b981;
}

.days-unit {
  font-size: 14px;
  font-weight: 600;
  color: var(--lh-text);
}

.progress-bar-track {
  width: 100%;
  height: 5px;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--lh-border) 60%, transparent);
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
}

.progress-bar-fill {
  height: 100%;
  background: var(--lh-accent);
  border-radius: 9999px;
  box-shadow: 0 0 8px color-mix(in srgb, var(--lh-accent) 40%, transparent);
  transition: width 0.3s ease;
}

@container (max-width: 140px) {
  .countdown-date-text { display: none; }
  .days-num { font-size: 26px; }
}
</style>
