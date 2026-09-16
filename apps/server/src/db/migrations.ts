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
}, {
  // 迁移版本 3：引入书签与分组、搜索引擎体系，扩展主题与壁纸字段。
  version: 3,
  // 建立书签与搜索相关表结构，预填常用引擎与默认分组。
  sql: `
    ALTER TABLE user_settings ADD COLUMN theme_id TEXT NOT NULL DEFAULT 'default';
    ALTER TABLE user_settings ADD COLUMN wallpaper_type TEXT NOT NULL DEFAULT 'none';
    ALTER TABLE user_settings ADD COLUMN wallpaper_value TEXT NOT NULL DEFAULT '';
    CREATE TABLE bookmark_groups (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX idx_bookmark_groups_space ON bookmark_groups(space_id);
    CREATE TABLE bookmarks (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES bookmark_groups(id) ON DELETE CASCADE,
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      icon_url TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX idx_bookmarks_group ON bookmarks(group_id);
    CREATE INDEX idx_bookmarks_space ON bookmarks(space_id);
    CREATE TABLE search_engines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url_template TEXT NOT NULL,
      bang TEXT NOT NULL DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX idx_search_engines_bang ON search_engines(bang);
    INSERT OR IGNORE INTO search_engines (id, name, url_template, bang, is_default, sort_order, created_at, updated_at) VALUES
      ('google', 'Google', 'https://www.google.com/search?q=%s', 'g', 1, 1, 0, 0),
      ('bing', 'Bing', 'https://www.bing.com/search?q=%s', 'b', 0, 2, 0, 0),
      ('duckduckgo', 'DuckDuckGo', 'https://duckduckgo.com/?q=%s', 'ddg', 0, 3, 0, 0),
      ('github', 'GitHub', 'https://github.com/search?q=%s', 'gh', 0, 4, 0, 0),
      ('youtube', 'YouTube', 'https://www.youtube.com/results?search_query=%s', 'yt', 0, 5, 0, 0);
    INSERT OR IGNORE INTO bookmark_groups (id, space_id, name, sort_order, is_public, created_at, updated_at) VALUES
      ('group-default', 'default', '常用推荐', 0, 1, 0, 0);
    INSERT OR IGNORE INTO bookmarks (id, group_id, space_id, title, url, icon_url, sort_order, is_public, created_at, updated_at) VALUES
      ('bm-github', 'group-default', 'default', 'GitHub', 'https://github.com', '', 0, 1, 0, 0),
      ('bm-mdn', 'group-default', 'default', 'MDN', 'https://developer.mozilla.org', '', 1, 1, 0, 0),
      ('bm-v2ex', 'group-default', 'default', 'V2EX', 'https://www.v2ex.com', '', 2, 1, 0, 0);
  `,
}, {
  // 迁移版本 4：在用户设置中增加自定义 CSS 覆盖字段。
  version: 4,
  // 增加 custom_css 列。
  sql: `
    ALTER TABLE user_settings ADD COLUMN custom_css TEXT NOT NULL DEFAULT '';
  `,
}, {
  // 迁移版本 5：结构化主题与空间画布。
  version: 5,
  // 每个空间保留一份容量受限的当前快照。
  sql: `
    ALTER TABLE user_settings ADD COLUMN theme_config TEXT NOT NULL DEFAULT '{}';
    CREATE TABLE desktops (
      space_id TEXT PRIMARY KEY REFERENCES spaces(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL DEFAULT 0,
      document TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
  `,
}, {
  // 迁移版本 6：书签支持无分组桌面独立图标，解除 group_id 非空约束。
  version: 6,
  // 重建书签表允许 group_id 为空并配置置空级联。
  sql: `
    CREATE TABLE bookmarks_v6 (
      id TEXT PRIMARY KEY,
      group_id TEXT REFERENCES bookmark_groups(id) ON DELETE SET NULL,
      space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      icon_url TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
    INSERT INTO bookmarks_v6 (id, group_id, space_id, title, url, icon_url, sort_order, is_public, created_at, updated_at)
      SELECT id, group_id, space_id, title, url, icon_url, sort_order, is_public, created_at, updated_at FROM bookmarks;
    DROP TABLE bookmarks;
    ALTER TABLE bookmarks_v6 RENAME TO bookmarks;
    CREATE INDEX idx_bookmarks_group ON bookmarks(group_id);
    CREATE INDEX idx_bookmarks_space ON bookmarks(space_id);
  `,
}, {
  // 迁移版本 7：增加图片池壁纸表与轮换设置字段。
  version: 7,
  // 建立壁纸表并为用户设置补充自动轮换开关与间隔。
  sql: `
    CREATE TABLE wallpapers (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'url')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX idx_wallpapers_user ON wallpapers(user_id);
    ALTER TABLE user_settings ADD COLUMN wallpaper_auto_rotate INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE user_settings ADD COLUMN wallpaper_rotate_interval INTEGER NOT NULL DEFAULT 60;
  `,
}, {
  // 迁移版本 8：搜索引擎增加搜索建议联想地址字段并填充内置引擎。
  version: 8,
  // 增加 suggestion_url 列并配置主流内置引擎的建议接口。
  sql: `
    ALTER TABLE search_engines ADD COLUMN suggestion_url TEXT NOT NULL DEFAULT '';
    UPDATE search_engines SET suggestion_url = 'https://suggestqueries.google.com/complete/search?client=firefox&q=%s' WHERE id = 'google';
    UPDATE search_engines SET suggestion_url = 'https://api.bing.com/osjson.aspx?query=%s' WHERE id = 'bing';
    UPDATE search_engines SET suggestion_url = 'https://duckduckgo.com/ac/?q=%s&type=list' WHERE id = 'duckduckgo';
    UPDATE search_engines SET suggestion_url = 'https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=%s' WHERE id = 'youtube';
  `,
}]

