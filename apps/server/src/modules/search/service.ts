import { asc, desc, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import type {
  CreateSearchEngineInput,
  SearchEngine,
  UpdateSearchEngineInput,
} from "@laull-home/shared"
import type { AppDatabase } from "../../db"
import { searchEngines } from "../../db/schema"

// 搜索引擎业务操作异常类。
export class SearchEngineError extends Error {
  // 携带 HTTP 状态码便于路由层转换。
  constructor(public status: number, message: string) {
    super(message)
    this.name = "SearchEngineError"
  }
}

// 转换数据库记录为标准搜索引擎结构。
function mapEngineRow(row: typeof searchEngines.$inferSelect): SearchEngine {
  return {
    id: row.id,
    name: row.name,
    urlTemplate: row.urlTemplate,
    bang: row.bang,
    isDefault: Boolean(row.isDefault),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// 创建搜索引擎服务。
export function createSearchService(db: AppDatabase) {
  return {
    // 列出所有可用搜索引擎。
    list(): SearchEngine[] {
      const rows = db.select()
        .from(searchEngines)
        .orderBy(desc(searchEngines.isDefault), asc(searchEngines.sortOrder), asc(searchEngines.createdAt))
        .all()
      return rows.map(mapEngineRow)
    },

    // 新增自定义搜索引擎。
    create(input: CreateSearchEngineInput): SearchEngine {
      if (!input.urlTemplate.includes("%s")) {
        throw new SearchEngineError(400, "搜索引擎模板必须包含 %s 占位符")
      }

      const now = Date.now()
      const id = "se-" + randomUUID()
      const isDefault = input.isDefault ? 1 : 0

      // 如果设置为默认引擎，先将原有默认引擎取消
      if (isDefault) {
        db.update(searchEngines).set({ isDefault: 0, updatedAt: now }).run()
      }

      const maxOrderRow = db.select({ sortOrder: searchEngines.sortOrder })
        .from(searchEngines)
        .orderBy(desc(searchEngines.sortOrder))
        .limit(1)
        .get()
      const nextSortOrder = (maxOrderRow?.sortOrder ?? 0) + 1

      db.insert(searchEngines).values({
        id,
        name: input.name.trim(),
        urlTemplate: input.urlTemplate.trim(),
        bang: input.bang?.trim().toLowerCase() ?? "",
        isDefault,
        sortOrder: nextSortOrder,
        createdAt: now,
        updatedAt: now,
      }).run()

      const created = db.select().from(searchEngines).where(eq(searchEngines.id, id)).get()!
      return mapEngineRow(created)
    },

    // 更新搜索引擎信息。
    update(id: string, input: UpdateSearchEngineInput): SearchEngine {
      const existing = db.select().from(searchEngines).where(eq(searchEngines.id, id)).get()
      if (!existing) throw new SearchEngineError(404, "指定的搜索引擎不存在")

      if (input.urlTemplate !== undefined && !input.urlTemplate.includes("%s")) {
        throw new SearchEngineError(400, "搜索引擎模板必须包含 %s 占位符")
      }

      const now = Date.now()
      if (input.isDefault) {
        db.update(searchEngines).set({ isDefault: 0, updatedAt: now }).run()
      }

      const values: Partial<typeof searchEngines.$inferInsert> = {
        updatedAt: now,
      }
      if (input.name !== undefined) values.name = input.name.trim()
      if (input.urlTemplate !== undefined) values.urlTemplate = input.urlTemplate.trim()
      if (input.bang !== undefined) values.bang = input.bang.trim().toLowerCase()
      if (input.isDefault !== undefined) values.isDefault = input.isDefault ? 1 : 0
      if (input.sortOrder !== undefined) values.sortOrder = input.sortOrder

      db.update(searchEngines).set(values).where(eq(searchEngines.id, id)).run()
      const updated = db.select().from(searchEngines).where(eq(searchEngines.id, id)).get()!
      return mapEngineRow(updated)
    },

    // 删除搜索引擎。
    delete(id: string): void {
      const existing = db.select().from(searchEngines).where(eq(searchEngines.id, id)).get()
      if (!existing) throw new SearchEngineError(404, "指定的搜索引擎不存在")

      const totalCount = db.select().from(searchEngines).all().length
      if (totalCount <= 1) {
        throw new SearchEngineError(400, "至少保留一个搜索引擎")
      }

      db.delete(searchEngines).where(eq(searchEngines.id, id)).run()

      // 如果删除的是默认引擎，把排在第一个的设为默认
      if (existing.isDefault) {
        const first = db.select().from(searchEngines).orderBy(asc(searchEngines.sortOrder)).limit(1).get()
        if (first) {
          db.update(searchEngines).set({ isDefault: 1, updatedAt: Date.now() }).where(eq(searchEngines.id, first.id)).run()
        }
      }
    },
  }
}
