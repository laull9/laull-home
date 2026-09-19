// HTML 危险标签黑名单。
const DANGEROUS_TAGS = new Set([
  'script', 'style', 'link', 'iframe', 'frame', 'frameset',
  'object', 'embed', 'applet', 'meta', 'base', 'form',
  'input', 'button', 'select', 'textarea', 'svg', 'math',
  'portal', 'dialog', 'plaintext', 'marquee',
])

// 允许的安全 HTML 标签白名单。
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'small',
  'blockquote', 'q', 'cite',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'pre', 'code', 'kbd', 'samp',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'a', 'img', 'span', 'div',
])

// 允许的安全属性白名单。
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  '*': new Set(['class', 'id', 'title', 'lang', 'dir']),
  'a': new Set(['href', 'target', 'rel']),
  'img': new Set(['src', 'alt', 'width', 'height', 'loading']),
  'th': new Set(['colspan', 'rowspan', 'scope', 'align']),
  'td': new Set(['colspan', 'rowspan', 'align']),
}

// 允许的安全链接与资源协议。
const SAFE_URL_PROTOCOLS = /^https?:|^mailto:|^tel:|^\/|^#/i

// 检验 URL 协议是否安全。
export function isSafeUrl(url: string): boolean {
  if (!url) return false
  // eslint-disable-next-line no-control-regex
  const trimmed = url.trim().replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
  if (/^javascript:|^vbscript:|^data:/i.test(trimmed)) return false
  return SAFE_URL_PROTOCOLS.test(trimmed)
}

// HTML 特殊字符转义。
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 深度清洗 HTML 文本，剔除恶意标签、危险事件属性及非法伪协议。
export function sanitizeHtml(rawHtml: string): string {
  if (!rawHtml) return ''

  // 1. 移除 HTML 注释与危险标签块（含内容）。
  let clean = rawHtml.replace(/<!--[\s\S]*?-->/g, '')
  for (const tag of DANGEROUS_TAGS) {
    const blockRegex = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi')
    clean = clean.replace(blockRegex, '')
    const selfClosingRegex = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi')
    clean = clean.replace(selfClosingRegex, '')
  }

  // 2. 正则解析剩余标签并白名单过滤。
  clean = clean.replace(/<\/?([a-zA-Z0-9_-]+)([^>]*)>/g, (_match, tagNameRaw: string, attrsRaw: string) => {
    const tagName = tagNameRaw.toLowerCase()
    const isClosing = _match.startsWith('</')

    if (!ALLOWED_TAGS.has(tagName)) {
      return ''
    }

    if (isClosing) {
      return `</${tagName}>`
    }

    // 解析属性。
    const sanitizedAttrs: string[] = []
    const attrRegex = /([a-zA-Z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
    let attrMatch: RegExpExecArray | null

    const allowedForTag = ALLOWED_ATTRIBUTES[tagName] ?? new Set<string>()
    const globalAllowed = ALLOWED_ATTRIBUTES['*']!

    while ((attrMatch = attrRegex.exec(attrsRaw)) !== null) {
      const attrName = attrMatch[1]!.toLowerCase()
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''

      // 强力阻断所有 on* 事件属性。
      if (attrName.startsWith('on')) continue

      // 白名单属性过滤。
      if (!allowedForTag.has(attrName) && !globalAllowed.has(attrName)) {
        continue
      }

      // 对 URL 属性进行协议安全校验。
      if (attrName === 'href' || attrName === 'src') {
        if (!isSafeUrl(attrValue)) continue
      }

      sanitizedAttrs.push(`${attrName}="${escapeHtml(attrValue)}"`)
    }

    // 对 a 标签强制补充安全属性。
    if (tagName === 'a') {
      const hasRel = sanitizedAttrs.some(a => a.startsWith('rel='))
      if (!hasRel) sanitizedAttrs.push('rel="noopener noreferrer"')
      const hasTarget = sanitizedAttrs.some(a => a.startsWith('target='))
      if (!hasTarget) sanitizedAttrs.push('target="_blank"')
    }

    const attrsStr = sanitizedAttrs.length > 0 ? ' ' + sanitizedAttrs.join(' ') : ''
    return `<${tagName}${attrsStr}>`
  })

  return clean
}

// 轻量安全 Markdown 解析器，输出经严格清洗的 HTML。
export function renderSafeMarkdown(markdown: string): string {
  if (!markdown || !markdown.trim()) return ''

  let text = markdown.replace(/\r\n/g, '\n')

  // 代码块占位符，防止代码块内部语法被误格式化。
  const codeBlocks: string[] = []
  text = text.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (_m, code: string) => {
    const idx = codeBlocks.length
    codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`)
    return `<!--CODEBLOCK_${idx}-->`
  })

  // 行内代码。
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => `<code>${escapeHtml(code)}</code>`)

  // 图片：![alt](url)。
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
    if (!isSafeUrl(url)) return ''
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" />`
  })

  // 链接：[text](url)。
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    if (!isSafeUrl(url)) return escapeHtml(label)
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
  })

  // 粗体与斜体。
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>')

  // 标题处理。
  text = text.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
  text = text.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
  text = text.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
  text = text.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
  text = text.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
  text = text.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')

  // 水平分割线。
  text = text.replace(/^---$/gm, '<hr />')

  // 引用块。
  text = text.replace(/^>\s+(.+)$/gm, '<blockquote><p>$1</p></blockquote>')

  // 无序列表与有序列表项。
  text = text.replace(/^[*+-]\s+(.+)$/gm, '<li>$1</li>')
  text = text.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')

  // 包裹连续的列表项。
  text = text.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
  // 消除紧邻重复 ul 嵌套。
  text = text.replace(/<\/ul>\s*<ul>/g, '')

  // 段落划分。
  const paragraphs = text.split(/\n{2,}/)
  const formatted = paragraphs.map(p => {
    const trimmed = p.trim()
    if (!trimmed) return ''
    if (/^<(h[1-6]|ul|ol|li|blockquote|pre|hr|div|p)\b/i.test(trimmed)) {
      return trimmed
    }
    if (trimmed.startsWith('<!--CODEBLOCK_')) {
      return trimmed
    }
    return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`
  }).join('\n')

  // 还原代码块。
  let result = formatted
  for (let i = 0; i < codeBlocks.length; i++) {
    result = result.replace(`<!--CODEBLOCK_${i}-->`, codeBlocks[i]!)
  }

  // 最终执行一次严密 Sanitization，清理潜在的拼接注入。
  return sanitizeHtml(result)
}

// 校验 iframe 嵌入地址是否受控与合规。
export function verifyIframeUrl(
  url: string,
  allowlist: string[] = [],
): { safe: boolean; reason?: string; normalizedUrl?: string } {
  if (!url || !url.trim()) {
    return { safe: false, reason: 'URL 不能为空' }
  }

  const trimmed = url.trim()

  // 阻断危险伪协议。
  if (/^(?:javascript|data|file|vbscript):/i.test(trimmed)) {
    return { safe: false, reason: '禁止使用危险协议' }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { safe: false, reason: 'URL 格式不合法' }
  }

  // 仅放行 https 或本地开发回环协议。
  const isLoopback = ['localhost', '127.0.0.1'].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
    return { safe: false, reason: '仅允许 HTTPS 或本地回环服务地址' }
  }

  // 若配置了域名白名单，必须严格匹配主机或通配符规则。
  if (allowlist.length > 0) {
    const hostname = parsed.hostname.toLowerCase()
    const matched = allowlist.some(pattern => {
      const p = pattern.trim().toLowerCase()
      if (!p) return false
      if (p === hostname || p === `${hostname}:${parsed.port}`) return true
      if (p.startsWith('*.') && hostname.endsWith(p.slice(1))) return true
      return false
    })

    if (!matched) {
      return { safe: false, reason: `目标域名 ${parsed.hostname} 未在允许列表中` }
    }
  }

  return { safe: true, normalizedUrl: parsed.href }
}
