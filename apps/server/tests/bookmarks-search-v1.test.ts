import { afterEach, describe, expect, test } from "bun:test"
import { createApp } from "../src/app"
import { loadConfig } from "../src/config"
import { openDatabase, type AppDatabase } from "../src/db"
import { createUser } from "../src/modules/auth/service"
import { assertSafeOutboundUrl, isPrivateIp } from "../src/modules/favicon/service"
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
      { id: "1", name: "Google", urlTemplate: "https://www.google.com/search?q=%s", bang: "g", isDefault: true, sortOrder: 1, createdAt: 0, updatedAt: 0 },
      { id: "2", name: "GitHub", urlTemplate: "https://github.com/search?q=%s", bang: "gh", isDefault: false, sortOrder: 2, createdAt: 0, updatedAt: 0 },
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
})
