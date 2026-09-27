// 解码图标地址中常见的 HTML 实体。
function decodeAttribute(value: string): string {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#(\d+)|#x([\da-f]+));/gi, (entity, decimal, hex) => {
    if (decimal || hex) {
      const code = parseInt(decimal || hex, decimal ? 10 : 16)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity
    }
    return ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' } as Record<string, string>)[entity.toLowerCase()] ?? entity
  })
}

// 读取带空格、单引号、双引号或未加引号的标签属性。
function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const match of tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1]!.toLowerCase()] = decodeAttribute(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return result
}

// 将网页声明地址转换为允许继续安全检查的 HTTP 地址。
export function resolveIconUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

// 按页面最终地址和 base 标签解析图标及应用清单。
export function discoverPageIcons(html: string, pageUrl: string): { icons: string[]; manifests: string[] } {
  const source = html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
  const baseTag = source.match(/<base\b[^>]*>/i)?.[0]
  const base = (baseTag && resolveIconUrl(attributes(baseTag).href ?? '', pageUrl)) || pageUrl
  const icons: string[] = []
  const manifests: string[] = []
  for (const match of source.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(match[0])
    const rel = (attrs.rel ?? '').toLowerCase().split(/\s+/)
    const url = attrs.href && resolveIconUrl(attrs.href, base)
    if (!url) continue
    if (rel.some(value => ['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed', 'mask-icon'].includes(value))) icons.push(url)
    if (rel.includes('manifest')) manifests.push(url)
  }
  return { icons: [...new Set(icons)].slice(0, 12), manifests: [...new Set(manifests)].slice(0, 2) }
}

// 清单中的相对图标路径以清单最终地址为基准。
export function discoverManifestIcons(text: string, manifestUrl: string): string[] {
  try {
    const manifest = JSON.parse(text)
    if (!Array.isArray(manifest?.icons)) return []
    return [...new Set<string>(manifest.icons.flatMap((icon: { src?: unknown }) => {
      const url = icon && typeof icon.src === 'string' && resolveIconUrl(icon.src, manifestUrl)
      return url ? [url] : []
    }))].slice(0, 8)
  } catch {
    return []
  }
}
