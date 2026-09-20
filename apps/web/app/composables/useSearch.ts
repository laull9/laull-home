import {
  parseSearchQuery,
  type CreateSearchEngineInput,
  type SearchEngine,
  type SearchQueryResult,
  type UpdateSearchEngineInput,
} from "@laull-home/shared"
import { getCachedSearchEngines, setCachedSearchEngines } from '../utils/localCache'
import { fetchClientSuggestions } from '../utils/clientSuggestions'

// 搜索引擎客户端状态与查询解析。
export function useSearch() {
  const engines = useState<SearchEngine[]>("search:engines", () => [])
  const loading = ref(false)
  const { $api } = useNuxtApp()

  // 读取所有搜索引擎，优先呈现本地缓存并异步对齐服务端数据。
  async function fetchEngines() {
    const cached = getCachedSearchEngines<SearchEngine[]>()
    if (cached && Array.isArray(cached) && cached.length > 0) {
      engines.value = cached
    } else {
      loading.value = true
    }

    try {
      const res = await $api.search.engines.get()
      if (res.data) {
        engines.value = res.data.engines
        setCachedSearchEngines(res.data.engines)
      }
    } finally {
      loading.value = false
    }
  }

  // 获取当前默认搜索引擎。
  const defaultEngine = computed(() => {
    return engines.value.find(e => e.isDefault) ?? engines.value[0]
  })

  // 解析输入并执行跳转。
  function executeSearch(input: string): SearchQueryResult {
    return parseSearchQuery(input, engines.value)
  }

  // 添加自定义搜索引擎。
  async function createEngine(input: CreateSearchEngineInput) {
    const res = await $api.search.engines.post(input)
    if (res.error) throw new Error(res.error.value?.message ?? "添加搜索引擎失败")
    await fetchEngines()
    return res.data?.engine
  }

  // 更新搜索引擎配置。
  async function updateEngine(id: string, input: UpdateSearchEngineInput) {
    const res = await $api.search.engines({ id }).put(input)
    if (res.error) throw new Error(res.error.value?.message ?? "更新搜索引擎失败")
    await fetchEngines()
    return res.data?.engine
  }

  // 删除搜索引擎。
  async function deleteEngine(id: string) {
    const res = await $api.search.engines({ id }).delete()
    if (res.error) throw new Error(res.error.value?.message ?? "删除搜索引擎失败")
    await fetchEngines()
  }

  // 在浏览器客户端直接拉取联想建议词，不经服务端中转。
  async function fetchSuggestions(query: string, engineId?: string): Promise<string[]> {
    const trimmed = query.trim()
    if (!trimmed) return []
    const targetEngine = (engineId ? engines.value.find(e => e.id === engineId) : null) ?? defaultEngine.value
    return fetchClientSuggestions(trimmed, targetEngine)
  }

  return {
    engines,
    defaultEngine,
    loading,
    fetchEngines,
    fetchSuggestions,
    executeSearch,
    createEngine,
    updateEngine,
    deleteEngine,
  }
}
