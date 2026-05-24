import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockInvokeFn = vi.fn()

vi.mock('../mock-tauri', () => ({
  isTauri: () => false,
  mockInvoke: (...args: unknown[]) => mockInvokeFn(...args),
}))

vi.mock('../utils/vault-dialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/vault-dialog')>()
  return {
    ...actual,
    pickFolder: vi.fn(),
  }
})

import { pickFolder } from '../utils/vault-dialog'
import { useGettingStartedClone } from './useGettingStartedClone'

describe('useGettingStartedClone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when the folder picker is cancelled', async () => {
    vi.mocked(pickFolder).mockResolvedValue(null)

    const onSuccess = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() => useGettingStartedClone({ onError, onSuccess }))

    await act(async () => {
      await result.current()
    })

    expect(mockInvokeFn).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('clones into a child 시작 가이드 folder and reports the canonical path', async () => {
    vi.mocked(pickFolder).mockResolvedValue('/Users/luca/Documents')
    mockInvokeFn.mockResolvedValue('/Users/luca/Documents/시작 가이드')

    const onSuccess = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() => useGettingStartedClone({ onError, onSuccess }))

    await act(async () => {
      await result.current()
    })

    expect(mockInvokeFn).toHaveBeenCalledWith('create_getting_started_vault', {
      targetPath: '/Users/luca/Documents/시작 가이드',
    })
    expect(onSuccess).toHaveBeenCalledWith('/Users/luca/Documents/시작 가이드', '시작 가이드')
    expect(onError).not.toHaveBeenCalled()
  })

  it('surfaces a friendly message for download failures', async () => {
    vi.mocked(pickFolder).mockResolvedValue('/Users/luca/Documents')
    mockInvokeFn.mockRejectedValue('git clone failed: fatal: unable to access')

    const onSuccess = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() => useGettingStartedClone({ onError, onSuccess }))

    await act(async () => {
      await result.current()
    })

    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('시작 가이드 볼트를 다운로드할 수 없습니다: git clone failed: fatal: unable to access')
  })

})
