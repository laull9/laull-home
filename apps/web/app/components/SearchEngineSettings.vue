<script setup lang="ts">
import { extractSiteOrigin, type SearchEngine } from "@laull-home/shared"
import SearchEngineDeleteModal from "./SearchEngineDeleteModal.vue"
import SearchEngineModal from "./SearchEngineModal.vue"

const { engines, fetchEngines, createEngine, updateEngine, deleteEngine } = useSearch()
const { fetchFavicon } = useBookmarks()
const iconCache = useState<Record<string, string>>('lh:engine-favicons', () => ({}))

// 新增引擎表单绑定。
const newName = ref("")
const newTemplate = ref("")
const newSuggestionUrl = ref("")
const newBang = ref("")
const newIsDefault = ref(false)
const showAddForm = ref(false)
const errorMessage = ref("")
const successMessage = ref("")

// 控制编辑弹窗显隐。
const showEditModal = ref(false)

// 当前正在编辑的搜索引擎对象。
const editingEngine = ref<SearchEngine | null>(null)

// 新增表单正在拉取图标状态。
const isFetchingNewIcon = ref(false)

// 列表中正在拉取图标的引擎标识。
const fetchingEngineId = ref<string | null>(null)

// 是否可以拉取新增表单中的图标。
const canFetchNewIcon = computed(() => !!extractSiteOrigin(newTemplate.value))

onMounted(async () => {
  await fetchEngines()
})

// 手动拉取新增表单中的站点图标。
async function handleFetchNewIcon() {
  const origin = extractSiteOrigin(newTemplate.value)
  if (!origin) {
    errorMessage.value = "请输入包含合法域名的搜索模板"
    return
  }
  isFetchingNewIcon.value = true
  errorMessage.value = ""
  try {
    const iconUrl = await fetchFavicon(origin)
    if (iconUrl) {
      iconCache.value[origin] = `${iconUrl}?t=${Date.now()}`
      if (import.meta.client) {
        try {
          window.localStorage.setItem('lh_engine_favicons', JSON.stringify(iconCache.value))
        } catch { /* 忽略存储写入异常。 */ }
      }
      successMessage.value = "站点图标拉取成功"
    } else {
      errorMessage.value = "未探测到站点图标，将使用默认首字徽章"
    }
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : "拉取图标失败"
  } finally {
    isFetchingNewIcon.value = false
  }
}

// 手动拉取并刷新指定已有搜索引擎的图标。
async function handleRefreshEngineIcon(engine: SearchEngine) {
  const origin = extractSiteOrigin(engine.urlTemplate)
  if (!origin) {
    errorMessage.value = "当前引擎模板缺少有效主机域名"
    return
  }
  fetchingEngineId.value = engine.id
  errorMessage.value = ""
  successMessage.value = ""
  try {
    const iconUrl = await fetchFavicon(origin)
    if (iconUrl) {
      iconCache.value[origin] = `${iconUrl}?t=${Date.now()}`
      if (import.meta.client) {
        try {
          window.localStorage.setItem('lh_engine_favicons', JSON.stringify(iconCache.value))
        } catch { /* 忽略存储写入异常。 */ }
      }
      successMessage.value = `已更新「${engine.name}」的站点图标`
    } else {
      errorMessage.value = `未探测到「${engine.name}」的站点图标`
    }
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : "更新图标失败"
  } finally {
    fetchingEngineId.value = null
  }
}

// 提交新增搜索引擎。
async function handleCreateEngine() {
  errorMessage.value = ""
  successMessage.value = ""
  if (!newName.value || !newTemplate.value) {
    errorMessage.value = "请填写引擎名称和搜索模板"
    return
  }
  if (!newTemplate.value.includes("%s")) {
    errorMessage.value = "搜索模板必须包含 %s 占位符"
    return
  }
  try {
    await createEngine({
      name: newName.value.trim(),
      urlTemplate: newTemplate.value.trim(),
      suggestionUrl: newSuggestionUrl.value.trim() || undefined,
      bang: newBang.value.trim().toLowerCase(),
      isDefault: newIsDefault.value,
    })
    successMessage.value = "搜索引擎已添加"
    newName.value = ""
    newTemplate.value = ""
    newSuggestionUrl.value = ""
    newBang.value = ""
    newIsDefault.value = false
    showAddForm.value = false
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : "添加失败"
  }
}

// 打开编辑弹窗。
function handleOpenEdit(engine: SearchEngine) {
  editingEngine.value = engine
  showEditModal.value = true
}

// 引擎编辑成功回调。
function handleEngineUpdated(updated: SearchEngine) {
  successMessage.value = "已更新「" + updated.name + "」配置"
}

// 设为默认搜索引擎。
async function handleSetDefault(engine: SearchEngine) {
  try {
    await updateEngine(engine.id, { isDefault: true })
    successMessage.value = "已将「" + engine.name + "」设为默认搜索引擎"
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : "设置失败"
  }
}

// 删除搜索引擎弹窗状态。
const deletingEngines = ref<SearchEngine[]>([])
const showDeleteModal = ref(false)
const isDeleting = ref(false)

// 删除指定搜索引擎。
function handleDelete(engine: SearchEngine) {
  deletingEngines.value = [engine]
  showDeleteModal.value = true
}

// 确认删除搜索引擎。
async function handleConfirmDelete() {
  if (deletingEngines.value.length === 0) return
  isDeleting.value = true
  errorMessage.value = ""
  try {
    for (const engine of deletingEngines.value) {
      await deleteEngine(engine.id)
    }
    successMessage.value = "搜索引擎已删除"
    showDeleteModal.value = false
    deletingEngines.value = []
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : "删除失败"
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <section class="card">
    <div class="card-header">
      <h2>搜索引擎管理</h2>
      <button type="button" class="btn-secondary" @click="showAddForm = !showAddForm">
        {{ showAddForm ? "收起" : "+ 添加引擎" }}
      </button>
    </div>

    <transition name="fade">
      <p v-if="successMessage" class="info-text">{{ successMessage }}</p>
    </transition>
    <transition name="fade">
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </transition>

    <!-- 新增搜索引擎表单 -->
    <transition name="form-expand">
      <div v-if="showAddForm" class="add-box">
        <div class="add-box-header">
          <span class="add-box-title">添加自定义搜索引擎</span>
          <div v-if="newTemplate" class="preview-badge">
            <EngineIcon :name="newName || '预览'" :url="newTemplate" :size="20" />
            <span class="preview-text">图标预览</span>
          </div>
        </div>
        <div class="field">
          <label>引擎名称</label>
          <input v-model="newName" type="text" placeholder="例如 GitHub" required>
        </div>
        <div class="field">
          <label>搜索模板（须含 %s）</label>
          <div class="template-row">
            <input v-model="newTemplate" type="text" placeholder="例如 https://github.com/search?q=%s" required>
            <button
              type="button"
              class="btn-action"
              :disabled="!canFetchNewIcon || isFetchingNewIcon"
              @click="handleFetchNewIcon"
            >
              {{ isFetchingNewIcon ? "拉取中..." : "拉取图标" }}
            </button>
          </div>
        </div>
        <div class="field">
          <label>搜索建议地址模板（可选，含 %s）</label>
          <input v-model="newSuggestionUrl" type="text" placeholder="例如 https://api.bing.com/osjson.aspx?query=%s">
        </div>
        <div class="field">
          <label>快捷 Bang（可选）</label>
          <input v-model="newBang" type="text" placeholder="例如 gh（用于 !gh 搜索）">
        </div>
        <div class="checkbox-row">
          <label>
            <input v-model="newIsDefault" type="checkbox">
            设为默认搜索引擎
          </label>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" @click="showAddForm = false">取消</button>
          <button type="button" class="btn" @click="handleCreateEngine">保存引擎</button>
        </div>
      </div>
    </transition>

    <!-- 引擎列表 -->
    <ul class="engine-list">
      <li v-for="engine in engines" :key="engine.id" class="engine-item">
        <div class="engine-item-left">
          <div class="engine-icon-wrapper">
            <EngineIcon
              :name="engine.name"
              :id="engine.id"
              :url="engine.urlTemplate"
              :size="26"
            />
          </div>
          <div class="engine-info">
            <div class="engine-name-row">
              <span class="engine-name">{{ engine.name }}</span>
              <span v-if="engine.bang" class="bang-badge">!{{ engine.bang }}</span>
              <span v-if="engine.isDefault" class="tag-default">默认</span>
            </div>
            <span class="engine-template">{{ engine.urlTemplate }}</span>
          </div>
        </div>
        <div class="engine-actions">
          <button
            type="button"
            class="btn-action"
            @click="handleOpenEdit(engine)"
          >
            编辑
          </button>
          <button
            type="button"
            class="btn-action"
            :disabled="fetchingEngineId === engine.id"
            @click="handleRefreshEngineIcon(engine)"
          >
            {{ fetchingEngineId === engine.id ? "拉取中..." : "拉取图标" }}
          </button>
          <button
            v-if="!engine.isDefault"
            type="button"
            class="btn-action"
            @click="handleSetDefault(engine)"
          >
            设为默认
          </button>
          <button
            type="button"
            class="btn-revoke"
            :disabled="engines.length <= 1"
            @click="handleDelete(engine)"
          >
            删除
          </button>
        </div>
      </li>
    </ul>

    <!-- 搜索引擎编辑弹窗 -->
    <SearchEngineModal
      :show="showEditModal"
      :engine="editingEngine"
      @close="showEditModal = false"
      @updated="handleEngineUpdated"
    />

    <!-- 搜索引擎删除确认弹窗 -->
    <SearchEngineDeleteModal
      :show="showDeleteModal"
      :engines="deletingEngines"
      :total-count="engines.length"
      :deleting="isDeleting"
      @close="showDeleteModal = false"
      @confirm="handleConfirmDelete"
    />
  </section>
</template>

<style scoped>
.card {
  background: color-mix(in srgb, var(--lh-surface) var(--lh-surface-opacity, 94%), transparent);
  border: 1px solid var(--lh-border); border-radius: var(--lh-radius-lg);
  padding: 22px; backdrop-filter: blur(var(--lh-blur));
  -webkit-backdrop-filter: blur(var(--lh-blur));
  box-shadow: var(--lh-shadow-card); color: var(--lh-text); box-sizing: border-box;
}
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
.card-header h2 { margin: 0; font-size: 17px; font-weight: 600; color: var(--lh-text); }
.add-box { background: var(--lh-surface-hover); border: 1px solid var(--lh-border); border-radius: var(--lh-radius-md); padding: 16px; margin-bottom: 18px; }
.add-box-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.add-box-title { font-size: 14px; font-weight: 600; color: var(--lh-text); }
.preview-badge { display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: var(--lh-radius-sm); background: var(--lh-surface-active); border: 1px solid var(--lh-border); }
.preview-text { font-size: 11px; color: var(--lh-text-secondary); }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.field label { font-size: 13px; color: var(--lh-text-secondary); }
.field input {
  padding: 8px 12px; border: 1px solid var(--lh-border); border-radius: var(--lh-radius-sm);
  font-size: 14px; background: var(--lh-surface-active); color: var(--lh-text); outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.field input:focus { border-color: var(--lh-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--lh-accent) 20%, transparent); }
.template-row { display: flex; gap: 8px; align-items: center; }
.template-row input { flex: 1; }
.checkbox-row { font-size: 13px; color: var(--lh-text-secondary); margin-bottom: 14px; }
.checkbox-row label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; }
.btn {
  padding: 7px 16px; background: var(--lh-accent); color: var(--lh-accent-text); border: none;
  border-radius: var(--lh-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500;
  transition: opacity 0.15s ease;
}
.btn:hover { opacity: 0.92; }
.btn-secondary {
  padding: 6px 12px; background: var(--lh-surface-active); border: 1px solid var(--lh-border);
  color: var(--lh-text); border-radius: var(--lh-radius-sm); cursor: pointer; font-size: 13px;
  transition: background 0.15s ease;
}
.btn-secondary:hover { background: var(--lh-surface-hover); }
.btn-action {
  padding: 4px 10px; border: 1px solid var(--lh-border); border-radius: var(--lh-radius-sm);
  background: var(--lh-surface-active); color: var(--lh-text); font-size: 12px; cursor: pointer;
  white-space: nowrap; transition: all 0.15s ease;
}
.btn-action:hover:not(:disabled) { background: var(--lh-surface-hover); border-color: var(--lh-accent); color: var(--lh-accent); }
.btn-action:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-revoke {
  padding: 4px 10px; background: var(--lh-danger-bg); color: var(--lh-danger);
  border: 1px solid var(--lh-danger-border); border-radius: var(--lh-radius-sm);
  cursor: pointer; font-size: 12px; font-weight: 500; transition: opacity 0.15s ease, background-color 0.15s ease;
}
.btn-revoke:hover:not(:disabled) { background: color-mix(in srgb, var(--lh-danger) 22%, transparent); }
.btn-revoke:disabled { opacity: 0.35; cursor: not-allowed; }
.engine-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.engine-item {
  display: flex; justify-content: space-between; align-items: center; padding: 12px 14px;
  background: var(--lh-surface-hover); border: 1px solid var(--lh-border); border-radius: var(--lh-radius-md);
  transition: border-color 0.15s ease;
}
.engine-item:hover { border-color: color-mix(in srgb, var(--lh-accent) 40%, var(--lh-border)); }
.engine-item-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.engine-icon-wrapper { display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.engine-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.engine-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.engine-name { font-weight: 600; font-size: 14px; color: var(--lh-text); }
.bang-badge {
  font-size: 11px; font-weight: 500; background: color-mix(in srgb, var(--lh-accent) 15%, transparent);
  color: var(--lh-accent); border: 1px solid color-mix(in srgb, var(--lh-accent) 30%, transparent);
  padding: 1px 6px; border-radius: 4px;
}
.tag-default {
  font-size: 11px; font-weight: 500; background: var(--lh-success-bg);
  color: var(--lh-success); border: 1px solid var(--lh-success-border);
  padding: 1px 6px; border-radius: 4px;
}
.engine-template { font-size: 12px; color: var(--lh-text-muted); word-break: break-all; }
.engine-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.info-text { color: var(--lh-success); font-size: 13px; margin: 6px 0 12px; }
.error-text { color: var(--lh-danger); font-size: 13px; margin: 6px 0 12px; }
.form-expand-enter-active, .form-expand-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}
.form-expand-enter-from, .form-expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-bottom: 0;
  transform: translateY(-6px);
}
.form-expand-enter-to, .form-expand-leave-from {
  opacity: 1;
  max-height: 500px;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
