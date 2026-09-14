// 生产环境并行托管独立后端与前端 Web 服务。
const env = { ...process.env, NODE_ENV: "production" }

// 并行启动 Elysia API 与 Nuxt SSR 产物。
const children = [
  Bun.spawn(["bun", "apps/server/dist/index.js"], { env, stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bun", "apps/web/.output/server/index.mjs"], { env, stdout: "inherit", stderr: "inherit" }),
]

// 统一终止所有托管进程。
function stop() {
  for (const child of children) child.kill("SIGTERM")
}

process.once("SIGINT", stop)
process.once("SIGTERM", stop)

const code = await Promise.race(children.map(child => child.exited))
stop()
await Promise.all(children.map(child => child.exited))
process.exit(code)
