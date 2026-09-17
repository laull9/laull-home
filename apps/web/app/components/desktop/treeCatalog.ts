import { ref } from 'vue'
import type { WidgetNode } from '@laull-home/shared'

// 记录组件树当前被拖拽的组件节点。
export const activeDragTreeItem = ref<TreeItem | null>(null)

// 组件树叶子节点接口。
export interface TreeItem {
  id: string
  type: WidgetNode['type']
  title: string
  desc: string
  variant?: string
  w: number
  h: number
  tag?: string
  frameless?: boolean
  referenceId?: string
}

// 组件树分类分支接口。
export interface TreeGroup {
  id: string
  name: string
  items: TreeItem[]
}

// 静态内置组件层级目录数据。
export const STATIC_TREE_GROUPS: TreeGroup[] = [
  {
    id: 'nav',
    name: '收纳容器与导航',
    items: [
      { id: 'search', type: 'search', title: '搜索条', desc: '集成搜索引擎与快捷指令', w: 8, h: 1, tag: '8×1' },
      { id: 'folder-accordion', type: 'folder', variant: '', title: '风琴收纳抽屉', desc: '就地展开折叠与沉浸视窗', w: 2, h: 2, tag: '2×2' },
      { id: 'folder-launchpad', type: 'folder', variant: 'launchpad', title: '启动台九宫格', desc: '前 8 项直接点击，展开沉浸视窗', w: 2, h: 2, tag: '2×2' },
      { id: 'folder-shelf', type: 'folder', variant: 'shelf', title: '紧凑横滑书架', desc: '横向滚动，全屏打开', w: 2, h: 1, tag: '2×1' },
      { id: 'folder-grid', type: 'folder', variant: 'grid', title: '经典平铺容器', desc: '网格平铺展示收纳内容', w: 2, h: 2, tag: '2×2' },
      { id: 'bm-large', type: 'bookmark', variant: 'large', title: '质感大图标', desc: '纯净无字圆角大图标', w: 1, h: 1, tag: '1×1', frameless: true },
      { id: 'bm-pill', type: 'bookmark', variant: 'pill', title: '胶囊信息卡', desc: '横向 2×0.5 矮版胶囊信息卡', w: 2, h: 1, tag: '2×1', frameless: true },
      { id: 'bm-standard', type: 'bookmark', variant: '', title: '标准图标捷径', desc: '1×1 经典应用图标启动项', w: 1, h: 1, tag: '1×1', frameless: true },
      { id: 'bm-emblem', type: 'bookmark', variant: 'emblem', title: '字母徽章捷径', desc: '根据标题生成的排印徽标', w: 1, h: 1, tag: '1×1' },
    ],
  },
  {
    id: 'time',
    name: '时间与日程',
    items: [
      { id: 'clock-digital', type: 'clock', variant: '', title: '经典数码时钟', desc: '等宽大字时间与日期', w: 2, h: 1, tag: '2×1' },
      { id: 'clock-analog', type: 'clock', variant: 'analog', title: '模拟精工表盘', desc: '圆形刻度盘面，支持无底座悬浮', w: 2, h: 2, tag: '2×2', frameless: true },
      { id: 'clock-flip', type: 'clock', variant: 'flip', title: '复古机械翻牌', desc: '经典机械翻折卡片质感', w: 2, h: 1, tag: '2×1' },
      { id: 'clock-progress', type: 'clock', variant: 'progress', title: '今日流逝环', desc: '24 小时流逝进度弧形环', w: 2, h: 2, tag: '2×2' },
      { id: 'clock-minimal', type: 'clock', variant: 'minimal', title: '极简大字时钟', desc: '纯净透明悬浮大字', w: 2, h: 1, tag: '2×1', frameless: true },
      { id: 'calendar', type: 'calendar', title: '日历小部件', desc: '月度日程网格与当日高亮', w: 3, h: 3, tag: '3×3' },
    ],
  },
  {
    id: 'tools',
    name: '效率工具',
    items: [
      { id: 'countdown', type: 'countdown', title: '倒数纪念日', desc: '目标日倒数与流逝进度条', w: 2, h: 2, tag: '2×2' },
      { id: 'todo', type: 'todo', title: '轻量待办清单', desc: '随手勾选任务与完成率进度', w: 2, h: 2, tag: '2×2' },
      { id: 'note', type: 'note', title: '便签备忘', desc: '桌面随手记便笺与备忘草稿', w: 2, h: 2, tag: '2×2' },
    ],
  },
]
