import { expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { createBackupService } from '../src/modules/backups/service'
import { eq } from 'drizzle-orm'
import { openDatabase } from '../src/db'
import { users, userSettings } from '../src/db/schema'
import { createZip } from '../src/modules/themes/zip'

// 测试一致性快照生成、附件归档、保留策略与演练恢复。
test('SQLite 一致性快照：通过 VACUUM INTO 生成无 WAL 依赖的独立一致数据库', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'backup-snap-test-'))
  const dbPath = join(tempDir, 'main.db')
  const db = openDatabase(dbPath)

  // 插入基线数据。
  const now = Date.now()
  db.insert(users).values({ id: 1, username: 'tester', passwordHash: 'hash123', createdAt: now }).run()
  db.insert(userSettings).values({ userId: 1, revision: 0, title: '我的快照主页', appearance: 'system', updatedAt: now }).run()

  const service = createBackupService(db, tempDir)

  try {
    const snap = service.createSnapshot()
    expect(snap.filename).toContain('.zip')
    expect(snap.sizeBytes).toBeGreaterThan(100)
    expect(snap.manifest.dbMigrationVersion).toBeGreaterThanOrEqual(14)
    expect(snap.manifest.files.some(f => f.path === 'data/laull-home.db')).toBe(true)

    // 读取快照文件验证。
    const list = service.listSnapshots()
    expect(list.length).toBe(1)
    expect(list[0]!.filename).toBe(snap.filename)
  } finally {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('附件归档：将 icons 与 wallpapers 目录共同打包并生成清单哈希', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'backup-attach-test-'))
  const dbPath = join(tempDir, 'main.db')
  const db = openDatabase(dbPath)

  // 构造附件。
  const iconsDir = join(tempDir, 'icons')
  const wallpapersDir = join(tempDir, 'wallpapers')
  mkdirSync(iconsDir, { recursive: true })
  mkdirSync(wallpapersDir, { recursive: true })
  writeFileSync(join(iconsDir, 'site.ico'), 'fake-icon-content')
  writeFileSync(join(wallpapersDir, 'bg.jpg'), 'fake-wallpaper-content')

  const service = createBackupService(db, tempDir)

  try {
    const snap = service.createSnapshot()
    const verify = service.verifyBackup(service.getSnapshotBuffer(snap.filename).buffer)

    expect(verify.valid).toBe(true)
    expect(verify.attachmentCount).toBe(2)
  } finally {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('保留策略：按快照数量与体积配额自动淘汰超限旧快照', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'backup-retention-test-'))
  const dbPath = join(tempDir, 'main.db')
  const db = openDatabase(dbPath)

  const service = createBackupService(db, tempDir)

  try {
    // 连续创建 3 份快照。
    service.createSnapshot()
    service.createSnapshot()
    service.createSnapshot()

    expect(service.listSnapshots().length).toBe(3)

    // 执行策略：最多保留 2 份。
    const pruneRes = service.enforceRetention({ maxSnapshots: 2 })
    expect(pruneRes.deletedCount).toBe(1)
    expect(service.listSnapshots().length).toBe(2)
  } finally {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('恢复演练：PRAGMA integrity_check 验证、损坏拦截与版本降级防护', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'backup-verify-test-'))
  const dbPath = join(tempDir, 'main.db')
  const db = openDatabase(dbPath)
  const service = createBackupService(db, tempDir)

  try {
    const snap = service.createSnapshot()
    const validBuf = service.getSnapshotBuffer(snap.filename).buffer

    // 1. 合规快照演练校验通过。
    const verifyOk = service.verifyBackup(validBuf)
    expect(verifyOk.valid).toBe(true)
    expect(verifyOk.integrityOk).toBe(true)

    // 2. 数据库内容被篡改损坏时被拦截。
    const corruptZip = createZip([
      { path: 'data/laull-home.db', data: Buffer.from('corrupted sqlite database junk content') },
      { path: 'backup-manifest.json', data: Buffer.from('{}') },
    ])
    const verifyCorrupt = service.verifyBackup(corruptZip)
    expect(verifyCorrupt.valid).toBe(false)
    expect(verifyCorrupt.message).toContain('数据库结构损坏')

    // 3. 快照迁移版本高于程序版本时拒绝降级。
    const futureDbPath = join(tempDir, 'future.db')
    const futureDb = new Database(futureDbPath)
    futureDb.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT, applied_at INTEGER);
      INSERT INTO schema_migrations VALUES (999, 'hash', 1000);
    `)
    futureDb.close()

    const futureZip = createZip([
      { path: 'data/laull-home.db', data: readFileSync(futureDbPath) },
      { path: 'backup-manifest.json', data: Buffer.from('{}') },
    ])
    const verifyFuture = service.verifyBackup(futureZip)
    expect(verifyFuture.valid).toBe(false)
    expect(verifyFuture.message).toContain('拒绝降级恢复')
  } finally {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('停机数据物理还原：解压并验证还原后的数据库与附件完整可用', () => {
  const tempSourceDir = mkdtempSync(join(tmpdir(), 'backup-src-'))
  const tempTargetDir = mkdtempSync(join(tmpdir(), 'backup-dst-'))

  const dbPath = join(tempSourceDir, 'source.db')
  const db = openDatabase(dbPath)

  // 写入待验证数据。
  const now = Date.now()
  db.insert(users).values({ id: 1, username: 'restore_user', passwordHash: 'pass_hash', createdAt: now }).run()
  db.insert(userSettings).values({ userId: 1, revision: 0, title: '即将还原的主页', appearance: 'dark', updatedAt: now }).run()

  const iconsDir = join(tempSourceDir, 'icons')
  mkdirSync(iconsDir, { recursive: true })
  writeFileSync(join(iconsDir, 'app.png'), 'test-png-binary')

  const service = createBackupService(db, tempSourceDir)

  try {
    const snap = service.createSnapshot()
    const snapBuffer = service.getSnapshotBuffer(snap.filename).buffer

    // 还原至全新空目标目录。
    const restoreRes = service.restoreToDirectory(snapBuffer, tempTargetDir)
    expect(restoreRes.restoredCount).toBeGreaterThanOrEqual(2)

    // 验证目标目录中的 SQLite 数据库可正常打开并含有正确数据。
    const restoredDbPath = join(tempTargetDir, 'laull-home.db')
    expect(existsSync(restoredDbPath)).toBe(true)

    const restoredDb = openDatabase(restoredDbPath)
    const userRow = restoredDb.select().from(users).where(eq(users.id, 1)).get()!
    expect(userRow.username).toBe('restore_user')

    const settingsRow = restoredDb.select().from(userSettings).where(eq(userSettings.userId, 1)).get()!
    expect(settingsRow.title).toBe('即将还原的主页')
    restoredDb.close()

    // 验证附件已还原。
    expect(existsSync(join(tempTargetDir, 'icons/app.png'))).toBe(true)
  } finally {
    db.close()
    rmSync(tempSourceDir, { recursive: true, force: true })
    rmSync(tempTargetDir, { recursive: true, force: true })
  }
})
