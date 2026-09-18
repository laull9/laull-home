// 敏感键名匹配列表。
const SENSITIVE_KEYS = new Set([
  'password',
  'secret',
  'token',
  'authorization',
  'cookie',
  'key',
  'credential',
  'apikey',
  'api_key',
  'auth',
  'masterkey',
  'master_key',
  'oldmasterkey',
  'newmasterkey',
])

// 对敏感明文生成末尾掩码文本（例如 ****1234）。
export function maskSecret(plainText: string): string {
  if (!plainText) return ''
  const trimmed = plainText.trim()
  if (trimmed.length <= 4) return '****'
  return `****${trimmed.slice(-4)}`
}

// 递归遍历对象或数组，屏蔽敏感字段防止日志泄露。
export function sanitizeLogData<T>(data: T): T {
  if (data === null || data === undefined) return data
  if (typeof data !== 'object') return data

  if (Array.isArray(data)) {
    return data.map(item => sanitizeLogData(item)) as unknown as T
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase()
    if (SENSITIVE_KEYS.has(lowerKey)) {
      result[key] = typeof value === 'string' ? maskSecret(value) : '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeLogData(value)
    } else if (typeof value === 'string' && lowerKey.includes('auth')) {
      result[key] = maskSecret(value)
    } else {
      result[key] = value
    }
  }
  return result as T
}

// 清洗 URL 查询参数中的敏感凭据。
export function sanitizeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr)
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        url.searchParams.set(key, '[REDACTED]')
      }
    }
    return url.toString()
  } catch {
    return urlStr
  }
}
