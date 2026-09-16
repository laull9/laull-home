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
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['**/*.{ts,mjs,vue}'],
    languageOptions: {
      globals: Object.fromEntries([
        'process', 'Bun', 'console', 'crypto', 'URL', 'window', 'document',
        'HTMLElement', 'MouseEvent', 'KeyboardEvent', 'Node', 'onUnmounted',
        'defineNuxtConfig', 'defineNuxtPlugin', 'defineEventHandler',
        'useRuntimeConfig', 'getRequestURL', 'createError', 'proxyRequest',
        'useRequestHeaders', 'useState', 'useNuxtApp', 'readonly', 'Response',
        'fetch', 'AbortSignal', 'ref', 'computed', 'onMounted', 'useRouter',
        'useRoute', 'definePageMeta', 'navigateTo', 'defineNuxtRouteMiddleware',
        'useAuth', 'useSpaces', 'useBookmarks', 'useSearch', 'useTheme',
        'watch', 'confirm', 'ResizeObserver', 'DragEvent', 'PointerEvent', 'getComputedStyle',
        'atob', 'btoa', 'TextEncoder', 'TextDecoder', 'HTMLInputElement',
        'HTMLAnchorElement', 'HTMLDialogElement', 'HTMLImageElement', 'HTMLTextAreaElement', 'Event', 'BeforeUnloadEvent',
        'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
      ].map(name => [name, 'readonly'])),
    },
  },
)
