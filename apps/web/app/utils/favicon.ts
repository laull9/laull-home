// 浏览器直连图片无需读取像素，适用于未开放跨域下载的图标。
export function probeIconImage(url: string, timeoutMs = 2500): Promise<string> {
  if (typeof Image === 'undefined') return Promise.resolve('')
  return new Promise((resolve) => {
    const image = new Image()
    // 结束探测并释放事件、计时器和未完成请求。
    const finish = (result: string) => {
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      image.removeAttribute('src')
      resolve(result)
    }
    const timer = setTimeout(() => finish(''), timeoutMs)
    image.referrerPolicy = 'no-referrer'
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0 ? url : '')
    image.onerror = () => finish('')
    image.src = url
  })
}

// 每批最多探测四张图片，优先保留站点声明的候选顺序。
export async function findBrowserIcon(candidates: string[]): Promise<string> {
  const urls = [...new Set(candidates)].filter(url => {
    try {
      const parsed = new URL(url)
      return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
    } catch {
      return false
    }
  }).slice(0, 24)
  for (let index = 0; index < urls.length; index += 4) {
    const results = await Promise.all(urls.slice(index, index + 4).map(url => probeIconImage(url)))
    const result = results.find(Boolean)
    if (result) return result
  }
  return ''
}

// 尝试将浏览器可读取的图标持久化，跨域受限时保留已验证的图片地址。
export async function persistBrowserIcon(url: string, upload: (blob: Blob) => Promise<string>): Promise<string> {
  if (!url) return ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2500)
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (!response.ok) return url
    const blob = await response.blob()
    if (!blob.size || blob.size > 512 * 1024 || blob.type.includes('text/html')) return url
    return await upload(blob) || url
  } catch {
    return url
  } finally {
    clearTimeout(timer)
  }
}
