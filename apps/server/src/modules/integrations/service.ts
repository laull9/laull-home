import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import {
  type CreateIntegrationInput,
  type DiscoverIntegrationInput,
  type IntegrationItem,
  type IntegrationManifest,
  type UpdateIntegrationInput,
  isValidIntegrationManifest,
  isValidWidgetRenderer,
} from '@laull-home/shared'
import type { AppDatabase } from '../../db'
import { integrations, integrationSecrets, spaces } from '../../db/schema'
import { fetchSafeIntegration } from './http-client'
import { decryptSecret, encryptSecret, rotateSecrets } from './secret'

// 微服务业务操作异常类。
export class IntegrationError extends Error {
  // 携带 HTTP 状态码。
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'IntegrationError'
  }
}

// 创建服务集成业务管理实例。
export function createIntegrationService(db: AppDatabase, masterKey = 'laull-home-default-master-key-32b') {
  // 校验目标地址并提取合法 URL。
  function parseBaseUrl(rawUrl: string): URL {
    try {
      const url = new URL(rawUrl)
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new IntegrationError(400, '微服务基准地址必须使用 http 或 https 协议')
      }
      return url
    } catch (err: unknown) {
      if (err instanceof IntegrationError) throw err
      throw new IntegrationError(400, '微服务基准地址格式无效')
    }
  }

  // 严格审查清单结构与渲染器白名单。
  function validateManifestStructure(manifest: unknown): IntegrationManifest {
    if (!isValidIntegrationManifest(manifest)) {
      throw new IntegrationError(400, '微服务清单格式不符合规范')
    }
    for (const w of manifest.widgets) {
      if (!isValidWidgetRenderer(w.renderer)) {
        throw new IntegrationError(400, `微服务小部件包含未知的渲染器: ${w.renderer}`)
      }
      if (!w.data.path.startsWith('/') || w.data.path.includes('..')) {
        throw new IntegrationError(400, `小部件 ${w.id} 的数据路径必须以 / 开头且不能包含跨目录字符`)
      }
    }
    if (manifest.actions) {
      for (const a of manifest.actions) {
        if (!a.path.startsWith('/') || a.path.includes('..')) {
          throw new IntegrationError(400, `动作 ${a.id} 的路径必须以 / 开头且不能包含跨目录字符`)
        }
      }
    }
    return manifest
  }

  // 组装认证请求标头。
  function buildAuthHeaders(authType: string, plainSecret: string): Record<string, string> {
    const headers: Record<string, string> = {
      'accept': 'application/json',
      'user-agent': 'laull-home-integration/0.3',
    }
    if (!plainSecret) return headers
    if (authType === 'bearer') {
      headers['authorization'] = `Bearer ${plainSecret}`
    } else if (authType === 'basic') {
      const encoded = Buffer.from(plainSecret).toString('base64')
      headers['authorization'] = `Basic ${encoded}`
    } else if (authType === 'api-key') {
      headers['x-api-key'] = plainSecret
    }
    return headers
  }

  return {
    // 发现并校验外部微服务清单文件。
    async discover(input: DiscoverIntegrationInput): Promise<IntegrationManifest> {
      const baseUrl = parseBaseUrl(input.baseUrl)
      const allowedHosts = input.allowedHosts && input.allowedHosts.length > 0
        ? input.allowedHosts
        : [baseUrl.host]

      const manifestUrl = new URL('/.well-known/laull-home.json', baseUrl.origin).toString()
      const headers = buildAuthHeaders(input.authType ?? 'none', input.secret ?? '')

      const res = await fetchSafeIntegration(manifestUrl, {
        method: 'GET',
        headers,
        allowedHosts,
        serviceId: 'discover_' + baseUrl.host,
        timeoutMs: 5000,
      })

      return validateManifestStructure(res.data)
    },

    // 列出指定空间内已配置的微服务。
    list(userId: number, spaceId?: string, isUnlocked = false): IntegrationItem[] {
      let query = db.select().from(integrations).where(eq(integrations.userId, userId))
      if (spaceId) {
        query = db.select().from(integrations).where(
          and(eq(integrations.userId, userId), eq(integrations.spaceId, spaceId))
        )
      }
      const rows = query.all()
      const secrets = db.select({ id: integrationSecrets.integrationId }).from(integrationSecrets).all()
      const secretIds = new Set(secrets.map(s => s.id))

      const result: IntegrationItem[] = []
      for (const row of rows) {
        if (row.spaceId === 'privacy' && !isUnlocked) continue
        let allowedHosts: string[] = []
        try {
          allowedHosts = JSON.parse(row.allowedHosts)
        } catch {
          allowedHosts = []
        }
        let manifest: IntegrationManifest = { schemaVersion: 1, id: row.slug, name: row.name, widgets: [] }
        try {
          manifest = JSON.parse(row.manifest)
        } catch {
          // 容错处理
        }
        result.push({
          id: row.id,
          spaceId: row.spaceId,
          name: row.name,
          slug: row.slug,
          baseUrl: row.baseUrl,
          authType: row.authType as IntegrationItem['authType'],
          allowedHosts,
          timeout: row.timeout,
          maxConcurrency: row.maxConcurrency,
          manifest,
          hasSecret: secretIds.has(row.id),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })
      }
      return result
    },

    // 获取单个微服务集成详情。
    getById(userId: number, id: string, isUnlocked = false): IntegrationItem | null {
      const row = db.select().from(integrations).where(
        and(eq(integrations.userId, userId), eq(integrations.id, id))
      ).get()
      if (!row) return null
      if (row.spaceId === 'privacy' && !isUnlocked) {
        throw new IntegrationError(403, '隐私空间尚未解锁')
      }
      const hasSecret = Boolean(
        db.select({ id: integrationSecrets.integrationId })
          .from(integrationSecrets)
          .where(eq(integrationSecrets.integrationId, id))
          .get()
      )
      return {
        id: row.id,
        spaceId: row.spaceId,
        name: row.name,
        slug: row.slug,
        baseUrl: row.baseUrl,
        authType: row.authType as IntegrationItem['authType'],
        allowedHosts: JSON.parse(row.allowedHosts),
        timeout: row.timeout,
        maxConcurrency: row.maxConcurrency,
        manifest: JSON.parse(row.manifest),
        hasSecret,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    },

    // 创建微服务集成。
    async create(userId: number, input: CreateIntegrationInput, isUnlocked = false): Promise<IntegrationItem> {
      const spaceId = input.spaceId ?? 'default'
      if (spaceId === 'privacy' && !isUnlocked) {
        throw new IntegrationError(403, '隐私空间尚未解锁')
      }
      const space = db.select().from(spaces).where(eq(spaces.id, spaceId)).get()
      if (!space) throw new IntegrationError(404, '所属空间不存在')

      const existingSlug = db.select().from(integrations).where(eq(integrations.slug, input.slug)).get()
      if (existingSlug) throw new IntegrationError(400, '微服务代号已存在')

      const baseUrl = parseBaseUrl(input.baseUrl)
      const allowedHosts = Array.from(new Set([
        ...(input.allowedHosts ?? []),
        baseUrl.host,
      ]))

      // 发现并校验 Manifest。
      const manifest = await this.discover({
        baseUrl: input.baseUrl,
        authType: input.authType,
        secret: input.secret,
        allowedHosts,
      })

      const id = randomUUID()
      const now = Date.now()

      db.transaction(tx => {
        tx.insert(integrations).values({
          id,
          userId,
          spaceId,
          name: input.name,
          slug: input.slug,
          baseUrl: input.baseUrl,
          authType: input.authType,
          allowedHosts: JSON.stringify(allowedHosts),
          timeout: input.timeout ?? 5000,
          maxConcurrency: input.maxConcurrency ?? 5,
          manifest: JSON.stringify(manifest),
          createdAt: now,
          updatedAt: now,
        }).run()

        if (input.secret) {
          const encrypted = encryptSecret(input.secret, masterKey)
          tx.insert(integrationSecrets).values({
            integrationId: id,
            encryptedSecret: encrypted,
            keyVersion: 1,
            createdAt: now,
            updatedAt: now,
          }).run()
        }
      })

      return this.getById(userId, id, isUnlocked)!
    },

    // 更新微服务集成配置。
    async update(userId: number, id: string, input: UpdateIntegrationInput, isUnlocked = false): Promise<IntegrationItem> {
      const existing = db.select().from(integrations).where(
        and(eq(integrations.userId, userId), eq(integrations.id, id))
      ).get()
      if (!existing) throw new IntegrationError(404, '微服务不存在')
      if (existing.spaceId === 'privacy' && !isUnlocked) {
        throw new IntegrationError(403, '隐私空间尚未解锁')
      }

      if (input.slug && input.slug !== existing.slug) {
        const slugCollision = db.select().from(integrations).where(eq(integrations.slug, input.slug)).get()
        if (slugCollision) throw new IntegrationError(400, '微服务代号已存在')
      }

      const now = Date.now()
      const baseUrl = input.baseUrl ? parseBaseUrl(input.baseUrl) : new URL(existing.baseUrl)
      let allowedHosts = input.allowedHosts
      if (allowedHosts) {
        allowedHosts = Array.from(new Set([...allowedHosts, baseUrl.host]))
      }

      db.transaction(tx => {
        tx.update(integrations).set({
          name: input.name ?? existing.name,
          slug: input.slug ?? existing.slug,
          baseUrl: input.baseUrl ?? existing.baseUrl,
          authType: input.authType ?? existing.authType,
          allowedHosts: allowedHosts ? JSON.stringify(allowedHosts) : existing.allowedHosts,
          timeout: input.timeout ?? existing.timeout,
          maxConcurrency: input.maxConcurrency ?? existing.maxConcurrency,
          updatedAt: now,
        }).where(eq(integrations.id, id)).run()

        if (input.removeSecret) {
          tx.delete(integrationSecrets).where(eq(integrationSecrets.integrationId, id)).run()
        } else if (input.secret) {
          const encrypted = encryptSecret(input.secret, masterKey)
          tx.insert(integrationSecrets).values({
            integrationId: id,
            encryptedSecret: encrypted,
            keyVersion: 1,
            createdAt: now,
            updatedAt: now,
          }).onConflictDoUpdate({
            target: integrationSecrets.integrationId,
            set: { encryptedSecret: encrypted, updatedAt: now },
          }).run()
        }
      })

      return this.getById(userId, id, isUnlocked)!
    },

    // 删除微服务。
    delete(userId: number, id: string, isUnlocked = false): boolean {
      const existing = db.select().from(integrations).where(
        and(eq(integrations.userId, userId), eq(integrations.id, id))
      ).get()
      if (!existing) throw new IntegrationError(404, '微服务不存在')
      if (existing.spaceId === 'privacy' && !isUnlocked) {
        throw new IntegrationError(403, '隐私空间尚未解锁')
      }
      db.delete(integrations).where(eq(integrations.id, id)).run()
      return true
    },

    // 受控数据代理：按 Manifest 声明拉取小部件数据。
    async fetchWidgetData(userId: number, integrationId: string, widgetId: string, isUnlocked = false): Promise<unknown> {
      const service = this.getById(userId, integrationId, isUnlocked)
      if (!service) throw new IntegrationError(404, '微服务不存在')

      const widget = service.manifest.widgets.find(w => w.id === widgetId)
      if (!widget) throw new IntegrationError(404, `小部件 ${widgetId} 未在服务清单中声明`)

      let plainSecret = ''
      const secretRow = db.select().from(integrationSecrets).where(eq(integrationSecrets.integrationId, integrationId)).get()
      if (secretRow) {
        plainSecret = decryptSecret(secretRow.encryptedSecret, masterKey)
      }

      const headers = buildAuthHeaders(service.authType, plainSecret)
      const targetUrl = new URL(widget.data.path, service.baseUrl).toString()

      const res = await fetchSafeIntegration(targetUrl, {
        method: widget.data.method,
        headers,
        allowedHosts: service.allowedHosts,
        serviceId: service.id,
        timeoutMs: service.timeout,
        maxConcurrency: service.maxConcurrency,
      })

      return res.data
    },

    // 受控动作授权执行：仅允许执行 Manifest 中已声明的操作。
    async executeAction(userId: number, integrationId: string, actionId: string, params: Record<string, unknown> | undefined, isUnlocked = false): Promise<unknown> {
      const service = this.getById(userId, integrationId, isUnlocked)
      if (!service) throw new IntegrationError(404, '微服务不存在')

      const action = service.manifest.actions?.find(a => a.id === actionId)
      if (!action) throw new IntegrationError(404, `动作 ${actionId} 未在服务清单中声明`)

      let plainSecret = ''
      const secretRow = db.select().from(integrationSecrets).where(eq(integrationSecrets.integrationId, integrationId)).get()
      if (secretRow) {
        plainSecret = decryptSecret(secretRow.encryptedSecret, masterKey)
      }

      const headers = buildAuthHeaders(service.authType, plainSecret)
      headers['content-type'] = 'application/json'
      const targetUrl = new URL(action.path, service.baseUrl).toString()

      const res = await fetchSafeIntegration(targetUrl, {
        method: action.method,
        headers,
        body: params ? JSON.stringify(params) : undefined,
        allowedHosts: service.allowedHosts,
        serviceId: service.id,
        timeoutMs: service.timeout,
        maxConcurrency: service.maxConcurrency,
      })

      return res.data
    },

    // 轮换主密钥。
    rotateMasterKey(oldKey: string, newKey: string): { count: number } {
      if (!oldKey || !newKey) throw new IntegrationError(400, '旧密钥与新密钥均不能为空')
      const { rotatedCount } = rotateSecrets(db, oldKey, newKey)
      return { count: rotatedCount }
    },
  }
}
