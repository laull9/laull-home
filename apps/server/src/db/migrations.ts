// 已发布迁移禁止改写；后续变更追加新版本。
export const migrations = [{
  // 迁移版本按顺序递增。
  version: 1,
  // 账号、会话与用户设置的初始结构。
  sql: `
    CREATE TABLE users (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX sessions_expiry ON sessions(expires_at);
    CREATE TABLE user_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
      title TEXT NOT NULL DEFAULT '我的主页',
      appearance TEXT NOT NULL DEFAULT 'system' CHECK (appearance IN ('system', 'light', 'dark')),
      updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE login_throttle (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      attempts INTEGER NOT NULL,
      window_end INTEGER NOT NULL
    ) STRICT;
  `,
}, {
  // 迁移版本 2：扩展设备会话标识，引入空间及隐私授权结构。
  version: 2,
  // 追加会话公开字段与空间相关表结构。
  sql: `
    ALTER TABLE sessions ADD COLUMN id TEXT;
    ALTER TABLE sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_id ON sessions(id);
    CREATE TABLE spaces (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('normal', 'privacy')),
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX idx_spaces_user ON spaces(user_id);
    CREATE TABLE space_credentials (
      space_id TEXT PRIMARY KEY REFERENCES spaces(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE space_sessions (
      token_hash TEXT PRIMARY KEY,
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX idx_space_sessions_expiry ON space_sessions(expires_at);
    INSERT OR IGNORE INTO spaces (id, user_id, name, type, is_default, created_at, updated_at)
      SELECT 'default', id, '默认空间', 'normal', 1, created_at, created_at FROM users WHERE id = 1;
    INSERT OR IGNORE INTO spaces (id, user_id, name, type, is_default, created_at, updated_at)
      SELECT 'privacy', id, '隐私空间', 'privacy', 0, created_at, created_at FROM users WHERE id = 1;
  `,
}]
