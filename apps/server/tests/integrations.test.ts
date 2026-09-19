import { describe, expect, it } from 'bun:test'
import { createApp } from '../src/app'
import { openDatabase } from '../src/db'
import { createAuthService, ensureInitialUser } from '../src/modules/auth/service'
import { createSpacesService } from '../src/modules/spaces/service'
import { createDesktopService } from '../src/modules/desktop/service'
import {
  createIntegrationService,
  decryptSecret,
  encryptSecret,
  isCloudMetadataOrBlockedIp,
  isHostAllowed,
  maskSecret,
  rotateSecrets,
  sanitizeLogData,
  sanitizeUrl,
} from '../src/modules/integrations'
import type { ServerConfig } from '../src/config'
import type { IntegrationManifest } from '@laull-home/shared'

// 构造测试环境与隔离数据库。
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
  const desktop = createDesktopService(db)
  const integrationService = createIntegrationService(db, config.masterKey ?? 'test-secret-master-key-32-chars!')
  return { db, config, auth, app, spaces, desktop, integrationService }
}

// 示例合法微服务清单。
const mockManifest: IntegrationManifest = {
  schemaVersion: 1,
  id: 'mock-service',
  name: 'Mock Service',
  widgets: [
    {
      id: 'metrics-card',
      name: '系统监控',
      renderer: 'metric-grid',
      data: { method: 'GET', path: '/api/status', refreshInterval: 5000 },
      fields: [
        { key: 'cpu', label: 'CPU 使用率', type: 'number', unit: '%' },
        { key: 'status', label: '服务状态', type: 'status' },
      ],
    },
  ],
  actions: [
    { id: 'restart', label: '重启服务', method: 'POST', path: '/api/restart' },
  ],
}

describe('AES-256-GCM 凭据加密、轮换与日志脱敏', () => {
  it('加密解密完整性与防篡改校验', () => {
    const masterKey = 'test-master-key-1234567890123456'
    const plainText = 'super-secret-bearer-token-xyz'

    // 加密格式为 v1:iv:tag:cipher。
    const encrypted = encryptSecret(plainText, masterKey)
    expect(encrypted.startsWith('v1:')).toBe(true)
    expect(encrypted.split(':').length).toBe(4)

    // 解密正确还原明文。
    const decrypted = decryptSecret(encrypted, masterKey)
    expect(decrypted).toBe(plainText)

    // 篡改密文导致校验失败抛错。
    const parts = encrypted.split(':')
    const tamperedCipher = (parts[3]![0] === '0' ? '1' : '0') + parts[3]!.slice(1)
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCipher}`
    expect(() => decryptSecret(tampered, masterKey)).toThrow()

    // 错误主密钥解密抛错。
    expect(() => decryptSecret(encrypted, 'wrong-master-key-99999999999999')).toThrow()
  })

  it('批量密钥轮换机制更新凭据并递增版本', async () => {
    const { db } = await createTestEnv()
    const oldKey = 'old-master-key-1234567890123456'
    const newKey = 'new-master-key-0987654321098765'

    // 预先插入一条使用旧密钥加密的凭据。
    const plain = 'my-api-secret'
    const enc = encryptSecret(plain, oldKey)
    const { integrations, integrationSecrets } = await import('../src/db/schema')
    db.insert(integrations).values({
      id: 'int-1',
      userId: 1,
      spaceId: 'default',
      name: 'Test',
      slug: 'test',
      baseUrl: 'http://localhost:8080',
      allowedHosts: '["localhost:8080"]',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).run()
    db.insert(integrationSecrets).values({
      integrationId: 'int-1',
      encryptedSecret: enc,
      keyVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).run()

    // 执行密钥轮换。
    const { rotatedCount } = rotateSecrets(db, oldKey, newKey)
    expect(rotatedCount).toBe(1)

    // 验证新密文可用新密钥成功解密，旧密钥无法解密。
    const updated = db.select().from(integrationSecrets).all()[0]!
    expect(updated.keyVersion).toBe(2)
    expect(decryptSecret(updated.encryptedSecret, newKey)).toBe(plain)
    expect(() => decryptSecret(updated.encryptedSecret, oldKey)).toThrow()
  })

  it('日志与数据脱敏屏蔽敏感字段与凭据明文', () => {
    // 凭据掩码保留末尾 4 位。
    expect(maskSecret('secret-token-1234')).toBe('****1234')
    expect(maskSecret('123')).toBe('****')

    // 对象递归脱敏。
    const logObj = {
      username: 'admin',
      token: 'jwt-bearer-abc-9876',
      password: 'mypassword',
      nested: {
        apiKey: 'key_xyz_5678',
        normalInfo: 'visible',
      },
    }
    const sanitized = sanitizeLogData(logObj) as typeof logObj
    expect(sanitized.username).toBe('admin')
    expect(sanitized.token).toBe('****9876')
    expect(sanitized.password).toBe('****word')
    expect(sanitized.nested.apiKey).toBe('****5678')
    expect(sanitized.nested.normalInfo).toBe('visible')

    // URL 查询参数脱敏。
    const cleanUrl = sanitizeUrl('http://example.com/api?token=secret123&user=admin')
    expect(cleanUrl).toContain('token=%5BREDACTED%5D')
    expect(cleanUrl).toContain('user=admin')
  })
})

describe('Widget Renderer 白名单与按断点存储布局', () => {
  it('白名单校验放行合法渲染器，拦截未知渲染器', async () => {
    // 注入非法 renderer。
    const invalidManifest = {
      ...mockManifest,
      widgets: [
        {
          id: 'evil',
          name: 'Evil',
          renderer: 'unsupported-renderer',
          data: { method: 'GET', path: '/api/evil' },
        },
      ],
    }

    // 校验函数必须拦截非法 renderer。
    const { isValidWidgetRenderer, isValidIntegrationManifest } = await import('@laull-home/shared')
    expect(isValidWidgetRenderer('metric-grid')).toBe(true)
    expect(isValidWidgetRenderer('status-card')).toBe(true)
    expect(isValidWidgetRenderer('api-card')).toBe(true)
    expect(isValidWidgetRenderer('unsupported-renderer')).toBe(false)
    expect(isValidIntegrationManifest(invalidManifest)).toBe(false)
  })

  it('支持 service 微服务组件在四种断点下保存与读取', async () => {
    const { desktop } = await createTestEnv()

    // 构造包含 service 组件的画布文档。
    const doc = {
      revision: 0,
      nodes: [
        {
          id: 'srv-widget-1',
          type: 'service' as const,
          title: '服务器指标',
          content: '',
          referenceId: '',
          timezone: 'Asia/Shanghai',
          hour12: false,
          stackId: '',
          css: '',
          integrationId: 'ltrade-service',
          widgetId: 'metrics-card',
          renderer: 'metric-grid' as const,
          refreshInterval: 10000,
          layouts: {
            desktop: { x: 0, y: 0, w: 4, h: 2, pinned: true },
            laptop: { x: 0, y: 0, w: 4, h: 2, pinned: true },
            tablet: { x: 0, y: 0, w: 3, h: 2, pinned: false },
            mobile: { x: 0, y: 0, w: 4, h: 2, pinned: false },
          },
        },
      ],
      templates: [],
    }

    const saved = desktop.save('default', doc)
    expect(saved).not.toBeNull()
    expect(saved?.revision).toBe(1)

    // 重新读取并验证断点布局。
    const read = desktop.get('default')
    expect(read.nodes.length).toBe(1)
    const node = read.nodes[0]!
    expect(node.type).toBe('service')
    expect(node.integrationId).toBe('ltrade-service')
    expect(node.renderer).toBe('metric-grid')
    expect(node.layouts.desktop.w).toBe(4)
    expect(node.layouts.tablet?.w).toBe(3)
    expect(node.layouts.mobile?.w).toBe(4)
  })
})

describe('受控出站与安全策略防护 (DNS / 允许列表 / SSRF)', () => {
  it('目标允许列表严格匹配校验', () => {
    const allowed = ['192.168.1.100:8080', 'ltrade:8080', 'example.com']
    expect(isHostAllowed(new URL('http://192.168.1.100:8080/api'), allowed)).toBe(true)
    expect(isHostAllowed(new URL('http://ltrade:8080/metrics'), allowed)).toBe(true)
    expect(isHostAllowed(new URL('https://example.com/status'), allowed)).toBe(true)
    // 未在允许列表中的主机一律拒绝。
    expect(isHostAllowed(new URL('http://192.168.1.200:8080/api'), allowed)).toBe(false)
    expect(isHostAllowed(new URL('http://evil.com'), allowed)).toBe(false)
  })

  it('阻断云厂商元数据服务与广播危险 IP', () => {
    // 拦截 AWS / GCP / Azure 实例元数据。
    expect(isCloudMetadataOrBlockedIp('169.254.169.254')).toBe(true)
    expect(isCloudMetadataOrBlockedIp('fd00:ec2::254')).toBe(true)
    expect(isCloudMetadataOrBlockedIp('::ffff:169.254.169.254')).toBe(true)
    // 拦截 0.0.0.0 与广播地址。
    expect(isCloudMetadataOrBlockedIp('0.0.0.0')).toBe(true)
    expect(isCloudMetadataOrBlockedIp('255.255.255.255')).toBe(true)
    expect(isCloudMetadataOrBlockedIp('224.0.0.1')).toBe(true)
    // 放行普通私有网络地址。
    expect(isCloudMetadataOrBlockedIp('192.168.1.100')).toBe(false)
    expect(isCloudMetadataOrBlockedIp('10.0.0.1')).toBe(false)
  })
})

describe('微服务 API 与受控数据代理、Action 授权', () => {
  it('未登录访问受保护端点返回 401 拦截', async () => {
    const { app } = await createTestEnv()
    const res = await app.handle(new Request('http://localhost:3000/api/v1/integrations', {
      headers: { origin: 'http://localhost:3000' },
    }))
    expect(res.status).toBe(401)
  })

  it('微服务 CRUD 操作与凭据非明文暴露', async () => {
    const { app, auth } = await createTestEnv()
    const login = await auth.login('admin', 'admin', 'agent')
    const cookieHeader = `lh_session=${login.token}`

    // 模拟目标微服务服务器提供 Manifest。
    const mockServer = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        if (url.pathname === '/.well-known/laull-home.json') {
          return Response.json(mockManifest)
        }
        if (url.pathname === '/api/status') {
          // 验证收到了 Bearer Token。
          const authHeader = req.headers.get('authorization')
          if (authHeader !== 'Bearer my-token-123') {
            return new Response('Unauthorized', { status: 401 })
          }
          return Response.json({ cpu: 42, status: 'healthy' })
        }
        if (url.pathname === '/api/restart' && req.method === 'POST') {
          return Response.json({ success: true, restarted: true })
        }
        return new Response('Not Found', { status: 404 })
      },
    })

    const targetPort = mockServer.port
    const targetHost = `127.0.0.1:${targetPort}`
    const targetBaseUrl = `http://${targetHost}`

    try {
      // 1. 发现微服务清单。
      const discoverRes = await app.handle(new Request('http://localhost:3000/api/v1/integrations/discover', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': cookieHeader,
          'origin': 'http://localhost:3000',
        },
        body: JSON.stringify({
          baseUrl: targetBaseUrl,
          authType: 'bearer',
          secret: 'my-token-123',
          allowedHosts: [targetHost],
        }),
      }))
      expect(discoverRes.status).toBe(200)
      const discoverBody = await discoverRes.json() as { manifest: IntegrationManifest }
      expect(discoverBody.manifest.id).toBe('mock-service')

      // 2. 创建微服务接入。
      const createRes = await app.handle(new Request('http://localhost:3000/api/v1/integrations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': cookieHeader,
          'origin': 'http://localhost:3000',
        },
        body: JSON.stringify({
          name: '测试微服务',
          slug: 'mock-service',
          baseUrl: targetBaseUrl,
          authType: 'bearer',
          allowedHosts: [targetHost],
          secret: 'my-token-123',
        }),
      }))
      expect(createRes.status).toBe(200)
      const created = (await createRes.json() as { integration: { id: string; hasSecret: boolean; secret?: string } }).integration
      expect(created.hasSecret).toBe(true)
      expect(created.secret).toBeUndefined() // 严禁暴露明文

      const serviceId = created.id

      // 3. 受控代理拉取 Widget 数据（自动注入凭据）。
      const proxyRes = await app.handle(new Request(`http://localhost:3000/api/v1/integrations/${serviceId}/widgets/metrics-card/data`, {
        headers: {
          'cookie': cookieHeader,
          'origin': 'http://localhost:3000',
        },
      }))
      expect(proxyRes.status).toBe(200)
      const proxyData = (await proxyRes.json() as { data: { cpu: number; status: string } }).data
      expect(proxyData.cpu).toBe(42)
      expect(proxyData.status).toBe('healthy')

      // 4. 尝试请求未在清单中注册的 widgetId 必须被 404 拒绝。
      const evilProxyRes = await app.handle(new Request(`http://localhost:3000/api/v1/integrations/${serviceId}/widgets/unknown-widget/data`, {
        headers: {
          'cookie': cookieHeader,
          'origin': 'http://localhost:3000',
        },
      }))
      expect(evilProxyRes.status).toBe(404)

      // 5. 受控触发已授权 Action。
      const actionRes = await app.handle(new Request(`http://localhost:3000/api/v1/integrations/${serviceId}/actions/restart`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': cookieHeader,
          'origin': 'http://localhost:3000',
        },
        body: JSON.stringify({ params: { force: true } }),
      }))
      expect(actionRes.status).toBe(200)
      const actionBody = (await actionRes.json() as { result: { success: boolean; restarted: boolean } }).result
      expect(actionBody.restarted).toBe(true)

      // 6. 尝试触发未声明的非法 Action 被 404 拒绝。
      const evilActionRes = await app.handle(new Request(`http://localhost:3000/api/v1/integrations/${serviceId}/actions/format-disk`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': cookieHeader,
          'origin': 'http://localhost:3000',
        },
        body: JSON.stringify({}),
      }))
      expect(evilActionRes.status).toBe(404)

      // 7. 删除微服务。
      const deleteRes = await app.handle(new Request(`http://localhost:3000/api/v1/integrations/${serviceId}`, {
        method: 'DELETE',
        headers: {
          'cookie': cookieHeader,
          'origin': 'http://localhost:3000',
        },
      }))
      expect(deleteRes.status).toBe(200)
    } finally {
      mockServer.stop(true)
    }
  })
})
