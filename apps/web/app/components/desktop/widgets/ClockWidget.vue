<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { WidgetNode } from '@laull-home/shared'
import ClockAnalog from './clock/ClockAnalog.vue'

// 时钟组件接收配置节点与当前卡片网格宽度。
const props = defineProps<{ node: WidgetNode; width: number }>()

// 当前响应式时间对象。
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined

// 页面可见时更新秒针走时，休眠时暂停。
function tick() {
  if (!document.hidden) now.value = new Date()
}

onMounted(() => {
  timer = setInterval(tick, 1000)
  document.addEventListener('visibilitychange', tick)
})

onUnmounted(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', tick)
})

// 按配置时区与 12/24 小时制拆分时间各部分。
const timeParts = computed(() => {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: props.node.timezone || 'Asia/Shanghai',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: props.node.hour12,
    hourCycle: props.node.hour12 ? 'h12' : 'h23',
  })
  const parts = formatter.formatToParts(now.value)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00'
  const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value ?? ''
  return { hour: get('hour'), minute: get('minute'), second: get('second'), dayPeriod }
})

// 获取当前时区下 24 小时制数值，供表盘与日进度精确计算。
const numericTime = computed(() => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: props.node.timezone || 'Asia/Shanghai',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false, hourCycle: 'h23',
  })
  const parts = formatter.formatToParts(now.value)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0)
  const hour = get('hour')
  const minute = get('minute')
  const second = get('second')
  return { hour, minute, second }
})

// 时钟日期与星期中文格式。
const dateText = computed(() => {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: props.node.timezone || 'Asia/Shanghai',
    month: 'long', day: 'numeric', weekday: 'short',
  })
  return formatter.format(now.value)
})

// 模拟表盘指针旋转角度。
const analogAngles = computed(() => {
  const { hour, minute, second } = numericTime.value
  const secondAngle = (second / 60) * 360
  const minuteAngle = ((minute + second / 60) / 60) * 360
  const hourAngle = (((hour % 12) + minute / 60) / 12) * 360
  return { hourAngle, minuteAngle, secondAngle }
})

// 今日已流逝时间百分比。
const dayProgressPercent = computed(() => {
  const { hour, minute, second } = numericTime.value
  const totalSeconds = hour * 3600 + minute * 60 + second
  return Math.min(100, Math.max(0, Math.round((totalSeconds / 86400) * 100)))
})

// 进度环 SVG 周长与偏移。
const circleStroke = 2 * Math.PI * 40
const circleOffset = computed(() => circleStroke - (circleStroke * dayProgressPercent.value) / 100)
</script>

<template>
  <div class="clock-root" :class="['clock-' + (node.variant || 'digital'), { compact: width <= 1 }]">
    <!-- 模拟精工表盘模式 -->
    <ClockAnalog
      v-if="node.variant === 'analog'"
      :angles="analogAngles"
      :date-text="dateText"
    />

    <!-- 复古机械翻牌模式 -->
    <template v-else-if="node.variant === 'flip'">
      <div class="flip-board">
        <div class="flip-card">
          <div class="flip-upper">{{ timeParts.hour }}</div>
          <div class="flip-seam" />
          <div class="flip-lower">{{ timeParts.hour }}</div>
        </div>
        <span class="flip-divider">:</span>
        <div class="flip-card">
          <div class="flip-upper">{{ timeParts.minute }}</div>
          <div class="flip-seam" />
          <div class="flip-lower">{{ timeParts.minute }}</div>
        </div>
      </div>
      <div class="flip-footer">
        <span v-if="node.hour12" class="period-tag">{{ timeParts.dayPeriod }}</span>
        <span class="flip-date">{{ dateText }}</span>
      </div>
    </template>

    <!-- 今日流逝环模式 -->
    <template v-else-if="node.variant === 'progress'">
      <div class="progress-clock">
        <div class="ring-wrap">
          <svg viewBox="0 0 100 100" class="progress-svg">
            <circle cx="50" cy="50" r="40" class="ring-bg" />
            <circle
              cx="50" cy="50" r="40"
              class="ring-fill"
              :stroke-dasharray="circleStroke"
              :stroke-dashoffset="circleOffset"
            />
          </svg>
          <div class="ring-center">
            <span class="ring-percent">{{ dayProgressPercent }}%</span>
            <span class="ring-caption">今日已过</span>
          </div>
        </div>
        <div class="progress-details">
          <time class="progress-time">{{ timeParts.hour }}:{{ timeParts.minute }}</time>
          <span class="progress-date">{{ dateText }}</span>
        </div>
      </div>
    </template>

    <!-- 极简无衬线大字模式 -->
    <template v-else-if="node.variant === 'minimal'">
      <div class="minimal-clock">
        <div class="minimal-time">
          <span class="num">{{ timeParts.hour }}</span>
          <span class="colon">:</span>
          <span class="num">{{ timeParts.minute }}</span>
          <span class="sec">{{ timeParts.second }}</span>
        </div>
        <div class="minimal-sub">
          <span v-if="node.hour12" class="period-tag">{{ timeParts.dayPeriod }}</span>
          <span class="minimal-date">{{ dateText }}</span>
        </div>
      </div>
    </template>

    <!-- 经典数码模式 (默认) -->
    <template v-else>
      <div class="digital-clock">
        <div class="digital-time-row">
          <time class="digital-time">{{ timeParts.hour }}:{{ timeParts.minute }}</time>
          <span class="digital-seconds">{{ timeParts.second }}</span>
        </div>
        <div class="digital-date-row">
          <span v-if="node.hour12" class="period-tag">{{ timeParts.dayPeriod }}</span>
          <span class="digital-date">{{ dateText }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.clock-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 0;
  box-sizing: border-box;
  user-select: none;
}

/* 经典数码时钟样式 */
.digital-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
}
.digital-time-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.digital-time {
  font-size: clamp(26px, 5.5cqw, 42px);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
  line-height: 1;
}
.digital-seconds {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--lh-text-secondary);
  font-weight: 500;
}
.digital-date-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--lh-text-secondary);
}
.period-tag {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--lh-surface-hover);
  color: var(--lh-text);
  font-weight: 600;
}

/* 极简大字时钟样式 */
.minimal-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
}
.minimal-time {
  display: flex;
  align-items: baseline;
  font-size: clamp(28px, 6cqw, 48px);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
  line-height: 1;
}
.minimal-time .colon {
  opacity: 0.7;
  margin: 0 1px;
}
.minimal-time .sec {
  font-size: 12px;
  font-weight: 400;
  color: var(--lh-accent);
  margin-left: 4px;
}
.minimal-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--lh-text-secondary);
}

/* 复古翻牌时钟样式 */
.flip-board {
  display: flex;
  align-items: center;
  gap: 6px;
}
.flip-card {
  position: relative;
  width: 52px;
  height: 58px;
  background: var(--lh-surface-hover);
  border: 1px solid var(--lh-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
}
.flip-upper, .flip-lower {
  width: 100%;
  height: 50%;
  display: flex;
  justify-content: center;
  font-size: 32px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: var(--lh-text);
  overflow: hidden;
}
.flip-upper {
  align-items: flex-end;
  background: color-mix(in srgb, var(--lh-surface-hover) 85%, black);
}
.flip-lower {
  align-items: flex-start;
  background: var(--lh-surface);
}
.flip-seam {
  width: 100%;
  height: 1px;
  background: rgba(0, 0, 0, 0.25);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.15);
}
.flip-divider {
  font-size: 24px;
  font-weight: 700;
  color: var(--lh-text-secondary);
  line-height: 1;
}
.flip-footer {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--lh-text-secondary);
}

/* 今日流逝环时钟样式 */
.progress-clock {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  width: 100%;
}
.ring-wrap {
  position: relative;
  width: 82px;
  height: 82px;
  flex-shrink: 0;
}
.progress-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.ring-bg {
  fill: none;
  stroke: var(--lh-border);
  stroke-width: 6;
}
.ring-fill {
  fill: none;
  stroke: var(--lh-accent);
  stroke-width: 6;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.6s ease;
}
.ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.1;
}
.ring-percent {
  font-size: 15px;
  font-weight: 700;
  color: var(--lh-text);
  font-variant-numeric: tabular-nums;
}
.ring-caption {
  font-size: 9px;
  color: var(--lh-text-secondary);
}
.progress-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.progress-time {
  font-size: 26px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.progress-date {
  font-size: 12px;
  color: var(--lh-text-secondary);
}

@container (max-width: 180px) {
  .dial-meta, .progress-details { display: none; }
  .clock-analog { justify-content: center; }
  .flip-card { width: 38px; height: 44px; }
  .flip-upper, .flip-lower { font-size: 22px; }
}
</style>
