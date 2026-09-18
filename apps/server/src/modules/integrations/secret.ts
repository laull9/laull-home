import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../db'
import { integrationSecrets } from '../../db/schema'

// 密文编码前缀版本标识。
const SECRET_CIPHER_VERSION = 'v1'

// 凭据加密异常类。
export class SecretCryptoError extends Error {
  // 携带错误标识。
  constructor(message: string) {
    super(message)
    this.name = 'SecretCryptoError'
  }
}

// 将主密钥字符串安全转换为 32 字节 AES 密钥 Buffer。
export function deriveKey(masterKey: string): Buffer {
  if (!masterKey || masterKey.trim().length === 0) {
    throw new SecretCryptoError('主密钥不能为空')
  }
  return createHash('sha256').update(masterKey).digest()
}

// 使用 AES-256-GCM 加密敏感凭据明文。
export function encryptSecret(plainText: string, masterKey: string): string {
  if (!plainText) return ''
  const key = deriveKey(masterKey)
  // 采用 12 字节标准 GCM IV（96-bit 随机向量）。
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(plainText, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag()
  // 格式：v1:iv_hex:tag_hex:cipher_hex。
  return `${SECRET_CIPHER_VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
}

// 使用 AES-256-GCM 解密敏感凭据密文并校验完整性。
export function decryptSecret(encryptedPayload: string, masterKey: string): string {
  if (!encryptedPayload) return ''
  const parts = encryptedPayload.split(':')
  if (parts.length !== 4 || parts[0] !== SECRET_CIPHER_VERSION) {
    throw new SecretCryptoError('密文格式无效或版本不匹配')
  }
  const iv = Buffer.from(parts[1]!, 'hex')
  const tag = Buffer.from(parts[2]!, 'hex')
  const cipherText = parts[3]!
  if (iv.length !== 12 || tag.length !== 16) {
    throw new SecretCryptoError('密文向量或校验标签长度不正确')
  }
  const key = deriveKey(masterKey)
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    let decrypted = decipher.update(cipherText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch {
    throw new SecretCryptoError('凭据解密校验失败，可能主密钥错误或密文被篡改')
  }
}

// 在单事务中批量轮换所有存储凭据的主密钥。
export function rotateSecrets(db: AppDatabase, oldMasterKey: string, newMasterKey: string): { rotatedCount: number } {
  const records = db.select().from(integrationSecrets).all()
  let rotatedCount = 0
  db.transaction(tx => {
    const now = Date.now()
    for (const record of records) {
      // 校验并解密旧密文。
      const plainSecret = decryptSecret(record.encryptedSecret, oldMasterKey)
      // 使用新密钥重新加密并递增版本。
      const newEncrypted = encryptSecret(plainSecret, newMasterKey)
      tx.update(integrationSecrets)
        .set({
          encryptedSecret: newEncrypted,
          keyVersion: record.keyVersion + 1,
          updatedAt: now,
        })
        .where(eq(integrationSecrets.integrationId, record.integrationId))
        .run()
      rotatedCount++
    }
  })
  return { rotatedCount }
}
