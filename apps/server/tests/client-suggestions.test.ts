import { describe, expect, test } from 'bun:test'
import { extractSuggestionList, fetchClientSuggestions } from '../../web/app/utils/clientSuggestions'

describe('客户端本地搜索建议词解析与直连行为验证', () => {
  test('解析标准 OpenSearch 格式建议响应', () => {
    const payload = ['vue', ['vuejs', 'vue3', 'vue router']]
    const result = extractSuggestionList(payload)
    expect(result).toEqual(['vuejs', 'vue3', 'vue router'])
  })

  test('解析 YouTube 嵌套 OpenSearch 格式建议响应', () => {
    const payload = ['bun', [
      ['bun js tutorial', 0],
      ['bun v1.4', 0],
      ['bun vs node', 0],
    ]]
    const result = extractSuggestionList(payload)
    expect(result).toEqual(['bun js tutorial', 'bun v1.4', 'bun vs node'])
  })

  test('解析百度 JSONP 建议响应结构', () => {
    const payload = {
      q: 'typescript',
      p: false,
      s: ['typescript 教程', 'typescript 官网', 'typescript playground'],
    }
    const result = extractSuggestionList(payload)
    expect(result).toEqual(['typescript 教程', 'typescript 官网', 'typescript playground'])
  })

  test('解析必应 qsonhs JSONP 建议响应结构', () => {
    const payload = {
      AS: {
        Query: 'drizzle',
        FullResults: 1,
        Results: [
          {
            Type: 'AS',
            Suggests: [
              { Txt: 'drizzle orm', Type: 'LS' },
              { Txt: 'drizzle studio', Type: 'LS' },
            ],
          },
        ],
      },
    }
    const result = extractSuggestionList(payload)
    expect(result).toEqual(['drizzle orm', 'drizzle studio'])
  })

  test('解析 GitHub API 建议响应结构', () => {
    const payload = {
      total_count: 2,
      items: [
        { full_name: 'vuejs/core' },
        { full_name: 'vuejs/router' },
      ],
    }
    const result = extractSuggestionList(payload)
    expect(result).toEqual(['vuejs/core', 'vuejs/router'])
  })

  test('异常与空响应安全降级为空列表', () => {
    expect(extractSuggestionList(null)).toEqual([])
    expect(extractSuggestionList(undefined)).toEqual([])
    expect(extractSuggestionList('')).toEqual([])
    expect(extractSuggestionList({})).toEqual([])
    expect(extractSuggestionList([])).toEqual([])
  })

  test('fetchClientSuggestions 空输入直接返回空数组，不发起拉取', async () => {
    const res1 = await fetchClientSuggestions('')
    expect(res1).toEqual([])

    const res2 = await fetchClientSuggestions('   ')
    expect(res2).toEqual([])
  })
})
