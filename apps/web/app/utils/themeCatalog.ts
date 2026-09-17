import { contrast } from '@laull-home/shared'

// 主题分类定义。
export type ThemeCategory = '经典简约' | '极客硬核' | '流行暗黑' | '艺术光影'

// 主题分类清单。
export const THEME_CATEGORIES: ThemeCategory[] = ['经典简约', '极客硬核', '流行暗黑', '艺术光影']

// 单套主题明暗单模颜色接口。
export interface ThemeModeColors {
  // 页面背景底色。
  bg: string
  // 卡片容器底色。
  surface: string
  // 一级正文颜色。
  text: string
  // 二级说明颜色。
  textSecondary: string
  // 品牌强调色。
  accent: string
  // 边框描边颜色。
  border: string
  // 悬停背景颜色。
  surfaceHover?: string
  // 毛玻璃反光高光边框。
  glassBorder?: string
}

// 主题特征色彩槽位接口。
export interface ThemeColorSlot {
  // 槽位唯一标识。
  id: string
  // 槽位显示名称。
  name: string
  // 浅色默认色值。
  defaultLight: string
  // 深色默认色值。
  defaultDark: string
  // 语义角色映射。
  role: 'accent' | 'secondary' | 'bg' | 'surface' | 'border'
}

// 主题元数据与几何排版定义结构。
export interface ThemeDefinition {
  // 唯一标识。
  id: string
  // 显示名称。
  name: string
  // 风格分类。
  category: ThemeCategory
  // 简短描述。
  description: string
  // 默认种子色。
  seed: string
  // 基础圆角半径。
  radius: number
  // 网格间隙。
  gap: number
  // 背景模糊半径。
  blur: number
  // 卡片不透明度。
  opacity: number
  // 专用字体族。
  fontFamily?: string
  // 阴影体系风格。
  shadowStyle?: 'soft' | 'hard' | 'glow' | 'clay' | 'paper'
  // 是否支持独立 UI 辅助色（不支持的主题在界面隐藏辅助色配置）。
  supportsAuxiliary?: boolean
  // 主题对外暴露的主题色槽位清单（数量不定）。
  colorSlots: ThemeColorSlot[]
  // 浅色模式颜色方案。
  light: ThemeModeColors
  // 深色模式颜色方案。
  dark: ThemeModeColors
}

// 二十套官方预设主题配置清单。
export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id: 'modern', name: '现代极简', category: '经典简约', description: '通透毛玻璃与柔和圆角阴影',
    seed: '#2563eb', radius: 18, gap: 16, blur: 16, opacity: 92, shadowStyle: 'soft', supportsAuxiliary: true,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (主色)', defaultLight: '#2563eb', defaultDark: '#3b82f6', role: 'accent' },
      { id: 'color2', name: '主题色 2 (背景底色)', defaultLight: '#f8fafc', defaultDark: '#0b0f19', role: 'bg' },
      { id: 'color3', name: '主题色 3 (卡片表面)', defaultLight: '#ffffff', defaultDark: '#111827', role: 'surface' },
    ],
    light: { bg: '#f8fafc', surface: '#ffffff', text: '#0f172a', textSecondary: '#64748b', accent: '#2563eb', border: '#e2e8f0' },
    dark: { bg: '#0b0f19', surface: '#111827', text: '#f8fafc', textSecondary: '#9ca3af', accent: '#3b82f6', border: '#374151' },
  },
  {
    id: 'pixel', name: '复古像素', category: '极客硬核', description: '8-bit 像素硬边与等宽字符',
    seed: '#2b59c3', radius: 2, gap: 12, blur: 0, opacity: 100, shadowStyle: 'hard', supportsAuxiliary: true,
    fontFamily: '"Courier New", monospace, system-ui, sans-serif',
    colorSlots: [
      { id: 'color1', name: '主题色 1 (像素主色)', defaultLight: '#2b59c3', defaultDark: '#6385ff', role: 'accent' },
      { id: 'color2', name: '主题色 2 (硬边描边)', defaultLight: '#222222', defaultDark: '#444444', role: 'border' },
      { id: 'color3', name: '主题色 3 (怀旧底色)', defaultLight: '#f0f0e8', defaultDark: '#141419', role: 'bg' },
    ],
    light: { bg: '#f0f0e8', surface: '#ffffff', text: '#1a1a1a', textSecondary: '#555555', accent: '#2b59c3', border: '#222222' },
    dark: { bg: '#141419', surface: '#1f1f28', text: '#e6e6e6', textSecondary: '#999999', accent: '#6385ff', border: '#444444' },
  },
  {
    id: 'dracula', name: '德古拉', category: '流行暗黑', description: '经典吸血鬼冷夜与荧光紫粉高亮',
    seed: '#bd93f9', radius: 14, gap: 16, blur: 14, opacity: 92, shadowStyle: 'soft', supportsAuxiliary: true,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (德古拉紫)', defaultLight: '#7c3aed', defaultDark: '#bd93f9', role: 'accent' },
      { id: 'color2', name: '主题色 2 (暗夜底色)', defaultLight: '#f8f8f2', defaultDark: '#1e1f29', role: 'bg' },
      { id: 'color3', name: '主题色 3 (荧光粉光)', defaultLight: '#d6d8e0', defaultDark: '#ff79c6', role: 'secondary' },
    ],
    light: { bg: '#f8f8f2', surface: '#ffffff', text: '#282a36', textSecondary: '#59658e', accent: '#7c3aed', border: '#d6d8e0' },
    dark: { bg: '#1e1f29', surface: '#282a36', text: '#f8f8f2', textSecondary: '#a4b1d6', accent: '#bd93f9', border: '#44475a' },
  },
  {
    id: 'nord', name: '北欧极光', category: '流行暗黑', description: '极地霜雪蓝灰与冷冽专注',
    seed: '#88c0d0', radius: 12, gap: 16, blur: 12, opacity: 94, shadowStyle: 'soft', supportsAuxiliary: true,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (极光霜蓝)', defaultLight: '#4c749f', defaultDark: '#88c0d0', role: 'accent' },
      { id: 'color2', name: '主题色 2 (极地夜幕)', defaultLight: '#eceff4', defaultDark: '#242933', role: 'bg' },
      { id: 'color3', name: '主题色 3 (冰霜描边)', defaultLight: '#d8dee9', defaultDark: '#434c5e', role: 'border' },
    ],
    light: { bg: '#eceff4', surface: '#ffffff', text: '#2e3440', textSecondary: '#4c566a', accent: '#4c749f', border: '#d8dee9' },
    dark: { bg: '#242933', surface: '#2e3440', text: '#eceff4', textSecondary: '#d8dee9', accent: '#88c0d0', border: '#434c5e' },
  },
  {
    id: 'catppuccin', name: '猫咖柔彩', category: '流行暗黑', description: '温馨低饱和粉彩马卡龙与舒适大圆角',
    seed: '#cba6f7', radius: 16, gap: 16, blur: 14, opacity: 92, shadowStyle: 'soft', supportsAuxiliary: true,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (柔彩薰衣紫)', defaultLight: '#8839ef', defaultDark: '#cba6f7', role: 'accent' },
      { id: 'color2', name: '主题色 2 (马卡龙粉)', defaultLight: '#ea76cb', defaultDark: '#f5c2e7', role: 'secondary' },
      { id: 'color3', name: '主题色 3 (咖啡底色)', defaultLight: '#eff1f5', defaultDark: '#181825', role: 'bg' },
    ],
    light: { bg: '#eff1f5', surface: '#ffffff', text: '#4c4f69', textSecondary: '#6c6f85', accent: '#8839ef', border: '#ccd0da' },
    dark: { bg: '#181825', surface: '#1e1e2e', text: '#cdd6f4', textSecondary: '#a6adc8', accent: '#cba6f7', border: '#313244' },
  },
  {
    id: 'gruvbox', name: '复古暖棕', category: '极客硬核', description: '复古大地色系与怀旧暖金光源',
    seed: '#fabd2f', radius: 10, gap: 14, blur: 8, opacity: 95, shadowStyle: 'soft', supportsAuxiliary: true,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (暖金光源)', defaultLight: '#af3a03', defaultDark: '#fabd2f', role: 'accent' },
      { id: 'color2', name: '主题色 2 (大地棕底)', defaultLight: '#fbf1c7', defaultDark: '#1d2021', role: 'bg' },
      { id: 'color3', name: '主题色 3 (暖木边框)', defaultLight: '#d5c4a1', defaultDark: '#504945', role: 'border' },
    ],
    light: { bg: '#fbf1c7', surface: '#f2e5bc', text: '#282828', textSecondary: '#504945', accent: '#af3a03', border: '#d5c4a1' },
    dark: { bg: '#1d2021', surface: '#282828', text: '#ebdbb2', textSecondary: '#bdae93', accent: '#fabd2f', border: '#504945' },
  },
  {
    id: 'tokyo-night', name: '东京之夜', category: '流行暗黑', description: '赛博夜幕与霓虹冰蓝繁华光泽',
    seed: '#7aa2f7', radius: 14, gap: 16, blur: 14, opacity: 90, shadowStyle: 'glow', supportsAuxiliary: true,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (东京霓蓝)', defaultLight: '#2e5cc8', defaultDark: '#7aa2f7', role: 'accent' },
      { id: 'color2', name: '主题色 2 (繁华亮紫)', defaultLight: '#7aa2f7', defaultDark: '#bb9af7', role: 'secondary' },
      { id: 'color3', name: '主题色 3 (夜幕深空)', defaultLight: '#e1e2e7', defaultDark: '#16161e', role: 'bg' },
    ],
    light: { bg: '#e1e2e7', surface: '#f0f1f4', text: '#2e3a59', textSecondary: '#565f89', accent: '#2e5cc8', border: '#c4c8da' },
    dark: { bg: '#16161e', surface: '#1a1b26', text: '#c0caf5', textSecondary: '#9aa5ce', accent: '#7aa2f7', border: '#292e42' },
  },
  {
    id: 'rose-pine', name: '玫瑰松木', category: '流行暗黑', description: '温润松林绿意与优雅干花玫瑰粉',
    seed: '#ebbcba', radius: 14, gap: 16, blur: 12, opacity: 92, shadowStyle: 'soft', supportsAuxiliary: true,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (干花玫瑰)', defaultLight: '#b4637a', defaultDark: '#ebbcba', role: 'accent' },
      { id: 'color2', name: '主题色 2 (苍松冷绿)', defaultLight: '#286983', defaultDark: '#31748f', role: 'secondary' },
      { id: 'color3', name: '主题色 3 (松木温底)', defaultLight: '#faf4ed', defaultDark: '#191724', role: 'bg' },
    ],
    light: { bg: '#faf4ed', surface: '#fffaf3', text: '#575279', textSecondary: '#706b88', accent: '#b4637a', border: '#cecacd' },
    dark: { bg: '#191724', surface: '#1f1d2e', text: '#e0def4', textSecondary: '#908caa', accent: '#ebbcba', border: '#393552' },
  },
  {
    id: 'solarized', name: '日晒光谱', category: '经典简约', description: '色彩实验室精密冷暖平衡设计',
    seed: '#2aa198', radius: 10, gap: 14, blur: 6, opacity: 96, shadowStyle: 'soft', supportsAuxiliary: false,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (晴空蔚蓝)', defaultLight: '#268bd2', defaultDark: '#2aa198', role: 'accent' },
      { id: 'color2', name: '主题色 2 (实验室青)', defaultLight: '#2aa198', defaultDark: '#268bd2', role: 'secondary' },
      { id: 'color3', name: '主题色 3 (日晒光谱底)', defaultLight: '#fdf6e3', defaultDark: '#002b36', role: 'bg' },
    ],
    light: { bg: '#fdf6e3', surface: '#eee8d5', text: '#073642', textSecondary: '#495e65', accent: '#268bd2', border: '#d6ccb2' },
    dark: { bg: '#002b36', surface: '#073642', text: '#93a1a1', textSecondary: '#93a1a1', accent: '#2aa198', border: '#001e26' },
  },
  {
    id: 'cyberpunk', name: '赛博朋克', category: '极客硬核', description: '高饱和电光青与热粉霓虹撞色',
    seed: '#05d9e8', radius: 4, gap: 14, blur: 0, opacity: 90, shadowStyle: 'glow', supportsAuxiliary: false,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (霓虹电青)', defaultLight: '#05d9e8', defaultDark: '#05d9e8', role: 'border' },
      { id: 'color2', name: '主题色 2 (荧光热粉)', defaultLight: '#e11d48', defaultDark: '#ff2a6d', role: 'accent' },
      { id: 'color3', name: '主题色 3 (赛博深空)', defaultLight: '#f7f4e9', defaultDark: '#050518', role: 'bg' },
    ],
    light: { bg: '#f7f4e9', surface: '#ffffff', text: '#09090b', textSecondary: '#52525b', accent: '#e11d48', border: '#f43f5e' },
    dark: { bg: '#050518', surface: '#0a0b26', text: '#d1f7ff', textSecondary: '#00c4d4', accent: '#ff2a6d', border: '#05d9e8' },
  },
  {
    id: 'matrix', name: '黑客帝国', category: '极客硬核', description: '纯黑终端底色与荧光磷绿代码流',
    seed: '#00ff66', radius: 2, gap: 12, blur: 0, opacity: 98, shadowStyle: 'glow', supportsAuxiliary: false,
    fontFamily: '"Courier New", monospace, system-ui, sans-serif',
    colorSlots: [
      { id: 'color1', name: '主题色 1 (荧光代码绿)', defaultLight: '#15803d', defaultDark: '#00ff66', role: 'accent' },
      { id: 'color2', name: '主题色 2 (暗夜代码底)', defaultLight: '#f0fdf4', defaultDark: '#020702', role: 'bg' },
    ],
    light: { bg: "#f0fdf4", surface: "#ffffff", text: "#14532d", textSecondary: "#166534", accent: "#15803d", border: "#86efac" },
    dark: { bg: "#020702", surface: "#041206", text: "#22c55e", textSecondary: "#22c55e", accent: "#00ff66", border: "#054015" },
  },
  {
    id: 'brutalist', name: '新丑野蛮', category: '艺术光影', description: '粗黑描边高对比与纯硬角偏移投影',
    seed: '#facc15', radius: 0, gap: 14, blur: 0, opacity: 100, shadowStyle: 'hard', supportsAuxiliary: false,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (冲击亮黄)', defaultLight: '#d97706', defaultDark: '#fbbf24', role: 'accent' },
      { id: 'color2', name: '主题色 2 (粗黑描边)', defaultLight: '#000000', defaultDark: '#ffffff', role: 'border' },
      { id: 'color3', name: '主题色 3 (粗糙底色)', defaultLight: '#fefce8', defaultDark: '#0f0f11', role: 'bg' },
    ],
    light: { bg: '#fefce8', surface: '#ffffff', text: '#000000', textSecondary: '#262626', accent: '#d97706', border: '#000000' },
    dark: { bg: '#0f0f11', surface: '#18181b', text: '#ffffff', textSecondary: '#d4d4d8', accent: '#fbbf24', border: '#ffffff' },
  },
  {
    id: 'glass', name: '通透玻璃', category: '经典简约', description: '超高折射磨砂水晶玻璃与悬浮感',
    seed: '#818cf8', radius: 20, gap: 18, blur: 24, opacity: 68, shadowStyle: 'soft', supportsAuxiliary: true,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (水晶紫青)', defaultLight: '#6366f1', defaultDark: '#818cf8', role: 'accent' },
      { id: 'color2', name: '主题色 2 (通透冰底)', defaultLight: '#ede9fe', defaultDark: '#090317', role: 'bg' },
    ],
    light: { bg: '#ede9fe', surface: '#ffffff', text: '#1e1b4b', textSecondary: '#4338ca', accent: '#6366f1', border: '#c7d2fe' },
    dark: { bg: '#090317', surface: '#160d33', text: '#e0e7ff', textSecondary: '#a5b4fc', accent: '#818cf8', border: '#2c1e59' },
  },
  {
    id: 'parchment', name: '羊皮古卷', category: '艺术光影', description: '复古羊皮古籍纸张与雅致衬线字体',
    seed: '#8b2c2c', radius: 4, gap: 16, blur: 0, opacity: 96, shadowStyle: 'paper', supportsAuxiliary: false,
    fontFamily: 'Georgia, "Noto Serif SC", "Songti SC", serif',
    colorSlots: [
      { id: 'color1', name: '主题色 1 (古籍朱砂)', defaultLight: '#8b2c2c', defaultDark: '#d97777', role: 'accent' },
      { id: 'color2', name: '主题色 2 (羊皮古纸)', defaultLight: '#f5efdc', defaultDark: '#1f1a17', role: 'bg' },
    ],
    light: { bg: '#f5efdc', surface: '#fafaf5', text: '#2a2420', textSecondary: '#5c5348', accent: '#8b2c2c', border: '#d4c9a6' },
    dark: { bg: '#1f1a17', surface: '#28221e', text: '#e8dfc4', textSecondary: '#a89b88', accent: '#d97777', border: '#443a33' },
  },
  {
    id: 'aurora', name: '极光之境', category: '艺术光影', description: '夜幕苍穹翡翠流光与幻彩青绿',
    seed: '#2dd4bf', radius: 14, gap: 16, blur: 16, opacity: 88, shadowStyle: 'glow', supportsAuxiliary: true,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (幻彩青绿)', defaultLight: '#0d9488', defaultDark: '#2dd4bf', role: 'accent' },
      { id: 'color2', name: '主题色 2 (夜幕苍穹)', defaultLight: '#f0fdfa', defaultDark: '#04151a', role: 'bg' },
    ],
    light: { bg: '#f0fdfa', surface: '#ffffff', text: '#134e4a', textSecondary: '#0f766e', accent: '#0d9488', border: '#99f6e4' },
    dark: { bg: '#04151a', surface: '#08232c', text: '#f0fdfa', textSecondary: '#5eead4', accent: '#2dd4bf', border: '#134e4a' },
  },
  {
    id: 'cherry-blossom', name: '春日落樱', category: '艺术光影', description: '春日落樱粉白花瓣与温润柔美弧度',
    seed: '#fb7185', radius: 18, gap: 16, blur: 14, opacity: 92, shadowStyle: 'soft', supportsAuxiliary: true,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (落樱绯红)', defaultLight: '#e11d48', defaultDark: '#fb7185', role: 'accent' },
      { id: 'color2', name: '主题色 2 (柔粉底色)', defaultLight: '#fff5f7', defaultDark: '#201217', role: 'bg' },
    ],
    light: { bg: '#fff5f7', surface: '#ffffff', text: '#4c0519', textSecondary: '#881337', accent: '#e11d48', border: '#fecdd3' },
    dark: { bg: '#201217', surface: '#2d1a21', text: '#ffe4e6', textSecondary: '#fda4af', accent: '#fb7185', border: '#4c1d29' },
  },
  {
    id: 'midnight', name: '幽邃午夜', category: '流行暗黑', description: '远洋深渊深蓝与星辰天青指引',
    seed: '#38bdf8', radius: 14, gap: 16, blur: 14, opacity: 90, shadowStyle: 'soft', supportsAuxiliary: true,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (天青星芒)', defaultLight: '#2563eb', defaultDark: '#38bdf8', role: 'accent' },
      { id: 'color2', name: '主题色 2 (远洋深渊)', defaultLight: '#eff6ff', defaultDark: '#060b18', role: 'bg' },
    ],
    light: { bg: '#eff6ff', surface: '#ffffff', text: '#172554', textSecondary: '#1e40af', accent: '#2563eb', border: '#bfdbfe' },
    dark: { bg: '#060b18', surface: '#0b1329', text: '#f0f9ff', textSecondary: '#93c5fd', accent: '#38bdf8', border: '#1e293b' },
  },
  {
    id: 'zinc', name: '极简冷灰', category: '经典简约', description: '工业极简灰度与纯粹克制秩序',
    seed: '#71717a', radius: 10, gap: 14, blur: 10, opacity: 95, shadowStyle: 'soft', supportsAuxiliary: true,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (工业冷灰)', defaultLight: '#18181b', defaultDark: '#fafafa', role: 'accent' },
      { id: 'color2', name: '主题色 2 (极简灰底)', defaultLight: '#f4f4f5', defaultDark: '#09090b', role: 'bg' },
    ],
    light: { bg: '#f4f4f5', surface: '#ffffff', text: '#18181b', textSecondary: '#52525b', accent: '#18181b', border: '#e4e4e7' },
    dark: { bg: '#09090b', surface: '#18181b', text: '#f4f4f5', textSecondary: '#a1a1aa', accent: '#fafafa', border: '#3f3f46' },
  },
  {
    id: 'sunset', name: '落日晚霞', category: '艺术光影', description: '余晖暮色地平线暖橙与落霞融金',
    seed: '#f97316', radius: 16, gap: 16, blur: 14, opacity: 92, shadowStyle: 'soft', supportsAuxiliary: true,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (余晖暮橙)', defaultLight: '#c2410c', defaultDark: '#f97316', role: 'accent' },
      { id: 'color2', name: '主题色 2 (落霞融金)', defaultLight: '#fff7ed', defaultDark: '#1c0d08', role: 'bg' },
    ],
    light: { bg: '#fff7ed', surface: '#ffffff', text: '#431407', textSecondary: '#7c2d12', accent: '#c2410c', border: '#fed7aa' },
    dark: { bg: '#1c0d08', surface: '#29150e', text: '#ffedd5', textSecondary: '#fdba74', accent: '#f97316', border: '#431f13' },
  },
  {
    id: 'claymorphism', name: '粘土新拟', category: '经典简约', description: '丰盈可爱软糯粘土与双重立体阴影',
    seed: '#6366f1', radius: 22, gap: 18, blur: 8, opacity: 96, shadowStyle: 'clay', supportsAuxiliary: true,
    colorSlots: [
      { id: 'color1', name: '主题色 1 (软萌靛青)', defaultLight: '#4f46e5', defaultDark: '#818cf8', role: 'accent' },
      { id: 'color2', name: '主题色 2 (粘土暖灰)', defaultLight: '#eef2f6', defaultDark: '#181e28', role: 'bg' },
    ],
    light: { bg: '#eef2f6', surface: '#ffffff', text: '#1e293b', textSecondary: '#475569', accent: '#4f46e5', border: '#dbe2ea' },
    dark: { bg: '#181e28', surface: '#212836', text: '#f1f5f9', textSecondary: '#94a3b8', accent: '#818cf8', border: '#2e384d' },
  },
]

// 构造指定主题定义在单模下的全套 CSS 变量。
export function buildTokensFromDefinition(def: ThemeDefinition, dark: boolean): Record<string, string> {
  const mode = dark ? def.dark : def.light
  const isPixel = def.id === 'pixel'
  const isBrutalist = def.id === 'brutalist'
  const accent = mode.accent
  const accentText = contrast(accent, '#ffffff') >= 4.5 ? '#ffffff' : '#000000'
  const radius = isPixel ? 2 : isBrutalist ? 0 : def.radius

  // 构建阴影梯度体系。
  let shadowSm = '0 2px 6px -1px rgba(0, 0, 0, 0.05), 0 1px 4px -1px rgba(0, 0, 0, 0.03)'
  let shadowCard = dark
    ? '0 12px 32px -4px rgba(0, 0, 0, 0.35), 0 4px 12px -2px rgba(0, 0, 0, 0.2)'
    : '0 10px 30px -4px rgba(0, 0, 0, 0.06), 0 4px 12px -2px rgba(0, 0, 0, 0.03)'
  let shadowHover = dark
    ? '0 18px 40px -6px rgba(0, 0, 0, 0.45), 0 8px 18px -2px rgba(0, 0, 0, 0.25)'
    : '0 16px 36px -6px rgba(0, 0, 0, 0.1), 0 6px 16px -2px rgba(0, 0, 0, 0.04)'
  let shadowDropdown = dark
    ? '0 24px 52px -8px rgba(0, 0, 0, 0.5), 0 10px 24px -4px rgba(0, 0, 0, 0.3)'
    : '0 20px 48px -8px rgba(0, 0, 0, 0.12), 0 8px 20px -4px rgba(0, 0, 0, 0.05)'

  if (def.shadowStyle === 'hard') {
    shadowSm = `2px 2px 0 ${mode.border}`
    shadowCard = `3px 3px 0 ${mode.border}`
    shadowHover = `4px 4px 0 ${accent}`
    shadowDropdown = `4px 4px 0 ${mode.border}`
  } else if (def.shadowStyle === 'glow') {
    shadowSm = `0 0 6px color-mix(in srgb, ${accent} 20%, transparent)`
    shadowCard = `0 0 12px color-mix(in srgb, ${accent} 22%, transparent), 0 4px 16px rgba(0, 0, 0, 0.35)`
    shadowHover = `0 0 20px color-mix(in srgb, ${accent} 45%, transparent), 0 8px 24px rgba(0, 0, 0, 0.45)`
    shadowDropdown = `0 0 24px color-mix(in srgb, ${accent} 35%, transparent), 0 16px 36px rgba(0, 0, 0, 0.5)`
  } else if (def.shadowStyle === 'clay') {
    shadowSm = dark
      ? 'inset -2px -2px 4px rgba(0, 0, 0, 0.3), inset 2px 2px 4px rgba(255, 255, 255, 0.06), 4px 4px 10px rgba(0, 0, 0, 0.3)'
      : 'inset -2px -2px 4px rgba(0, 0, 0, 0.04), inset 2px 2px 4px rgba(255, 255, 255, 0.6), 4px 4px 12px rgba(163, 177, 198, 0.3)'
    shadowCard = dark
      ? 'inset -3px -3px 6px rgba(0, 0, 0, 0.35), inset 3px 3px 6px rgba(255, 255, 255, 0.08), 8px 8px 20px rgba(0, 0, 0, 0.45)'
      : 'inset -3px -3px 6px rgba(0, 0, 0, 0.05), inset 3px 3px 6px rgba(255, 255, 255, 0.8), 8px 8px 20px rgba(163, 177, 198, 0.35)'
    shadowHover = dark
      ? 'inset -3px -3px 6px rgba(0, 0, 0, 0.4), inset 3px 3px 6px rgba(255, 255, 255, 0.12), 12px 12px 28px rgba(0, 0, 0, 0.55)'
      : 'inset -3px -3px 6px rgba(0, 0, 0, 0.06), inset 3px 3px 6px rgba(255, 255, 255, 0.9), 12px 12px 28px rgba(163, 177, 198, 0.45)'
    shadowDropdown = dark
      ? '10px 18px 40px rgba(0, 0, 0, 0.6)'
      : '10px 18px 40px rgba(163, 177, 198, 0.45)'
  } else if (def.shadowStyle === 'paper') {
    shadowSm = '0 1px 3px rgba(42, 36, 32, 0.08)'
    shadowCard = '0 3px 10px rgba(42, 36, 32, 0.08), 0 1px 3px rgba(42, 36, 32, 0.05)'
    shadowHover = '0 6px 18px rgba(42, 36, 32, 0.14)'
    shadowDropdown = '0 12px 28px rgba(42, 36, 32, 0.18)'
  }

  const blurVal = (isPixel || isBrutalist) ? 0 : def.blur
  const danger = isBrutalist ? '#ff1744' : (dark ? '#f87171' : '#dc2626')
  const dangerText = contrast(danger, '#ffffff') >= 4.5 ? '#ffffff' : '#000000'
  const success = dark ? (def.id === 'matrix' ? '#00ff66' : '#4ade80') : '#15803d'
  const successText = contrast(success, '#ffffff') >= 4.5 ? '#ffffff' : '#000000'

  const tokens: Record<string, string> = {
    '--lh-bg': mode.bg,
    '--lh-surface': mode.surface,
    '--lh-surface-hover': mode.surfaceHover ?? (dark ? '#27272a' : '#f4f4f5'),
    '--lh-surface-active': mode.border,
    '--lh-input-bg': mode.surface,
    '--lh-input-border': mode.border,
    '--lh-text': mode.text,
    '--lh-text-secondary': mode.textSecondary,
    '--lh-text-muted': mode.textSecondary,
    '--lh-accent': accent,
    '--lh-accent-hover': accent,
    '--lh-accent-text': accentText,
    '--lh-auxiliary': accent,
    '--lh-auxiliary-hover': accent,
    '--lh-auxiliary-text': accentText,
    '--lh-border': mode.border,
    '--lh-border-hover': mode.textSecondary,
    '--lh-font-family': def.fontFamily ?? '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    '--lh-radius-lg': radius + 'px',
    '--lh-radius-md': (isPixel ? 2 : isBrutalist ? 0 : Math.round(radius * 0.65)) + 'px',
    '--lh-radius-sm': (isPixel ? 0 : isBrutalist ? 0 : Math.round(radius * 0.4)) + 'px',
    '--lh-radius-full': (isPixel ? '2px' : isBrutalist ? '0px' : '9999px'),
    '--lh-shadow-sm': shadowSm,
    '--lh-shadow-card': shadowCard,
    '--lh-shadow-hover': shadowHover,
    '--lh-shadow-dropdown': shadowDropdown,
    '--lh-glass-border': (isPixel || isBrutalist) ? mode.border : (mode.glassBorder ?? (dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.65)')),
    '--lh-glass-bg': (isPixel || isBrutalist) ? mode.surface : (dark ? 'rgba(30, 30, 34, 0.72)' : 'rgba(255, 255, 255, 0.72)'),
    '--lh-blur': blurVal + 'px',
    '--lh-danger': danger,
    '--lh-danger-hover': dark ? '#ef4444' : '#b91c1c',
    '--lh-danger-bg': isBrutalist ? (dark ? 'rgba(239, 68, 68, 0.25)' : '#fee2e2') : (dark ? 'rgba(239, 68, 68, 0.16)' : 'rgba(220, 38, 38, 0.08)'),
    '--lh-danger-border': isBrutalist ? mode.border : (dark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(220, 38, 38, 0.25)'),
    '--lh-danger-text': dangerText,
    '--lh-success': success,
    '--lh-success-hover': dark ? '#22c55e' : '#166534',
    '--lh-success-bg': isBrutalist ? (dark ? 'rgba(34, 197, 94, 0.25)' : '#dcfce7') : (dark ? 'rgba(34, 197, 94, 0.16)' : 'rgba(21, 128, 61, 0.08)'),
    '--lh-success-border': isBrutalist ? mode.border : (dark ? 'rgba(34, 197, 94, 0.35)' : 'rgba(21, 128, 61, 0.25)'),
    '--lh-success-text': successText,
    '--lh-warning': dark ? '#fbbf24' : '#d97706',
    '--lh-warning-hover': dark ? '#f59e0b' : '#b45309',
    '--lh-warning-bg': isBrutalist ? (dark ? 'rgba(245, 158, 11, 0.25)' : '#fef3c7') : (dark ? 'rgba(245, 158, 11, 0.16)' : 'rgba(217, 119, 6, 0.1)'),
    '--lh-warning-border': isBrutalist ? mode.border : (dark ? 'rgba(245, 158, 11, 0.35)' : 'rgba(217, 119, 6, 0.28)'),
    '--lh-warning-text': dark ? '#fef3c7' : '#92400e',
  }
  for (const slot of def.colorSlots) {
    tokens[`--lh-theme-${slot.id}`] = dark ? slot.defaultDark : slot.defaultLight
  }
  return tokens
}
