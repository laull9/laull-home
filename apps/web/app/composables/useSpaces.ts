import type { SpaceItem } from '@laull-home/shared'

// 空间状态与短期授权管理。
export function useSpaces() {
  const spaces = useState<SpaceItem[]>('spaces:list', () => [])
  const activeSpaceId = useState<string>('spaces:active', () => 'default')
  const { $api } = useNuxtApp()

  // 读取所有空间及其解锁状态。
  async function fetchSpaces() {
    const result = await $api.spaces.get()
    if (result.error) throw new Error('读取空间列表失败')
    spaces.value = result.data.spaces
    return spaces.value
  }

  // 为隐私空间设置独立密码。
  async function setupPrivacyPassword(password: string) {
    if (import.meta.server) throw new Error('操作需要在浏览器执行')
    const result = await $api.spaces.privacy.setup.post({ password })
    if (result.error) throw new Error(result.error.value?.message ?? '设置密码失败')
    await fetchSpaces()
  }

  // 输入独立密码解锁隐私空间。
  async function unlockPrivacySpace(password: string) {
    if (import.meta.server) throw new Error('操作需要在浏览器执行')
    const result = await $api.spaces.privacy.unlock.post({ password })
    if (result.error) throw new Error(result.error.value?.message ?? '密码错误或解锁失败')
    await fetchSpaces()
  }

  // 主动锁定隐私空间，撤销短期授权。
  async function lockPrivacySpace() {
    if (import.meta.server) throw new Error('操作需要在浏览器执行')
    const result = await $api.spaces.privacy.lock.post()
    if (result.error) throw new Error('锁定隐私空间失败')
    await fetchSpaces()
    if (activeSpaceId.value === 'privacy') activeSpaceId.value = 'default'
  }

  return {
    spaces: readonly(spaces),
    activeSpaceId,
    fetchSpaces,
    setupPrivacyPassword,
    unlockPrivacySpace,
    lockPrivacySpace,
  }
}
