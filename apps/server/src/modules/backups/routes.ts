import { Elysia, t } from 'elysia'
import type { BackupService } from './service'
import { BackupError } from './service'
import type { AuthService } from '../auth/service'
import {
  backupRetentionPolicySchema,
  createSnapshotRequestSchema,
  verifyBackupRequestSchema,
} from '@laull-home/shared'

// 备份路由依赖注入接口。
export interface BackupRouteDeps {
  backupService: BackupService
  authService: AuthService
}

// 组装并导出数据备份与快照相关 HTTP API 路由。
export function createBackupRoutes({ backupService, authService }: BackupRouteDeps) {
  return new Elysia({ prefix: '/backups' })
    .onError(({ error, status }) => {
      if (error instanceof BackupError) {
        return status(error.status, { code: 'BACKUP_ERROR', message: error.message })
      }
    })
    // 权限解析中间件，确保仅登录管理员可操作数据备份。
    .resolve(({ cookie, status }) => {
      const token = cookie.lh_session!.value
      const user = authService.authenticate(token)
      if (!user) return status(401, { code: 'UNAUTHORIZED', message: '请先登录' })
      return { user }
    })
    // 获取当前已有备份快照列表与保留策略。
    .get('/', () => {
      const snapshots = backupService.listSnapshots()
      const totalSizeBytes = snapshots.reduce((sum, s) => sum + s.sizeBytes, 0)
      return {
        snapshots,
        totalSizeBytes,
        retentionPolicy: backupService.getRetentionPolicy(),
      }
    })
    // 立即创建一致性数据库快照与附件归档。
    .post('/snapshot', ({ body }) => {
      const result = backupService.createSnapshot({
        includeSecrets: body.includeSecrets,
        encryptionPassword: body.encryptionPassword,
      })
      return { success: true, ...result }
    }, {
      body: createSnapshotRequestSchema,
    })
    // 下载指定快照文件。
    .get('/download/:filename', ({ params, set }) => {
      const { filename, buffer, isEncrypted } = backupService.getSnapshotBuffer(params.filename)
      set.headers['content-type'] = isEncrypted ? 'application/octet-stream' : 'application/zip'
      set.headers['content-disposition'] = `attachment; filename="${encodeURIComponent(filename)}"`
      return buffer
    }, {
      params: t.Object({ filename: t.String() }),
    })
    // 删除指定快照。
    .delete('/:filename', ({ params }) => {
      const success = backupService.deleteSnapshot(params.filename)
      return { success }
    }, {
      params: t.Object({ filename: t.String() }),
    })
    // 执行快照恢复演练与完整性校验。
    .post('/verify', ({ body }) => {
      const { buffer } = backupService.getSnapshotBuffer(body.filename)
      const result = backupService.verifyBackup(buffer, body.password)
      return result
    }, {
      body: verifyBackupRequestSchema,
    })
    // 验证上传的外部备份包。
    .post('/verify-upload', async ({ body }) => {
      const file = body.file as Blob
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = backupService.verifyBackup(buffer, body.password)
      return result
    }, {
      body: t.Object({
        file: t.File(),
        password: t.Optional(t.String()),
      }),
    })
    // 手动执行保留策略修剪清理。
    .post('/prune', ({ body }) => {
      const result = backupService.enforceRetention(body)
      return { success: true, ...result }
    }, {
      body: backupRetentionPolicySchema,
    })
}
