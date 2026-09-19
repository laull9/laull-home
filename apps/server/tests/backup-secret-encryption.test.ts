import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { createBackupService } from '../src/modules/backups/service'
import { openDatabase } from '../src/db'
import { integrations, integrationSecrets, spaces, users, userSettings } from '../src/db/schema'

// 测试默认导出排除 Secret 明文与密码加密备份恢复流程。
test('默认脱敏导出：严格清除 integration_secrets 表数据，杜绝凭据外泄', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'backup-secret-leak-test-'))
  const dbPath = join(tempDir, 'main.db')
  const db = openDatabase(dbPath)

  // 插入用户、空间、微服务及加密凭据。
  const now = Date.now()
  db.insert(users).values({ id: 1, username: 'admin', passwordHash: 'hash', createdAt: now }).run()
  db.insert(userSettings).values({ userId: 1, revision: 0, title: '主页', appearance: 'system', updatedAt: now }).run()
  db.insert(spaces).values({ id: 'space-1', userId: 1, name: '默认', type: 'normal', isDefault: 1, createdAt: now, updatedAt: now }).run()
  db.insert(integrations).values({ id: 'int-1', userId: 1, spaceId: 'space-1', name: '测试服务', slug: 'test-svc', baseUrl: 'https://api.test', authType: 'bearer', createdAt: now, updatedAt: now }).run()
  db.insert(integrationSecrets).values({ integrationId: 'int-1', encryptedSecret: 'v1:fake_iv:fake_tag:fake_cipher', keyVersion: 1, createdAt: now, updatedAt: now }).run()

  const service = createBackupService(db, tempDir)

  try {
    // 默认创建脱敏快照。
    const snap = service.createSnapshot({ includeSecrets: false })
    expect(snap.manifest.secretsExcluded).toBe(true)
    expect(snap.manifest.encrypted).toBe(false)

    // 演练并检查解出的数据库中的凭据表。
    const targetDir = join(tempDir, 'restored_sanitized')
    const snapBuf = service.getSnapshotBuffer(snap.filename).buffer
    service.restoreToDirectory(snapBuf, targetDir)

    const restoredDb = new Database(join(targetDir, 'laull-home.db'))
    const secretRows = restoredDb.query('SELECT * FROM integration_secrets;').all()
    restoredDb.close()

    // 凭据表必须为空，杜绝明文或旧密文泄露！
    expect(secretRows.length).toBe(0)
  } finally {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('加密备份与恢复：基于加盐 AES-256-GCM，校验密码验证与防篡改机制', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'backup-enc-test-'))
  const dbPath = join(tempDir, 'main.db')
  const db = openDatabase(dbPath)

  // 插入包含微服务与凭据的数据。
  const now = Date.now()
  db.insert(users).values({ id: 1, username: 'admin', passwordHash: 'hash', createdAt: now }).run()
  db.insert(userSettings).values({ userId: 1, revision: 0, title: '加密主页', appearance: 'system', updatedAt: now }).run()
  db.insert(spaces).values({ id: 'space-1', userId: 1, name: '空间', type: 'normal', isDefault: 1, createdAt: now, updatedAt: now }).run()
  db.insert(integrations).values({ id: 'int-1', userId: 1, spaceId: 'space-1', name: '内部微服务', slug: 'int-slug', baseUrl: 'https://internal.test', authType: 'bearer', createdAt: now, updatedAt: now }).run()
  db.insert(integrationSecrets).values({ integrationId: 'int-1', encryptedSecret: 'v1:iv123:tag123:ciphertext123', keyVersion: 1, createdAt: now, updatedAt: now }).run()

  const service = createBackupService(db, tempDir)

  try {
    const password = 'StrongBackupPassword123!'
    // 1. 创建加密备份。
    const snap = service.createSnapshot({
      includeSecrets: true,
      encryptionPassword: password,
    })

    expect(snap.filename.endsWith('.enc')).toBe(true)
    expect(snap.manifest.encrypted).toBe(true)
    expect(snap.manifest.secretsExcluded).toBe(false)

    const encBuffer = service.getSnapshotBuffer(snap.filename).buffer

    // 2. 演练校验：正确密码通过。
    const verifyCorrect = service.verifyBackup(encBuffer, password)
    expect(verifyCorrect.valid).toBe(true)
    expect(verifyCorrect.encrypted).toBe(true)
    expect(verifyCorrect.secretsExcluded).toBe(false)

    // 3. 演练校验：未提供密码拦截。
    const verifyNoPwd = service.verifyBackup(encBuffer)
    expect(verifyNoPwd.valid).toBe(false)
    expect(verifyNoPwd.message).toContain('必须提供解密密码')

    // 4. 演练校验：错误密码拦截。
    const verifyWrongPwd = service.verifyBackup(encBuffer, 'WrongPassword456!')
    expect(verifyWrongPwd.valid).toBe(false)
    expect(verifyWrongPwd.message).toContain('密码不正确或数据被篡改')

    // 5. 密文篡改检测。
    const tampered = Buffer.from(encBuffer)
    tampered[tampered.length - 5]! ^= 0xff
    const verifyTampered = service.verifyBackup(tampered, password)
    expect(verifyTampered.valid).toBe(false)

    // 6. 还原加密快照并核对微服务凭据未丢失。
    const restoreDir = join(tempDir, 'restored_encrypted')
    service.restoreToDirectory(encBuffer, restoreDir, password)

    const restoredDb = new Database(join(restoreDir, 'laull-home.db'))
    const secretRows = restoredDb.query('SELECT * FROM integration_secrets;').all() as Array<{ encrypted_secret: string }>
    restoredDb.close()

    expect(secretRows.length).toBe(1)
    expect(secretRows[0]!.encrypted_secret).toBe('v1:iv123:tag123:ciphertext123')
  } finally {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  }
})
