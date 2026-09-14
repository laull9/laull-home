import { and, desc, eq, gt, lte, ne } from 'drizzle-orm'
import type { AppDatabase } from '../../db'
import { loginThrottle, sessions, spaces, users, userSettings } from '../../db/schema'
import type { ServerConfig } from '../../config'

// 认证错误只携带允许向客户端公开的信息。
export class AuthError extends Error {
  // HTTP 状态供路由统一转换。
  constructor(public status: 401 | 409 | 429, message: string) { super(message) }
}

// Session 原文只放 Cookie，数据库使用 SHA-256 摘要。
export function hashToken(token: string): string {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex')
}

// 检查并在账号未初始化时自动创建初始管理员与默认密码。
export async function ensureInitialUser(db: AppDatabase): Promise<{ created: boolean; username?: string; password?: string }> {
  const existing = db.select({ id: users.id }).from(users).get()
  if (existing) return { created: false }
  const username = 'admin'
  const password = 'admin'
  await createUser(db, username, password)
  return { created: true, username, password }
}

// 通过本地命令初始化唯一账号，不提供公网注册入口。
export async function createUser(db: AppDatabase, username: string, password: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(username) || password.length < 5 || password.length > 128) {
    throw new Error('用户名需为 1 至 64 位字母、数字、下划线或连字符，密码需为 5 至 128 位')
  }
  const existing = db.select({ id: users.id }).from(users).get()
  if (existing) throw new AuthError(409, '账号已初始化')
  const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 })
  const now = Date.now()
  db.transaction(tx => {
    const user = tx.select({ id: users.id }).from(users).get()
    if (user) throw new AuthError(409, '账号已初始化')
    tx.insert(users).values({ id: 1, username, passwordHash, createdAt: now }).run()
    tx.insert(userSettings).values({ userId: 1, updatedAt: now }).run()
    tx.insert(spaces).values([
      { id: 'default', userId: 1, name: '默认空间', type: 'normal', isDefault: 1, createdAt: now, updatedAt: now },
      { id: 'privacy', userId: 1, name: '隐私空间', type: 'privacy', isDefault: 0, createdAt: now, updatedAt: now },
    ]).onConflictDoNothing().run()
  })
}

// 本地账号密码重置与节流解锁。
export async function resetPassword(db: AppDatabase, newPassword: string, username?: string): Promise<void> {
  if (newPassword.length < 12 || newPassword.length > 128) {
    throw new Error('密码需为 12 至 128 位')
  }
  const user = db.select().from(users).where(eq(users.id, 1)).get()
  if (!user) throw new Error('账号未初始化，无法重置密码')
  if (username && user.username !== username) throw new Error('指定用户名不存在')
  const passwordHash = await Bun.password.hash(newPassword, { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 })
  db.transaction(tx => {
    tx.update(users).set({ passwordHash }).where(eq(users.id, 1)).run()
    tx.delete(sessions).where(eq(sessions.userId, 1)).run()
    tx.delete(loginThrottle).where(eq(loginThrottle.id, 1)).run()
  })
}

// 认证服务持有数据库依赖，不创建全局连接。
export function createAuthService(db: AppDatabase, config: ServerConfig) {
  return {
    // 持久化全局登录节流，避免代理地址伪造绕过限制。
    async login(username: string, password: string, userAgent = '') {
      const now = Date.now()
      db.transaction(tx => {
        const limit = tx.select().from(loginThrottle).where(eq(loginThrottle.id, 1)).get()
        if (limit && limit.windowEnd > now && limit.attempts >= 10) {
          throw new AuthError(429, '登录尝试过多，请稍后重试')
        }
        if (!limit || limit.windowEnd <= now) {
          tx.insert(loginThrottle).values({ id: 1, attempts: 1, windowEnd: now + 15 * 60_000 })
            .onConflictDoUpdate({
              target: loginThrottle.id,
              set: { attempts: 1, windowEnd: now + 15 * 60_000 },
            }).run()
        } else {
          tx.update(loginThrottle).set({ attempts: limit.attempts + 1 }).where(eq(loginThrottle.id, 1)).run()
        }
      })
      const user = db.select().from(users).where(eq(users.id, 1)).get()
      // 无效用户名也验证现有密码摘要，减少用户名时序差异。
      const valid = user ? await Bun.password.verify(password, user.passwordHash) : false
      if (!user || !valid || user.username !== username) throw new AuthError(401, '用户名或密码错误')
      const token = crypto.getRandomValues(new Uint8Array(32)).toHex()
      const sessionId = crypto.getRandomValues(new Uint8Array(16)).toHex()
      const expiresAt = now + config.sessionDays * 86_400_000
      db.transaction(tx => {
        tx.delete(sessions).where(lte(sessions.expiresAt, now)).run()
        // 每个账号最多保留 20 个 Session，超出时撤销最早的会话。
        const active = tx.select({ tokenHash: sessions.tokenHash }).from(sessions).orderBy(desc(sessions.createdAt)).all()
        if (active.length >= 20) {
          const toRemove = active.slice(19).map(s => s.tokenHash)
          for (const th of toRemove) {
            tx.delete(sessions).where(eq(sessions.tokenHash, th)).run()
          }
        }
        tx.insert(sessions).values({
          tokenHash: hashToken(token),
          userId: 1,
          createdAt: now,
          expiresAt,
          id: sessionId,
          userAgent,
        }).run()
      })
      const isDefaultPassword = await Bun.password.verify('admin', user.passwordHash)
      return { token, sessionId, expiresAt, user: { id: user.id, username: user.username, isDefaultPassword } }
    },
    // 修改密码并撤销所有旧会话，重新生成当前设备会话。
    async changePassword(userId: number, oldPassword: string, newPassword: string, userAgent = '') {
      if (newPassword.length < 5 || newPassword.length > 128) {
        throw new AuthError(401, '新密码需为 5 至 128 位')
      }
      const user = db.select().from(users).where(eq(users.id, userId)).get()
      if (!user) throw new AuthError(401, '用户不存在')
      const valid = await Bun.password.verify(oldPassword, user.passwordHash)
      if (!valid) throw new AuthError(401, '旧密码不正确')
      const passwordHash = await Bun.password.hash(newPassword, { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 })
      const now = Date.now()
      const token = crypto.getRandomValues(new Uint8Array(32)).toHex()
      const sessionId = crypto.getRandomValues(new Uint8Array(16)).toHex()
      const expiresAt = now + config.sessionDays * 86_400_000
      db.transaction(tx => {
        tx.update(users).set({ passwordHash }).where(eq(users.id, userId)).run()
        tx.delete(sessions).where(eq(sessions.userId, userId)).run()
        tx.insert(sessions).values({
          tokenHash: hashToken(token),
          userId,
          createdAt: now,
          expiresAt,
          id: sessionId,
          userAgent,
        }).run()
      })
      return { token, sessionId, expiresAt }
    },
    // 修改当前用户的用户名并防止重名。
    async changeUsername(userId: number, newUsername: string) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(newUsername)) {
        throw new AuthError(401, '用户名需为 1 至 64 位字母、数字、下划线或连字符')
      }
      const existing = db.select({ id: users.id }).from(users).where(and(eq(users.username, newUsername), ne(users.id, userId))).get()
      if (existing) {
        throw new AuthError(409, '用户名已被占用')
      }
      db.update(users).set({ username: newUsername }).where(eq(users.id, userId)).run()
      return { success: true, username: newUsername }
    },
    // 获取当前用户的所有活动会话列表。
    listSessions(userId: number, currentToken: string) {
      const now = Date.now()
      const rows = db.select().from(sessions).where(
        and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)),
      ).orderBy(desc(sessions.createdAt)).all()
      const currentHash = hashToken(currentToken)
      return rows.map(row => ({
        id: row.id ?? '',
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        isCurrent: row.tokenHash === currentHash,
        userAgent: row.userAgent ?? '',
      }))
    },
    // 撤销指定会话编号的设备。
    revokeSession(userId: number, sessionId: string) {
      db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.id, sessionId))).run()
    },
    // 每次请求检查数据库和有效期，撤销立即生效。
    authenticate(token: unknown) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null
      const row = db.select({
        id: users.id,
        username: users.username,
        passwordHash: users.passwordHash,
      }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(
        and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, Date.now())),
      ).get()
      return row ?? null
    },
    // 退出只撤销当前会话。
    logout(token: string) {
      db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token))).run()
    },
    // 保留当前设备，撤销同一用户的其他会话。
    revokeOthers(token: string) {
      db.delete(sessions).where(ne(sessions.tokenHash, hashToken(token))).run()
    },
  }
}
