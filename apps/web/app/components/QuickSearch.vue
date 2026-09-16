<script setup lang="ts">
import { nextTick } from "vue"
import { looksLikeUrl, type SearchEngine } from "@laull-home/shared"
import SearchEngineModal from "./SearchEngineModal.vue"
import SearchEngineDropdown from "./SearchEngineDropdown.vue"
import SearchSuggestions from "./SearchSuggestions.vue"
import EngineIcon from "./EngineIcon.vue"

const { engines, defaultEngine, fetchEngines, fetchSuggestions, executeSearch } = useSearch()

// 搜索主输入内容。
const searchQuery = ref("")

// 键盘上下导航时暂存的用户手工输入原词。
const originalQuery = ref("")

// 当前选中的临时活动搜索引擎。
const selectedEngine = ref<SearchEngine | null>(null)

// 搜索引擎下拉平铺面板展开状态。
const isDropdownOpen = ref(false)

// 搜索建议联想词列表。
const suggestions = ref<string[]>([])

// 联想建议加载中状态。
const isSuggestionsLoading = ref(false)

// 联想建议下拉栏展开状态。
const isSuggestionsOpen = ref(false)

// 键盘当前选中的建议项索引。
const selectedSuggestionIndex = ref(-1)

// 搜索引擎弹窗显隐状态。
const showEngineModal = ref(false)

// 当前编辑的引擎实例（null 表示新增模式）。
const editingEngine = ref<SearchEngine | null>(null)

// 搜索栏容器引用，用于处理点击外部关闭下拉面板。
const searchContainerRef = ref<HTMLElement | null>(null)

// 建议防抖定时器引用。
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// 是否正处于键盘按键导航挑选联想词过程中。
let isNavigatingSuggestions = false

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

// 触发联想词拉取。
async function triggerFetchSuggestions(text: string) {
  if (debounceTimer) clearTimeout(debounceTimer)
  const trimmed = text.trim()
  if (!trimmed || trimmed.startsWith("!") || looksLikeUrl(trimmed) || isDropdownOpen.value) {
    suggestions.value = []
    isSuggestionsOpen.value = false
    selectedSuggestionIndex.value = -1
    return
  }
  debounceTimer = setTimeout(async () => {
    isSuggestionsLoading.value = true
    try {
      const items = await fetchSuggestions(trimmed, activeEngine.value?.id)
      suggestions.value = items
      isSuggestionsOpen.value = items.length > 0 && !isDropdownOpen.value
      selectedSuggestionIndex.value = -1
    } finally {
      isSuggestionsLoading.value = false
    }
  }, 150)
}

// 监听搜索词变化并防抖请求建议。
watch(searchQuery, (newVal) => {
  if (isNavigatingSuggestions) return
  if (selectedSuggestionIndex.value === -1) {
    originalQuery.value = newVal
  }
  triggerFetchSuggestions(newVal)
})

// 监听活动搜索引擎切换，刷新对应联想建议。
watch(activeEngine, () => {
  if (searchQuery.value) {
    triggerFetchSuggestions(searchQuery.value)
  }
})

onMounted(async () => {
  await fetchEngines()
  document.addEventListener("click", handleClickOutside)
})

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  document.removeEventListener("click", handleClickOutside)
})

// 切换下拉面板显隐。
function toggleDropdown() {
  isDropdownOpen.value = !isDropdownOpen.value
  if (isDropdownOpen.value) {
    isSuggestionsOpen.value = false
  }
}

// 选择特定搜索引擎。
function handleSelectEngine(engine: SearchEngine) {
  selectedEngine.value = engine
  isDropdownOpen.value = false
}

// 处理引擎批量删除后的状态联动。
function handleEngineDeleted(deletedIds: string[]) {
  if (selectedEngine.value && deletedIds.includes(selectedEngine.value.id)) {
    selectedEngine.value = null
  }
}

// 打开新增自定义搜索引擎通用弹窗。
function openAddModal() {
  editingEngine.value = null
  showEngineModal.value = true
}

// 打开编辑搜索引擎弹窗。
function openEditModal(engine: SearchEngine) {
  editingEngine.value = engine
  showEngineModal.value = true
}

// 处理自定义搜索引擎创建完成。
function handleEngineCreated(engine: SearchEngine) {
  selectedEngine.value = engine
}

// 处理自定义搜索引擎更新完成。
function handleEngineUpdated(engine: SearchEngine) {
  if (selectedEngine.value && selectedEngine.value.id === engine.id) {
    selectedEngine.value = engine
  }
}

// 清空当前搜索输入内容。
function handleClearQuery() {
  searchQuery.value = ""
  originalQuery.value = ""
  suggestions.value = []
  isSuggestionsOpen.value = false
  selectedSuggestionIndex.value = -1
}

// 输入框聚焦时若已有建议则展开。
function handleInputFocus() {
  if (suggestions.value.length > 0 && searchQuery.value.trim() && !isDropdownOpen.value) {
    isSuggestionsOpen.value = true
  }
}

// 处理输入框真实手工输入，重置选中状态。
function handleManualInput() {
  selectedSuggestionIndex.value = -1
}

// 步进联想词选定项，期间不触发联想词重新拉取与刷新。
function stepSuggestion(delta: 1 | -1) {
  const len = suggestions.value.length
  if (len === 0) return
  isNavigatingSuggestions = true
  if (delta === 1) {
    selectedSuggestionIndex.value = selectedSuggestionIndex.value < len - 1 ? selectedSuggestionIndex.value + 1 : -1
  } else {
    selectedSuggestionIndex.value = selectedSuggestionIndex.value > 0 ? selectedSuggestionIndex.value - 1 : (selectedSuggestionIndex.value === 0 ? -1 : len - 1)
  }
  searchQuery.value = selectedSuggestionIndex.value >= 0 ? (suggestions.value[selectedSuggestionIndex.value] ?? originalQuery.value) : originalQuery.value
  nextTick(() => {
    isNavigatingSuggestions = false
  })
}

// 键盘导航选择联想项，拦截默认跳焦与失焦。
function handleKeyDown(event: KeyboardEvent) {
  if (!isSuggestionsOpen.value || suggestions.value.length === 0) {
    return
  }

  if (event.key === "Tab") {
    event.preventDefault()
    stepSuggestion(event.shiftKey ? -1 : 1)
  } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    event.preventDefault()
    stepSuggestion(1)
  } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    event.preventDefault()
    stepSuggestion(-1)
  } else if (event.key === "Escape") {
    isSuggestionsOpen.value = false
    selectedSuggestionIndex.value = -1
    searchQuery.value = originalQuery.value
  }
}

// 直接选中建议词执行搜索。
function handleSelectSuggestion(keyword: string) {
  searchQuery.value = keyword
  isSuggestionsOpen.value = false
  selectedSuggestionIndex.value = -1
  handleSearch()
}

// 仅填入建议词到搜索框。
function handleFillSuggestion(keyword: string) {
  searchQuery.value = keyword
  originalQuery.value = keyword
  selectedSuggestionIndex.value = -1
}

// 处理点击容器外部自动收起下拉面板与建议栏。
function handleClickOutside(event: MouseEvent) {
  // 如果搜索引擎编辑/新增弹窗处于打开状态，保持下拉面板，绝不收起。
  if (showEngineModal.value) return

  const target = event.target as HTMLElement | null
  if (!target || !searchContainerRef.value) return

  // 1. 如果点击目标或事件传播路径位于搜索容器内，保持展开。
  const path = event.composedPath?.() ?? []
  if (path.includes(searchContainerRef.value) || searchContainerRef.value.contains(target)) {
    return
  }
  // 2. 如果点击的目标节点已脱离主文档，判定为内部交互，不关闭。
  if (!document.contains(target)) {
    return
  }

  // 3. 如果点击的是模态对话框遮罩或弹窗内容，不关闭下拉面板。
  if (target.closest?.('dialog, .modal-backdrop')) {
    return
  }

  isDropdownOpen.value = false
  isSuggestionsOpen.value = false
}

// 执行搜索跳转或直接打开网址。
function handleSearch() {
  const trimmed = searchQuery.value.trim()
  if (!trimmed) return
  isSuggestionsOpen.value = false
  selectedSuggestionIndex.value = -1

  const parsed = executeSearch(trimmed)
  let targetUrl = parsed.targetUrl
  if (parsed.type === "search" && selectedEngine.value) {
    targetUrl = selectedEngine.value.urlTemplate.replace("%s", encodeURIComponent(trimmed))
  }
  if (targetUrl) {
    window.open(targetUrl, "_blank", "noopener,noreferrer")
  }
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
          :url="activeEngine?.urlTemplate"
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
        @input="handleManualInput"
        @focus="handleInputFocus"
        @keydown="handleKeyDown"
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

    <!-- 自动关联关键字模糊匹配建议下拉栏（与搜索框等宽贴合） -->
    <transition name="panel-drop">
      <SearchSuggestions
        v-if="isSuggestionsOpen && !isDropdownOpen && suggestions.length > 0"
        :suggestions="suggestions"
        :query="searchQuery"
        :selected-index="selectedSuggestionIndex"
        :active-engine="activeEngine"
        :loading="isSuggestionsLoading"
        @select="handleSelectSuggestion"
        @fill="handleFillSuggestion"
        @hover="selectedSuggestionIndex = $event"
      />
    </transition>

    <!-- 下拉平铺选择面板（与搜索框严格等宽） -->
    <transition name="panel-drop">
      <SearchEngineDropdown
        v-if="isDropdownOpen"
        :engines="engines"
        :active-engine="activeEngine"
        @select="handleSelectEngine"
        @open-add="openAddModal"
        @open-edit="openEditModal"
        @engine-deleted="handleEngineDeleted"
      />
    </transition>

    <!-- 搜索引擎配置通用弹窗（支持新增与编辑） -->
    <SearchEngineModal
      :show="showEngineModal"
      :engine="editingEngine"
      :close-on-click-outside="true"
      @close="showEngineModal = false"
      @created="handleEngineCreated"
      @updated="handleEngineUpdated"
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
  background: color-mix(in srgb, var(--lh-surface) var(--lh-surface-opacity, 92%), transparent);
  border: 1px solid var(--lh-border);
  border-radius: var(--lh-radius-full);
  box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), var(--lh-shadow-card);
  backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  -webkit-backdrop-filter: blur(var(--lh-blur)) saturate(160%);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.search-form:focus-within {
  border-color: var(--lh-accent);
  box-shadow: inset 0 1px 1px 0 var(--lh-glass-border, transparent), 0 0 0 3px color-mix(in srgb, var(--lh-accent) 20%, transparent), var(--lh-shadow-hover);
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
