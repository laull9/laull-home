import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { migrations } from './migrations'

// 打开数据库并在单个写事务中完成待执行迁移。
export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new Database(path, { create: true, strict: true })
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;')
    db.transaction(() => {
      db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL) STRICT')
      const applied = db.query<{ version: number; checksum: string }, []>('SELECT version, checksum FROM schema_migrations ORDER BY version').all()
      if (applied.some(row => !migrations.some(m => m.version === row.version))) throw new Error('数据库版本高于当前程序，请停止降级')
      for (const migration of migrations) {
        const checksum = new Bun.CryptoHasher('sha256').update(migration.sql).digest('hex')
        const existing = applied.find(row => row.version === migration.version)
        if (existing) {
          if (existing.checksum !== checksum) throw new Error('已执行迁移内容发生变化')
          continue
        }
        db.exec(migration.sql)
        db.query('INSERT INTO schema_migrations VALUES (?, ?, ?)').run(migration.version, checksum, Date.now())
      }
    }).immediate()
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
