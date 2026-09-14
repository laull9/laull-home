import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

// 源码检查排除框架产物和本地持久化数据。
export default ts.config(
  { ignores: ['**/node_modules/**', '**/.nuxt/**', '**/.output/**', '**/dist/**', 'data/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    files: ['**/*.{ts,mjs,vue}'],
    languageOptions: {
      globals: Object.fromEntries(['process', 'Bun', 'console', 'crypto', 'URL', 'window', 'defineNuxtConfig', 'defineNuxtPlugin', 'defineEventHandler', 'useRuntimeConfig', 'getRequestURL', 'createError', 'proxyRequest', 'useRequestHeaders', 'useState', 'useNuxtApp', 'readonly', 'Response', 'fetch', 'AbortSignal'].map(name => [name, 'readonly'])),
    },
  },
)
