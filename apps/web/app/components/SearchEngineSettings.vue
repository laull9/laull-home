<script setup lang="ts">
import type { SearchEngine } from "@laull-home/shared"

const { engines, fetchEngines, createEngine, updateEngine, deleteEngine } = useSearch()

// 新增引擎表单绑定。
const newName = ref("")
const newTemplate = ref("")
const newBang = ref("")
const newIsDefault = ref(false)
const showAddForm = ref(false)
const errorMessage = ref("")
const successMessage = ref("")

onMounted(async () => {
  await fetchEngines()
})

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
      bang: newBang.value.trim().toLowerCase(),
      isDefault: newIsDefault.value,
    })
    successMessage.value = "搜索引擎已添加"
    newName.value = ""
    newTemplate.value = ""
    newBang.value = ""
    newIsDefault.value = false
    showAddForm.value = false
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : "添加失败"
  }
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

// 删除指定搜索引擎。
async function handleDelete(engine: SearchEngine) {
  if (confirm("确认删除搜索引擎「" + engine.name + "」？")) {
    try {
      await deleteEngine(engine.id)
      successMessage.value = "搜索引擎已删除"
    } catch (err: unknown) {
      errorMessage.value = err instanceof Error ? err.message : "删除失败"
    }
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

    <p v-if="successMessage" class="info-text">{{ successMessage }}</p>
    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

    <!-- 新增搜索引擎表单 -->
    <div v-if="showAddForm" class="add-box">
      <div class="field">
        <label>引擎名称</label>
        <input v-model="newName" type="text" placeholder="例如 GitHub" required>
      </div>
      <div class="field">
        <label>搜索模板（须含 %s）</label>
        <input v-model="newTemplate" type="text" placeholder="例如 https://github.com/search?q=%s" required>
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

    <!-- 引擎列表 -->
    <ul class="engine-list">
      <li v-for="engine in engines" :key="engine.id" class="engine-item">
        <div class="engine-info">
          <div class="engine-name-row">
            <span class="engine-name">{{ engine.name }}</span>
            <span v-if="engine.bang" class="bang-badge">!{{ engine.bang }}</span>
            <span v-if="engine.isDefault" class="tag-default">默认</span>
          </div>
          <span class="engine-template">{{ engine.urlTemplate }}</span>
        </div>
        <div class="engine-actions">
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
  </section>
</template>

<style scoped>
.card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 20px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.card-header h2 {
  margin: 0;
  font-size: 18px;
}
.add-box {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.field label {
  font-size: 13px;
  color: #4b5563;
}
.field input {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}
.checkbox-row {
  font-size: 13px;
  color: #4b5563;
  margin-bottom: 12px;
}
.checkbox-row label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn {
  padding: 8px 16px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
.btn-secondary {
  padding: 6px 12px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.btn-action {
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: #ffffff;
  font-size: 12px;
  cursor: pointer;
}
.btn-revoke {
  padding: 4px 8px;
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.btn-revoke:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.engine-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.engine-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 6px;
}
.engine-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.engine-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.engine-name {
  font-weight: 500;
  font-size: 14px;
}
.bang-badge {
  font-size: 11px;
  background: #e0e7ff;
  color: #3730a3;
  padding: 1px 6px;
  border-radius: 4px;
}
.tag-default {
  font-size: 11px;
  background: #dcfce7;
  color: #166534;
  padding: 1px 6px;
  border-radius: 4px;
}
.engine-template {
  font-size: 12px;
  color: #6b7280;
}
.engine-actions {
  display: flex;
  gap: 6px;
}
.info-text {
  color: #059669;
  font-size: 13px;
  margin: 6px 0;
}
.error-text {
  color: #dc2626;
  font-size: 13px;
  margin: 6px 0;
}
</style>
