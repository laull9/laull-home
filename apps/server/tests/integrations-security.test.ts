import { describe, expect, it } from 'bun:test'
import { createApp } from '../src/app'
import { openDatabase } from '../src/db'
import { createAuthService, ensureInitialUser } from '../src/modules/auth/service'
import { createSpacesService } from '../src/modules/spaces/service'
import { createIntegrationService, fetchSafeIntegration } from '../src/modules/integrations'
import type { ServerConfig } from '../src/config'

// 构造测试环境。
async function createTestEnv() {
  const db = openDatabase(':memory:')
  await ensureInitialUser(db)
  const config: ServerConfig = {
    port: 3001,
    host: '127.0.0.1',
    origin: 'http://localhost:3000',
    dataDir: ':memory:',
    databasePath: ':memory:',
    sessionDays: 7,
    secureCookie: false,
    masterKey: 'test-secret-master-key-32-chars!',
  }
  const auth = createAuthService(db, config)
  const app = createApp(db, config)
  const spaces = createSpacesService(db)
  const integrationService = createIntegrationService(db, config.masterKey ?? 'test-secret-master-key-32-chars!')
  return { db, config, auth, app, spaces, integrationService }
}

describe('微服务高级安全防护与隔离边界', () => {
  it('隐私空间微服务在未授权时禁止访问与创建', async () => {
    const { app, auth, spaces } = await createTestEnv()
    const login = await auth.login('admin', 'admin', 'agent')
    const cookieHeader = `lh_session=${login.token}`

    // 设置隐私空间密码但未解锁。
    await spaces.setupPassword(login.user.id, 'privacy', 'privacy-pass-123')

    // 未解锁隐私空间时尝试在隐私空间创建微服务，返回 403。
    const createRes = await app.handle(new Request('http://localhost:3000/api/v1/integrations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cookie': cookieHeader,
        'origin': 'http://localhost:3000',
      },
      body: JSON.stringify({
        spaceId: 'privacy',
        name: '私密服务',
        slug: 'privacy-service',
        baseUrl: 'http://127.0.0.1:9090',
        authType: 'none',
        allowedHosts: ['127.0.0.1:9090'],
      }),
    }))
    expect(createRes.status).toBe(403)
  })

  it('Manifest 路径包含跨目录跳出 .. 时被严格拒绝', async () => {
    const { integrationService } = await createTestEnv()
    const evilManifest = {
      schemaVersion: 1,
      id: 'evil-service',
      name: 'Evil Service',
      widgets: [
        {
          id: 'leak',
          name: 'Leak',
          renderer: 'metric-grid',
          data: { method: 'GET', path: '/api/../../etc/passwd' },
        },
      ],
    }

    // 模拟恶意服务器返回带 .. 的 path。
    const evilServer = Bun.serve({
      port: 0,
      fetch() {
        return Response.json(evilManifest)
      },
    })

    try {
      await expect(integrationService.discover({
        baseUrl: `http://127.0.0.1:${evilServer.port}`,
        allowedHosts: [`127.0.0.1:${evilServer.port}`],
      })).rejects.toThrow('不能包含跨目录字符')
    } finally {
      evilServer.stop(true)
    }
  })

  it('重定向逐跳审查：跳向非白名单主机或云元数据被拦截', async () => {
    // 搭建重定向服务，将请求重定向到未允许的外部或云元数据主机。
    const redirectServer = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        if (url.pathname === '/redirect-to-metadata') {
          return new Response(null, {
            status: 302,
            headers: { location: 'http://169.254.169.254/latest/meta-data' },
          })
        }
        if (url.pathname === '/redirect-to-unallowed') {
          return new Response(null, {
            status: 302,
            headers: { location: 'http://evil-external-host.com/data' },
          })
        }
        return new Response('ok')
      },
    })

    const host = `127.0.0.1:${redirectServer.port}`
    try {
      // 1. 重定向到云元数据拦截。
      await expect(fetchSafeIntegration(`http://${host}/redirect-to-metadata`, {
        allowedHosts: [host],
        serviceId: 'test-meta',
      })).rejects.toThrow()

      // 2. 重定向到未在白名单中的外部主机拦截。
      await expect(fetchSafeIntegration(`http://${host}/redirect-to-unallowed`, {
        allowedHosts: [host],
        serviceId: 'test-unallowed',
      })).rejects.toThrow('未在允许列表中')
    } finally {
      redirectServer.stop(true)
    }
  })

  it('超时与并发限制：超时返回 504，超出并发返回 429 保护', async () => {
    const slowServer = Bun.serve({
      port: 0,
      async fetch() {
        await new Promise(r => setTimeout(r, 400))
        return Response.json({ slow: true })
      },
    })

    const host = `127.0.0.1:${slowServer.port}`
    const serviceId = 'slow-service-' + slowServer.port

    try {
      // 1. 超时测试（超时设为 100ms，而服务端需要 400ms）。
      await expect(fetchSafeIntegration(`http://${host}/test`, {
        allowedHosts: [host],
        serviceId,
        timeoutMs: 100,
        maxConcurrency: 5,
      })).rejects.toThrow('超时')

      // 2. 并发限制测试（maxConcurrency = 1，同时发起两个请求）。
      const p1 = fetchSafeIntegration(`http://${host}/test`, {
        allowedHosts: [host],
        serviceId,
        timeoutMs: 1000,
        maxConcurrency: 1,
      })

      // 立即发第二个请求，应当触发 429 错误。
      await expect(fetchSafeIntegration(`http://${host}/test`, {
        allowedHosts: [host],
        serviceId,
        timeoutMs: 1000,
        maxConcurrency: 1,
      })).rejects.toThrow('并发请求数已达上限')

      await p1
    } finally {
      slowServer.stop(true)
    }
  })
})
