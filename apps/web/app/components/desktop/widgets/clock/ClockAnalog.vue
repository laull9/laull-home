<script setup lang="ts">
// 模拟表盘指针旋转角度参数。
const props = defineProps<{
  angles: { hourAngle: number; minuteAngle: number; secondAngle: number }
  dateText: string
}>()

// 模拟表盘 12 处主刻度。
const dialTicks = Array.from({ length: 12 }, (_, i) => ({
  deg: i * 30,
  isMajor: i % 3 === 0,
}))
</script>

<template>
  <div class="clock-analog">
    <div class="analog-dial">
      <div
        v-for="tickItem in dialTicks"
        :key="tickItem.deg"
        class="dial-tick"
        :class="{ major: tickItem.isMajor }"
        :style="{ transform: 'rotate(' + tickItem.deg + 'deg) translateY(-42px)' }"
      />
      <div class="hand hour-hand" :style="{ transform: 'rotate(' + angles.hourAngle + 'deg)' }" />
      <div class="hand minute-hand" :style="{ transform: 'rotate(' + angles.minuteAngle + 'deg)' }" />
      <div class="hand second-hand" :style="{ transform: 'rotate(' + angles.secondAngle + 'deg)' }" />
      <div class="dial-center-pin" />
    </div>
    <div class="dial-meta">
      <span class="dial-date">{{ props.dateText }}</span>
    </div>
  </div>
</template>

<style scoped>
.clock-analog {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  gap: 12px;
  padding: 4px;
}
.analog-dial {
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  border: 2px solid var(--lh-border);
  background: color-mix(in srgb, var(--lh-surface) 90%, transparent);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
  display: grid;
  place-items: center;
}
.dial-tick {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1px;
  height: 5px;
  background: var(--lh-text-muted);
  transform-origin: center center;
  margin-left: -0.5px;
  margin-top: -2.5px;
}
.dial-tick.major {
  width: 2px;
  height: 7px;
  background: var(--lh-text);
  margin-left: -1px;
  margin-top: -3.5px;
}
.hand {
  position: absolute;
  bottom: 50%;
  left: 50%;
  transform-origin: bottom center;
  border-radius: 2px;
}
.hour-hand {
  width: 3px;
  height: 28px;
  margin-left: -1.5px;
  background: var(--lh-text);
}
.minute-hand {
  width: 2px;
  height: 38px;
  margin-left: -1px;
  background: var(--lh-text);
}
.second-hand {
  width: 1px;
  height: 42px;
  margin-left: -0.5px;
  background: var(--lh-accent);
}
.dial-center-pin {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--lh-accent);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.2);
}
.dial-meta {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}
.dial-date {
  font-size: 13px;
  color: var(--lh-text);
  font-weight: 500;
}
@container (max-width: 180px) {
  .dial-meta { display: none; }
  .clock-analog { justify-content: center; }
}
</style>
