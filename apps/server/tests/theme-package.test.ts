import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createZip, sanitizeZipEntryPath, ZipError } from '../src/modules/themes/zip'
import { createThemePackageService } from '../src/modules/themes/service'
import { eq } from 'drizzle-orm'
import { openDatabase } from '../src/db'
import { users, userSettings } from '../src/db/schema'

// 测试主题包安全导入、导出、Zip Slip 与边界防护。
test('Zip Slip 防护：严密拦截任何目录穿越路径条目', () => {
  // 拦截绝对路径。
  expect(() => sanitizeZipEntryPath('/etc/passwd')).toThrow(ZipError)
  expect(() => sanitizeZipEntryPath('\\Windows\\System32')).toThrow(ZipError)

  // 拦截包含 .. 的相对穿越路径。
  expect(() => sanitizeZipEntryPath('../escaped.json')).toThrow(ZipError)
  expect(() => sanitizeZipEntryPath('assets/../../root.json')).toThrow(ZipError)
  expect(() => sanitizeZipEntryPath('theme/subdir/../../../danger.css')).toThrow(ZipError)
  expect(() => sanitizeZipEntryPath('..\\evil.txt')).toThrow(ZipError)

  // 合规路径正常通过并标准化。
  expect(sanitizeZipEntryPath('theme.json')).toBe('theme.json')
  expect(sanitizeZipEntryPath('assets/wallpaper.png')).toBe('assets/wallpaper.png')
  expect(sanitizeZipEntryPath('styles\\style.css')).toBe('styles/style.css')
})

test('文件类型白名单与恶意内容拦截：拒绝可执行文件与恶意 SVG', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'theme-test-'))
  const db = openDatabase(':memory:')
  const service = createThemePackageService(db, tempDir)

  try {
    // 1. 包含可执行文件 .exe 或脚本 .sh。
    const evilZip = createZip([
      { path: 'theme.json', data: Buffer.from(JSON.stringify({ name: '恶意外壳', themeConfig: { version: 1, seed: '#2563eb', customSeed: false, opacity: 90, blur: 10, radius: 10, gap: 10, wallpaperDim: 0, wallpaperBlur: 0, light: {}, dark: {} } })) },
      { path: 'payload.exe', data: Buffer.from('malicious payload') },
    ])
    expect(() => service.parseAndValidateTheme(evilZip)).toThrow('包含不允许的文件类型')

    // 2. 包含 HTML 网页文件。
    const htmlZip = createZip([
      { path: 'theme.json', data: Buffer.from(JSON.stringify({ name: 'HTML外挂', themeConfig: { version: 1, seed: '#2563eb', customSeed: false, opacity: 90, blur: 10, radius: 10, gap: 10, wallpaperDim: 0, wallpaperBlur: 0, light: {}, dark: {} } })) },
      { path: 'index.html', data: Buffer.from('<script>alert(1)</script>') },
    ])
    expect(() => service.parseAndValidateTheme(htmlZip)).toThrow('包含不允许的文件类型')

    // 3. 包含恶意 SVG 脚本注入。
    const evilSvgZip = createZip([
      { path: 'theme.json', data: Buffer.from(JSON.stringify({ name: 'SVG注入', themeConfig: { version: 1, seed: '#2563eb', customSeed: false, opacity: 90, blur: 10, radius: 10, gap: 10, wallpaperDim: 0, wallpaperBlur: 0, light: {}, dark: {} } })) },
      { path: 'wallpaper.svg', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>') },
    ])
    expect(() => service.parseAndValidateTheme(evilSvgZip)).toThrow('包含不安全的脚本')
  } finally {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('CSS 边界校验：拦截包含外部资源 url、@import 及非法选择器', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'theme-css-test-'))
  const db = openDatabase(':memory:')
  const service = createThemePackageService(db, tempDir)

  try {
    // 1. 包含 @import 外部网络字体或样式。
    const importCssZip = createZip([
      { path: 'theme.json', data: Buffer.from(JSON.stringify({ name: '导入测试', themeConfig: { version: 1, seed: '#2563eb', customSeed: false, opacity: 90, blur: 10, radius: 10, gap: 10, wallpaperDim: 0, wallpaperBlur: 0, light: {}, dark: {} } })) },
      { path: 'style.css', data: Buffer.from('@import url("https://evil.com/leak.css");') },
    ])
    expect(() => service.parseAndValidateTheme(importCssZip)).toThrow('主题 CSS 校验失败')

    // 2. 包含 url() 外部资源引用。
    const urlCssZip = createZip([
      { path: 'theme.json', data: Buffer.from(JSON.stringify({ name: '外链测试', themeConfig: { version: 1, seed: '#2563eb', customSeed: false, opacity: 90, blur: 10, radius: 10, gap: 10, wallpaperDim: 0, wallpaperBlur: 0, light: {}, dark: {} } })) },
      { path: 'style.css', data: Buffer.from('.app-root { background-color: url("http://evil.com/bg.png"); }') },
    ])
    expect(() => service.parseAndValidateTheme(urlCssZip)).toThrow('主题 CSS 校验失败')
  } finally {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('合规主题包导入与导出闭环验证', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'theme-valid-test-'))
  const db = openDatabase(':memory:')

  const now = Date.now()
  db.insert(users).values({ id: 1, username: 'admin', passwordHash: 'hash', createdAt: now }).run()
  db.insert(userSettings).values({ userId: 1, revision: 0, title: '测试主页', appearance: 'system', updatedAt: now }).run()

  const service = createThemePackageService(db, tempDir)

  try {
    // 构造合规的主题包 ZIP。
    const validManifest = {
      name: '赛博极光主题',
      version: '1.2.0',
      description: '极光渐变风格双模主题',
      author: 'Tester',
      themeConfig: {
        version: 1,
        seed: '#06b6d4',
        customSeed: true,
        opacity: 90,
        blur: 18,
        radius: 14,
        gap: 16,
        wallpaperDim: 20,
        wallpaperBlur: 5,
        light: { accent: '#0891b2' },
        dark: { accent: '#22d3ee' },
      },
      customCss: '.app-root { color: #06b6d4; }',
      wallpaperFile: 'wallpaper.png',
    }

    // PNG 8 字节魔数。
    const mockPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])

    const validZip = createZip([
      { path: 'theme.json', data: Buffer.from(JSON.stringify(validManifest)) },
      { path: 'style.css', data: Buffer.from('.app-root button { border-radius: 8px; }') },
      { path: 'wallpaper.png', data: mockPng },
    ])

    // 1. 检验解析。
    const parsed = service.parseAndValidateTheme(validZip)
    expect(parsed.manifest.name).toBe('赛博极光主题')
    expect(parsed.wallpaperEntry).toBeDefined()
    expect(parsed.cssContent).toContain('color: #06b6d4')

    // 2. 导入应用。
    const importResult = await service.importTheme(1, validZip, true)
    expect(importResult.applied).toBe(true)
    expect(importResult.wallpaperUrl).toContain('/api/v1/wallpapers/image/')

    // 3. 校验数据库已落盘。
    const currentSettings = db.select().from(userSettings).where(eq(userSettings.userId, 1)).get()!
    expect(currentSettings.themeId).toBe('custom')
    expect(currentSettings.themeConfig).toContain('#06b6d4')
    expect(currentSettings.customCss).toContain('border-radius: 8px')

    // 4. 反向导出主题包。
    const exported = service.exportTheme(1, '导出主题')
    expect(exported.filename).toContain('laull-theme-')
    expect(exported.buffer.length).toBeGreaterThan(50)

    // 验证导出的 ZIP 可以重新被成功解析。
    const reParsed = service.parseAndValidateTheme(exported.buffer)
    expect(reParsed.manifest.themeConfig.seed).toBe('#06b6d4')
  } finally {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  }
})
