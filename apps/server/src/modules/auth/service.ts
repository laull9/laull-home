import type { Database } from 'bun:sqlite'
import type { ServerConfig } from '../../config'

// 认证错误只携带允许向客户端公开的信息。
export class AuthError extends Error {
  // HTTP 状态供路由统一转换。
  constructor(public status: 401 | 409 | 429, message: string) { super(message) }
}

// 用户查询结构仅在认证模块内部使用。
interface UserRow {
  // 单用户账号编号。
  id: number
  // 登录用户名。
  username: string
  // Argon2id 密码摘要。
  password_hash: string
}

// Session 原文只放 Cookie，数据库使用 SHA-256 摘要。
export function hashToken(token: string): string {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex')
}

// 通过本地命令初始化唯一账号，不提供公网注册入口。
export async function createUser(db: Database, username: string, password: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(username) || password.length < 12 || password.length > 128) {
    throw new Error('用户名需为 1 至 64 位字母、数字、下划线或连字符，密码需为 12 至 128 位')
  }
  if (db.query('SELECT id FROM users').get()) throw new AuthError(409, '账号已初始化')
  const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 })
  db.transaction(() => {
    if (db.query('SELECT id FROM users').get()) throw new AuthError(409, '账号已初始化')
    db.query('INSERT INTO users VALUES (1, ?, ?, ?)').run(username, passwordHash, Date.now())
    db.query('INSERT INTO user_settings (user_id, updated_at) VALUES (1, ?)').run(Date.now())
  }).immediate()
}

// 认证服务持有数据库依赖，不创建全局连接。
export function createAuthService(db: Database, config: ServerConfig) {
  return {
    // 持久化全局登录节流，避免代理地址伪造绕过限制。
    async login(username: string, password: string) {
      const now = Date.now()
      db.transaction(() => {
        const limit = db.query<{ attempts: number; window_end: number }, []>('SELECT attempts, window_end FROM login_throttle WHERE id = 1').get()
        if (limit && limit.window_end > now && limit.attempts >= 10) throw new AuthError(429, '登录尝试过多，请稍后重试')
        if (!limit || limit.window_end <= now) {
          db.query('INSERT OR REPLACE INTO login_throttle VALUES (1, 1, ?)').run(now + 15 * 60_000)
        } else db.query('UPDATE login_throttle SET attempts = attempts + 1 WHERE id = 1').run()
      }).immediate()
      const user = db.query<UserRow, []>('SELECT * FROM users WHERE id = 1').get()
      // 无效用户名也验证现有密码摘要，减少用户名时序差异。
      const valid = user ? await Bun.password.verify(password, user.password_hash) : false
      if (!user || !valid || user.username !== username) throw new AuthError(401, '用户名或密码错误')
      const token = crypto.getRandomValues(new Uint8Array(32)).toHex()
      const expiresAt = now + config.sessionDays * 86_400_000
      db.transaction(() => {
        db.query('DELETE FROM sessions WHERE expires_at <= ?').run(now)
        // 每个账号最多保留 20 个 Session，超出时撤销最早的会话。
        db.query('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions ORDER BY created_at DESC LIMIT -1 OFFSET 19)').run()
        db.query('INSERT INTO sessions VALUES (?, 1, ?, ?)').run(hashToken(token), now, expiresAt)
      }).immediate()
      return { token, expiresAt, user: { id: user.id, username: user.username } }
    },
    // 每次请求检查数据库和有效期，撤销立即生效。
    authenticate(token: unknown) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null
      return db.query<{ id: number; username: string }, [string, number]>(
        'SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?',
      ).get(hashToken(token), Date.now())
    },
    // 退出只撤销当前会话。
    logout(token: string) { db.query('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token)) },
    // 保留当前设备，撤销同一用户的其他会话。
    revokeOthers(token: string) { db.query('DELETE FROM sessions WHERE token_hash <> ?').run(hashToken(token)) },
  }
}
