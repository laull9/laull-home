// 串行保存只提交最新快照，失败停止队列并保留待保存状态。
export function createAutoSave<T>(read: () => T, write: (value: T) => Promise<void>, changed: (state: 'pending' | 'saving' | 'saved' | 'error', error?: unknown) => void, delay = 500) {
  let pending = false
  let running: Promise<boolean> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  // 同一时刻最多一次写入，响应期间的新修改进入下一轮。
  async function drain(): Promise<boolean> {
    while (pending) {
      pending = false
      changed('saving')
      try { await write(read()) }
      catch (error) { pending = true; changed('error', error); return false }
    }
    changed('saved')
    return true
  }
  // 离页和重试立即刷新，并复用正在执行的请求。
  function flush(): Promise<boolean> {
    clearTimeout(timer)
    if (!running) running = drain().finally(() => { running = undefined })
    return running
  }
  // 合并快速连续输入，防止每个按键触发网络请求。
  function schedule() {
    pending = true
    changed('pending')
    clearTimeout(timer)
    timer = setTimeout(() => { void flush() }, delay)
  }
  // 清理定时器，不取消已发出的请求。
  function dispose() { clearTimeout(timer) }
  // 主动重读后清除待保存草稿。
  function reset() { clearTimeout(timer); pending = false }
  return { schedule, flush, dispose, reset }
}
