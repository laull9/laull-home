import { afterEach, describe, expect, test } from "bun:test"
import { createApp } from "../src/app"
import { loadConfig } from "../src/config"
import { openDatabase, type AppDatabase } from "../src/db"
import { createUser } from "../src/modules/auth/service"
import { assertSafeOutboundUrl, isPrivateIp } from "../src/modules/favicon/service"
import { decodeBufferWithEncoding, parseSuggestionsPayload, resolveSuggestionTemplate } from "../src/modules/search/service"
import { parseSearchQuery, type SearchEngine } from "@laull-home/shared"

const databases: AppDatabase[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })

async function fixture() {
  const db = openDatabase(":memory:")
  databases.push(db)
  await createUser(db, "owner", "test-password-123")
  const app = createApp(db, loadConfig({})).compile()

  async function request(path: string, method = "GET", body?: unknown, cookie?: string, origin = "http://localhost:3000") {
    return app.handle(new Request("http://localhost/api/v1" + path, {
      method,
      headers: { origin, ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }))
  }

  async function login() {
    const response = await request("/auth/login", "POST", { username: "owner", password: "test-password-123" })
    expect(response.status).toBe(200)
    return { response, cookie: response.headers.get("set-cookie")!.split(";")[0]! }
  }

  return { db, request, login }
}

describe("书签与分组 CRUD 及排序", () => {
  test("完整分组与书签读写、重排与级联删除", async () => {
    const { request, login } = await fixture()
    const { cookie } = await login()

    // 1. 创建分组
    const createGroupRes = await request("/bookmarks/groups", "POST", { spaceId: "default", name: "学习资料", isPublic: true }, cookie)
    expect(createGroupRes.status).toBe(200)
    const { group } = await createGroupRes.json()
    expect(group.name).toBe("学习资料")

    // 2. 在该分组创建书签
    const createBmRes = await request("/bookmarks", "POST", {
      groupId: group.id,
      title: "TypeScript 文档",
      url: "https://www.typescriptlang.org",
      iconUrl: "",
      isPublic: true,
    }, cookie)
    expect(createBmRes.status).toBe(200)
    const { bookmark } = await createBmRes.json()
    expect(bookmark.title).toBe("TypeScript 文档")

    // 3. 更新书签
    const updateBmRes = await request("/bookmarks/" + bookmark.id, "PUT", {
      title: "TS 官方文档",
    }, cookie)
    expect(updateBmRes.status).toBe(200)
    const updatedBm = (await updateBmRes.json()).bookmark
    expect(updatedBm.title).toBe("TS 官方文档")

    // 4. 新增第二条书签并重排
    const createBmRes2 = await request("/bookmarks", "POST", {
      groupId: group.id,
      title: "Bun 官网",
      url: "https://bun.sh",
    }, cookie)
    const bm2 = (await createBmRes2.json()).bookmark

    const reorderRes = await request("/bookmarks/reorder", "POST", {
      groupId: group.id,
      bookmarkIds: [bm2.id, bookmark.id],
    }, cookie)
    expect(reorderRes.status).toBe(200)

    const listBms = await (await request("/bookmarks?spaceId=default&groupId=" + group.id, "GET", undefined, cookie)).json()
    expect(listBms.bookmarks[0].id).toBe(bm2.id)
    expect(listBms.bookmarks[1].id).toBe(bookmark.id)

    // 5. 删除分组将级联删除其下的书签
    const deleteGroupRes = await request("/bookmarks/groups/" + group.id, "DELETE", undefined, cookie)
    expect(deleteGroupRes.status).toBe(200)
    const remainingBms = await (await request("/bookmarks?spaceId=default&groupId=" + group.id, "GET", undefined, cookie)).json()
    expect(remainingBms.bookmarks).toHaveLength(0)
  })

  test("支持无分组独立书签创建、移入分组与移出分组", async () => {
    const { request, login } = await fixture()
    const { cookie } = await login()

    // 1. 创建未分组独立书签
    const createRes = await request("/bookmarks", "POST", {
      spaceId: "default",
      title: "独立桌面图标",
      url: "https://example.org",
    }, cookie)
    expect(createRes.status).toBe(200)
    const standaloneBm = (await createRes.json()).bookmark
    expect(standaloneBm.groupId).toBeNull()
    expect(standaloneBm.title).toBe("独立桌面图标")

    // 2. 查询默认空间书签列表包含该独立书签
    const listRes = await request("/bookmarks?spaceId=default", "GET", undefined, cookie)
    const allBms = (await listRes.json()).bookmarks
    expect(allBms.some((b: { id: string; groupId: string | null }) => b.id === standaloneBm.id && b.groupId === null)).toBe(true)

    // 3. 创建文件夹分组并将独立书签移入分组
    const groupRes = await request("/bookmarks/groups", "POST", { spaceId: "default", name: "收纳文件夹" }, cookie)
    const folderGroup = (await groupRes.json()).group
    const moveIntoRes = await request("/bookmarks/" + standaloneBm.id, "PUT", { groupId: folderGroup.id }, cookie)
    expect(moveIntoRes.status).toBe(200)
    const movedBm = (await moveIntoRes.json()).bookmark
    expect(movedBm.groupId).toBe(folderGroup.id)

    // 4. 将书签移出分组成为独立书签
    const moveOutRes = await request("/bookmarks/" + standaloneBm.id, "PUT", { groupId: null }, cookie)
    expect(moveOutRes.status).toBe(200)
    const restoredBm = (await moveOutRes.json()).bookmark
    expect(restoredBm.groupId).toBeNull()
  })
})

describe("空间与访客权限隔离", () => {
  test("访客只能读取公开内容，写操作需登录", async () => {
    const { request, login } = await fixture()
    const { cookie } = await login()

    // 访客尝试创建书签应被拦截
    const anonWrite = await request("/bookmarks/groups", "POST", { spaceId: "default", name: "秘密" })
    expect(anonWrite.status).toBe(401)

    // 登录后在默认空间创建一个公开分组和一个非公开分组
    const gPublicRes = await request("/bookmarks/groups", "POST", { spaceId: "default", name: "公开组", isPublic: true }, cookie)
    const gPrivateRes = await request("/bookmarks/groups", "POST", { spaceId: "default", name: "私密组", isPublic: false }, cookie)
    const gPublic = (await gPublicRes.json()).group
    const gPrivate = (await gPrivateRes.json()).group

    // 访客读取只能看到公开分组以及初始化自带的公开分组
    const anonGroupsRes = await request("/bookmarks/groups?spaceId=default")
    expect(anonGroupsRes.status).toBe(200)
    const anonGroups = (await anonGroupsRes.json()).groups
    expect(anonGroups.some((g: { id: string }) => g.id === gPublic.id)).toBe(true)
    expect(anonGroups.some((g: { id: string }) => g.id === gPrivate.id)).toBe(false)
  })

  test("隐私空间书签在未授权时禁止访问，短期授权有效时可操作", async () => {
    const { request, login } = await fixture()
    const { cookie } = await login()

    // 尝试直接访问隐私空间分组，未解锁返回 403
    const lockedRes = await request("/bookmarks/groups?spaceId=privacy", "GET", undefined, cookie)
    expect(lockedRes.status).toBe(403)

    // 设置隐私密码并解锁
    await request("/spaces/privacy/setup", "POST", { password: "privacy-pass-123" }, cookie)
    const unlockRes = await request("/spaces/privacy/unlock", "POST", { password: "privacy-pass-123" }, cookie)
    expect(unlockRes.status).toBe(200)
    const spaceCookie = unlockRes.headers.get("set-cookie")!.split(";")[0]!
    const combinedCookie = cookie + "; " + spaceCookie

    // 解锁后可创建隐私分组
    const createPrivGroup = await request("/bookmarks/groups", "POST", { spaceId: "privacy", name: "隐私分组" }, combinedCookie)
    expect(createPrivGroup.status).toBe(200)

    // 锁定后重新访问返回 403
    await request("/spaces/privacy/lock", "POST", undefined, combinedCookie)
    const reLockRes = await request("/bookmarks/groups?spaceId=privacy", "GET", undefined, combinedCookie)
    expect(reLockRes.status).toBe(403)
  })
})

describe("搜索引擎与 Bang 匹配", () => {
  test("引擎增删改查及默认引擎约束", async () => {
    const { request, login } = await fixture()
    const { cookie } = await login()

    // 访客公开获取引擎列表
    const listRes = await request("/search/engines")
    expect(listRes.status).toBe(200)
    const engines = (await listRes.json()).engines
    expect(engines.length).toBeGreaterThanOrEqual(5)

    // 添加自定义引擎
    const addRes = await request("/search/engines", "POST", {
      name: "Bilibili",
      urlTemplate: "https://search.bilibili.com/all?keyword=%s",
      bang: "bili",
    }, cookie)
    expect(addRes.status).toBe(200)
    const bili = (await addRes.json()).engine

    // 更新引擎
    const updateRes = await request("/search/engines/" + bili.id, "PUT", {
      bang: "bz",
    }, cookie)
    expect(updateRes.status).toBe(200)
    expect((await updateRes.json()).engine.bang).toBe("bz")

    // 删除引擎
    const delRes = await request("/search/engines/" + bili.id, "DELETE", undefined, cookie)
    expect(delRes.status).toBe(200)
  })

  test("搜索输入解析器准确识别 URL、Bang 与常规搜索", () => {
    const engines: SearchEngine[] = [
      { id: "1", name: "Google", urlTemplate: "https://www.google.com/search?q=%s", suggestionUrl: "", bang: "g", isDefault: true, sortOrder: 1, createdAt: 0, updatedAt: 0 },
      { id: "2", name: "GitHub", urlTemplate: "https://github.com/search?q=%s", suggestionUrl: "", bang: "gh", isDefault: false, sortOrder: 2, createdAt: 0, updatedAt: 0 },
    ]

    // 1. Bang 语法识别
    const bangResult = parseSearchQuery("!gh rust orm", engines)
    expect(bangResult.type).toBe("search")
    expect(bangResult.targetUrl).toBe("https://github.com/search?q=rust%20orm")

    // 2. URL 域名自动识别
    const urlResult = parseSearchQuery("github.com/openai", engines)
    expect(urlResult.type).toBe("url")
    expect(urlResult.targetUrl).toBe("https://github.com/openai")

    // 3. 完整 URL 识别
    const fullUrlResult = parseSearchQuery("https://bun.sh/docs", engines)
    expect(fullUrlResult.type).toBe("url")
    expect(fullUrlResult.targetUrl).toBe("https://bun.sh/docs")

    // 4. 普通关键词搜索
    const normalResult = parseSearchQuery("elysia framework", engines)
    expect(normalResult.type).toBe("search")
    expect(normalResult.targetUrl).toBe("https://www.google.com/search?q=elysia%20framework")
  })
})

describe("Favicon 出站限制与 SSRF 防护", () => {
  test("阻断本地私有网络与回环地址", async () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true)
    expect(isPrivateIp("10.0.0.1")).toBe(true)
    expect(isPrivateIp("192.168.1.1")).toBe(true)
    expect(isPrivateIp("172.20.0.1")).toBe(true)
    expect(isPrivateIp("::1")).toBe(true)
    expect(isPrivateIp("8.8.8.8")).toBe(false)

    await expect(assertSafeOutboundUrl("http://127.0.0.1:8080")).rejects.toThrow("内网")
    await expect(assertSafeOutboundUrl("http://localhost:3000")).rejects.toThrow()
    await expect(assertSafeOutboundUrl("http://192.168.1.1/favicon.ico")).rejects.toThrow("内网")
    await expect(assertSafeOutboundUrl("ftp://example.com/icon.png")).rejects.toThrow("协议")
  })

  test("搜索引擎模板地址解析站点 Origin 且阻断非法协议", () => {
    function extractOrigin(urlStr?: string): string {
      if (!urlStr) return ""
      try {
        const raw = urlStr.replace(/%s.*/, "").trim()
        let parsed: URL
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
          parsed = new URL(raw)
        } else {
          parsed = new URL("https://" + raw)
        }
        if (['http:', 'https:'].includes(parsed.protocol)) return parsed.origin
      } catch { /* 忽略格式不合法地址。 */ }
      return ""
    }

    expect(extractOrigin("https://www.google.com/search?q=%s")).toBe("https://www.google.com")
    expect(extractOrigin("https://github.com/search?q=%s")).toBe("https://github.com")
    expect(extractOrigin("https://cn.bing.com/search?q=%s")).toBe("https://cn.bing.com")
    expect(extractOrigin("http://example.com/search?k=%s&p=1")).toBe("http://example.com")
    expect(extractOrigin("www.baidu.com/s?wd=%s")).toBe("https://www.baidu.com")
    expect(extractOrigin("javascript:alert(1)")).toBe("")
    expect(extractOrigin("file:///etc/hosts")).toBe("")
    expect(extractOrigin("data:text/html,<h1>hi</h1>")).toBe("")
  })
})

describe("多搜索引擎建议与联想匹配", () => {
  test("解析主流及自定义搜索引擎多样化响应数据", () => {
    // 1. OpenSearch 标准格式
    const openSearchJson = JSON.stringify(["bun", ["bun js", "bun test", "bun install"]])
    expect(parseSuggestionsPayload(openSearchJson)).toEqual(["bun js", "bun test", "bun install"])

    // 2. 带有 JSONP 包装的百度/搜狗格式
    const jsonpData = `window.bdsug.sug(${JSON.stringify(["vue", ["vue3", "vue router", "vuex"]])});`
    expect(parseSuggestionsPayload(jsonpData)).toEqual(["vue3", "vue router", "vuex"])

    // 3. 百度 sugrec 格式
    const baiduSugrec = JSON.stringify({ q: "react", g: [{ q: "react native" }, { q: "react router" }] })
    expect(parseSuggestionsPayload(baiduSugrec)).toEqual(["react native", "react router"])

    // 4. 哔哩哔哩格式
    const bilibiliData = JSON.stringify({
      code: 0,
      result: {
        tag: [{ value: "elysia 教程" }, { value: "elysia bun" }],
      },
    })
    expect(parseSuggestionsPayload(bilibiliData)).toEqual(["elysia 教程", "elysia bun"])

    // 5. GitHub 格式
    const githubData = JSON.stringify({
      items: [{ full_name: "oven-sh/bun" }, { full_name: "elysiajs/elysia" }],
    })
    expect(parseSuggestionsPayload(githubData)).toEqual(["oven-sh/bun", "elysiajs/elysia"])

    // 6. 异常或空白格式优雅降级
    expect(parseSuggestionsPayload("")).toEqual([])
    expect(parseSuggestionsPayload("<html>invalid</html>")).toEqual([])
    expect(parseSuggestionsPayload("{}")).toEqual([])
  })

  test("自动推导主流搜索引擎建议接口或使用自定义配置", () => {
    // 1. 自定义显式配置优先
    expect(resolveSuggestionTemplate({
      urlTemplate: "https://custom.search/?q=%s",
      name: "Custom",
      suggestionUrl: "https://custom.search/api/suggest?term=%s",
    })).toBe("https://custom.search/api/suggest?term=%s")

    // 2. 谷歌智能推导
    expect(resolveSuggestionTemplate({
      urlTemplate: "https://www.google.com/search?q=%s",
      name: "Google",
      suggestionUrl: "",
    })).toContain("suggestqueries.google.com")

    // 3. 必应智能推导为高速 cn.bing.com 接口
    expect(resolveSuggestionTemplate({
      urlTemplate: "https://cn.bing.com/search?q=%s",
      name: "Bing",
      suggestionUrl: "",
    })).toContain("cn.bing.com")

    // 4. 旧式海外 api.bing.com 自动升级为 cn.bing.com
    expect(resolveSuggestionTemplate({
      urlTemplate: "https://www.bing.com/search?q=%s",
      name: "Bing",
      suggestionUrl: "https://api.bing.com/osjson.aspx?query=%s",
    })).toBe("https://cn.bing.com/osjson.aspx?query=%s")

    // 4. 百度智能推导
    expect(resolveSuggestionTemplate({
      urlTemplate: "https://www.baidu.com/s?wd=%s",
      name: "Baidu",
      suggestionUrl: "",
    })).toContain("suggestion.baidu.com")

    // 5. 未匹配且无自定义时安全返回空
    expect(resolveSuggestionTemplate({
      urlTemplate: "https://unknown-search-site.org/find?k=%s",
      name: "Unknown",
      suggestionUrl: "",
    })).toBe("")
  })

  test("/search/suggestions 端点获取关联搜索建议与异常防护", async () => {
    const { request } = await fixture()

    // 1. 未传关键字或纯空格直接返回 400 校验拦截
    const emptyRes = await request("/search/suggestions?q=")
    expect(emptyRes.status).toBe(400)

    // 2. 正常查询端点调用，结构保持契约
    const sugRes = await request("/search/suggestions?q=bun")
    expect(sugRes.status).toBe(200)
    const data = await sugRes.json()
    expect(Array.isArray(data.suggestions)).toBe(true)
  })

  test("字符编码自适配解码器准确识别 GBK 与 UTF-8 避免中文乱码", () => {
    // 1. 正常 UTF-8 编码流解码
    const utf8Bytes = new TextEncoder().encode('["谷歌", "谷歌翻译"]')
    expect(decodeBufferWithEncoding(utf8Bytes, "application/json; charset=utf-8")).toBe('["谷歌", "谷歌翻译"]')

    // 2. 百度常用 GBK 编码流（声明 charset=gbk）
    // 0xb0, 0xd9, 0xb6, 0xc8 对应 GBK 编码的“百度”
    const gbkBytes = new Uint8Array([0x5b, 0x22, 0xb0, 0xd9, 0xb6, 0xc8, 0x22, 0x5d])
    expect(decodeBufferWithEncoding(gbkBytes, "text/javascript; charset=gbk")).toBe('["百度"]')

    // 3. 响应头缺失或未声明 charset 时自适应识别并回退 GBK 解码
    expect(decodeBufferWithEncoding(gbkBytes)).toBe('["百度"]')
  })
})

