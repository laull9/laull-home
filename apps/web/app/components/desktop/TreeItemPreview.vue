<script setup lang="ts">
import { computed } from 'vue'
import type { TreeItem } from './treeCatalog'

// 微缩组件预览接收组件项定义与可选示例数据。
defineProps<{ item: TreeItem }>()

// 实时响应式时间，保持微缩时钟与全局主时钟严格对齐运转。
const { now } = useCurrentTime()

// 格式化当前时分秒。
const timeString = computed(() => {
  const h = String(now.value.getHours()).padStart(2, '0')
  const m = String(now.value.getMinutes()).padStart(2, '0')
  const s = String(now.value.getSeconds()).padStart(2, '0')
  return { h, m, s, hm: `${h}:${m}` }
})

// 模拟表盘指针旋转角度。
const analogAngles = computed(() => {
  const s = now.value.getSeconds()
  const m = now.value.getMinutes()
  const h = now.value.getHours() % 12
  return {
    hour: (h + m / 60) * 30,
    minute: (m + s / 60) * 6,
    second: s * 6,
  }
})

// 24 小时流逝百分比。
const dayProgress = computed(() => {
  const total = now.value.getHours() * 3600 + now.value.getMinutes() * 60 + now.value.getSeconds()
  return Math.round((total / 86400) * 100)
})
</script>

<template>
  <div class="preview-stage" :class="['type-' + item.type, { 'is-frameless': item.frameless }]">
    <!-- 搜索条微缩 -->
    <div v-if="item.type === 'search'" class="preview-search">
      <span class="preview-google-g">G</span>
      <span class="preview-search-placeholder">在 Google 中搜索...</span>
      <span class="preview-search-btn">🔍</span>
    </div>

    <!-- 时钟微缩预览 -->
    <template v-else-if="item.type === 'clock'">
      <!-- 模拟精工表盘 -->
      <div v-if="item.variant === 'analog'" class="preview-analog">
        <svg viewBox="0 0 100 100" class="analog-svg" aria-hidden="true">
          <circle cx="50" cy="50" r="46" class="dial-bg" />
          <circle cx="50" cy="50" r="46" class="dial-rim" />
          <!-- 简明 4 个主刻度 -->
          <line x1="50" y1="8" x2="50" y2="14" class="dial-tick" />
          <line x1="50" y1="86" x2="50" y2="92" class="dial-tick" />
          <line x1="8" y1="50" x2="14" y2="50" class="dial-tick" />
          <line x1="86" y1="50" x2="92" y2="50" class="dial-tick" />
          <!-- 时针、分针与秒针 -->
          <line x1="50" y1="50" x2="50" y2="26" class="hand hour" :style="{ transform: `rotate(${analogAngles.hour}deg)` }" />
          <line x1="50" y1="50" x2="50" y2="18" class="hand minute" :style="{ transform: `rotate(${analogAngles.minute}deg)` }" />
          <line x1="50" y1="52" x2="50" y2="14" class="hand second" :style="{ transform: `rotate(${analogAngles.second}deg)` }" />
          <circle cx="50" cy="50" r="3" class="dial-pivot" />
        </svg>
      </div>

      <!-- 复古机械翻牌 -->
      <div v-else-if="item.variant === 'flip'" class="preview-flip">
        <div class="flip-card"><span>{{ timeString.h }}</span></div>
        <span class="flip-sep">:</span>
        <div class="flip-card"><span>{{ timeString.m }}</span></div>
      </div>

      <!-- 今日流逝环 -->
      <div v-else-if="item.variant === 'progress'" class="preview-progress">
        <svg viewBox="0 0 44 44" class="progress-ring">
          <circle cx="22" cy="22" r="18" class="ring-bg" />
          <circle cx="22" cy="22" r="18" class="ring-fill" :style="{ strokeDashoffset: 113.1 * (1 - dayProgress / 100) }" />
        </svg>
        <div class="progress-text">
          <span class="progress-val">{{ dayProgress }}%</span>
          <span class="progress-sub">{{ timeString.hm }}</span>
        </div>
      </div>

      <!-- 极简大字时钟 -->
      <div v-else-if="item.variant === 'minimal'" class="preview-minimal">
        <span class="minimal-time">{{ timeString.hm }}</span>
      </div>

      <!-- 经典数码时钟 (默认) -->
      <div v-else class="preview-digital">
        <span class="digital-time">{{ timeString.hm }}</span>
        <span class="digital-sec">:{{ timeString.s }}</span>
      </div>
    </template>

    <!-- 图标书签微缩 -->
    <template v-else-if="item.type === 'bookmark'">
      <!-- 胶囊信息卡 -->
      <div v-if="item.variant === 'pill'" class="preview-pill">
        <div class="demo-icon">★</div>
        <div class="pill-meta">
          <span class="pill-name">常用站点</span>
          <span class="pill-domain">example.com</span>
        </div>
      </div>

      <!-- 48px 质感大图标 -->
      <div v-else-if="item.variant === 'large'" class="preview-large-bm">
        <div class="large-badge">★</div>
        <span class="large-text">应用</span>
      </div>

      <!-- 字母徽章 -->
      <div v-else-if="item.variant === 'emblem'" class="preview-emblem">
        <div class="emblem-box">L</div>
        <span class="emblem-text">Laull</span>
      </div>

      <!-- 标准图标 (默认) -->
      <div v-else class="preview-standard-bm">
        <div class="standard-icon">★</div>
        <span class="standard-text">捷径</span>
      </div>
    </template>

    <!-- 文件夹收纳微缩 -->
    <template v-else-if="item.type === 'folder'">
      <!-- 启动台九宫格 -->
      <div v-if="item.variant === 'launchpad'" class="preview-launchpad">
        <div v-for="i in 8" :key="i" class="launch-dot" />
        <div class="launch-plus">+</div>
      </div>

      <!-- 横滑书架 -->
      <div v-else-if="item.variant === 'shelf'" class="preview-shelf">
        <div v-for="i in 4" :key="i" class="shelf-pill">●</div>
      </div>

      <!-- 经典平铺网格 -->
      <div v-else-if="item.variant === 'grid'" class="preview-grid">
        <div v-for="i in 4" :key="i" class="grid-cell">■</div>
      </div>

      <!-- 风琴收纳抽屉 (默认) -->
      <div v-else class="preview-accordion">
        <div class="accordion-bar">
          <span class="bar-title">分组收纳</span>
          <span class="bar-tag">4项</span>
        </div>
        <div class="accordion-dots">
          <span v-for="i in 4" :key="i" class="acc-dot" />
        </div>
      </div>
    </template>

    <!-- 倒数日微缩 -->
    <div v-else-if="item.type === 'countdown'" class="preview-countdown">
      <div class="countdown-days">
        <span class="c-num">30</span>
        <span class="c-unit">天</span>
      </div>
      <span class="c-name">重要倒数</span>
    </div>

    <!-- 待办清单微缩 -->
    <div v-else-if="item.type === 'todo'" class="preview-todo">
      <div class="todo-line done"><span class="check-box">✓</span> 探索新功能</div>
      <div class="todo-line"><span class="check-box" /> 整理收藏夹</div>
    </div>

    <!-- 便签微缩 -->
    <div v-else-if="item.type === 'note'" class="preview-note">
      <span class="note-pin">📌</span>
      <span class="note-txt">随手记录灵感与清单...</span>
    </div>

    <!-- 日历微缩 -->
    <div v-else-if="item.type === 'calendar'" class="preview-calendar">
      <div class="cal-head">9月</div>
      <div class="cal-mini-grid">
        <span v-for="d in 14" :key="d" :class="{ 'cal-today': d === 9 }">{{ d }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-stage {
  width: 100%;
  height: 52px;
  border-radius: var(--lh-radius-sm);
  background: color-mix(in srgb, var(--lh-surface-hover) 70%, transparent);
  border: 1px solid var(--lh-border);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  padding: 4px 8px;
  user-select: none;
  pointer-events: none;
  color: var(--lh-text);
  transition: transform .2s, border-color .2s;
}
.preview-stage.is-frameless {
  background: transparent;
  border-color: color-mix(in srgb, var(--lh-border) 60%, transparent);
}

/* 搜索条样式 */
.preview-search {
  width: 90%;
  height: 28px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--lh-surface) 90%, transparent);
  border: 1px solid var(--lh-border);
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 6px;
  color: var(--lh-text-secondary);
  box-shadow: var(--lh-shadow-sm);
}
.preview-google-g { font-weight: 800; font-size: 13px; color: var(--lh-accent); }
.preview-search-placeholder { font-size: 11px; flex: 1; color: var(--lh-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preview-search-btn { font-size: 11px; }

/* 时钟样式 */
.preview-digital { font-size: 18px; font-weight: 700; font-family: monospace; display: flex; align-items: baseline; color: var(--lh-text); }
.digital-sec { font-size: 12px; opacity: .7; margin-left: 2px; }

.preview-analog { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; }
.analog-svg { width: 100%; height: 100%; }
.dial-bg { fill: color-mix(in srgb, var(--lh-surface) 90%, transparent); }
.dial-rim { fill: none; stroke: var(--lh-border); stroke-width: 2.5; }
.dial-tick { stroke: var(--lh-border-hover); stroke-width: 2.5; }
.hand { stroke-linecap: round; transform-origin: 50px 50px; }
.hand.hour { stroke: var(--lh-text); stroke-width: 3.5; }
.hand.minute { stroke: var(--lh-text-secondary); stroke-width: 2.5; }
.hand.second { stroke: var(--lh-accent); stroke-width: 1.5; }
.dial-pivot { fill: var(--lh-accent); }

.preview-flip { display: flex; align-items: center; gap: 4px; }
.flip-card { background: var(--lh-surface); color: var(--lh-text); font-family: monospace; font-size: 16px; font-weight: 800; padding: 2px 6px; border-radius: 4px; box-shadow: var(--lh-shadow-sm); border: 1px solid var(--lh-border); }
.flip-sep { font-weight: 800; opacity: .7; color: var(--lh-text); }

.preview-progress { display: flex; align-items: center; gap: 8px; }
.progress-ring { width: 36px; height: 36px; transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: var(--lh-border); stroke-width: 4; }
.ring-fill { fill: none; stroke: var(--lh-accent); stroke-width: 4; stroke-dasharray: 113.1; stroke-linecap: round; }
.progress-text { display: flex; flex-direction: column; }
.progress-val { font-size: 13px; font-weight: 700; color: var(--lh-accent); }
.progress-sub { font-size: 10px; opacity: .7; font-family: monospace; color: var(--lh-text-secondary); }

.preview-minimal { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: var(--lh-text); }

/* 书签样式 */
.preview-standard-bm { display: flex; align-items: center; gap: 6px; color: var(--lh-text); }
.standard-icon { width: 26px; height: 26px; border-radius: 6px; background: var(--lh-accent); color: var(--lh-accent-text); display: flex; align-items: center; justify-content: center; font-size: 12px; }
.standard-text { font-size: 12px; font-weight: 600; }

.preview-large-bm { display: flex; flex-direction: column; align-items: center; gap: 2px; color: var(--lh-text); }
.large-badge { width: 30px; height: 30px; border-radius: 8px; background: var(--lh-accent); color: var(--lh-accent-text); display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 6px color-mix(in srgb, var(--lh-accent) 30%, transparent); }
.large-text { font-size: 10px; font-weight: 500; }

.preview-pill { display: flex; align-items: center; gap: 8px; width: 85%; background: var(--lh-surface); padding: 4px 8px; border-radius: var(--lh-radius-full); border: 1px solid var(--lh-border); color: var(--lh-text); }
.demo-icon { width: 20px; height: 20px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; }
.pill-meta { display: flex; flex-direction: column; }
.pill-name { font-size: 11px; font-weight: 600; line-height: 1.1; }
.pill-domain { font-size: 9px; opacity: .7; line-height: 1.1; color: var(--lh-text-secondary); }

.preview-emblem { display: flex; align-items: center; gap: 6px; color: var(--lh-text); }
.emblem-box { width: 24px; height: 24px; border-radius: 6px; background: var(--lh-accent); color: var(--lh-accent-text); font-weight: 800; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.emblem-text { font-size: 12px; font-weight: 600; }

/* 文件夹样式 */
.preview-accordion { width: 90%; display: flex; flex-direction: column; gap: 4px; color: var(--lh-text); }
.accordion-bar { display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; }
.bar-tag { font-size: 9px; opacity: .7; }
.accordion-dots { display: flex; gap: 4px; }
.acc-dot { width: 14px; height: 14px; border-radius: 3px; background: var(--lh-surface); border: 1px solid var(--lh-border); }

.preview-launchpad { display: grid; grid-template-columns: repeat(3, 11px); grid-template-rows: repeat(3, 11px); gap: 3px; }
.launch-dot { border-radius: 2px; background: var(--lh-accent); }
.launch-plus { border-radius: 2px; background: var(--lh-surface-hover); border: 1px solid var(--lh-border); font-size: 8px; display: flex; align-items: center; justify-content: center; color: var(--lh-text-secondary); }

.preview-shelf { display: flex; gap: 6px; }
.shelf-pill { padding: 2px 6px; border-radius: 4px; background: var(--lh-surface); border: 1px solid var(--lh-border); color: var(--lh-text); font-size: 9px; }

.preview-grid { display: grid; grid-template-columns: repeat(2, 14px); gap: 4px; color: var(--lh-text-secondary); font-size: 10px; }

/* 工具微缩 */
.preview-countdown { display: flex; align-items: center; gap: 8px; }
.countdown-days { display: flex; align-items: baseline; gap: 2px; color: var(--lh-accent); }
.c-num { font-size: 20px; font-weight: 800; }
.c-unit { font-size: 11px; }
.c-name { font-size: 11px; opacity: .8; color: var(--lh-text-secondary); }

.preview-todo { width: 90%; font-size: 10px; display: flex; flex-direction: column; gap: 3px; color: var(--lh-text); }
.todo-line { display: flex; align-items: center; gap: 4px; }
.todo-line.done { text-decoration: line-through; opacity: .6; color: var(--lh-text-muted); }
.check-box { width: 10px; height: 10px; border: 1px solid var(--lh-border); border-radius: 2px; display: inline-flex; align-items: center; justify-content: center; font-size: 8px; color: #10b981; }

.preview-note { width: 85%; background: color-mix(in srgb, var(--lh-surface) 90%, transparent); border: 1px dashed var(--lh-border); border-radius: 6px; padding: 4px 6px; display: flex; align-items: center; gap: 4px; color: var(--lh-text); }
.note-pin { font-size: 12px; }
.note-txt { font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.preview-calendar { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.cal-head { font-size: 10px; font-weight: 700; color: var(--lh-accent); }
.cal-mini-grid { display: grid; grid-template-columns: repeat(7, 8px); gap: 2px; font-size: 7px; text-align: center; color: var(--lh-text-secondary); }
.cal-today { background: var(--lh-accent); color: var(--lh-accent-text); border-radius: 50%; }
</style>
