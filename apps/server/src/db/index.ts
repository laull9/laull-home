import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { asc } from 'drizzle-orm'
import { migrations } from './migrations'
import * as schema from './schema'

// 应用统一强类型数据库客户端。
export type AppDatabase = BunSQLiteDatabase<typeof schema> & {
  // 安全关闭底层连接。
  close: () => void
}

// 打开数据库并在单个写事务中完成待执行迁移。
export function openDatabase(path: string): AppDatabase {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const sqlite = new Database(path, { create: true, strict: true })
  try {
    sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;')
    const db = Object.assign(drizzle({ client: sqlite, schema }), {
      close: () => sqlite.close(),
    }) as AppDatabase
    sqlite.transaction(() => {
      sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL) STRICT')
      const applied = db.select({
        version: schema.schemaMigrations.version,
        checksum: schema.schemaMigrations.checksum,
      }).from(schema.schemaMigrations).orderBy(asc(schema.schemaMigrations.version)).all()

      if (applied.some(row => !migrations.some(m => m.version === row.version))) {
        throw new Error('数据库版本高于当前程序，请停止降级')
      }
      for (const migration of migrations) {
        const checksum = new Bun.CryptoHasher('sha256').update(migration.sql).digest('hex')
        const existing = applied.find(row => row.version === migration.version)
        if (existing) {
          if (existing.checksum !== checksum) throw new Error('已执行迁移内容发生变化')
          continue
        }
        sqlite.exec(migration.sql)
        db.insert(schema.schemaMigrations).values({
          version: migration.version,
          checksum,
          appliedAt: Date.now(),
        }).run()
      }
    }).immediate()
    return db
  } catch (error) {
    sqlite.close()
    throw error
  }
}
