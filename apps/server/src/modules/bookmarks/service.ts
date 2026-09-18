import { and, asc, desc, eq, isNull } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import type {
  Bookmark,
  BookmarkGroup,
  CreateBookmarkGroupInput,
  CreateBookmarkInput,
  ReorderBookmarkGroupsInput,
  ReorderBookmarksInput,
  UpdateBookmarkGroupInput,
  UpdateBookmarkInput,
} from "@laull-home/shared"
import type { AppDatabase } from "../../db"
import { bookmarkGroups, bookmarks, spaces } from "../../db/schema"

// 书签业务操作异常类。
export class BookmarkError extends Error {
  // 携带 HTTP 状态码便于路由层转换。
  constructor(public status: number, message: string) {
    super(message)
    this.name = "BookmarkError"
  }
}

// 转换数据库分组行为标准分组结构。
function mapGroupRow(row: typeof bookmarkGroups.$inferSelect): BookmarkGroup {
  return {
    id: row.id,
    spaceId: row.spaceId,
    name: row.name,
    sortOrder: row.sortOrder,
    isPublic: Boolean(row.isPublic),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// 转换数据库书签行为标准书签结构。
function mapBookmarkRow(row: typeof bookmarks.$inferSelect): Bookmark {
  return {
    id: row.id,
    groupId: row.groupId,
    spaceId: row.spaceId,
    title: row.title,
    url: row.url,
    iconUrl: row.iconUrl,
    sortOrder: row.sortOrder,
    isPublic: Boolean(row.isPublic),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// 校验 URL 协议安全性。
function assertSafeUrl(targetUrl: string) {
  try {
    const parsed = new URL(targetUrl)
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error()
    }
  } catch {
    throw new BookmarkError(400, "书签地址必须是以 http:// 或 https:// 开头的合法网址")
  }
}

// 创建书签与分组服务。
export function createBookmarkService(db: AppDatabase) {
  // 校验目标空间的访问与操作权限。
  function assertSpacePermission(spaceId: string, isUnlocked: boolean, isVisitor = false) {
    const space = db.select().from(spaces).where(eq(spaces.id, spaceId)).get()
    if (!space) throw new BookmarkError(404, "指定的空间不存在")
    if (space.type === "privacy") {
      if (isVisitor) throw new BookmarkError(401, "未登录访客无法访问隐私空间")
      if (!isUnlocked) throw new BookmarkError(403, "隐私空间尚未解锁")
    }
    return space
  }

  return {
    // 列出指定空间下的分组。
    listGroups(spaceId: string, isUnlocked: boolean, isVisitor = false): BookmarkGroup[] {
      assertSpacePermission(spaceId, isUnlocked, isVisitor)
      const conditions = [eq(bookmarkGroups.spaceId, spaceId)]
      if (isVisitor) conditions.push(eq(bookmarkGroups.isPublic, 1))

      const rows = db.select()
        .from(bookmarkGroups)
        .where(and(...conditions))
        .orderBy(asc(bookmarkGroups.sortOrder), asc(bookmarkGroups.createdAt))
        .all()

      return rows.map(mapGroupRow)
    },

    // 创建书签分组。
    createGroup(input: CreateBookmarkGroupInput, isUnlocked: boolean): BookmarkGroup {
      assertSpacePermission(input.spaceId, isUnlocked)
      const now = Date.now()
      const maxOrderRow = db.select({ sortOrder: bookmarkGroups.sortOrder })
        .from(bookmarkGroups)
        .where(eq(bookmarkGroups.spaceId, input.spaceId))
        .orderBy(desc(bookmarkGroups.sortOrder))
        .limit(1)
        .get()
      const nextSortOrder = (maxOrderRow?.sortOrder ?? -1) + 1

      const id = "group-" + randomUUID()
      const isPublic = input.isPublic !== false ? 1 : 0

      db.insert(bookmarkGroups).values({
        id,
        spaceId: input.spaceId,
        name: input.name.trim(),
        sortOrder: nextSortOrder,
        isPublic,
        createdAt: now,
        updatedAt: now,
      }).run()

      const created = db.select().from(bookmarkGroups).where(eq(bookmarkGroups.id, id)).get()!
      return mapGroupRow(created)
    },

    // 更新书签分组。
    updateGroup(id: string, input: UpdateBookmarkGroupInput, isUnlocked: boolean): BookmarkGroup {
      const group = db.select().from(bookmarkGroups).where(eq(bookmarkGroups.id, id)).get()
      if (!group) throw new BookmarkError(404, "分组不存在")
      assertSpacePermission(group.spaceId, isUnlocked)

      const values: Partial<typeof bookmarkGroups.$inferInsert> = {
        updatedAt: Date.now(),
      }
      if (input.name !== undefined) values.name = input.name.trim()
      if (input.sortOrder !== undefined) values.sortOrder = input.sortOrder
      if (input.isPublic !== undefined) values.isPublic = input.isPublic ? 1 : 0

      db.update(bookmarkGroups).set(values).where(eq(bookmarkGroups.id, id)).run()
      const updated = db.select().from(bookmarkGroups).where(eq(bookmarkGroups.id, id)).get()!
      return mapGroupRow(updated)
    },

    // 删除书签分组及其所属书签。
    deleteGroup(id: string, isUnlocked: boolean): void {
      const group = db.select().from(bookmarkGroups).where(eq(bookmarkGroups.id, id)).get()
      if (!group) throw new BookmarkError(404, "分组不存在")
      assertSpacePermission(group.spaceId, isUnlocked)
      db.delete(bookmarkGroups).where(eq(bookmarkGroups.id, id)).run()
    },

    // 批量重排分组顺序。
    reorderGroups(spaceId: string, input: ReorderBookmarkGroupsInput, isUnlocked: boolean): void {
      assertSpacePermission(spaceId, isUnlocked)
      const now = Date.now()
      db.transaction(tx => {
        input.groupIds.forEach((groupId, index) => {
          tx.update(bookmarkGroups)
            .set({ sortOrder: index, updatedAt: now })
            .where(and(eq(bookmarkGroups.id, groupId), eq(bookmarkGroups.spaceId, spaceId)))
            .run()
        })
      })
    },

    // 列出书签，可按分组过滤。
    listBookmarks(spaceId: string, isUnlocked: boolean, isVisitor = false, groupId?: string): Bookmark[] {
      assertSpacePermission(spaceId, isUnlocked, isVisitor)
      const conditions = [eq(bookmarks.spaceId, spaceId)]
      if (groupId) conditions.push(eq(bookmarks.groupId, groupId))
      if (isVisitor) conditions.push(eq(bookmarks.isPublic, 1))

      const rows = db.select()
        .from(bookmarks)
        .where(and(...conditions))
        .orderBy(asc(bookmarks.sortOrder), asc(bookmarks.createdAt))
        .all()

      return rows.map(mapBookmarkRow)
    },

    // 创建书签，支持未分组独立书签与指定分组书签。
    createBookmark(input: CreateBookmarkInput, isUnlocked: boolean): Bookmark {
      assertSafeUrl(input.url)
      let targetSpaceId = input.spaceId ?? "default"
      let targetGroupId: string | null = null

      if (input.groupId) {
        const group = db.select().from(bookmarkGroups).where(eq(bookmarkGroups.id, input.groupId)).get()
        if (!group) throw new BookmarkError(404, "指定的分组不存在")
        assertSpacePermission(group.spaceId, isUnlocked)
        targetSpaceId = group.spaceId
        targetGroupId = group.id
      } else {
        assertSpacePermission(targetSpaceId, isUnlocked)
      }

      const now = Date.now()
      const maxOrderConditions = [eq(bookmarks.spaceId, targetSpaceId)]
      if (targetGroupId) {
        maxOrderConditions.push(eq(bookmarks.groupId, targetGroupId))
      } else {
        maxOrderConditions.push(isNull(bookmarks.groupId))
      }
      const maxOrderRow = db.select({ sortOrder: bookmarks.sortOrder })
        .from(bookmarks)
        .where(and(...maxOrderConditions))
        .orderBy(desc(bookmarks.sortOrder))
        .limit(1)
        .get()
      const nextSortOrder = (maxOrderRow?.sortOrder ?? -1) + 1

      const id = "bm-" + randomUUID()
      const isPublic = input.isPublic !== false ? 1 : 0

      db.insert(bookmarks).values({
        id,
        groupId: targetGroupId,
        spaceId: targetSpaceId,
        title: input.title.trim(),
        url: input.url.trim(),
        iconUrl: input.iconUrl?.trim() ?? "",
        sortOrder: nextSortOrder,
        isPublic,
        createdAt: now,
        updatedAt: now,
      }).run()

      const created = db.select().from(bookmarks).where(eq(bookmarks.id, id)).get()!
      return mapBookmarkRow(created)
    },

    // 更新书签信息。
    updateBookmark(id: string, input: UpdateBookmarkInput, isUnlocked: boolean): Bookmark {
      const bookmark = db.select().from(bookmarks).where(eq(bookmarks.id, id)).get()
      if (!bookmark) throw new BookmarkError(404, "书签不存在")
      assertSpacePermission(bookmark.spaceId, isUnlocked)

      const values: Partial<typeof bookmarks.$inferInsert> = {
        updatedAt: Date.now(),
      }

      if (input.url !== undefined) {
        assertSafeUrl(input.url)
        values.url = input.url.trim()
      }
      if (input.title !== undefined) values.title = input.title.trim()
      if (input.iconUrl !== undefined) values.iconUrl = input.iconUrl.trim()
      if (input.sortOrder !== undefined) values.sortOrder = input.sortOrder
      if (input.isPublic !== undefined) values.isPublic = input.isPublic ? 1 : 0

      if (input.groupId !== undefined && input.groupId !== bookmark.groupId) {
        if (input.groupId === null) {
          values.groupId = null
          // 未显式指定排序时，从文件夹移出默认排在独立书签末尾。
          if (input.sortOrder === undefined) {
            const maxOrderRow = db.select({ sortOrder: bookmarks.sortOrder })
              .from(bookmarks)
              .where(and(eq(bookmarks.spaceId, bookmark.spaceId), isNull(bookmarks.groupId)))
              .orderBy(desc(bookmarks.sortOrder))
              .limit(1)
              .get()
            values.sortOrder = (maxOrderRow?.sortOrder ?? -1) + 1
          }
        } else {
          const targetGroup = db.select().from(bookmarkGroups).where(eq(bookmarkGroups.id, input.groupId)).get()
          if (!targetGroup) throw new BookmarkError(404, "目标分组不存在")
          assertSpacePermission(targetGroup.spaceId, isUnlocked)
          values.groupId = targetGroup.id
          values.spaceId = targetGroup.spaceId
          // 未显式指定排序时，放入文件夹默认追加在最后一位，绝不在中间插入。
          if (input.sortOrder === undefined) {
            const maxOrderRow = db.select({ sortOrder: bookmarks.sortOrder })
              .from(bookmarks)
              .where(and(eq(bookmarks.spaceId, targetGroup.spaceId), eq(bookmarks.groupId, targetGroup.id)))
              .orderBy(desc(bookmarks.sortOrder))
              .limit(1)
              .get()
            values.sortOrder = (maxOrderRow?.sortOrder ?? -1) + 1
          }
        }
      }

      db.update(bookmarks).set(values).where(eq(bookmarks.id, id)).run()
      const updated = db.select().from(bookmarks).where(eq(bookmarks.id, id)).get()!
      return mapBookmarkRow(updated)
    },

    // 删除书签。
    deleteBookmark(id: string, isUnlocked: boolean): void {
      const bookmark = db.select().from(bookmarks).where(eq(bookmarks.id, id)).get()
      if (!bookmark) throw new BookmarkError(404, "书签不存在")
      assertSpacePermission(bookmark.spaceId, isUnlocked)
      db.delete(bookmarks).where(eq(bookmarks.id, id)).run()
    },

    // 批量重读书签组内顺序。
    reorderBookmarks(input: ReorderBookmarksInput, isUnlocked: boolean): void {
      const group = db.select().from(bookmarkGroups).where(eq(bookmarkGroups.id, input.groupId)).get()
      if (!group) throw new BookmarkError(404, "指定的分组不存在")
      assertSpacePermission(group.spaceId, isUnlocked)

      const now = Date.now()
      db.transaction(tx => {
        input.bookmarkIds.forEach((bookmarkId, index) => {
          tx.update(bookmarks)
            .set({ sortOrder: index, updatedAt: now })
            .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.groupId, input.groupId)))
            .run()
        })
      })
    },
  }
}
