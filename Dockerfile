# 第一阶段：安装依赖
FROM oven/bun:1.4.2 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile

# 第二阶段：源码构建
FROM oven/bun:1.4.2 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN bun run build

# 第三阶段：生产运行镜像
FROM oven/bun:1.4.2-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV LAULL_HOME_HOST=127.0.0.1
ENV LAULL_HOME_PORT=3001
ENV LAULL_HOME_DATABASE_PATH=/app/data/laull-home.db
ENV LAULL_HOME_DATA_DIR=/app/data
ENV NUXT_API_INTERNAL_URL=http://127.0.0.1:3001

# 复制运行必要文件与产物
COPY package.json ./
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/.output ./apps/web/.output
COPY --from=builder /app/scripts/start.ts ./scripts/start.ts

# 创建持久化数据目录
RUN mkdir -p /app/data && chown -R bun:bun /app

USER bun
VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "run", "start"]
