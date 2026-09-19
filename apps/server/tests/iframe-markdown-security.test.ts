import { expect, test } from 'bun:test'
import { renderSafeMarkdown, sanitizeHtml, verifyIframeUrl } from '@laull-home/shared'

// 测试受控 iframe 协议与域名白名单安全策略。
test('受控 iframe 协议安全校验：阻断危险伪协议，放行 HTTPS 与开发回环', () => {
  // 危险伪协议拦截。
  expect(verifyIframeUrl('javascript:alert(1)').safe).toBe(false)
  expect(verifyIframeUrl('data:text/html,<script>alert(1)</script>').safe).toBe(false)
  expect(verifyIframeUrl('file:///etc/passwd').safe).toBe(false)
  expect(verifyIframeUrl('vbscript:msgbox(1)').safe).toBe(false)

  // 非 HTTPS 外网协议拦截。
  expect(verifyIframeUrl('http://insecure.example.com').safe).toBe(false)

  // 合法协议放行。
  expect(verifyIframeUrl('https://example.com/embed').safe).toBe(true)
  expect(verifyIframeUrl('http://localhost:8080/dashboard').safe).toBe(true)
  expect(verifyIframeUrl('http://127.0.0.1:3000').safe).toBe(true)
})

test('受控 iframe 域名白名单匹配：严格按允许列表约束目标嵌入范围', () => {
  const allowlist = ['grafana.home.lab', '*.monitoring.internal', 'localhost:9000']

  // 1. 完全主机匹配。
  expect(verifyIframeUrl('https://grafana.home.lab/d/123', allowlist).safe).toBe(true)

  // 2. 通配符子域名匹配。
  expect(verifyIframeUrl('https://node1.monitoring.internal/metrics', allowlist).safe).toBe(true)
  expect(verifyIframeUrl('https://cluster.monitoring.internal/status', allowlist).safe).toBe(true)

  // 3. 不在白名单内的域名被拒绝。
  const rejectRes = verifyIframeUrl('https://evil-tracking.com/ad', allowlist)
  expect(rejectRes.safe).toBe(false)
  expect(rejectRes.reason).toContain('未在允许列表中')

  // 4. 白名单为空时默认放行合法 HTTPS 目标。
  expect(verifyIframeUrl('https://trusted-site.com', []).safe).toBe(true)
})

// 测试 Markdown 解析与 HTML Sanitizer 清理安全防护。
test('Markdown 解析器正常渲染：标题、列表、代码块与链接', () => {
  const md = `
# 标题一
这是一段正文，包含 **粗体** 和 *斜体* 以及 [外部链接](https://laull.org)。

- 项目一
- 项目二

\`\`\`ts
const x = 100
\`\`\`
`
  const html = renderSafeMarkdown(md)
  expect(html).toContain('<h1>标题一</h1>')
  expect(html).toContain('<strong>粗体</strong>')
  expect(html).toContain('<em>斜体</em>')
  expect(html).toContain('<a href="https://laull.org" target="_blank" rel="noopener noreferrer">外部链接</a>')
  expect(html).toContain('<li>项目一</li>')
  expect(html).toContain('<pre><code>const x = 100</code></pre>')
})

test('Markdown / HTML Sanitizer 严密清洗 XSS 恶意载荷', () => {
  // 1. 过滤 script 标签及混淆大小写。
  const attack1 = 'Hello <script>alert("xss")</script> World <sCrIpt src="evil.js"></sCrIpt>'
  expect(sanitizeHtml(attack1)).toBe('Hello  World ')
  expect(renderSafeMarkdown(attack1)).not.toContain('script')

  // 2. 剥除 onerror, onload 等事件处理器。
  const attack2 = '<img src="https://example.com/pic.png" onerror="alert(1)" onload="evil()">'
  const cleanImg = sanitizeHtml(attack2)
  expect(cleanImg).toContain('<img src="https://example.com/pic.png">')
  expect(cleanImg).not.toContain('onerror')
  expect(cleanImg).not.toContain('onload')

  // 3. 过滤 a 标签中的 javascript: 伪协议。
  const attack3 = '[点击领奖](javascript:alert(document.cookie))'
  const cleanLink = renderSafeMarkdown(attack3)
  expect(cleanLink).not.toContain('javascript:')
  expect(cleanLink).not.toContain('alert')

  // 4. 彻底剥离 iframe, object, embed, form 等高危标签。
  const attack4 = '<iframe src="https://phishing.com"></iframe><object data="test"></object><form action="/steal"></form>'
  expect(sanitizeHtml(attack4)).toBe('')

  // 5. 阻止 SVG 与 MathML 内部的潜伏脚本。
  const attack5 = '<svg><script>alert(1)</script></svg><math><mtext>x</mtext></math>'
  expect(sanitizeHtml(attack5)).toBe('')
})
