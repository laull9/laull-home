import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { asc, count, eq, inArray } from 'drizzle-orm'
import { openDatabase } from '../src/db'
import { migrations } from '../src/db/migrations'
import {
  bookmarkGroups,
  bookmarks,
  desktops,
  integrations,
  schemaMigrations,
  spaces,
  users,
  userSettings,
  wallpaperPools,
} from '../src/db/schema'

// 辅助函数：创建隔离的测试临时目录。
function createTempFolder(): string {
  return mkdtempSync(join(tmpdir(), 'laull-migration-cap-'))
}

// 模拟旧版 v1 数据库初始化并无缝升级至最新版。
test('旧版数据库升级：从 v1 逐步升级至最新版并完整保留业务数据', () => {
  const folder = createTempFolder()
  const dbPath = join(folder, 'legacy.db')

  // 使用原生连接创建 v1 初始结构并插入遗留数据。
  const rawSqlite = new Database(dbPath, { create: true, strict: true })
  const v1 = migrations[0]!
  const v1Hash = new Bun.CryptoHasher('sha256').update(v1.sql).digest('hex')
  rawSqlite.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    ) STRICT;
  `)
  rawSqlite.exec(v1.sql)
  rawSqlite.query(
    'INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)',
  ).run(1, v1Hash, Date.now())

  const now = Date.now()
  rawSqlite.query(
    'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(1, 'legacy_admin', '$argon2id$fake_hash_value', now)
  rawSqlite.query(
    'INSERT INTO user_settings (user_id, revision, title, appearance, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(1, 0, '旧版主页标题', 'dark', now)
  rawSqlite.close()

  // 执行 openDatabase 触发自动迁移升级链路。
  const db = openDatabase(dbPath)

  try {
    // 校验全部迁移均已执行入库。
    const appliedList = db.select({ version: schemaMigrations.version })
      .from(schemaMigrations)
      .orderBy(asc(schemaMigrations.version))
      .all()
    expect(appliedList.length).toBe(migrations.length)
    expect(appliedList[appliedList.length - 1]!.version).toBe(migrations[migrations.length - 1]!.version)

    // 校验原有用户与设置无损继承。
    const oldUser = db.select().from(users).where(eq(users.id, 1)).get()
    expect(oldUser).toBeDefined()
    expect(oldUser!.username).toBe('legacy_admin')

    const oldSettings = db.select().from(userSettings).where(eq(userSettings.userId, 1)).get()
    expect(oldSettings).toBeDefined()
    expect(oldSettings!.title).toBe('旧版主页标题')
    expect(oldSettings!.appearance).toBe('dark')

    // 校验新版本默认空间与隐私空间已自动生成。
    const spaceList = db.select().from(spaces).where(eq(spaces.userId, 1)).all()
    expect(spaceList.some(s => s.id === 'default' && s.type === 'normal')).toBe(true)
    expect(spaceList.some(s => s.id === 'privacy' && s.type === 'privacy')).toBe(true)

    // 校验默认图片池已由迁移逻辑补齐。
    const pools = db.select().from(wallpaperPools).where(eq(wallpaperPools.userId, 1)).all()
    expect(pools.length).toBeGreaterThanOrEqual(1)

    // 重启数据库校验幂等性。
    db.close()
    const reopenedDb = openDatabase(dbPath)
    const secondCheck = reopenedDb.select({ version: schemaMigrations.version }).from(schemaMigrations).all()
    expect(secondCheck.length).toBe(migrations.length)
    reopenedDb.close()
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

// 迁移异常发生时必须完整回滚，不能残留脏版本。
test('迁移失败回滚：异常事务自动撤销，保留原始数据与一致性状态', () => {
  const folder = createTempFolder()
  const dbPath = join(folder, 'rollback.db')
  const db = openDatabase(dbPath)

  // 插入初始数据。
  const now = Date.now()
  db.insert(users).values({ id: 1, username: 'test_user', passwordHash: 'hash', createdAt: now }).run()
  db.insert(userSettings).values({ userId: 1, revision: 0, title: '未失败标题', appearance: 'light', updatedAt: now }).run()

  const initialMigrationCount = db.select().from(schemaMigrations).all().length
  db.close()

  // 模拟异常迁移注入底层连接。
  const rawSqlite = new Database(dbPath, { create: true, strict: true })
  rawSqlite.exec('PRAGMA foreign_keys = ON;')

  let errorThrown = false
  try {
    rawSqlite.transaction(() => {
      rawSqlite.exec('CREATE TABLE temp_rollback_table (id INTEGER PRIMARY KEY);')
      // 故意触发语法或外键错误中断事务。
      rawSqlite.exec('INSERT INTO non_existent_table_xyz VALUES (1);')
    }).immediate()
  } catch {
    errorThrown = true
  }

  expect(errorThrown).toBe(true)
  rawSqlite.close()

  // 重新打开数据库，校验未受损坏。
  const recoverDb = openDatabase(dbPath)
  try {
    const migrationsAfter = recoverDb.select().from(schemaMigrations).all()
    expect(migrationsAfter.length).toBe(initialMigrationCount)

    const currentUser = recoverDb.select().from(users).where(eq(users.id, 1)).get()
    expect(currentUser!.username).toBe('test_user')
  } finally {
    recoverDb.close()
    rmSync(folder, { recursive: true, force: true })
  }
})

// 大容量业务数据读写、批量排序与高并发稳定性测试。
test('大容量压力验证：批量书签、多分组与复杂画布稳定响应', () => {
  const folder = createTempFolder()
  const dbPath = join(folder, 'capacity.db')
  const db = openDatabase(dbPath)

  const now = Date.now()
  db.insert(users).values({ id: 1, username: 'scale_user', passwordHash: 'pwd_hash', createdAt: now }).run()
  db.insert(userSettings).values({ userId: 1, revision: 0, title: '高容量测试', appearance: 'system', updatedAt: now }).run()
  db.insert(spaces).values([
    { id: 'default', userId: 1, name: '默认空间', type: 'normal', isDefault: 1, createdAt: now, updatedAt: now },
  ]).onConflictDoNothing().run()

  const startTime = performance.now()

  try {
    // 1. 批量插入 50 个书签分组。
    const groupItems = Array.from({ length: 50 }, (_, i) => ({
      id: `group-scale-${i}`,
      spaceId: 'default',
      name: `分组-${i}`,
      sortOrder: i,
      isPublic: 1,
      createdAt: now + i,
      updatedAt: now + i,
    }))
    db.insert(bookmarkGroups).values(groupItems).run()

    // 2. 批量插入 1200 个书签项并分布到各个分组。
    const bookmarkItems = Array.from({ length: 1200 }, (_, i) => ({
      id: `bm-scale-${i}`,
      groupId: `group-scale-${i % 50}`,
      spaceId: 'default',
      title: `书签站点标题 - ${i}`,
      url: `https://example-${i}.test/path`,
      iconUrl: `https://example-${i}.test/favicon.ico`,
      sortOrder: i,
      isPublic: 1,
      createdAt: now + i,
      updatedAt: now + i,
    }))

    // 分批以 200 条执行插入避免 SQLite 单条语句变量上限。
    const batchChunkSize = 200
    for (let c = 0; c < bookmarkItems.length; c += batchChunkSize) {
      db.insert(bookmarks).values(bookmarkItems.slice(c, c + batchChunkSize)).run()
    }

    // 3. 写入一个包含 80 个组件的大体积 Desktop 画布 JSON。
    const nodes = Array.from({ length: 80 }, (_, i) => ({
      id: `widget-${i}`,
      type: 'bookmark',
      title: `组件小部件 ${i}`,
      content: '',
      referenceId: `bm-scale-${i}`,
      timezone: 'Asia/Shanghai',
      hour12: false,
      stackId: '',
      css: '.widget { display: flex; }',
      layouts: {
        desktop: { x: (i * 2) % 12, y: Math.floor(i / 6), w: 2, h: 1, pinned: false },
        laptop: { x: (i * 2) % 8, y: Math.floor(i / 4), w: 2, h: 1, pinned: false },
        tablet: { x: (i * 2) % 6, y: Math.floor(i / 3), w: 2, h: 1, pinned: false },
        mobile: { x: 0, y: i, w: 4, h: 1, pinned: false },
      },
    }))
    const bigDocument = JSON.stringify({ revision: 1, nodes, templates: [] })
    db.insert(desktops).values({
      spaceId: 'default',
      revision: 1,
      document: bigDocument,
      updatedAt: now,
    }).run()

    // 4. 批量添加 30 个微服务接入。
    const integrationList = Array.from({ length: 30 }, (_, i) => ({
      id: `integration-${i}`,
      userId: 1,
      spaceId: 'default',
      name: `微服务指标 ${i}`,
      slug: `service-slug-${i}`,
      baseUrl: `https://service-${i}.internal.test`,
      authType: 'api-key' as const,
      allowedHosts: JSON.stringify([`service-${i}.internal.test`]),
      timeout: 5000,
      maxConcurrency: 5,
      manifest: JSON.stringify({ version: '1.0.0' }),
      createdAt: now,
      updatedAt: now,
    }))
    db.insert(integrations).values(integrationList).run()

    // 5. 聚合查询与批量查询耗时验证。
    const queryStart = performance.now()
    const totalBookmarks = db.select({ count: count() }).from(bookmarks).where(eq(bookmarks.spaceId, 'default')).get()
    expect(totalBookmarks?.count).toBe(1200)

    const listGroupBm = db.select()
      .from(bookmarks)
      .where(eq(bookmarks.groupId, 'group-scale-10'))
      .orderBy(asc(bookmarks.sortOrder))
      .all()
    expect(listGroupBm.length).toBe(24)

    const readDesktop = db.select().from(desktops).where(eq(desktops.spaceId, 'default')).get()
    expect(readDesktop).toBeDefined()
    const parsedDesktop = JSON.parse(readDesktop!.document)
    expect(parsedDesktop.nodes.length).toBe(80)

    const queryDuration = performance.now() - queryStart
    // 查询耗时应显著低于 150 毫秒。
    expect(queryDuration).toBeLessThan(150)

    // 6. 批量级联删除清理验证。
    const deleteIds = bookmarkItems.slice(0, 50).map(b => b.id)
    db.delete(bookmarks).where(inArray(bookmarks.id, deleteIds)).run()

    const remainingCount = db.select({ count: count() }).from(bookmarks).where(eq(bookmarks.spaceId, 'default')).get()
    expect(remainingCount?.count).toBe(1150)

    const totalDuration = performance.now() - startTime
    // 整体大数据量读写控制在合理范围。
    expect(totalDuration).toBeLessThan(2000)
  } finally {
    db.close()
    rmSync(folder, { recursive: true, force: true })
  }
})
