import { and, asc, eq } from 'drizzle-orm'
import { BREAKPOINTS, newWidget, scopedCss, type Desktop } from '@laull-home/shared'
import type { AppDatabase } from '../../db'
import { bookmarkGroups, bookmarks, desktops } from '../../db/schema'
import { BookmarkError } from '../bookmarks/service'

// 画布服务提供原子快照及乐观并发控制。
export function createDesktopService(db: AppDatabase) {
  // 旧版书签首次读取时映射到组件，不改写原书签。
  function initial(spaceId: string): Desktop {
    const search = newWidget('search', 'initial-search')
    const clock = newWidget('clock', 'initial-clock')
    const folders = db.select().from(bookmarkGroups).where(eq(bookmarkGroups.spaceId, spaceId)).orderBy(asc(bookmarkGroups.sortOrder)).all().map(group => ({
      ...newWidget('folder', 'folder-' + group.id), title: group.name, referenceId: group.id,
    }))
    return { revision: 0, nodes: [search, clock, ...folders], templates: [] }
  }
  // 校验引用归属、时区、叠放尺寸、CSS 与容量。
  function validate(spaceId: string, value: Desktop) {
    if (new TextEncoder().encode(JSON.stringify(value)).length > 512 * 1024) throw new BookmarkError(400, '画布超过 512 KiB')
    for (const list of [value.nodes, value.templates]) {
      if (new Set(list.map(node => node.id)).size !== list.length) throw new BookmarkError(400, '组件编号重复')
      const stacks = new Map<string, string>()
      for (const node of list) {
        try { scopedCss(node.css, '#widget-' + node.id) } catch (error) {
          throw new BookmarkError(400, error instanceof Error ? error.message : 'CSS 无效')
        }
        try { new Intl.DateTimeFormat('zh-CN', { timeZone: node.timezone }) } catch { throw new BookmarkError(400, '时区无效') }
        if (node.referenceId) {
          const table = node.type === 'bookmark' ? bookmarks : node.type === 'folder' ? bookmarkGroups : null
          if (table) {
            const row = db.select({ spaceId: table.spaceId }).from(table).where(eq(table.id, node.referenceId)).get()
            if (!row || row.spaceId !== spaceId) throw new BookmarkError(400, '书签或分组不属于当前空间')
          }
        }
        for (const [key, p] of Object.entries(node.layouts)) {
          if (!p) continue
          if (p.x + p.w > BREAKPOINTS[key as keyof typeof BREAKPOINTS]) throw new BookmarkError(400, '组件超出网格边界')
          if (node.type === 'search' && p.h !== 1) throw new BookmarkError(400, '搜索组件只能占一行')
        }
        if (node.stackId) {
          const sizes = JSON.stringify(Object.entries(BREAKPOINTS).map(([key, columns]) => {
            const p = node.layouts[key as keyof typeof BREAKPOINTS] ?? node.layouts.desktop
            return [Math.min(columns, p.w), p.h]
          }))
          if (stacks.has(node.stackId) && stacks.get(node.stackId) !== sizes) throw new BookmarkError(400, '叠放组件的各断点尺寸必须一致')
          stacks.set(node.stackId, sizes)
        }
      }
    }
  }
  const service = {
    // 未保存的旧版主页返回迁移视图。
    get(spaceId: string): Desktop {
      const row = db.select().from(desktops).where(eq(desktops.spaceId, spaceId)).get()
      if (!row) return initial(spaceId)
      const doc = JSON.parse(row.document) as Desktop
      return { ...doc, revision: row.revision }
    },
    // 首次写入与后续更新均通过事务检测版本。
    save(spaceId: string, value: Desktop): Desktop | null {
      try { validate(spaceId, value) } catch (error) {
        if (error instanceof BookmarkError) throw error
        throw new BookmarkError(400, error instanceof Error ? error.message : '组件配置无效')
      }
      return db.transaction(tx => {
        const row = tx.select().from(desktops).where(eq(desktops.spaceId, spaceId)).get()
        if ((row?.revision ?? 0) !== value.revision) return null
        const result = { ...value, revision: value.revision + 1 }
        const data = { revision: result.revision, document: JSON.stringify(result), updatedAt: Date.now() }
        if (row) tx.update(desktops).set(data).where(and(eq(desktops.spaceId, spaceId), eq(desktops.revision, value.revision))).run()
        else tx.insert(desktops).values({ spaceId, ...data }).run()
        return result
      })
    },
    // 两个书签组件合并为真实分组，布局与书签移动共享事务。
    merge(spaceId: string, value: Desktop, sourceId: string, targetId: string): Desktop | null {
      validate(spaceId, value)
      return db.transaction(tx => {
        if (service.get(spaceId).revision !== value.revision) return null
        const source = value.nodes.find(node => node.id === sourceId)
        const target = value.nodes.find(node => node.id === targetId)
        if (!source || !target || source.id === target.id || source.type !== 'bookmark' || target.type !== 'bookmark' || !source.referenceId || !target.referenceId || source.referenceId === target.referenceId) throw new BookmarkError(400, '请选择两个不同的书签组件')
        const groupId = crypto.randomUUID()
        const now = Date.now()
        tx.insert(bookmarkGroups).values({ id: groupId, spaceId, name: '新文件夹', sortOrder: 0, isPublic: 0, createdAt: now, updatedAt: now }).run()
        for (const [index, node] of [target, source].entries()) tx.update(bookmarks).set({ groupId, sortOrder: index, updatedAt: now }).where(and(eq(bookmarks.id, node.referenceId), eq(bookmarks.spaceId, spaceId))).run()
        const folder = { ...newWidget('folder', target.id), title: '新文件夹', referenceId: groupId, layouts: target.layouts }
        return service.save(spaceId, { ...value, nodes: value.nodes.filter(node => node.id !== source.id).map(node => node.id === target.id ? folder : node) })
      })
    },
  }
  return service
}

// 导出 DesktopService 推导类型。
export type DesktopService = ReturnType<typeof createDesktopService>

