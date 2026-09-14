import { and, asc, desc, eq, gt, lte } from 'drizzle-orm'
import type { SpaceItem, SpaceType } from '@laull-home/shared'
import type { AppDatabase } from '../../db'
import { spaceCredentials, spaces, spaceSessions } from '../../db/schema'
import { AuthError, hashToken } from '../auth/service'

// 空间服务处理空间隔离、独立凭据与短期解锁授权。
export function createSpacesService(db: AppDatabase) {
  return {
    // 获取用户可用空间列表及当前解锁状态。
    list(userId: number, currentSpaceToken?: string): SpaceItem[] {
      const now = Date.now()
      const spaceList = db.select().from(spaces).where(eq(spaces.userId, userId)).orderBy(desc(spaces.isDefault), asc(spaces.createdAt)).all()
      const credRows = db.select({
        spaceId: spaceCredentials.spaceId,
      }).from(spaceCredentials).innerJoin(spaces, eq(spaces.id, spaceCredentials.spaceId)).where(eq(spaces.userId, userId)).all()
      const credSet = new Set(credRows.map(r => r.spaceId))

      let unlockedSpaceId: string | null = null
      if (currentSpaceToken && /^[a-f0-9]{64}$/.test(currentSpaceToken)) {
        const session = db.select({ spaceId: spaceSessions.spaceId }).from(spaceSessions).where(
          and(
            eq(spaceSessions.tokenHash, hashToken(currentSpaceToken)),
            eq(spaceSessions.userId, userId),
            gt(spaceSessions.expiresAt, now),
          ),
        ).get()
        if (session) unlockedSpaceId = session.spaceId
      }
      return spaceList.map(space => ({
        id: space.id,
        name: space.name,
        type: space.type as SpaceType,
        isDefault: Boolean(space.isDefault),
        hasPassword: credSet.has(space.id),
        isUnlocked: space.type === 'normal' || unlockedSpaceId === space.id,
      }))
    },
    // 为隐私空间设置或更新独立密码。
    async setupPassword(userId: number, spaceId: string, password: string): Promise<void> {
      if (password.length < 5 || password.length > 128) throw new AuthError(401, '独立隐私密码需为 5 至 128 位')
      const space = db.select().from(spaces).where(and(eq(spaces.id, spaceId), eq(spaces.userId, userId))).get()
      if (!space || space.type !== 'privacy') throw new AuthError(401, '目标隐私空间不存在')
      const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 })
      const now = Date.now()
      db.transaction(tx => {
        tx.insert(spaceCredentials).values({
          spaceId,
          passwordHash,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: spaceCredentials.spaceId,
          set: { passwordHash, updatedAt: now },
        }).run()
        // 密码变更后撤销旧的短期授权。
        tx.delete(spaceSessions).where(eq(spaceSessions.spaceId, spaceId)).run()
      })
    },
    // 验证独立隐私密码并签发 15 分钟短期空间授权。
    async unlock(userId: number, spaceId: string, password: string): Promise<{ token: string; expiresAt: number }> {
      const space = db.select().from(spaces).where(and(eq(spaces.id, spaceId), eq(spaces.userId, userId))).get()
      if (!space || space.type !== 'privacy') throw new AuthError(401, '目标隐私空间不存在')
      const cred = db.select().from(spaceCredentials).where(eq(spaceCredentials.spaceId, spaceId)).get()
      if (!cred) throw new AuthError(401, '尚未初始化独立隐私密码，请先设置')
      const valid = await Bun.password.verify(password, cred.passwordHash)
      if (!valid) throw new AuthError(401, '独立隐私密码错误')
      const now = Date.now()
      const token = crypto.getRandomValues(new Uint8Array(32)).toHex()
      // 短期授权固定有效期 15 分钟。
      const expiresAt = now + 15 * 60_000
      db.transaction(tx => {
        tx.delete(spaceSessions).where(lte(spaceSessions.expiresAt, now)).run()
        tx.insert(spaceSessions).values({
          tokenHash: hashToken(token),
          spaceId,
          userId,
          createdAt: now,
          expiresAt,
        }).run()
      })
      return { token, expiresAt }
    },
    // 主动锁定隐私空间，立即销毁短期会话。
    lock(spaceToken: string): void {
      db.delete(spaceSessions).where(eq(spaceSessions.tokenHash, hashToken(spaceToken))).run()
    },
    // 检查用户是否有权限访问指定空间。
    verifyAccess(userId: number, spaceId: string, spaceToken?: string): boolean {
      const space = db.select().from(spaces).where(and(eq(spaces.id, spaceId), eq(spaces.userId, userId))).get()
      if (!space) return false
      if (space.type === 'normal') return true
      if (!spaceToken || !/^[a-f0-9]{64}$/.test(spaceToken)) return false
      const session = db.select({ spaceId: spaceSessions.spaceId }).from(spaceSessions).where(
        and(
          eq(spaceSessions.tokenHash, hashToken(spaceToken)),
          eq(spaceSessions.spaceId, spaceId),
          eq(spaceSessions.userId, userId),
          gt(spaceSessions.expiresAt, Date.now()),
        ),
      ).get()
      return Boolean(session)
    },
  }
}
