import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('设置页右上角版本号标签与构建配置校验', () => {
  const rootDir = resolve(import.meta.dir, '../..')
  const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'))
  expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/)

  // 验证 nuxt.config.ts 注入了 public.version
  const nuxtConfig = readFileSync(resolve(rootDir, 'apps/web/nuxt.config.ts'), 'utf-8')
  expect(nuxtConfig).toContain('pkg.version')
  expect(nuxtConfig).toContain('public:')
  expect(nuxtConfig).toContain('version:')

  // 验证 settings.vue 包含右上角版本标签结构与样式
  const settingsVue = readFileSync(resolve(rootDir, 'apps/web/app/pages/settings.vue'), 'utf-8')
  expect(settingsVue).toContain('class="version-tag"')
  expect(settingsVue).toContain('v{{ appVersion }}')
  expect(settingsVue).toContain('.version-tag')

  // 验证拆分后的 DeviceSettings.vue 存在并被引入
  const deviceSettingsVue = readFileSync(resolve(rootDir, 'apps/web/app/components/DeviceSettings.vue'), 'utf-8')
  expect(deviceSettingsVue).toContain('活动设备')
  expect(settingsVue).toContain('<DeviceSettings')
})
