import { expect, test } from 'bun:test'
import { extractImageUrls, isLikelyImageUrl } from '@laull-home/shared'

test('文本图片提取：准确识别 Markdown 与 HTML 格式图片', () => {
  const content = `
    这是收藏的一组桌面背景：
    ![海边落日](https://example.com/wallpapers/sunset.jpg)
    ![森林晨雾](https://example.com/forest.png?size=large)
    还有一段网页代码：
    <img src="https://example.com/photos/aurora.webp" alt="极光璀璨" />
    <img class="img-fluid" src="https://example.com/gallery/night.avif">
  `

  const extracted = extractImageUrls(content)
  expect(extracted.length).toBe(4)
  expect(extracted[0]).toEqual({
    name: '海边落日',
    url: 'https://example.com/wallpapers/sunset.jpg',
  })
  expect(extracted[1]).toEqual({
    name: '森林晨雾',
    url: 'https://example.com/forest.png?size=large',
  })
  expect(extracted[2]).toEqual({
    name: '极光璀璨',
    url: 'https://example.com/photos/aurora.webp',
  })
  expect(extracted[3]).toEqual({
    name: 'night',
    url: 'https://example.com/gallery/night.avif',
  })
})

test('文本图片提取：剥离标点符号并过滤非图片普通网页', () => {
  const text = `
    参考资料：https://github.com/laull/project（这是一个项目主页，非图片）。
    壁纸直链如下：
    1. https://example.com/nature/autumn-red-maple.jpg。
    2. (https://example.com/city/tokyo-tower.png)，
    3. 点击查看：https://example.com/art/abstract_fluid.svg！
    4. 交流群：https://v2ex.com/t/123456；
  `

  const results = extractImageUrls(text)
  expect(results.length).toBe(3)
  expect(results.map(r => r.url)).toEqual([
    'https://example.com/nature/autumn-red-maple.jpg',
    'https://example.com/city/tokyo-tower.png',
    'https://example.com/art/abstract_fluid.svg',
  ])
  expect(results[0]?.name).toBe('autumn red maple')
  expect(results[1]?.name).toBe('tokyo tower')
  expect(results[2]?.name).toBe('abstract fluid')
})

test('文本图片提取：支持图床直链与参数格式，自动去重与上限限制', () => {
  const unsplashUrl = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80'
  const text = `
    ${unsplashUrl}
    https://i.imgur.com/example_pic.jpeg
    重复链接：${unsplashUrl}
    ${unsplashUrl}
    参数指定格式：https://cdn.example.com/asset?id=123&format=webp
  `

  const results = extractImageUrls(text, 2)
  // 上限限制为 2 条
  expect(results.length).toBe(2)
  expect(results[0]?.url).toBe(unsplashUrl)
  expect(results[1]?.url).toBe('https://i.imgur.com/example_pic.jpeg')
})

test('图片特征判定：isLikelyImageUrl 准确识别常见图片地址与非法协议', () => {
  expect(isLikelyImageUrl('https://example.com/bg.JPG')).toBe(true)
  expect(isLikelyImageUrl('https://example.com/bg.png')).toBe(true)
  expect(isLikelyImageUrl('https://example.com/bg.webp')).toBe(true)
  expect(isLikelyImageUrl('https://example.com/bg.gif')).toBe(true)
  expect(isLikelyImageUrl('https://example.com/bg.avif')).toBe(true)
  expect(isLikelyImageUrl('https://example.com/bg.svg')).toBe(true)
  expect(isLikelyImageUrl('https://example.com/get?f=png')).toBe(true)
  expect(isLikelyImageUrl('https://images.unsplash.com/photo-123')).toBe(true)

  // 非图片与非法协议拒绝
  expect(isLikelyImageUrl('javascript:alert(1)')).toBe(false)
  expect(isLikelyImageUrl('https://example.com/index.html')).toBe(false)
  expect(isLikelyImageUrl('https://example.com/about')).toBe(false)
  expect(isLikelyImageUrl('ftp://example.com/pic.jpg')).toBe(false)
})
