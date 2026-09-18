import { lookup } from 'node:dns/promises'

// 微服务出站网络异常类。
export class IntegrationHttpError extends Error {
  // 携带 HTTP 状态码便于路由层转换。
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'IntegrationHttpError'
  }
}

// 检查是否为受保护的云厂商元数据服务或危险网络地址。
export function isCloudMetadataOrBlockedIp(ip: string): boolean {
  let cleanIp = ip.trim().toLowerCase()
  if (cleanIp.startsWith('[') && cleanIp.endsWith(']')) {
    cleanIp = cleanIp.slice(1, -1)
  }
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.slice(7)
  }
  // 云元数据服务严格拦截。
  if (cleanIp === '169.254.169.254') return true
  if (cleanIp === 'fd00:ec2::254') return true

  // 阻断 0.0.0.0 与广播地址。
  if (cleanIp === '0.0.0.0' || cleanIp === '255.255.255.255') return true

  const parts = cleanIp.split('.').map(Number)
  if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
    const a = parts[0] ?? -1
    const b = parts[1] ?? -1
    // 阻断组播与保留网段。
    if (a >= 224) return true
    // 阻断 169.254.x.x 链路本地及云元数据段。
    if (a === 169 && b === 254) return true
  }
  return false
}

// 检查目标主机与端口是否属于允许列表。
export function isHostAllowed(targetUrl: URL, allowedHosts: string[]): boolean {
  if (!allowedHosts || allowedHosts.length === 0) return false
  const hostWithPort = targetUrl.host.toLowerCase()
  const hostnameOnly = targetUrl.hostname.toLowerCase()
  for (const allowed of allowedHosts) {
    const cleanAllowed = allowed.trim().toLowerCase()
    if (cleanAllowed === hostWithPort || cleanAllowed === hostnameOnly) {
      return true
    }
  }
  return false
}

// 校验微服务出站目标地址、白名单与 DNS 解析结果。
export async function assertSafeIntegrationTarget(
  targetUrl: URL,
  allowedHosts: string[],
): Promise<{ url: URL; resolvedIp: string }> {
  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    throw new IntegrationHttpError(400, '仅允许请求 http 或 https 协议')
  }

  if (!isHostAllowed(targetUrl, allowedHosts)) {
    throw new IntegrationHttpError(403, `目标主机 ${targetUrl.host} 未在允许列表中`)
  }

  let resolvedIp = ''
  try {
    const addresses = await lookup(targetUrl.hostname, { all: true })
    for (const addr of addresses) {
      if (isCloudMetadataOrBlockedIp(addr.address)) {
        throw new IntegrationHttpError(403, '目标主机解析为云元数据或受限危险 IP')
      }
    }
    resolvedIp = addresses[0]?.address ?? ''
  } catch (err: unknown) {
    if (err instanceof IntegrationHttpError) throw err
    throw new IntegrationHttpError(400, `无法解析目标主机地址 ${targetUrl.hostname}`)
  }

  return { url: targetUrl, resolvedIp }
}

// 单个服务并发请求计数器。
const activeConcurrency = new Map<string, number>()

// 安全出站请求配置选项。
export interface SafeRequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  maxConcurrency?: number
  allowedHosts: string[]
  serviceId: string
}

// 安全出站请求响应。
export interface SafeResponse<T = unknown> {
  status: number
  headers: Headers
  data: T
}

// 执行受控的安全出站请求，校验目标白名单、逐跳重定向、DNS 审查、并发与超时。
export async function fetchSafeIntegration<T = unknown>(
  initialUrl: string,
  options: SafeRequestOptions,
): Promise<SafeResponse<T>> {
  const currentCount = activeConcurrency.get(options.serviceId) ?? 0
  const maxLimit = options.maxConcurrency ?? 5
  if (currentCount >= maxLimit) {
    throw new IntegrationHttpError(429, `服务并发请求数已达上限（最大 ${maxLimit}）`)
  }

  activeConcurrency.set(options.serviceId, currentCount + 1)

  try {
    let currentUrlStr = initialUrl
    let redirects = 0
    const maxRedirects = 3
    const timeoutMs = options.timeoutMs ?? 5000

    while (redirects <= maxRedirects) {
      let parsedUrl: URL
      try {
        parsedUrl = new URL(currentUrlStr)
      } catch {
        throw new IntegrationHttpError(400, '请求目标地址格式无效')
      }

      const { url } = await assertSafeIntegrationTarget(parsedUrl, options.allowedHosts)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const res = await fetch(url.toString(), {
          method: options.method ?? 'GET',
          headers: options.headers,
          body: options.body,
          signal: controller.signal,
          redirect: 'manual',
        })

        // 逐跳手动拦截并校验重定向。
        if ([301, 302, 303, 307, 308].includes(res.status)) {
          const location = res.headers.get('location')
          if (!location) throw new IntegrationHttpError(400, '重定向响应缺少 Location 标头')
          currentUrlStr = new URL(location, currentUrlStr).toString()
          redirects++
          continue
        }

        // 响应体积限制 2MB。
        const maxBytes = 2 * 1024 * 1024
        const lengthHeader = res.headers.get('content-length')
        if (lengthHeader && Number(lengthHeader) > maxBytes) {
          throw new IntegrationHttpError(400, '微服务响应体积超出 2MB 限制')
        }

        const arrayBuffer = await res.arrayBuffer()
        if (arrayBuffer.byteLength > maxBytes) {
          throw new IntegrationHttpError(400, '微服务响应体积超出 2MB 限制')
        }

        const text = Buffer.from(arrayBuffer).toString('utf-8')
        let data: unknown = text
        const contentType = res.headers.get('content-type') ?? ''
        if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
          try {
            data = JSON.parse(text)
          } catch {
            // 解析失败时保留文本。
          }
        }

        if (!res.ok) {
          throw new IntegrationHttpError(res.status, typeof data === 'object' && data !== null && 'message' in (data as Record<string, unknown>) ? String((data as Record<string, unknown>).message) : `微服务返回错误状态码 ${res.status}`)
        }

        return {
          status: res.status,
          headers: res.headers,
          data: data as T,
        }
      } catch (err: unknown) {
        if (err instanceof IntegrationHttpError) throw err
        if (err instanceof Error && err.name === 'AbortError') {
          throw new IntegrationHttpError(504, `微服务请求超时（${timeoutMs}ms）`)
        }
        throw new IntegrationHttpError(502, `无法连接至目标微服务: ${err instanceof Error ? err.message : '网络连接失败'}`)
      } finally {
        clearTimeout(timer)
      }
    }

    throw new IntegrationHttpError(400, '重定向次数过多')
  } finally {
    const updated = (activeConcurrency.get(options.serviceId) ?? 1) - 1
    if (updated <= 0) {
      activeConcurrency.delete(options.serviceId)
    } else {
      activeConcurrency.set(options.serviceId, updated)
    }
  }
}
