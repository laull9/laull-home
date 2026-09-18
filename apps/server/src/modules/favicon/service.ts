import { createHash } from "node:crypto"
import { lookup } from "node:dns/promises"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { extname, join, resolve } from "node:path"

// 图标服务操作异常类。
export class FaviconError extends Error {
  // 携带 HTTP 状态码便于路由层转换。
  constructor(public status: number, message: string) {
    super(message)
    this.name = "FaviconError"
  }
}

// 检查是否为私有、回环或内网受限 IP。
export function isPrivateIp(ip: string): boolean {
  if (ip === "localhost" || ip === "::1" || ip === "::") return true
  let cleanIp = ip.trim().toLowerCase()
  if (cleanIp.startsWith("[") && cleanIp.endsWith("]")) {
    cleanIp = cleanIp.slice(1, -1)
  }
  if (cleanIp.startsWith("::ffff:")) cleanIp = cleanIp.slice(7)
  const parts = cleanIp.split(".").map(Number)
  if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
    const a = parts[0] ?? -1
    const b = parts[1] ?? -1
    const c = parts[2] ?? -1
    if (a === 0 || a === 127) return true
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true
    if (a === 198 && b === 51 && c === 100) return true
    if (a === 203 && b === 0 && c === 113) return true
    if (a >= 224) return true
    return false
  }
  const norm = cleanIp.toLowerCase()
  if (norm === "::1" || norm === "::") return true
  if (norm.startsWith("fc") || norm.startsWith("fd")) return true
  if (norm.startsWith("fe8") || norm.startsWith("fe9") || norm.startsWith("fea") || norm.startsWith("feb")) return true
  if (norm.startsWith("2001:db8")) return true
  return false
}

// 校验目标地址并防范 SSRF 及 DNS 重绑定攻击，返回 URL 和已解析的安全 IP。
export async function assertSafeOutboundUrl(targetUrl: string): Promise<{ url: URL; resolvedIp: string }> {
  let url: URL
  try {
    url = new URL(targetUrl)
  } catch {
    throw new FaviconError(400, "目标地址格式无效")
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new FaviconError(400, "仅允许请求 http 或 https 协议")
  }
  if (isPrivateIp(url.hostname)) {
    throw new FaviconError(403, "禁止请求内网或回环地址")
  }

  let resolvedIp = ''
  try {
    const addresses = await lookup(url.hostname, { all: true })
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        throw new FaviconError(403, "目标主机解析为受限私有 IP")
      }
    }
    // 取第一个合法地址用于后续请求，防止 DNS 重绑定。
    resolvedIp = addresses[0]?.address ?? ''
  } catch (err: unknown) {
    if (err instanceof FaviconError) throw err
    throw new FaviconError(400, "无法解析目标主机地址")
  }
  return { url, resolvedIp }
}

// 创建受控 Favicon 探测与缓存服务。
export function createFaviconService(dataDir: string) {
  const iconsDir = resolve(dataDir, "icons")
  if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true })

  // 安全请求远程资源并限制体积与重定向。
  async function fetchWithSafeLimits(targetUrl: string, maxRedirects = 3): Promise<{ buffer: Buffer, contentType: string }> {
    let currentUrl = targetUrl
    let redirects = 0

    while (redirects <= maxRedirects) {
      const { url, resolvedIp } = await assertSafeOutboundUrl(currentUrl)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)

      try {
        // 对 HTTP 协议使用物理 IP 并注入 Host 头防 DNS 重绑定；HTTPS 保持域名以通过 TLS SNI 证书校验。
        const fetchUrl = new URL(url.toString())
        if (resolvedIp && fetchUrl.protocol === "http:") {
          fetchUrl.hostname = resolvedIp.includes(':') ? `[${resolvedIp}]` : resolvedIp
        }
        const res = await fetch(fetchUrl.toString(), {
          signal: controller.signal,
          redirect: "manual",
          headers: {
            "Host": url.host,
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "accept": "image/*,text/html;q=0.9,*/*;q=0.8",
          },
        })

        if ([301, 302, 303, 307, 308].includes(res.status)) {
          const location = res.headers.get("location")
          if (!location) throw new FaviconError(400, "重定向响应缺少 Location")
          currentUrl = new URL(location, currentUrl).toString()
          redirects++
          continue
        }

        if (!res.ok) throw new FaviconError(res.status, "抓取目标返回失败状态")

        const contentType = res.headers.get("content-type") ?? "application/octet-stream"
        const isHtml = contentType.includes("text/html")
        const maxBytes = isHtml ? 2 * 1024 * 1024 : 512 * 1024

        const lengthHeader = res.headers.get("content-length")
        if (lengthHeader && Number(lengthHeader) > maxBytes) {
          throw new FaviconError(400, isHtml ? "HTML体积超出 2MB 限制" : "响应体积超出 512KB 限制")
        }

        const arrayBuffer = await res.arrayBuffer()
        if (arrayBuffer.byteLength > maxBytes) {
          throw new FaviconError(400, isHtml ? "HTML体积超出 2MB 限制" : "响应体积超出 512KB 限制")
        }

        return {
          buffer: Buffer.from(arrayBuffer),
          contentType,
        }
      } finally {
        clearTimeout(timer)
      }
    }

    throw new FaviconError(400, "重定向次数过多")
  }

  // 从 HTML 中正则提取常见图标地址。
  function extractIconsFromHtml(html: string, baseUrl: string): string[] {
    const candidates: string[] = []
    const linkRegex = /<link\b[^>]*>/gi

    let match: RegExpExecArray | null
    while ((match = linkRegex.exec(html)) !== null) {
      const tag = match[0]
      const relMatch = /rel=["']([^"']+)["']/i.exec(tag)
      if (!relMatch) continue
      const rel = relMatch[1]?.toLowerCase() ?? ""
      if (!rel.includes("icon")) continue

      const hrefMatch = /href=["']([^"']+)["']/i.exec(tag)
      if (hrefMatch?.[1]) {
        try {
          candidates.push(new URL(hrefMatch[1], baseUrl).toString())
        } catch {
          // 忽略非法相对地址
        }
      }
    }
    return candidates
  }

  return {
    // 读取本地缓存的图标文件。
    getIcon(filename: string): { buffer: Buffer, contentType: string } | null {
      // 严防路径穿越
      const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "")
      const filePath = join(iconsDir, sanitized)
      if (!existsSync(filePath)) return null

      const ext = extname(sanitized).toLowerCase()
      let contentType = "image/png"
      if (ext === ".ico") contentType = "image/x-icon"
      else if (ext === ".svg") contentType = "image/svg+xml"
      else if (ext === ".webp") contentType = "image/webp"
      else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg"

      return { buffer: readFileSync(filePath), contentType }
    },

    // 探测并缓存站点图标，返回本地相对访问路径。
    async fetchAndCache(siteUrl: string, forceRefresh = false): Promise<string> {
      const { url: safeUrl } = await assertSafeOutboundUrl(siteUrl)
      const domain = safeUrl.hostname
      const urlHash = createHash("sha256").update(domain).digest("hex").slice(0, 16)

      // 检查是否已有真实图标缓存（非强制刷新时直接复用）
      if (!forceRefresh) {
        for (const ext of [".png", ".ico", ".svg", ".webp", ".jpg"]) {
          const candidateName = urlHash + ext
          if (existsSync(join(iconsDir, candidateName))) {
            return "/api/v1/icons/" + candidateName
          }
        }
      }

      // 针对必应等知名搜索引擎预置极速官方图标探测端点
      const priorityUrls: string[] = []
      if (domain.includes("bing.com")) {
        priorityUrls.push(
          "https://cn.bing.com/sa/simg/favicon-trans-bg-blue-mg-png.png",
          "https://cn.bing.com/favicon.ico",
          "https://www.bing.com/favicon.ico",
        )
      }

      for (const pUrl of priorityUrls) {
        try {
          const iconData = await fetchWithSafeLimits(pUrl)
          if (iconData.buffer.byteLength > 0) {
            let ext = ".png"
            if (iconData.contentType.includes("icon") || pUrl.endsWith(".ico")) ext = ".ico"
            else if (iconData.contentType.includes("svg") || pUrl.endsWith(".svg")) ext = ".svg"
            const filename = urlHash + ext
            writeFileSync(join(iconsDir, filename), iconData.buffer)
            return "/api/v1/icons/" + filename
          }
        } catch {
          // 忽略预设端点探测失败
        }
      }

      // 1. 尝试抓取页面 HTML 寻找 declared icon
      try {
        const pageResult = await fetchWithSafeLimits(safeUrl.toString())
        if (pageResult.contentType.includes("text/html")) {
          const html = pageResult.buffer.toString("utf-8")
          const iconUrls = extractIconsFromHtml(html, safeUrl.toString())

          for (const iconUrl of iconUrls) {
            try {
              const iconData = await fetchWithSafeLimits(iconUrl)
              if (iconData.buffer.byteLength > 0) {
                let ext = ".png"
                if (iconData.contentType.includes("svg")) ext = ".svg"
                else if (iconData.contentType.includes("icon")) ext = ".ico"
                else if (iconData.contentType.includes("webp")) ext = ".webp"
                const filename = urlHash + ext
                writeFileSync(join(iconsDir, filename), iconData.buffer)
                return "/api/v1/icons/" + filename
              }
            } catch {
              // 忽略当前候选图标抓取失败
            }
          }
        }
      } catch {
        // 忽略页面 HTML 探测失败
      }

      // 2. 尝试直接请求 /favicon.ico
      try {
        const faviconUrl = new URL("/favicon.ico", safeUrl.origin).toString()
        const icoData = await fetchWithSafeLimits(faviconUrl)
        if (icoData.buffer.byteLength > 0) {
          const filename = urlHash + ".ico"
          writeFileSync(join(iconsDir, filename), icoData.buffer)
          return "/api/v1/icons/" + filename
        }
      } catch {
        // 忽略 /favicon.ico 探测失败
      }

      // 3. 若远程拉取失败但本地存在旧缓存，返回旧缓存兜底
      for (const ext of [".png", ".ico", ".svg", ".webp", ".jpg"]) {
        const candidateName = urlHash + ext
        if (existsSync(join(iconsDir, candidateName))) {
          return "/api/v1/icons/" + candidateName
        }
      }

      // 4. 所有抓取失败，返回空由客户端回退
      return ""
    },
  }
}
