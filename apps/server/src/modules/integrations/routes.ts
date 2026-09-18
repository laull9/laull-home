import { Elysia, t } from 'elysia'
import {
  createIntegrationSchema,
  discoverIntegrationSchema,
  executeActionSchema,
  rotateSecretKeySchema,
  updateIntegrationSchema,
} from '@laull-home/shared'
import type { createIntegrationService } from './service'
import type { createSpacesService } from '../spaces/service'
import type { createAuthService } from '../auth/service'
import { IntegrationHttpError } from './http-client'
import { IntegrationError } from './service'
import { SecretCryptoError } from './secret'

// 路由挂载所需依赖接口。
export interface IntegrationRoutesOptions {
  integrationService: ReturnType<typeof createIntegrationService>
  spacesService: ReturnType<typeof createSpacesService>
  authService: ReturnType<typeof createAuthService>
}

// 注册微服务接入 API 路由插件。
export function createIntegrationRoutes(options: IntegrationRoutesOptions) {
  const { integrationService, spacesService, authService } = options

  return new Elysia({ prefix: '/integrations' })
    .resolve(({ cookie, status }) => {
      const token = cookie.lh_session?.value
      const user = authService.authenticate(token)
      if (!user) return status(401, { code: 'UNAUTHORIZED', message: '请先登录' })
      const spaceToken = typeof cookie.lh_space_session?.value === 'string' ? cookie.lh_space_session.value : undefined
      return { user, sessionToken: token as string, spaceToken }
    })
    .onError(({ error, status }) => {
      if (error instanceof IntegrationError) {
        return status(error.status, { code: 'INTEGRATION_ERROR', message: error.message })
      }
      if (error instanceof IntegrationHttpError) {
        return status(error.status, { code: 'OUTBOUND_ERROR', message: error.message })
      }
      if (error instanceof SecretCryptoError) {
        return status(400, { code: 'CRYPTO_ERROR', message: error.message })
      }
    })
    // 发现并校验微服务清单。
    .post('/discover', async ({ body }) => {
      const manifest = await integrationService.discover(body)
      return { manifest }
    }, { body: discoverIntegrationSchema })
    // 列出配置的微服务。
    .get('/', ({ user, query, spaceToken }) => {
      const isUnlocked = spacesService.verifyAccess(user.id, query.spaceId ?? 'default', spaceToken)
      const list = integrationService.list(user.id, query.spaceId, isUnlocked)
      return { integrations: list }
    }, { query: t.Object({ spaceId: t.Optional(t.String()) }) })
    // 获取单个微服务详情。
    .get('/:id', ({ user, params, spaceToken, status }) => {
      const isUnlocked = spacesService.verifyAccess(user.id, 'privacy', spaceToken)
      const item = integrationService.getById(user.id, params.id, isUnlocked)
      if (!item) return status(404, { code: 'NOT_FOUND', message: '微服务不存在' })
      return { integration: item }
    }, { params: t.Object({ id: t.String() }) })
    // 创建新微服务接入。
    .post('/', async ({ user, body, spaceToken }) => {
      const isUnlocked = spacesService.verifyAccess(user.id, body.spaceId ?? 'default', spaceToken)
      const integration = await integrationService.create(user.id, body, isUnlocked)
      return { integration }
    }, { body: createIntegrationSchema })
    // 更新微服务配置。
    .put('/:id', async ({ user, params, body, spaceToken }) => {
      const isUnlocked = spacesService.verifyAccess(user.id, 'privacy', spaceToken)
      const integration = await integrationService.update(user.id, params.id, body, isUnlocked)
      return { integration }
    }, { params: t.Object({ id: t.String() }), body: updateIntegrationSchema })
    // 删除微服务。
    .delete('/:id', ({ user, params, spaceToken }) => {
      const isUnlocked = spacesService.verifyAccess(user.id, 'privacy', spaceToken)
      integrationService.delete(user.id, params.id, isUnlocked)
      return { success: true }
    }, { params: t.Object({ id: t.String() }) })
    // 受控数据代理拉取小部件数据。
    .get('/:id/widgets/:widgetId/data', async ({ user, params, spaceToken }) => {
      const isUnlocked = spacesService.verifyAccess(user.id, 'privacy', spaceToken)
      const data = await integrationService.fetchWidgetData(user.id, params.id, params.widgetId, isUnlocked)
      return { data }
    }, { params: t.Object({ id: t.String(), widgetId: t.String() }) })
    // 受控执行微服务动作。
    .post('/:id/actions/:actionId', async ({ user, params, body, spaceToken }) => {
      const isUnlocked = spacesService.verifyAccess(user.id, 'privacy', spaceToken)
      const result = await integrationService.executeAction(user.id, params.id, params.actionId, body.params, isUnlocked)
      return { result }
    }, { params: t.Object({ id: t.String(), actionId: t.String() }), body: executeActionSchema })
    // 轮换主密钥。
    .post('/rotate-key', ({ body }) => {
      const result = integrationService.rotateMasterKey(body.oldMasterKey, body.newMasterKey)
      return { success: true, ...result }
    }, { body: rotateSecretKeySchema })
}
