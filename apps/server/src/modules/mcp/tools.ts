import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  BREAKPOINTS,
  DEFAULT_THEME,
  findBottomRightPlacement,
  newWidget,
  scopedCss,
  WIDGET_CATALOG,
  type Breakpoint,
  type Desktop,
  type HomeSettings,
  type WidgetNode,
} from '@laull-home/shared'
import type { DesktopService } from '../desktop/service'
import type { SettingsService } from '../settings/service'
import { broadcastDesktopEvent } from './events'

// 生成返回给模型客户端的纯文本内容块。
function jsonResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  }
}

// 统一工具注册，阻断 MCP SDK 内部双重 Zod 联合泛型导致的深度递归回溯。
function addTool<T extends Record<string, z.ZodTypeAny>>(
  server: McpServer,
  name: string,
  description: string,
  parameters: T,
  handler: (args: { [K in keyof T]: z.infer<T[K]> }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>,
) {
  // @ts-expect-error 阻断官方 SDK 在 TS 下的多层重载递归。
  server.tool(name, description, parameters, handler)
}

// 注册所有 MCP 结构化工具与只读资源。
export function registerMcpTools(
  server: McpServer,
  deps: {
    userId: number
    desktopService: DesktopService
    settingsService: SettingsService
  },
) {
  const { userId, desktopService, settingsService } = deps

  // 辅助获取默认或指定空间的画布。
  function getCanvas(spaceId?: string): Desktop {
    return desktopService.get(spaceId ?? 'default')
  }

  // 辅助保存画布，遇到版本冲突自动读取最新版本重试一次。
  function saveCanvas(spaceId: string | undefined, mutator: (current: Desktop) => Desktop): Desktop {
    const targetSpace = spaceId ?? 'default'
    const current = getCanvas(targetSpace)
    const next = mutator(current)
    const saved = desktopService.save(targetSpace, next)
    if (saved) return saved
    const reloaded = getCanvas(targetSpace)
    const retry = mutator(reloaded)
    const retrySaved = desktopService.save(targetSpace, retry)
    if (!retrySaved) throw new Error('画布并发更新冲突，请重试')
    return retrySaved
  }

  // 辅助更新用户设置，版本冲突时自动重试。
  function saveSettings(mutator: (current: HomeSettings) => HomeSettings): HomeSettings {
    const current = settingsService.get(userId)
    const next = mutator(current)
    const saved = settingsService.update(userId, next)
    if (saved) return saved
    const reloaded = settingsService.get(userId)
    const retry = mutator(reloaded)
    const retrySaved = settingsService.update(userId, retry)
    if (!retrySaved) throw new Error('设置并发更新冲突，请重试')
    return retrySaved
  }

  // 注册只读资源 home://canvas/overview。
  server.registerResource('canvas_overview', 'home://canvas/overview', {
    title: '主页桌面与主题全景概览',
    description: '读取主页组件拓扑、当前主题变量与网格配置',
    mimeType: 'application/json',
  }, async () => {
    const desktop = getCanvas('default')
    const settings = settingsService.get(userId)
    return {
      contents: [{
        uri: 'home://canvas/overview',
        mimeType: 'application/json',
        text: JSON.stringify({
          revision: desktop.revision,
          widgetsCount: desktop.nodes.length,
          widgets: desktop.nodes,
          breakpoints: BREAKPOINTS,
          theme: {
            themeId: settings.themeId,
            appearance: settings.appearance,
            themeConfig: settings.themeConfig,
            customCss: settings.customCss,
          },
        }, null, 2),
      }],
    }
  })

  // 1. 读取当前主题与 CSS 配置。
  addTool(server, 'get_theme_and_css', '读取当前主题标识、三层 Token、壁纸遮罩滤镜及全局自定义 CSS', {}, async () => {
    const settings = settingsService.get(userId)
    const tc = settings.themeConfig ?? DEFAULT_THEME
    return jsonResult({
      themeId: settings.themeId ?? 'default',
      appearance: settings.appearance,
      tokens: {
        seed: tc.seed,
        opacity: tc.opacity,
        blur: tc.blur,
        radius: tc.radius,
        gap: tc.gap,
        light: tc.light,
        dark: tc.dark,
      },
      wallpaperBackdrop: { dim: tc.wallpaperDim, blur: tc.wallpaperBlur },
      customCss: settings.customCss ?? '',
    })
  })

  // 2. 覆盖更新全局自定义 CSS。
  addTool(server, 'set_custom_css', '校验并覆盖全局自定义 CSS，受安全选择器与属性白名单限制', {
    css: z.string().describe('CSS 样式源码文本'),
  }, async ({ css }) => {
    scopedCss(css, '.app-root')
    const updated = saveSettings(cur => ({ ...cur, customCss: css }))
    broadcastDesktopEvent('theme.updated')
    return jsonResult({ success: true, revision: updated.revision, customCss: updated.customCss })
  })

  // 3. 切换主题预设或微调种子色。
  addTool(server, 'set_theme', '切换主题预设或传入种子色微调全套明暗色彩', {
    themeId: z.string().optional().describe('预设主题标识，如 default、ocean 等'),
    seed: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('十六进制种子色，如 #2563eb'),
    opacity: z.number().min(50).max(100).optional().describe('表面透明度 50~100'),
    blur: z.number().min(0).max(30).optional().describe('毛玻璃模糊半径 0~30'),
    radius: z.number().min(0).max(40).optional().describe('组件圆角大小 0~40'),
    gap: z.number().min(4).max(32).optional().describe('网格间距 4~32'),
  }, async (args) => {
    const updated = saveSettings(cur => {
      const baseTheme = cur.themeConfig ?? DEFAULT_THEME
      const tc = {
        ...baseTheme,
        version: 1 as const,
        seed: args.seed ?? baseTheme.seed,
        customSeed: args.seed ? true : baseTheme.customSeed,
        opacity: args.opacity ?? baseTheme.opacity,
        blur: args.blur ?? baseTheme.blur,
        radius: args.radius ?? baseTheme.radius,
        gap: args.gap ?? baseTheme.gap,
      }
      return { ...cur, themeId: args.themeId ?? cur.themeId, themeConfig: tc }
    })
    broadcastDesktopEvent('theme.updated')
    return jsonResult({ success: true, revision: updated.revision, themeId: updated.themeId, themeConfig: updated.themeConfig })
  })

  // 4. 微调壁纸遮罩滤镜。
  addTool(server, 'set_wallpaper_backdrop', '调整壁纸遮罩层的暗化百分比与高斯模糊半径', {
    dim: z.number().min(0).max(80).describe('暗化百分比（0 到 80）'),
    blur: z.number().min(0).max(24).describe('模糊半径（0 到 24）'),
  }, async ({ dim, blur }) => {
    const updated = saveSettings(cur => {
      const baseTheme = cur.themeConfig ?? DEFAULT_THEME
      return {
        ...cur,
        themeConfig: { ...baseTheme, version: 1 as const, wallpaperDim: dim, wallpaperBlur: blur },
      }
    })
    broadcastDesktopEvent('theme.updated')
    return jsonResult({ success: true, revision: updated.revision, wallpaperDim: dim, wallpaperBlur: blur })
  })

  // 5. 列出桌面所有组件。
  addTool(server, 'list_widgets', '列出当前空间所有组件实例的元数据、类型、尺寸跨度、坐标与配置', {
    spaceId: z.string().optional().describe('空间标识，默认为 default'),
  }, async ({ spaceId }) => {
    const desktop = getCanvas(spaceId)
    return jsonResult({ revision: desktop.revision, widgets: desktop.nodes })
  })

  // 6. 获取单个组件完整快照。
  addTool(server, 'get_widget', '输入 widgetId 获取单个组件的完整配置快照', {
    widgetId: z.string().describe('组件唯一标识'),
    spaceId: z.string().optional().describe('空间标识，默认为 default'),
  }, async ({ widgetId, spaceId }) => {
    const desktop = getCanvas(spaceId)
    const widget = desktop.nodes.find(node => node.id === widgetId)
    if (!widget) throw new Error(`未找到组件: ${widgetId}`)
    return jsonResult(widget)
  })

  // 7. 在画布添加新组件。
  addTool(server, 'add_widget', '在桌面添加新组件', {
    type: z.enum(['search', 'bookmark', 'folder', 'clock', 'calendar', 'countdown', 'todo', 'note']).describe('组件类型'),
    title: z.string().optional().describe('组件自定义标题'),
    variant: z.string().optional().describe('形态变体'),
    colSpan: z.number().int().min(1).max(12).optional().describe('网格列跨度'),
    rowSpan: z.number().int().min(1).max(4).optional().describe('网格行跨度'),
    x: z.number().int().min(0).max(11).optional().describe('起始列坐标'),
    y: z.number().int().min(0).max(199).optional().describe('起始行坐标'),
    spaceId: z.string().optional().describe('目标空间标识，默认为 default'),
  }, async (args) => {
    const targetSpace = args.spaceId ?? 'default'
    const widgetId = `w-${crypto.randomUUID().slice(0, 8)}`
    const created = newWidget(args.type, widgetId, args.variant)
    if (args.title) created.title = args.title
    const current = getCanvas(targetSpace)
    const preferredW = args.colSpan ?? created.layouts.desktop.w
    const preferredH = args.rowSpan ?? created.layouts.desktop.h

    if (args.x !== undefined && args.y !== undefined) {
      created.layouts.desktop = { x: args.x, y: args.y, w: preferredW, h: preferredH, pinned: false }
    } else {
      const spot = findBottomRightPlacement(current.nodes, preferredW, preferredH, 'desktop')
      created.layouts.desktop = { ...spot, w: preferredW, h: preferredH, pinned: false }
    }

    const saved = saveCanvas(targetSpace, cur => ({ ...cur, nodes: [...cur.nodes, created] }))
    broadcastDesktopEvent('widget.updated')
    return jsonResult({ success: true, revision: saved.revision, widget: created })
  })

  // 8. 修改组件业务或 UI 参数。
  addTool(server, 'update_widget', '修改指定组件的标题、内容、时区或样式参数', {
    widgetId: z.string().describe('目标组件唯一标识'),
    title: z.string().optional().describe('新标题'),
    content: z.string().optional().describe('文本或 JSON 内容'),
    timezone: z.string().optional().describe('时区名称，如 Asia/Shanghai'),
    hour12: z.boolean().optional().describe('是否使用 12 小时制'),
    style: z.object({
      opacity: z.number().min(50).max(100).optional(),
      blur: z.number().min(0).max(30).optional(),
      radius: z.number().min(0).max(40).optional(),
      padding: z.number().min(0).max(32).optional(),
      border: z.number().min(0).max(4).optional(),
      color: z.string().optional(),
      background: z.string().optional(),
      frameless: z.boolean().optional(),
    }).optional().describe('局部微调样式'),
    spaceId: z.string().optional().describe('空间标识，默认为 default'),
  }, async (args) => {
    let updatedNode: WidgetNode | null = null
    const saved = saveCanvas(args.spaceId, cur => {
      const exists = cur.nodes.find(n => n.id === args.widgetId)
      if (!exists) throw new Error(`未找到组件: ${args.widgetId}`)
      const nextNodes = cur.nodes.map(node => {
        if (node.id !== args.widgetId) return node
        const merged: WidgetNode = {
          ...node,
          title: args.title ?? node.title,
          content: args.content !== undefined ? args.content : node.content,
          timezone: args.timezone ?? node.timezone,
          hour12: args.hour12 !== undefined ? args.hour12 : node.hour12,
          style: args.style ? { ...(node.style ?? { opacity: 95, blur: 16, radius: 16, padding: 12, border: 1, color: '', background: '' }), ...args.style } : node.style,
        }
        updatedNode = merged
        return merged
      })
      return { ...cur, nodes: nextNodes }
    })
    broadcastDesktopEvent('widget.updated')
    return jsonResult({ success: true, revision: saved.revision, widget: updatedNode })
  })

  // 9. 为特定组件写入或修改独立 Scoped CSS。
  addTool(server, 'set_widget_css', '为特定组件配置独立 Scoped CSS，限制在组件容器内部生效', {
    widgetId: z.string().describe('目标组件唯一标识'),
    css: z.string().describe('CSS 样式源码文本'),
    spaceId: z.string().optional().describe('空间标识，默认为 default'),
  }, async ({ widgetId, css, spaceId }) => {
    scopedCss(css, `#widget-${widgetId}`)
    const saved = saveCanvas(spaceId, cur => {
      const exists = cur.nodes.find(n => n.id === widgetId)
      if (!exists) throw new Error(`未找到组件: ${widgetId}`)
      return { ...cur, nodes: cur.nodes.map(n => n.id === widgetId ? { ...n, css } : n) }
    })
    broadcastDesktopEvent('widget.updated')
    return jsonResult({ success: true, revision: saved.revision, widgetId, css })
  })

  // 10. 删除组件。
  addTool(server, 'delete_widget', '从桌面移除指定组件并释放占用的窗格', {
    widgetId: z.string().describe('要删除的组件唯一标识'),
    spaceId: z.string().optional().describe('空间标识，默认为 default'),
  }, async ({ widgetId, spaceId }) => {
    const saved = saveCanvas(spaceId, cur => {
      const exists = cur.nodes.find(n => n.id === widgetId)
      if (!exists) throw new Error(`未找到组件: ${widgetId}`)
      return { ...cur, nodes: cur.nodes.filter(n => n.id !== widgetId) }
    })
    broadcastDesktopEvent('widget.updated')
    return jsonResult({ success: true, revision: saved.revision, deletedWidgetId: widgetId })
  })

  // 11. 复制克隆组件。
  addTool(server, 'clone_widget', '深拷贝指定组件的完整配置并在就近网格空位生成副本', {
    widgetId: z.string().describe('要克隆的源组件标识'),
    spaceId: z.string().optional().describe('空间标识，默认为 default'),
  }, async ({ widgetId, spaceId }) => {
    const targetSpace = spaceId ?? 'default'
    let clonedNode: WidgetNode | null = null
    const saved = saveCanvas(targetSpace, cur => {
      const source = cur.nodes.find(n => n.id === widgetId)
      if (!source) throw new Error(`未找到组件: ${widgetId}`)
      const newId = `w-${crypto.randomUUID().slice(0, 8)}`
      const p = source.layouts.desktop
      const spot = findBottomRightPlacement(cur.nodes, p.w, p.h, 'desktop')
      clonedNode = {
        ...JSON.parse(JSON.stringify(source)),
        id: newId,
        title: `${source.title} 副本`,
        layouts: { ...source.layouts, desktop: { ...spot, w: p.w, h: p.h, pinned: false } },
      }
      return { ...cur, nodes: [...cur.nodes, clonedNode!] }
    })
    broadcastDesktopEvent('widget.updated')
    return jsonResult({ success: true, revision: saved.revision, clonedWidget: clonedNode })
  })

  // 12. 读取断点排布矩阵。
  addTool(server, 'get_layout', '读取指定断点下的网格列数与所有组件占用的窗格坐标矩阵', {
    breakpoint: z.enum(['mobile', 'tablet', 'laptop', 'desktop']).optional().describe('目标断点，默认 desktop'),
    spaceId: z.string().optional().describe('空间标识，默认为 default'),
  }, async ({ breakpoint, spaceId }) => {
    const bp = (breakpoint ?? 'desktop') as Breakpoint
    const desktop = getCanvas(spaceId)
    const columns = BREAKPOINTS[bp]
    const placements = desktop.nodes.map(node => ({
      id: node.id,
      title: node.title,
      type: node.type,
      placement: node.layouts[bp] ?? node.layouts.desktop,
    }))
    return jsonResult({ breakpoint: bp, columns, placements })
  })

  // 13. 平移组件坐标。
  addTool(server, 'move_widget', '将指定组件平移至指定的网格行列起始位置', {
    widgetId: z.string().describe('组件唯一标识'),
    x: z.number().int().min(0).max(11).describe('目标列坐标 x'),
    y: z.number().int().min(0).max(199).describe('目标行坐标 y'),
    breakpoint: z.enum(['mobile', 'tablet', 'laptop', 'desktop']).optional().describe('目标断点，默认 desktop'),
    spaceId: z.string().optional().describe('空间标识，默认为 default'),
  }, async ({ widgetId, x, y, breakpoint, spaceId }) => {
    const bp = (breakpoint ?? 'desktop') as Breakpoint
    const saved = saveCanvas(spaceId, cur => {
      const node = cur.nodes.find(n => n.id === widgetId)
      if (!node) throw new Error(`未找到组件: ${widgetId}`)
      const currentPlacement = node.layouts[bp] ?? node.layouts.desktop
      const updatedPlacement = { ...currentPlacement, x, y }
      return { ...cur, nodes: cur.nodes.map(n => n.id === widgetId ? { ...n, layouts: { ...n.layouts, [bp]: updatedPlacement } } : n) }
    })
    broadcastDesktopEvent('layout.updated')
    return jsonResult({ success: true, revision: saved.revision, widgetId, placement: { x, y } })
  })

  // 14. 调整组件尺寸跨度。
  addTool(server, 'resize_widget', '改变指定组件的窗格占用跨度（colSpan 与 rowSpan）', {
    widgetId: z.string().describe('组件唯一标识'),
    colSpan: z.number().int().min(1).max(12).describe('新列跨度 w'),
    rowSpan: z.number().int().min(1).max(4).describe('新行跨度 h'),
    breakpoint: z.enum(['mobile', 'tablet', 'laptop', 'desktop']).optional().describe('目标断点，默认 desktop'),
    spaceId: z.string().optional().describe('空间标识，默认为 default'),
  }, async ({ widgetId, colSpan, rowSpan, breakpoint, spaceId }) => {
    const bp = (breakpoint ?? 'desktop') as Breakpoint
    const saved = saveCanvas(spaceId, cur => {
      const node = cur.nodes.find(n => n.id === widgetId)
      if (!node) throw new Error(`未找到组件: ${widgetId}`)
      const currentPlacement = node.layouts[bp] ?? node.layouts.desktop
      const updatedPlacement = { ...currentPlacement, w: colSpan, h: rowSpan }
      return { ...cur, nodes: cur.nodes.map(n => n.id === widgetId ? { ...n, layouts: { ...n.layouts, [bp]: updatedPlacement } } : n) }
    })
    broadcastDesktopEvent('layout.updated')
    return jsonResult({ success: true, revision: saved.revision, widgetId, colSpan, rowSpan })
  })

  // 15. 锁定或解锁组件固定网格锚点。
  addTool(server, 'pin_widget', '锁定或解锁组件的固定网格锚点', {
    widgetId: z.string().describe('组件唯一标识'),
    pinned: z.boolean().describe('是否固定锚点'),
    breakpoint: z.enum(['mobile', 'tablet', 'laptop', 'desktop']).optional().describe('目标断点，默认 desktop'),
    spaceId: z.string().optional().describe('空间标识，默认为 default'),
  }, async ({ widgetId, pinned, breakpoint, spaceId }) => {
    const bp = (breakpoint ?? 'desktop') as Breakpoint
    const saved = saveCanvas(spaceId, cur => {
      const node = cur.nodes.find(n => n.id === widgetId)
      if (!node) throw new Error(`未找到组件: ${widgetId}`)
      const currentPlacement = node.layouts[bp] ?? node.layouts.desktop
      const updatedPlacement = { ...currentPlacement, pinned }
      return { ...cur, nodes: cur.nodes.map(n => n.id === widgetId ? { ...n, layouts: { ...n.layouts, [bp]: updatedPlacement } } : n) }
    })
    broadcastDesktopEvent('layout.updated')
    return jsonResult({ success: true, revision: saved.revision, widgetId, pinned })
  })

  // 16. 单事务批量重排整页组件。
  addTool(server, 'batch_update_layout', '单事务批量重排整页组件坐标与跨度', {
    placements: z.array(z.object({
      widgetId: z.string().describe('组件唯一标识'),
      x: z.number().int().min(0).max(11),
      y: z.number().int().min(0).max(199),
      colSpan: z.number().int().min(1).max(12).optional(),
      rowSpan: z.number().int().min(1).max(4).optional(),
      pinned: z.boolean().optional(),
    })).describe('排布重排数组'),
    breakpoint: z.enum(['mobile', 'tablet', 'laptop', 'desktop']).optional().describe('目标断点，默认 desktop'),
    spaceId: z.string().optional().describe('空间标识，默认为 default'),
  }, async ({ placements, breakpoint, spaceId }) => {
    const bp = (breakpoint ?? 'desktop') as Breakpoint
    const posMap = new Map(placements.map(p => [p.widgetId, p]))
    const saved = saveCanvas(spaceId, cur => {
      const nextNodes = cur.nodes.map(node => {
        const patch = posMap.get(node.id)
        if (!patch) return node
        const currentPlacement = node.layouts[bp] ?? node.layouts.desktop
        const nextPlacement = {
          ...currentPlacement,
          x: patch.x,
          y: patch.y,
          w: patch.colSpan ?? currentPlacement.w,
          h: patch.rowSpan ?? currentPlacement.h,
          pinned: patch.pinned !== undefined ? patch.pinned : currentPlacement.pinned,
        }
        return { ...node, layouts: { ...node.layouts, [bp]: nextPlacement } }
      })
      return { ...cur, nodes: nextNodes }
    })
    broadcastDesktopEvent('layout.updated')
    return jsonResult({ success: true, revision: saved.revision, updatedCount: placements.length })
  })

  // 17. 读取组件模板清单。
  addTool(server, 'list_widget_templates', '读取预制与用户保存的组件模板清单', {
    spaceId: z.string().optional().describe('空间标识，默认为 default'),
  }, async ({ spaceId }) => {
    const desktop = getCanvas(spaceId)
    return jsonResult({ presetCatalog: WIDGET_CATALOG, userTemplates: desktop.templates })
  })

  // 18. 将组件沉淀为个人模板。
  addTool(server, 'save_widget_as_template', '将配置好的现有组件沉淀为个人模板，供后续快速复用', {
    widgetId: z.string().describe('组件唯一标识'),
    templateTitle: z.string().optional().describe('模板自定义命名'),
    spaceId: z.string().optional().describe('空间标识，默认为 default'),
  }, async ({ widgetId, templateTitle, spaceId }) => {
    let savedTemplate: WidgetNode | null = null
    const saved = saveCanvas(spaceId, cur => {
      const node = cur.nodes.find(n => n.id === widgetId)
      if (!node) throw new Error(`未找到组件: ${widgetId}`)
      if (cur.templates.length >= 40) throw new Error('个人模板已达 40 个上限')
      const tplId = `tpl-${crypto.randomUUID().slice(0, 8)}`
      savedTemplate = {
        ...JSON.parse(JSON.stringify(node)),
        id: tplId,
        title: templateTitle ?? `${node.title} 模板`,
      }
      return { ...cur, templates: [...cur.templates, savedTemplate!] }
    })
    broadcastDesktopEvent('widget.updated')
    return jsonResult({ success: true, revision: saved.revision, template: savedTemplate })
  })
}
