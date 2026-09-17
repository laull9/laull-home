import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { McpKeyMetadata, McpKeyRefreshResponse } from '@laull-home/shared'
import type { AppDatabase } from '../../db'
import { mcpKeys, users } from '../../db/schema'

// 计算密钥原文的 SHA-256 哈希摘要。
export function hashMcpKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

// 生成脱敏掩码，仅保留统一前缀与末尾 4 位字符。
export function maskMcpKey(key: string): string {
  const tail = key.slice(-4)
  return `lh_mcp_••••••••${tail}`
}

// 生成统一前缀的 32 字节高熵随机文本密钥。
export function generateMcpKey(): string {
  const entropy = randomBytes(32).toString('hex')
  return `lh_mcp_${entropy}`
}

// MCP 核心密钥服务，保证哈希存储与单向刷新机制。
export function createMcpService(db: AppDatabase) {
  return {
    // 获取当前用户密钥的脱敏元数据，明文不可反查。
    getKeyMetadata(userId: number): McpKeyMetadata {
      const record = db.select({
        keyMask: mcpKeys.keyMask,
        createdAt: mcpKeys.createdAt,
        updatedAt: mcpKeys.updatedAt,
      }).from(mcpKeys).where(eq(mcpKeys.userId, userId)).get()
      if (!record) {
        return { hasKey: false, keyMask: null, createdAt: null, updatedAt: null }
      }
      return {
        hasKey: true,
        keyMask: record.keyMask,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }
    },
    // 单向签发或刷新密钥，旧密钥立即吊销，仅此一次返回完整明文。
    refreshKey(userId: number): McpKeyRefreshResponse {
      const plainKey = generateMcpKey()
      const keyHash = hashMcpKey(plainKey)
      const keyMask = maskMcpKey(plainKey)
      const now = Date.now()

      db.transaction(tx => {
        // 先移除旧密钥。
        tx.delete(mcpKeys).where(eq(mcpKeys.userId, userId)).run()
        // 写入新密钥摘要与脱敏掩码。
        tx.insert(mcpKeys).values({
          userId,
          keyHash,
          keyMask,
          createdAt: now,
          updatedAt: now,
        }).run()
      })

      return {
        key: plainKey,
        keyMask,
        createdAt: now,
      }
    },
    // 停用当前用户的 MCP 密钥，收回调用权限。
    revokeKey(userId: number): boolean {
      const existing = db.select({ userId: mcpKeys.userId }).from(mcpKeys).where(eq(mcpKeys.userId, userId)).get()
      if (!existing) return false
      db.delete(mcpKeys).where(eq(mcpKeys.userId, userId)).run()
      return true
    },
    // 比对 Bearer 密钥哈希，返回有效用户编号。
    verifyKey(rawKey: string): { id: number; username: string } | null {
      if (!rawKey || !rawKey.startsWith('lh_mcp_')) return null
      const computedHash = hashMcpKey(rawKey)
      const record = db.select({
        userId: mcpKeys.userId,
      }).from(mcpKeys).where(eq(mcpKeys.keyHash, computedHash)).get()
      if (!record) return null

      const user = db.select({
        id: users.id,
        username: users.username,
      }).from(users).where(eq(users.id, record.userId)).get()

      return user ?? null
    },
  }
}

// 导出服务推导类型。
export type McpService = ReturnType<typeof createMcpService>
