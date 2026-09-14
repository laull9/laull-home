<script setup lang="ts">
import { looksLikeUrl, isValidSafeUrl, type SearchEngine } from "@laull-home/shared"

const { engines, defaultEngine, fetchEngines } = useSearch()

// 搜索主输入内容。
const searchQuery = ref("")

// 当前选中的临时活动搜索引擎。
const selectedEngine = ref<SearchEngine | null>(null)

// 搜索引擎下拉平铺面板展开状态。
const isDropdownOpen = ref(false)

// 添加自定义搜索引擎弹窗显隐状态。
const showAddModal = ref(false)

// 搜索栏容器引用，用于处理点击外部关闭下拉面板。
const searchContainerRef = ref<HTMLElement | null>(null)

// 最终生效的活动搜索引擎。
const activeEngine = computed<SearchEngine | null>(() => {
  return selectedEngine.value ?? defaultEngine.value ?? engines.value[0] ?? null
})

// 搜索框动态占位提示文本。
const placeholderText = computed(() => {
  if (activeEngine.value) {
    return "在 " + activeEngine.value.name + " 中搜索或输入网址..."
  }
  return "输入搜索内容或网址..."
})

onMounted(async () => {
  await fetchEngines()
  document.addEventListener("click", handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside)
})

// 切换下拉面板显隐。
function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value
}

// 选择特定搜索引擎。
function handleSelectEngine(engine: SearchEngine) {
  selectedEngine.value = engine
  isDropdownOpen.value = false
}

// 打开新增自定义搜索引擎通用弹窗。
function openAddModal() {
  isDropdownOpen.value = false
  showAddModal.value = true
}

// 处理自定义搜索引擎创建完成。
function handleEngineCreated(engine: SearchEngine) {
  selectedEngine.value = engine
}

// 清空当前搜索输入内容。
function handleClearQuery() {
  searchQuery.value = ""
}

// 处理点击容器外部自动收起下拉面板。
function handleClickOutside(event: MouseEvent) {
  if (searchContainerRef.value && !searchContainerRef.value.contains(event.target as Node)) {
    isDropdownOpen.value = false
  }
}

// 执行搜索跳转或直接打开网址。
function handleSearch() {
  const trimmed = searchQuery.value.trim()
  if (!trimmed) return

  // 1. 优先匹配 Bang 快捷搜索
  if (trimmed.startsWith("!")) {
    const spaceIndex = trimmed.indexOf(" ")
    const bang = spaceIndex === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIndex)
    const keyword = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim()
    const matchedEngine = engines.value.find(e => e.bang && e.bang.toLowerCase() === bang.toLowerCase())
    if (matchedEngine) {
      const target = matchedEngine.urlTemplate.replace("%s", encodeURIComponent(keyword))
      window.open(target, "_blank", "noopener,noreferrer")
      return
    }
  }

  // 2. 检查是否为合法网址
  if (looksLikeUrl(trimmed)) {
    const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed
    if (isValidSafeUrl(finalUrl)) {
      window.open(finalUrl, "_blank", "noopener,noreferrer")
      return
    }
  }

  // 3. 提交至当前选中的搜索引擎
  const template = activeEngine.value?.urlTemplate ?? "https://www.google.com/search?q=%s"
  const target = template.replace("%s", encodeURIComponent(trimmed))
  window.open(target, "_blank", "noopener,noreferrer")
}
</script>

<template>
  <div ref="searchContainerRef" class="search-container">
    <form class="search-form" @submit.prevent="handleSearch">
      <!-- 搜索引擎左侧触发按钮 -->
      <button
        type="button"
        class="engine-trigger"
        :class="{ 'trigger-active': isDropdownOpen }"
        :title="activeEngine ? activeEngine.name : '选择搜索引擎'"
        @click="toggleDropdown"
      >
        <EngineIcon
          :name="activeEngine?.name ?? 'Google'"
          :id="activeEngine?.id"
          :size="20"
        />
        <span class="dropdown-arrow" :class="{ 'arrow-up': isDropdownOpen }">▾</span>
      </button>

      <!-- 搜索主输入框 -->
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        :placeholder="placeholderText"
        autofocus
      >

      <!-- 清除按钮 -->
      <button
        v-if="searchQuery"
        type="button"
        class="btn-clear"
        title="清空"
        @click="handleClearQuery"
      >
        <svg class="icon-clear" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <!-- 放大镜提交按钮 -->
      <button type="submit" class="search-button" title="搜索">
        <svg class="icon-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    </form>

    <!-- 下拉平铺选择面板（与搜索框严格等宽） -->
    <transition name="panel-drop">
      <div v-if="isDropdownOpen" class="engine-dropdown-panel">
        <div class="engine-grid">
          <button
            v-for="engine in engines"
            :key="engine.id"
            type="button"
            class="engine-card"
            :class="{ active: activeEngine?.id === engine.id }"
            @click="handleSelectEngine(engine)"
          >
            <EngineIcon :name="engine.name" :id="engine.id" :size="20" />
            <span class="card-name" :title="engine.name">{{ engine.name }}</span>
            <span v-if="engine.bang" class="card-bang">!{{ engine.bang }}</span>
          </button>
        </div>

        <!-- 底部添加搜索引擎按钮 -->
        <div class="dropdown-footer">
          <button type="button" class="btn-add-engine" @click="openAddModal">
            + 添加自定义搜索引擎
          </button>
        </div>
      </div>
    </transition>

    <!-- 添加自定义搜索引擎通用弹窗 -->
    <SearchEngineModal
      :show="showAddModal"
      :close-on-click-outside="true"
      @close="showAddModal = false"
      @created="handleEngineCreated"
    />
  </div>
</template>

<style scoped>
.search-container {
  position: relative;
  max-width: 680px;
  width: 100%;
  margin: 28px auto 48px auto;
  padding: 0 16px;
  box-sizing: border-box;
}

.search-form {
  position: relative;
  display: flex;
  align-items: center;
  height: 52px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-full);
  box-shadow: var(--lh-shadow-card);
  backdrop-filter: blur(var(--lh-blur));
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.search-form:focus-within {
  border-color: var(--lh-accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15), var(--lh-shadow-card);
}

.engine-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 6px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--lh-radius-full);
  transition: background 0.15s ease;
  flex-shrink: 0;
}

.engine-trigger:hover,
.trigger-active {
  background: var(--lh-surface-hover);
}

.dropdown-arrow {
  font-size: 11px;
  color: var(--lh-text-secondary);
  transition: transform 0.2s ease;
}

.arrow-up {
  transform: rotate(180deg);
}

.search-input {
  flex: 1;
  height: 100%;
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--lh-text);
  font-size: 15px;
  outline: none;
  min-width: 0;
}

.search-input::placeholder {
  color: var(--lh-text-muted);
}

.btn-clear {
  background: transparent;
  border: none;
  color: var(--lh-text-muted);
  cursor: pointer;
  padding: 6px;
  margin-right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--lh-radius-full);
  transition: color 0.15s ease;
}

.btn-clear:hover {
  color: var(--lh-text);
}

.icon-clear {
  width: 16px;
  height: 16px;
}

.search-button {
  width: 40px;
  height: 40px;
  margin-right: 6px;
  border-radius: var(--lh-radius-full);
  background: var(--lh-accent);
  color: var(--lh-accent-text);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.search-button:hover {
  background: var(--lh-accent-hover);
  transform: scale(1.04);
}

.icon-search {
  width: 18px;
  height: 18px;
}

.engine-dropdown-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 16px;
  right: 16px;
  background: var(--lh-surface);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-lg);
  box-shadow: var(--lh-shadow-dropdown);
  backdrop-filter: blur(var(--lh-blur));
  padding: 14px;
  box-sizing: border-box;
  z-index: 100;
}

.engine-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}

.engine-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--lh-radius-md);
  border: 1px solid transparent;
  background: transparent;
  color: var(--lh-text);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.engine-card:hover {
  background: var(--lh-surface-hover);
  border-color: var(--lh-border);
}

.engine-card.active {
  background: var(--lh-surface-active);
  border-color: var(--lh-border);
  font-weight: 500;
}

.card-name {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-bang {
  font-size: 11px;
  color: var(--lh-text-muted);
}

.dropdown-footer {
  margin-top: 12px;
  border-top: 1px solid var(--lh-border);
  padding-top: 10px;
  text-align: center;
}

.btn-add-engine {
  background: none;
  border: none;
  color: var(--lh-accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: var(--lh-radius-sm);
  transition: background 0.15s ease;
}

.btn-add-engine:hover {
  background: var(--lh-surface-hover);
}


.panel-drop-enter-active,
.panel-drop-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.panel-drop-enter-from,
.panel-drop-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>

