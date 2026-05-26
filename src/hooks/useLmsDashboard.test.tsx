import { act, renderHook, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLmsDashboard } from './useLmsDashboard'
import { getLmsOverview, getLmsStatus } from '../lib/lmsDashboard'

vi.mock('../lib/lmsDashboard', async () => {
  const actual = await vi.importActual<typeof import('../lib/lmsDashboard')>('../lib/lmsDashboard')
  return {
    ...actual,
    getLmsStatus: vi.fn(),
    getLmsOverview: vi.fn(),
    loginLms: vi.fn(),
    clearLmsSession: vi.fn(),
  }
})

vi.mock('../lib/productAnalytics', () => ({
  trackLmsDashboardRefreshTriggered: vi.fn(),
  trackLmsDashboardRefreshCompleted: vi.fn(),
  trackLmsDashboardRefreshFailed: vi.fn(),
  trackLmsSessionCleared: vi.fn(),
}))

const mockStatus = vi.mocked(getLmsStatus)
const mockOverview = vi.mocked(getLmsOverview)

beforeEach(() => {
  vi.clearAllMocks()
  mockStatus.mockResolvedValue({
    credential_state: 'ready',
    credential_message: '한성 e-class 세션이 준비되었습니다.',
    read_only: true,
    session_clear_available: true,
  })
  mockOverview.mockResolvedValue({
    read_only: true,
    summary: { course_count: 0, assignment_count: 0, capped_course_count: 0, capped_assignment_count: 0 },
    courses: [],
    assignments: [],
  })
})

describe('useLmsDashboard', () => {
  it('fetches on open and does not implement interval or timeout polling', async () => {
    const { result } = renderHook(() => useLmsDashboard())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockStatus).toHaveBeenCalledTimes(1)
    expect(mockOverview).toHaveBeenCalledTimes(1)

    const source = readFileSync('src/hooks/useLmsDashboard.ts', 'utf8')
    expect(source).not.toContain('setInterval(')
    expect(source).not.toContain('setTimeout(')
  })

  it('supports explicit manual refresh without leaking assignment details to analytics inputs', async () => {
    const { result } = renderHook(() => useLmsDashboard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.refresh('manual')
    })

    expect(mockStatus).toHaveBeenCalledTimes(2)
    expect(mockOverview).toHaveBeenCalledTimes(2)
  })
})
