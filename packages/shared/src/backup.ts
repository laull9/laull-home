import { Type, type Static } from '@sinclair/typebox'

// 单个备份快照项元数据校验规则。
export const backupSnapshotItemSchema = Type.Object({
  filename: Type.String({ minLength: 1, maxLength: 255 }),
  sizeBytes: Type.Integer({ minimum: 0 }),
  createdAt: Type.Integer({ minimum: 0 }),
  version: Type.Optional(Type.Integer({ minimum: 1 })),
  encrypted: Type.Boolean(),
  secretsExcluded: Type.Boolean(),
  manifest: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
}, { additionalProperties: false })

// 备份快照列表响应校验规则。
export const backupListResponseSchema = Type.Object({
  snapshots: Type.Array(backupSnapshotItemSchema),
  totalSizeBytes: Type.Integer({ minimum: 0 }),
  retentionPolicy: Type.Object({
    maxSnapshots: Type.Integer({ minimum: 1, maximum: 100 }),
    maxAgeDays: Type.Integer({ minimum: 1, maximum: 365 }),
    maxTotalSizeBytes: Type.Integer({ minimum: 1024 * 1024 }),
  }),
}, { additionalProperties: false })

// 创建快照请求校验规则。
export const createSnapshotRequestSchema = Type.Object({
  name: Type.Optional(Type.String({ maxLength: 50 })),
  includeSecrets: Type.Optional(Type.Boolean()),
  encryptionPassword: Type.Optional(Type.String({ minLength: 8, maxLength: 128 })),
}, { additionalProperties: false })

// 保留策略配置校验规则。
export const backupRetentionPolicySchema = Type.Object({
  maxSnapshots: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  maxAgeDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 365 })),
  maxTotalSizeBytes: Type.Optional(Type.Integer({ minimum: 10 * 1024 * 1024 })),
}, { additionalProperties: false })

// 恢复演练验证请求校验规则。
export const verifyBackupRequestSchema = Type.Object({
  filename: Type.String({ minLength: 1, maxLength: 255 }),
  password: Type.Optional(Type.String({ maxLength: 128 })),
}, { additionalProperties: false })

// 恢复演练验证结果校验规则。
export const verifyBackupResultSchema = Type.Object({
  valid: Type.Boolean(),
  message: Type.String(),
  dbVersion: Type.Optional(Type.Integer()),
  currentAppMaxVersion: Type.Optional(Type.Integer()),
  integrityOk: Type.Boolean(),
  attachmentCount: Type.Integer({ minimum: 0 }),
  secretsExcluded: Type.Boolean(),
  encrypted: Type.Boolean(),
}, { additionalProperties: false })

// 备份快照元数据类型。
export type BackupSnapshotItem = Static<typeof backupSnapshotItemSchema>

// 备份快照列表响应类型。
export type BackupListResponse = Static<typeof backupListResponseSchema>

// 创建快照请求类型。
export type CreateSnapshotRequest = Static<typeof createSnapshotRequestSchema>

// 保留策略配置类型。
export type BackupRetentionPolicy = Static<typeof backupRetentionPolicySchema>

// 恢复演练验证结果类型。
export type VerifyBackupResult = Static<typeof verifyBackupResultSchema>
