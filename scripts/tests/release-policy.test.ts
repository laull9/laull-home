import { test, expect } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateReleaseTag, validateReleaseCommit } from '../release-policy'

test('只接受与项目版本一致的正式标签', () => {
  expect(() => validateReleaseTag('v0.0.1', '0.0.1')).not.toThrow()
  for (const tag of ['0.0.1', 'v01.0.0', 'v1.0.0-beta', 'v1.0.0', 'v1.0.0;echo']) {
    expect(() => validateReleaseTag(tag, '0.0.1')).toThrow()
  }
})

test('支持 main 历史提交和附注标签，拒绝只在 dev 的提交', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'laull-policy-'))
  // 所有提交均在临时仓库生成，不改动用户工作区。
  function git(...args: string[]) {
    const result = Bun.spawnSync(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
    if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  }
  try {
    git('init', '-b', 'main')
    git('config', 'user.email', 'test@example.invalid')
    git('config', 'user.name', '发布规则测试')
    git('commit', '--allow-empty', '-m', '初始提交')
    git('tag', '-a', 'v0.0.1', '-m', '首次版本')
    expect(() => validateReleaseCommit(cwd, 'v0.0.1', 'main')).not.toThrow()
    git('commit', '--allow-empty', '-m', '后续提交')
    expect(() => validateReleaseCommit(cwd, 'v0.0.1', 'main')).toThrow('当前检出')
    git('checkout', '--detach', 'v0.0.1')
    expect(() => validateReleaseCommit(cwd, 'v0.0.1', 'main')).not.toThrow()
    git('switch', '-c', 'dev')
    git('commit', '--allow-empty', '-m', '未合并开发')
    git('tag', 'v0.0.2')
    expect(() => validateReleaseCommit(cwd, 'v0.0.2', 'main')).toThrow('main')
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
