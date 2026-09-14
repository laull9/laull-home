import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// 用户表定义。
export const users = sqliteTable('users', {
  // 单用户编号固定为 1。
  id: integer('id').primaryKey(),
  // 唯一用户名。
  username: text('username').notNull().unique(),
  // Argon2id 密码哈希摘要。
  passwordHash: text('password_hash').notNull(),
  // 创建时间戳。
  createdAt: integer('created_at').notNull(),
})

// 设备会话表定义。
export const sessions = sqliteTable('sessions', {
  // 会话原文的 SHA-256 摘要。
  tokenHash: text('token_hash').primaryKey(),
  // 关联用户编号。
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // 会话创建时间戳。
  createdAt: integer('created_at').notNull(),
  // 会话过期时间戳。
  expiresAt: integer('expires_at').notNull(),
  // 客户端公开会话标识。
  id: text('id'),
  // 客户端设备信息。
  userAgent: text('user_agent').notNull().default(''),
}, table => [
  // 按过期时间快速索引。
  index('sessions_expiry').on(table.expiresAt),
  // 按公开会话标识唯一索引。
  uniqueIndex('idx_sessions_id').on(table.id),
])

// 用户基础设置表定义。
export const userSettings = sqliteTable('user_settings', {
  // 关联用户编号。
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  // 版本号防止并发写入冲突。
  revision: integer('revision').notNull().default(0),
  // 主页页面标题。
  title: text('title').notNull().default('我的主页'),
  // 外观模式：system、light、dark。
  appearance: text('appearance').notNull().default('system'),
  // 更新时间戳。
  updatedAt: integer('updated_at').notNull(),
})

// 登录节流记录表定义。
export const loginThrottle = sqliteTable('login_throttle', {
  // 固定编号 1 保持单条记录。
  id: integer('id').primaryKey(),
  // 当前时间窗口内失败尝试次数。
  attempts: integer('attempts').notNull(),
  // 窗口截止时间戳。
  windowEnd: integer('window_end').notNull(),
})

// 空间表定义。
export const spaces = sqliteTable('spaces', {
  // 空间唯一标识。
  id: text('id').primaryKey(),
  // 所属用户编号。
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // 空间名称。
  name: text('name').notNull(),
  // 空间类型：normal 或 privacy。
  type: text('type').notNull(),
  // 是否为默认普通空间。
  isDefault: integer('is_default').notNull().default(0),
  // 创建时间戳。
  createdAt: integer('created_at').notNull(),
  // 更新时间戳。
  updatedAt: integer('updated_at').notNull(),
}, table => [
  // 按所属用户索引空间。
  index('idx_spaces_user').on(table.userId),
])

// 独立隐私密码凭据表定义。
export const spaceCredentials = sqliteTable('space_credentials', {
  // 目标空间编号。
  spaceId: text('space_id').primaryKey().references(() => spaces.id, { onDelete: 'cascade' }),
  // 独立隐私密码哈希。
  passwordHash: text('password_hash').notNull(),
  // 更新时间戳。
  updatedAt: integer('updated_at').notNull(),
})

// 短期空间授权会话表定义。
export const spaceSessions = sqliteTable('space_sessions', {
  // 短期空间令牌的 SHA-256 摘要。
  tokenHash: text('token_hash').primaryKey(),
  // 授权目标空间编号。
  spaceId: text('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  // 所属用户编号。
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // 授权签发时间戳。
  createdAt: integer('created_at').notNull(),
  // 授权过期时间戳。
  expiresAt: integer('expires_at').notNull(),
}, table => [
  // 按过期时间快速清理过期授权。
  index('idx_space_sessions_expiry').on(table.expiresAt),
])

// 迁移历史记录表定义。
export const schemaMigrations = sqliteTable('schema_migrations', {
  // 迁移递增版本号。
  version: integer('version').primaryKey(),
  // 迁移 SQL 内容 SHA-256 校验和。
  checksum: text('checksum').notNull(),
  // 迁移执行时间戳。
  appliedAt: integer('applied_at').notNull(),
})
