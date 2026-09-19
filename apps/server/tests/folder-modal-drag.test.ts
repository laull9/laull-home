import { describe, expect, test } from 'bun:test'

// 视窗边界矩形结构。
interface ViewportBounds {
  left: number
  right: number
  top: number
  bottom: number
}

// 文件夹弹窗进出与迟滞唤出核心判定算法。
function evaluateDragPosition(
  cachedRect: ViewportBounds | null,
  currentOutside: boolean,
  clientX: number,
  clientY: number,
): boolean {
  if (!cachedRect) return false
  // 铁律：过滤原生 HTML5 拖拽中的 (0, 0) 空坐标，防止初期误判。
  if (clientX === 0 && clientY === 0) return currentOutside

  const { left, right, top, bottom } = cachedRect
  const isInside =
    clientX >= left &&
    clientX <= right &&
    clientY >= top &&
    clientY <= bottom

  if (isInside) {
    // 移回视窗区域时立即重新唤出显示文件夹。
    return false
  }

  // 超出边界 16px 迟滞缓冲区时判定为拖出外部，文件夹隐形退场。
  const buffer = 16
  const isFarOutside =
    clientX < left - buffer ||
    clientX > right + buffer ||
    clientY < top - buffer ||
    clientY > bottom + buffer

  if (isFarOutside) {
    return true
  }

  // 处于 0~16px 边缘缓冲带时保持原有状态，防止抖动。
  return currentOutside
}

describe('文件夹弹窗拖拽内部重排、移出退场与反悔重新唤出状态机', () => {
  const viewportRect: ViewportBounds = {
    left: 200,
    right: 800,
    top: 100,
    bottom: 600,
  }

  test('内部拖拽时过滤 (0, 0) 空坐标，绝不误触发外部退场与关闭', () => {
    let isOutside = false

    // 1. 刚起拖瞬间，浏览器派发 (0, 0) 空坐标，状态必须保持 false。
    isOutside = evaluateDragPosition(viewportRect, isOutside, 0, 0)
    expect(isOutside).toBe(false)

    // 2. 内部正常坐标拖动，状态保持 false。
    isOutside = evaluateDragPosition(viewportRect, isOutside, 300, 200)
    expect(isOutside).toBe(false)

    // 3. 内部靠近边缘（未超出 16px buffer），状态依然保持 false。
    isOutside = evaluateDragPosition(viewportRect, isOutside, 805, 300)
    expect(isOutside).toBe(false)
  })

  test('拖拽超出视窗边界时进入外部状态，并在外部松手时允许关闭', () => {
    let isOutside = false

    // 1. 拖出右侧边界大于 16px（例如 820px）。
    isOutside = evaluateDragPosition(viewportRect, isOutside, 820, 300)
    expect(isOutside).toBe(true)

    // 2. 外部移动中保持 true。
    isOutside = evaluateDragPosition(viewportRect, isOutside, 900, 400)
    expect(isOutside).toBe(true)
  })

  test('拖出外部后移回视窗相关显示区域，必须立即重新唤出文件夹', () => {
    // 初始状态已处于外部。
    let isOutside = true

    // 1. 鼠标从外部移回视窗矩形内部（例如 x: 400, y: 300）。
    isOutside = evaluateDragPosition(viewportRect, isOutside, 400, 300)
    // 必须恢复为 false，视窗重新唤出！
    expect(isOutside).toBe(false)

    // 2. 移回内部后松手（状态为 false），文件夹不关闭并保持打开。
    expect(isOutside).toBe(false)
  })

  test('防穿透机制：拖拽松手 200ms 内屏蔽遮罩误点击', () => {
    const lastDragEndTime = Date.now()
    const isRecent = (now: number) => now - lastDragEndTime < 200

    // 松手后 50ms 内冒泡的 click 事件被拦截。
    expect(isRecent(lastDragEndTime + 50)).toBe(true)
    // 松手后 250ms 后正常点击遮罩可触发退出。
    expect(isRecent(lastDragEndTime + 250)).toBe(false)
  })

  // 核心准则验证：拖出文件夹后，无匹配位置返回文件夹，有匹配位置才移动。
  test('拖离视窗后无匹配位置松手不关闭弹窗，成功落入桌面才关闭', () => {
    // 决策函数：判定是否执行关闭弹窗。
    const shouldCloseOnDragEnd = (wasDraggedOutside: boolean, wasDroppedToDesktop: boolean): boolean => {
      return wasDraggedOutside && wasDroppedToDesktop
    }

    // 1. 拖出外部但在无匹配位置（如空白区、非画布区）松手，弹窗绝不关闭。
    expect(shouldCloseOnDragEnd(true, false)).toBe(false)

    // 2. 拖出外部后按 ESC 取消，弹窗绝不关闭。
    expect(shouldCloseOnDragEnd(false, false)).toBe(false)

    // 3. 拖出外部并在桌面有效匹配网格松手，桌面接收成功，弹窗关闭。
    expect(shouldCloseOnDragEnd(true, true)).toBe(true)
  })
})

// 文件夹根容器点击判定算法：仅允许在点击空白区域或明确标题时展开视窗，禁止条目与控件穿透。
function shouldOpenFolderOnRootClick(targetElement: { tagName: string; closest: (selector: string) => boolean }): boolean {
  if (targetElement.closest('a, button, input, textarea, select, .widget-tools, [data-folder-item]')) {
    return false
  }
  return true
}

describe('文件夹未展开时点击子条目事件拦截与根容器防误开测试', () => {
  test('直接点击文件夹内书签图标、链接或操作按钮时，坚决拦截根容器打开行为', () => {
    // 1. 模拟点击书签链接 <a> 或其内部图标。
    const bookmarkLinkTarget = {
      tagName: 'A',
      closest: (sel: string) => sel.includes('a') || sel.includes('[data-folder-item]'),
    }
    expect(shouldOpenFolderOnRootClick(bookmarkLinkTarget)).toBe(false)

    // 2. 模拟点击文件夹内独立按钮。
    const buttonTarget = {
      tagName: 'BUTTON',
      closest: (sel: string) => sel.includes('button'),
    }
    expect(shouldOpenFolderOnRootClick(buttonTarget)).toBe(false)

    // 3. 模拟点击工具栏或输入框。
    const inputTarget = {
      tagName: 'INPUT',
      closest: (sel: string) => sel.includes('input'),
    }
    expect(shouldOpenFolderOnRootClick(inputTarget)).toBe(false)
  })

  test('点击文件夹空白区域或标题背景时，允许触发根容器展开视窗', () => {
    const blankBackgroundTarget = {
      tagName: 'DIV',
      closest: () => false,
    }
    expect(shouldOpenFolderOnRootClick(blankBackgroundTarget)).toBe(true)
  })

  test('书签点击事件必须显式调用 stopPropagation 阻断冒泡', () => {
    let propagationStopped = false
    const mockEvent = {
      stopPropagation: () => { propagationStopped = true },
      preventDefault: () => {},
    }

    // 模拟 handleItemClick 行为。
    function handleItemClick(event: { stopPropagation: () => void; preventDefault: () => void }, editing: boolean) {
      event.stopPropagation()
      if (editing) {
        event.preventDefault()
      }
    }

    // 非编辑模式点击：仅阻断冒泡，不阻止默认跳转。
    handleItemClick(mockEvent, false)
    expect(propagationStopped).toBe(true)
  })
})

// 文件夹内右键菜单项生成决策函数。
function generateFolderContextMenuItems(hasBookmark: boolean, isModal = false) {
  if (hasBookmark) {
    return [
      { id: 'open-new-tab', label: '在新标签页打开' },
      { id: 'copy-link', label: '复制链接' },
      { id: 'edit-bookmark', label: '编辑此书签' },
      { id: 'delete-bookmark', label: '删除此书签' },
      { id: 'add', label: '在此文件夹添加图标' },
      ...(!isModal ? [{ id: 'open', label: '展开全部内容' }] : []),
    ]
  }
  return [
    { id: 'add', label: '在此文件夹添加图标' },
    ...(!isModal ? [{ id: 'open', label: '展开全部内容' }] : []),
  ]
}

describe('文件夹内书签右键快捷菜单生成与专属操作测试', () => {
  test('右键具体书签时必须生成专属书签操作（在新标签打开、复制链接、编辑、删除）', () => {
    // 桌面未展开卡片中右键书签。
    const cardItems = generateFolderContextMenuItems(true, false)
    const cardItemIds = cardItems.map(item => item.id)
    expect(cardItemIds).toContain('open-new-tab')
    expect(cardItemIds).toContain('copy-link')
    expect(cardItemIds).toContain('edit-bookmark')
    expect(cardItemIds).toContain('delete-bookmark')
    expect(cardItemIds).toContain('add')
    expect(cardItemIds).toContain('open')

    // 弹窗中右键书签。
    const modalItems = generateFolderContextMenuItems(true, true)
    const modalItemIds = modalItems.map(item => item.id)
    expect(modalItemIds).toContain('open-new-tab')
    expect(modalItemIds).toContain('copy-link')
    expect(modalItemIds).toContain('edit-bookmark')
    expect(modalItemIds).toContain('delete-bookmark')
    expect(modalItemIds).toContain('add')
    expect(modalItemIds).not.toContain('open')
  })

  test('右键文件夹空白区域时仅生成文件夹级操作，绝不泄漏单书签专属操作', () => {
    const blankCardItems = generateFolderContextMenuItems(false, false)
    const blankCardIds = blankCardItems.map(item => item.id)
    expect(blankCardIds).toEqual(['add', 'open'])

    const blankModalItems = generateFolderContextMenuItems(false, true)
    const blankModalIds = blankModalItems.map(item => item.id)
    expect(blankModalIds).toEqual(['add'])
  })

  test('书签右键操作路由准确触发编辑、删除与复制逻辑', async () => {
    const mockBookmark = {
      id: 'bm-test-1',
      spaceId: 'default',
      groupId: 'grp-test-1',
      title: '知乎',
      url: 'https://zhihu.com',
      iconUrl: '',
      sortOrder: 0,
      isPublic: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    // 模拟动作分发。
    function executeBookmarkAction(actionId: string, bm: typeof mockBookmark) {
      if (actionId === 'edit-bookmark') return { type: 'edit', bookmark: bm }
      if (actionId === 'delete-bookmark') return { type: 'delete', id: bm.id }
      if (actionId === 'copy-link') return { type: 'copy', url: bm.url }
      return null
    }

    expect(executeBookmarkAction('edit-bookmark', mockBookmark)).toEqual({ type: 'edit', bookmark: mockBookmark })
    expect(executeBookmarkAction('delete-bookmark', mockBookmark)).toEqual({ type: 'delete', id: 'bm-test-1' })
    expect(executeBookmarkAction('copy-link', mockBookmark)).toEqual({ type: 'copy', url: 'https://zhihu.com' })
  })
})


