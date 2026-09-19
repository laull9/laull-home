import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'
import { Database } from 'bun:sqlite'
import type { AppDatabase } from '../../db'
import { migrations } from '../../db/migrations'
import { createZip, readZipEntries, type ZipFileToWrite } from '../themes/zip'
import type { BackupRetentionPolicy, BackupSnapshotItem, VerifyBackupResult } from '@laull-home/shared'

// 备份加密魔数标识。
const ENC_MAGIC = Buffer.from('LH_ENC1')

// 备份服务业务异常类。
export class BackupError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

// 备份清单内部结构。
export interface BackupManifest {
  version: number
  createdAt: number
  appVersion: string
  dbMigrationVersion: number
  encrypted: boolean
  secretsExcluded: boolean
  files: Array<{ path: string; size: number; sha256: string }>
}

// 默认快照保留策略。
export const DEFAULT_RETENTION_POLICY: Required<BackupRetentionPolicy> = {
  maxSnapshots: 7,
  maxAgeDays: 30,
  maxTotalSizeBytes: 500 * 1024 * 1024,
}

// 计算 Buffer 的 SHA-256 摘要。
function sha256(buf: Buffer): string {
  return new Bun.CryptoHasher('sha256').update(buf).digest('hex')
}

// 使用 AES-256-GCM 基于密码加密归档数据。
export function encryptBackupArchive(data: Buffer, password: string): Buffer {
  if (!password || password.length < 8) {
    throw new BackupError(400, '加密密码长度至少为 8 位')
  }
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = pbkdf2Sync(password, salt, 100000, 32, 'sha256')
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([ENC_MAGIC, salt, iv, tag, encrypted])
}

// 使用 AES-256-GCM 基于密码解密归档数据。
export function decryptBackupArchive(encryptedData: Buffer, password: string): Buffer {
  if (encryptedData.length < ENC_MAGIC.length + 16 + 12 + 16) {
    throw new BackupError(400, '加密备份包头部截断损坏')
  }
  const magic = encryptedData.subarray(0, ENC_MAGIC.length)
  if (!magic.equals(ENC_MAGIC)) {
    throw new BackupError(400, '非法的加密备份魔数')
  }
  let offset = ENC_MAGIC.length
  const salt = encryptedData.subarray(offset, offset + 16)
  offset += 16
  const iv = encryptedData.subarray(offset, offset + 12)
  offset += 12
  const tag = encryptedData.subarray(offset, offset + 16)
  offset += 16
  const ciphertext = encryptedData.subarray(offset)

  const key = pbkdf2Sync(password, salt, 100000, 32, 'sha256')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new BackupError(400, '备份解密失败，密码不正确或数据被篡改')
  }
}

// 创建统一备份与恢复演练服务。
export function createBackupService(db: AppDatabase, dataDir: string) {
  const backupsDir = join(dataDir, 'backups')
  if (!existsSync(backupsDir)) {
    mkdirSync(backupsDir, { recursive: true, mode: 0o700 })
  }

  // 获取当前程序支持的最大迁移版本号。
  const currentAppMaxVersion = Math.max(...migrations.map(m => m.version), 1)

  return {
    // 获取当前保留策略配置。
    getRetentionPolicy(): Required<BackupRetentionPolicy> {
      return { ...DEFAULT_RETENTION_POLICY }
    },

    // 执行保留策略修剪，清理超限或过期旧快照。
    enforceRetention(policy: BackupRetentionPolicy = {}): { deletedCount: number } {
      const maxSnapshots = policy.maxSnapshots ?? DEFAULT_RETENTION_POLICY.maxSnapshots
      const maxAgeDays = policy.maxAgeDays ?? DEFAULT_RETENTION_POLICY.maxAgeDays
      const maxTotalSizeBytes = policy.maxTotalSizeBytes ?? DEFAULT_RETENTION_POLICY.maxTotalSizeBytes

      const items = this.listSnapshots()
      const now = Date.now()
      const ageThreshold = now - maxAgeDays * 24 * 60 * 60 * 1000

      let deletedCount = 0
      const remaining: typeof items = []

      for (const item of items) {
        if (item.createdAt < ageThreshold) {
          this.deleteSnapshot(item.filename)
          deletedCount++
        } else {
          remaining.push(item)
        }
      }

      // 按数量限制修剪（最旧优先）。
      while (remaining.length > maxSnapshots) {
        const oldest = remaining.pop()!
        this.deleteSnapshot(oldest.filename)
        deletedCount++
      }

      // 按总体积配额修剪。
      let currentTotalSize = remaining.reduce((sum, item) => sum + item.sizeBytes, 0)
      while (currentTotalSize > maxTotalSizeBytes && remaining.length > 0) {
        const oldest = remaining.pop()!
        this.deleteSnapshot(oldest.filename)
        currentTotalSize -= oldest.sizeBytes
        deletedCount++
      }

      return { deletedCount }
    },

    // 列出所有本地快照。
    listSnapshots(): BackupSnapshotItem[] {
      if (!existsSync(backupsDir)) return []
      const files = readdirSync(backupsDir)
      const list: BackupSnapshotItem[] = []

      for (const file of files) {
        if (!file.endsWith('.zip') && !file.endsWith('.enc')) continue
        const fullPath = join(backupsDir, file)
        try {
          const stat = statSync(fullPath)
          const isEnc = file.endsWith('.enc')
          list.push({
            filename: file,
            sizeBytes: stat.size,
            createdAt: stat.mtimeMs,
            encrypted: isEnc,
            secretsExcluded: !isEnc,
          })
        } catch {
          // 忽略并发删除或读取异常。
        }
      }

      return list.sort((a, b) => b.createdAt - a.createdAt)
    },

    // 删除指定快照文件。
    deleteSnapshot(filename: string): boolean {
      const safeName = basename(filename)
      const fullPath = join(backupsDir, safeName)
      if (existsSync(fullPath)) {
        unlinkSync(fullPath)
        return true
      }
      return false
    },

    // 读取指定快照文件 Buffer。
    getSnapshotBuffer(filename: string): { filename: string; buffer: Buffer; isEncrypted: boolean } {
      const safeName = basename(filename)
      const fullPath = join(backupsDir, safeName)
      if (!existsSync(fullPath)) {
        throw new BackupError(404, '指定的快照文件不存在')
      }
      const buffer = readFileSync(fullPath)
      return {
        filename: safeName,
        buffer,
        isEncrypted: safeName.endsWith('.enc'),
      }
    },

    // 创建一致性快照归档（使用 SQLite VACUUM INTO，并可选择排除凭据或密码加密）。
    createSnapshot(options: {
      includeSecrets?: boolean
      encryptionPassword?: string
      retentionPolicy?: BackupRetentionPolicy
    } = {}): { filename: string; sizeBytes: number; manifest: BackupManifest } {
      const now = Date.now()
      const timestamp = new Date(now).toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const tempSnapshotDbPath = join(backupsDir, `temp_snapshot_${now}.db`)

      try {
        // 1. 使用 SQLite VACUUM INTO 在线导出一致性快照。
        const escapedPath = tempSnapshotDbPath.replace(/'/g, "''")
        const client = (db as unknown as { $client?: Database }).$client
        if (client && typeof client.exec === 'function') {
          client.exec(`VACUUM INTO '${escapedPath}'`)
        } else {
          throw new BackupError(500, '底层数据库客户端不支持 VACUUM INTO 快照')
        }

        // 2. 处理凭据排除（默认脱敏）。
        const excludeSecrets = !options.includeSecrets
        if (excludeSecrets) {
          const snapDb = new Database(tempSnapshotDbPath)
          try {
            snapDb.exec('DELETE FROM integration_secrets;')
          } finally {
            snapDb.close()
          }
        }

        // 3. 读取快照 DB 文件及附件并打包。
        const dbBuffer = readFileSync(tempSnapshotDbPath)
        const archiveFiles: ZipFileToWrite[] = [
          { path: 'data/laull-home.db', data: dbBuffer },
        ]

        // 打包 icons 附件。
        const iconsDir = join(dataDir, 'icons')
        if (existsSync(iconsDir)) {
          for (const icon of readdirSync(iconsDir)) {
            const fullIcon = join(iconsDir, icon)
            if (statSync(fullIcon).isFile()) {
              archiveFiles.push({ path: `data/icons/${icon}`, data: readFileSync(fullIcon) })
            }
          }
        }

        // 打包 wallpapers 附件。
        const wallpapersDir = join(dataDir, 'wallpapers')
        if (existsSync(wallpapersDir)) {
          for (const wp of readdirSync(wallpapersDir)) {
            const fullWp = join(wallpapersDir, wp)
            if (statSync(fullWp).isFile()) {
              archiveFiles.push({ path: `data/wallpapers/${wp}`, data: readFileSync(fullWp) })
            }
          }
        }

        // 4. 构建备份清单。
        const fileMetadata = archiveFiles.map(f => ({
          path: f.path,
          size: f.data.length,
          sha256: sha256(f.data),
        }))

        const manifest: BackupManifest = {
          version: 1,
          createdAt: now,
          appVersion: '0.4.0',
          dbMigrationVersion: currentAppMaxVersion,
          encrypted: Boolean(options.encryptionPassword),
          secretsExcluded: excludeSecrets,
          files: fileMetadata,
        }

        archiveFiles.push({
          path: 'backup-manifest.json',
          data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
        })

        // 5. 生成 Zip 归档 Buffer。
        const suffix = `${now.toString().slice(-4)}_${Math.random().toString(36).slice(2, 6)}`
        let finalBuffer = createZip(archiveFiles)
        let finalName = `backup_${timestamp}_${suffix}_v${currentAppMaxVersion}.zip`

        // 6. 若配置了密码，使用加盐 AES-256-GCM 封装加密。
        if (options.encryptionPassword) {
          finalBuffer = encryptBackupArchive(finalBuffer, options.encryptionPassword)
          finalName = `backup_${timestamp}_${suffix}_v${currentAppMaxVersion}.enc`
        }

        const finalPath = join(backupsDir, finalName)
        writeFileSync(finalPath, finalBuffer)

        // 7. 执行保留策略自动清理。
        this.enforceRetention(options.retentionPolicy)

        return {
          filename: finalName,
          sizeBytes: finalBuffer.length,
          manifest,
        }
      } finally {
        // 清理临时文件。
        if (existsSync(tempSnapshotDbPath)) {
          try { unlinkSync(tempSnapshotDbPath) } catch { /* 忽略清理残余 */ }
        }
      }
    },

    // 恢复演练与完整性检验（验证归档、解密、PRAGMA integrity_check、迁移版本与附件）。
    verifyBackup(archiveBuffer: Buffer, password?: string): VerifyBackupResult {
      let zipBuffer = archiveBuffer
      const isEncrypted = archiveBuffer.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC)

      if (isEncrypted) {
        if (!password) {
          return {
            valid: false,
            message: '该备份为加密文件，必须提供解密密码',
            integrityOk: false,
            attachmentCount: 0,
            secretsExcluded: false,
            encrypted: true,
          }
        }
        try {
          zipBuffer = decryptBackupArchive(archiveBuffer, password)
        } catch (err) {
          return {
            valid: false,
            message: err instanceof Error ? err.message : '解密失败',
            integrityOk: false,
            attachmentCount: 0,
            secretsExcluded: false,
            encrypted: true,
          }
        }
      }

      let entries: ReturnType<typeof readZipEntries>
      try {
        entries = readZipEntries(zipBuffer)
      } catch (err) {
        return {
          valid: false,
          message: `压缩包格式损坏：${err instanceof Error ? err.message : '解析失败'}`,
          integrityOk: false,
          attachmentCount: 0,
          secretsExcluded: false,
          encrypted: isEncrypted,
        }
      }

      const manifestEntry = entries.find(e => e.path === 'backup-manifest.json')
      let manifest: BackupManifest | undefined
      if (manifestEntry) {
        try {
          manifest = JSON.parse(manifestEntry.data.toString('utf8'))
        } catch { /* 忽略解析异常 */ }
      }

      const dbEntry = entries.find(e => e.path === 'data/laull-home.db')
      if (!dbEntry) {
        return {
          valid: false,
          message: '备份包中缺失核心数据库文件 data/laull-home.db',
          integrityOk: false,
          attachmentCount: 0,
          secretsExcluded: false,
          encrypted: isEncrypted,
        }
      }

      // 提取至临时文件做 SQLite 完整性检查。
      const tempTestDb = join(backupsDir, `verify_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`)
      let integrityOk = false
      let dbVersion: number | undefined

      try {
        writeFileSync(tempTestDb, dbEntry.data)
        const testSqlite = new Database(tempTestDb)
        try {
          const integrity = testSqlite.query('PRAGMA integrity_check;').all() as Array<{ integrity_check: string }>
          integrityOk = integrity.length > 0 && integrity[0]?.integrity_check === 'ok'

          const migrationRows = testSqlite.query('SELECT MAX(version) as max_v FROM schema_migrations;').all() as Array<{ max_v: number }>
          dbVersion = migrationRows[0]?.max_v ?? 1
        } finally {
          testSqlite.close()
        }
      } catch (err) {
        return {
          valid: false,
          message: `SQLite 数据库结构损坏：${err instanceof Error ? err.message : '未知错误'}`,
          integrityOk: false,
          attachmentCount: 0,
          secretsExcluded: false,
          encrypted: isEncrypted,
        }
      } finally {
        if (existsSync(tempTestDb)) {
          try { unlinkSync(tempTestDb) } catch { /* 忽略清理残余 */ }
        }
      }

      if (!integrityOk) {
        return {
          valid: false,
          message: '数据库 PRAGMA integrity_check 未能通过',
          integrityOk: false,
          attachmentCount: 0,
          secretsExcluded: false,
          encrypted: isEncrypted,
        }
      }

      // 检查迁移版本兼容性（拒绝备份版本高于程序版本的包）。
      if (dbVersion && dbVersion > currentAppMaxVersion) {
        return {
          valid: false,
          message: `备份的数据库迁移版本（v${dbVersion}）高于当前运行程序支持的最大版本（v${currentAppMaxVersion}），拒绝降级恢复`,
          dbVersion,
          currentAppMaxVersion,
          integrityOk: true,
          attachmentCount: 0,
          secretsExcluded: Boolean(manifest?.secretsExcluded),
          encrypted: isEncrypted,
        }
      }

      const attachmentCount = entries.filter(e => e.path.startsWith('data/icons/') || e.path.startsWith('data/wallpapers/')).length

      return {
        valid: true,
        message: '备份包演练校验通过，数据结构完好无损',
        dbVersion,
        currentAppMaxVersion,
        integrityOk: true,
        attachmentCount,
        secretsExcluded: Boolean(manifest?.secretsExcluded),
        encrypted: isEncrypted,
      }
    },

    // 停机或离线物理还原数据到指定目录。
    restoreToDirectory(archiveBuffer: Buffer, targetDir: string, password?: string): { restoredCount: number } {
      const verify = this.verifyBackup(archiveBuffer, password)
      if (!verify.valid) {
        throw new BackupError(400, `恢复中止：${verify.message}`)
      }

      let zipBuffer = archiveBuffer
      if (archiveBuffer.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC)) {
        zipBuffer = decryptBackupArchive(archiveBuffer, password!)
      }

      const entries = readZipEntries(zipBuffer)
      let restoredCount = 0

      for (const entry of entries) {
        if (entry.isDirectory || entry.path === 'backup-manifest.json') continue
        // 映射到目标路径。
        const relative = entry.path.startsWith('data/') ? entry.path.slice(5) : entry.path
        const targetPath = resolve(targetDir, relative)
        mkdirSync(dirname(targetPath), { recursive: true })
        writeFileSync(targetPath, entry.data)
        restoredCount++
      }

      return { restoredCount }
    },
  }
}

// 导出 BackupService 类型。
export type BackupService = ReturnType<typeof createBackupService>
