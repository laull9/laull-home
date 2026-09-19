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
  // 预设主题标识。
  themeId: text('theme_id').notNull().default('default'),
  // 壁纸类型：none、color、gradient、url。
  wallpaperType: text('wallpaper_type').notNull().default('none'),
  // 壁纸具体参数。
  wallpaperValue: text('wallpaper_value').notNull().default(''),
  // 结构化主题参数。
  themeConfig: text('theme_config').notNull().default('{}'),
  // 自定义 CSS 覆盖样式规则。
  customCss: text('custom_css').notNull().default(''),
  // 壁纸是否自动定时轮换：0 关闭，1 开启。
  wallpaperAutoRotate: integer('wallpaper_auto_rotate').notNull().default(0),
  // 壁纸定时轮换间隔时间（分钟）。
  wallpaperRotateInterval: integer('wallpaper_rotate_interval').notNull().default(60),
  // 当前使用的图片池标识。
  activeWallpaperPoolId: text('active_wallpaper_pool_id'),
  // 全局默认壁纸填充模式。
  wallpaperFitMode: text('wallpaper_fit_mode').notNull().default('cover'),
  // 未进入编辑模式时是否允许拖动图标链接改位置：0 关闭，1 开启。
  allowDragWithoutEdit: integer('allow_drag_without_edit').notNull().default(1),
  // 受控 iframe 允许嵌入的域名白名单 JSON 数组。
  iframeAllowlist: text('iframe_allowlist').notNull().default('[]'),
  // 更新时间戳。
  updatedAt: integer('updated_at').notNull(),
})

// 登录节流记录表定义，按来源 IP 分桶独立限流。
export const loginThrottle = sqliteTable('login_throttle', {
  // 来源 IP 地址作为分桶主键。
  ip: text('ip').primaryKey(),
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

// 书签分组表定义。
export const bookmarkGroups = sqliteTable('bookmark_groups', {
  // 分组唯一标识。
  id: text('id').primaryKey(),
  // 所属空间标识。
  spaceId: text('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  // 分组展示名称。
  name: text('name').notNull(),
  // 组间排序权重。
  sortOrder: integer('sort_order').notNull().default(0),
  // 访客模式下是否可见。
  isPublic: integer('is_public').notNull().default(1),
  // 创建时间戳。
  createdAt: integer('created_at').notNull(),
  // 更新时间戳。
  updatedAt: integer('updated_at').notNull(),
}, table => [
  // 按所属空间索引分组。
  index('idx_bookmark_groups_space').on(table.spaceId),
])

// 书签表定义。
export const bookmarks = sqliteTable('bookmarks', {
  // 书签唯一标识。
  id: text('id').primaryKey(),
  // 所属分组标识，未归入文件夹时为 null。
  groupId: text('group_id').references(() => bookmarkGroups.id, { onDelete: 'set null' }),
  // 所属空间标识。
  spaceId: text('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  // 书签展示标题。
  title: text('title').notNull(),
  // 目标访问地址。
  url: text('url').notNull(),
  // 图标访问地址或本地缓存相对路径。
  iconUrl: text('icon_url').notNull().default(''),
  // 组内排序权重。
  sortOrder: integer('sort_order').notNull().default(0),
  // 访客模式下是否可见。
  isPublic: integer('is_public').notNull().default(1),
  // 创建时间戳。
  createdAt: integer('created_at').notNull(),
  // 更新时间戳。
  updatedAt: integer('updated_at').notNull(),
}, table => [
  // 按所属分组索引书签。
  index('idx_bookmarks_group').on(table.groupId),
  // 按所属空间索引书签。
  index('idx_bookmarks_space').on(table.spaceId),
])

// 搜索引擎表定义。
export const searchEngines = sqliteTable('search_engines', {
  // 搜索引擎唯一标识。
  id: text('id').primaryKey(),
  // 引擎展示名称。
  name: text('name').notNull(),
  // 搜索查询地址模板，包含 %s。
  urlTemplate: text('url_template').notNull(),
  // 搜索建议联想地址模板，包含 %s。
  suggestionUrl: text('suggestion_url').notNull().default(''),
  // 快捷 Bang 语法缩写。
  bang: text('bang').notNull().default(''),
  // 是否为默认搜索引擎。
  isDefault: integer('is_default').notNull().default(0),
  // 排序权重。
  sortOrder: integer('sort_order').notNull().default(0),
  // 创建时间戳。
  createdAt: integer('created_at').notNull(),
  // 更新时间戳。
  updatedAt: integer('updated_at').notNull(),
}, table => [
  // 按 Bang 指令建立快速索引。
  index('idx_search_engines_bang').on(table.bang),
])


// 空间画布将节点与断点布局同时提交。
export const desktops = sqliteTable('desktops', {
  // 空间删除时清理画布。
  spaceId: text('space_id').primaryKey().references(() => spaces.id, { onDelete: 'cascade' }),
  // 乐观锁版本。
  revision: integer('revision').notNull().default(0),
  // 经过 Schema 校验的快照。
  document: text('document').notNull(),
  // 最后更新时间。
  updatedAt: integer('updated_at').notNull(),
})

// 图片池表定义。
export const wallpaperPools = sqliteTable('wallpaper_pools', {
  // 图片池唯一标识。
  id: text('id').primaryKey(),
  // 所属用户编号。
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // 图片池名称。
  name: text('name').notNull(),
  // 是否为默认图片池。
  isDefault: integer('is_default').notNull().default(0),
  // 创建时间戳。
  createdAt: integer('created_at').notNull(),
  // 更新时间戳。
  updatedAt: integer('updated_at').notNull(),
}, table => [
  // 按所属用户索引图片池。
  index('idx_wallpaper_pools_user').on(table.userId),
])

// 图片池壁纸表定义。
export const wallpapers = sqliteTable('wallpapers', {
  // 壁纸唯一标识。
  id: text('id').primaryKey(),
  // 所属用户编号。
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // 所属图片池标识。
  poolId: text('pool_id').notNull().references(() => wallpaperPools.id, { onDelete: 'cascade' }),
  // 壁纸名称。
  name: text('name').notNull(),
  // 壁纸访问地址或相对静态路径。
  url: text('url').notNull(),
  // 壁纸来源：upload 本地上传或 url 外部导入。
  sourceType: text('source_type').notNull(),
  // 独立填充模式，为空表示跟随全局配置。
  fitMode: text('fit_mode'),
  // 创建时间戳。
  createdAt: integer('created_at').notNull(),
  // 更新时间戳。
  updatedAt: integer('updated_at').notNull(),
}, table => [
  // 按所属用户索引壁纸。
  index('idx_wallpapers_user').on(table.userId),
  // 按所属图片池索引壁纸。
  index('idx_wallpapers_pool').on(table.poolId),
])

// MCP 访问密钥表定义，每个用户仅维护单个有效密钥。
export const mcpKeys = sqliteTable('mcp_keys', {
  // 所属用户编号。
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  // 密钥原文的 SHA-256 哈希摘要。
  keyHash: text('key_hash').notNull(),
  // 脱敏展示的末尾掩码文本。
  keyMask: text('key_mask').notNull(),
  // 密钥生成时间戳。
  createdAt: integer('created_at').notNull(),
  // 密钥刷新时间戳。
  updatedAt: integer('updated_at').notNull(),
})

// 微服务接入表定义。
export const integrations = sqliteTable('integrations', {
  // 唯一标识。
  id: text('id').primaryKey(),
  // 所属用户编号。
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // 所属空间标识。
  spaceId: text('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  // 服务名称。
  name: text('name').notNull(),
  // 唯一代号标识。
  slug: text('slug').notNull().unique(),
  // 目标基准访问地址。
  baseUrl: text('base_url').notNull(),
  // 认证类型：none、bearer、basic、api-key。
  authType: text('auth_type').notNull().default('none'),
  // 目标允许访问的主机与端口列表 JSON 数组。
  allowedHosts: text('allowed_hosts').notNull().default('[]'),
  // 请求超时毫秒数。
  timeout: integer('timeout').notNull().default(5000),
  // 最大并发请求数。
  maxConcurrency: integer('max_concurrency').notNull().default(5),
  // 经过校验的清单 JSON 文本。
  manifest: text('manifest').notNull().default('{}'),
  // 创建时间戳。
  createdAt: integer('created_at').notNull(),
  // 更新时间戳。
  updatedAt: integer('updated_at').notNull(),
}, table => [
  // 按所属用户索引服务。
  index('idx_integrations_user').on(table.userId),
  // 按所属空间索引服务。
  index('idx_integrations_space').on(table.spaceId),
  // 按代号快速查找。
  uniqueIndex('idx_integrations_slug').on(table.slug),
])

// 微服务凭据加密存储表，严格保存在后端并禁止进入浏览器。
export const integrationSecrets = sqliteTable('integration_secrets', {
  // 关联服务编号。
  integrationId: text('integration_id').primaryKey().references(() => integrations.id, { onDelete: 'cascade' }),
  // AES-256-GCM 格式加密密文（v1:iv:tag:ciphertext）。
  encryptedSecret: text('encrypted_secret').notNull(),
  // 主密钥轮换版本号。
  keyVersion: integer('key_version').notNull().default(1),
  // 创建时间戳。
  createdAt: integer('created_at').notNull(),
  // 更新时间戳。
  updatedAt: integer('updated_at').notNull(),
})



