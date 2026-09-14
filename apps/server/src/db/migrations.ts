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
}]
