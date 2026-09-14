import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateReleaseTag } from './release-policy'

// 版本取自已检出的提交，打包命令不修改版本号。
const manifest = await Bun.file('package.json').json()
// 本地打包默认使用项目版本；CI 显式传入标签。
const tag = process.env.RELEASE_TAG ?? `v${manifest.version}`
validateReleaseTag(tag, manifest.version)
// 独立临时目录避免把仓库环境文件或数据库带进发布包。
const staging = mkdtempSync(join(tmpdir(), 'laull-release-'))
// 发布目录只保存归档与校验文件。
const output = join(process.cwd(), 'release')
mkdirSync(output, { recursive: true })

// 子进程失败时停止打包，禁止发布残缺产物。
function run(args: string[]) {
  const result = Bun.spawnSync(args, { stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode !== 0) throw new Error('发布打包失败')
}

try {
  const name = `laull-home-${tag}`
  const destination = join(staging, name)
  mkdirSync(destination)
  // 使用固定文件清单，并保留后端定位仓库根目录所需的层级。
  run(['tar', '-cf', join(staging, 'payload.tar'), 'apps/web/.output', 'apps/server/dist', '.env.example', 'README.md', 'docs'])
  run(['tar', '-xf', join(staging, 'payload.tar'), '-C', destination])
  const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { stdout: 'pipe', stderr: 'pipe' })
  await Bun.write(join(destination, 'release.json'), JSON.stringify({
    version: manifest.version,
    commit: revision.exitCode === 0 ? revision.stdout.toString().trim() : 'uncommitted',
    bun: Bun.version,
    platform: `${process.platform}-${process.arch}`,
  }, null, 2))
  const archive = join(output, `${name}.tar.gz`)
  run(['tar', '-czf', archive, '-C', staging, name])
  const hash = new Bun.CryptoHasher('sha256').update(await Bun.file(archive).arrayBuffer()).digest('hex')
  await Bun.write(`${archive}.sha256`, `${hash}  ${name}.tar.gz\n`)
  console.info(`发布包已生成：${archive}`)
} finally { rmSync(staging, { recursive: true, force: true }) }
