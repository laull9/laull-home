import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createBackupService } from '../apps/server/src/modules/backups/service'
import { loadConfig } from '../apps/server/src/config'
import { openDatabase } from '../apps/server/src/db'

// 命令行参数解析结果接口。
interface RestoreCliArgs {
  file: string
  dataDir?: string
  password?: string
  dryRun: boolean
}

// 解析终端传入的命令行参数。
function parseArgs(args: string[]): RestoreCliArgs {
  let file = ''
  let dataDir: string | undefined
  let password: string | undefined
  let dryRun = false

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true
    } else if (arg.startsWith('--data-dir=')) {
      dataDir = arg.slice('--data-dir='.length)
    } else if (arg.startsWith('--password=')) {
      password = arg.slice('--password='.length)
    } else if (!arg.startsWith('-') && !file) {
      file = arg
    }
  }

  return { file, dataDir, password, dryRun }
}

// 离线停机恢复与演练验证主入口。
async function main() {
  const rawArgs = process.argv.slice(2)
  const args = parseArgs(rawArgs)

  if (!args.file) {
    console.error('用法: bun scripts/restore.ts <备份文件路径> [--data-dir=<目录>] [--password=<密码>] [--dry-run]')
    process.exit(1)
  }

  const archivePath = resolve(process.cwd(), args.file)
  if (!existsSync(archivePath)) {
    console.error(`错误: 备份文件不存在: ${archivePath}`)
    process.exit(1)
  }

  const config = loadConfig()
  const targetDataDir = args.dataDir ? resolve(process.cwd(), args.dataDir) : config.dataDir

  console.info(`========================================`)
  console.info(`  laull-home 数据恢复与演练验证工具`)
  console.info(`========================================`)
  console.info(`备份文件: ${archivePath}`)
  console.info(`目标目录: ${targetDataDir}`)
  console.info(`运行模式: ${args.dryRun ? '恢复演练 (dry-run，不写入磁盘)' : '生产还原 (真实覆盖写入)'}`)

  const archiveBuffer = readFileSync(archivePath)

  // 临时内存数据库实例用于演练校验服务初始化。
  const mockDb = openDatabase(':memory:')
  try {
    const backupService = createBackupService(mockDb, targetDataDir)

    // 1. 执行演练与合法性深度验证。
    console.info('\n[1/3] 正在执行数据完整性与迁移版本演练校验...')
    const verify = backupService.verifyBackup(archiveBuffer, args.password)

    if (!verify.valid) {
      console.error(`\n✕ 校验失败: ${verify.message}`)
      process.exit(1)
    }

    console.info(`✓ 演练校验通过: ${verify.message}`)
    console.info(`  - 页面结构检查 (PRAGMA integrity_check): ${verify.integrityOk ? '正常' : '异常'}`)
    if (verify.dbVersion) {
      console.info(`  - 快照迁移版本: v${verify.dbVersion} (当前程序最高支持: v${verify.currentAppMaxVersion})`)
    }
    console.info(`  - 归档附件数量: ${verify.attachmentCount} 个文件`)
    console.info(`  - 凭据脱敏状态: ${verify.secretsExcluded ? '已脱敏排除' : '包含在内 (加密保护)'}`)

    // 2. 若为演练模式，到此完成退出。
    if (args.dryRun) {
      console.info('\n[2/3] 演练模式：跳过物理磁盘还原。')
      console.info('[3/3] 演练成功，该备份包完好且与当前版本完全兼容！')
      process.exit(0)
    }

    // 3. 执行真实落盘恢复。
    console.info('\n[2/3] 正在将快照数据库与附件物理还原至目标目录...')
    const res = backupService.restoreToDirectory(archiveBuffer, targetDataDir, args.password)

    console.info(`\n[3/3] 还原成功！共恢复了 ${res.restoredCount} 个文件到 ${targetDataDir}`)
    if (verify.secretsExcluded) {
      console.info('注意: 该备份为脱敏快照，请在启动服务后登录设置页面重新输入各微服务的凭据。')
    }
  } finally {
    mockDb.close()
  }
}

void main()
