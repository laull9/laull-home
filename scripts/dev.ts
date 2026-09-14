// 根命令统一传入环境，使 Web 与 API 读取同一个配置来源。
const env = { ...process.env }
// 并行启动两个进程，任一退出时终止另一个。
const children = [
  Bun.spawn(['bun', 'run', '--cwd', 'apps/server', 'dev'], { env, stdout: 'inherit', stderr: 'inherit' }),
  Bun.spawn(['bun', 'run', '--cwd', 'apps/web', 'dev'], { env, stdout: 'inherit', stderr: 'inherit' }),
]
// 转发退出信号，避免留下后台服务。
function stop() { for (const child of children) child.kill() }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
const code = await Promise.race(children.map(child => child.exited))
stop()
await Promise.all(children.map(child => child.exited))
process.exit(code)
