// 正式发布只允许不带前导零的三段版本号。
export function validateReleaseTag(tag: string, version: string): void {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
    throw new Error('发布标签必须采用 vX.Y.Z 格式')
  }
  if (tag !== `v${version}`) throw new Error('发布标签与 package.json 的 version 不一致')
}

// 验证标签指向当前构建提交，且该提交已经进入 main。
export function validateReleaseCommit(cwd: string, tag: string, mainRef = 'refs/remotes/origin/main'): void {
  // Git 参数通过数组传入，避免标签内容被解释成命令。
  function git(...args: string[]): string {
    const result = Bun.spawnSync(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
    if (result.exitCode !== 0) throw new Error('发布提交校验失败：标签必须指向已进入 main 的提交')
    return result.stdout.toString().trim()
  }
  const commit = git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`)
  if (commit !== git('rev-parse', 'HEAD')) throw new Error('标签与当前检出的提交不一致')
  git('merge-base', '--is-ancestor', commit, mainRef)
}

// 工作流调用入口；单元测试可独立导入校验函数。
if (import.meta.main) {
  const tag = process.env.RELEASE_TAG ?? ''
  const manifest = await Bun.file('package.json').json()
  validateReleaseTag(tag, manifest.version)
  validateReleaseCommit(process.cwd(), tag)
  console.info('发布标签、版本和 main 归属校验通过')
}
