import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LmsDashboardPage } from './LmsDashboardPage'
import { useLmsDashboard, type UseLmsDashboardResult } from '../hooks/useLmsDashboard'
import { openExternalUrl } from '../utils/url'

vi.mock('../hooks/useLmsDashboard', () => ({
  useLmsDashboard: vi.fn(),
}))

vi.mock('../utils/url', () => ({
  openExternalUrl: vi.fn(),
}))

vi.mock('../lib/productAnalytics', () => ({
  trackLmsDashboardOpened: vi.fn(),
  trackLmsOriginalOpened: vi.fn(),
}))

const mockUseLmsDashboard = vi.mocked(useLmsDashboard)
const mockOpenExternalUrl = vi.mocked(openExternalUrl)

function readyState(overrides: Partial<UseLmsDashboardResult> = {}): UseLmsDashboardResult {
  return {
    loading: false,
    refreshing: false,
    credentialState: 'ready',
    status: {
      credential_state: 'ready',
      credential_message: '한성 e-class 세션이 준비되었습니다.',
      read_only: true,
      session_clear_available: true,
      student_id_masked: '21***68',
    },
    overview: {
      read_only: true,
      summary: { course_count: 1, assignment_count: 3, capped_course_count: 1, capped_assignment_count: 3 },
      courses: [],
      assignments: [
        { assignment_id: 'today', course_id: 'c1', course_name: '소프트웨어공학', name: '오늘 마감 과제', url: 'https://learn.hansung.ac.kr/mod/assign/view.php?id=1', due_text: '2026-05-26', due_date: '2026-05-26', status_text: '미제출' },
        { assignment_id: 'week', course_id: 'c1', course_name: '소프트웨어공학', name: '이번 주 과제', url: 'https://learn.hansung.ac.kr/mod/assign/view.php?id=2', due_text: '2026-05-30', due_date: '2026-05-30', status_text: '제출 가능' },
        { assignment_id: 'unsafe', course_id: 'c1', course_name: '소프트웨어공학', name: '외부 링크 과제', url: 'https://evil.test/mod/assign/view.php?id=3', due_text: 'LMS 표기 확인 필요' },
      ],
    },
    error: null,
    lastRefreshedAt: new Date('2026-05-26T10:00:00+09:00'),
    refresh: vi.fn(async () => undefined),
    login: vi.fn(async () => undefined),
    clearSession: vi.fn(async () => undefined),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseLmsDashboard.mockReturnValue(readyState())
})

describe('LmsDashboardPage', () => {
  it('renders connection, urgent-today, and week-deadline sections in Korean', () => {
    render(<LmsDashboardPage locale="ko-KR" />)

    expect(screen.getByText('LMS 대시보드')).toBeInTheDocument()
    expect(screen.getByText('연결 상태')).toBeInTheDocument()
    expect(screen.getByText('오늘 급한 과제')).toBeInTheDocument()
    expect(screen.getByText('이번 주 마감')).toBeInTheDocument()
    expect(screen.getByText('오늘 마감 과제')).toBeInTheDocument()
    expect(screen.getByText('이번 주 과제')).toBeInTheDocument()
    expect(screen.getByText('날짜 형식 확인 필요')).toBeInTheDocument()
  })

  it('opens only original Hansung LMS assignment URLs', () => {
    render(<LmsDashboardPage locale="ko-KR" />)

    fireEvent.click(screen.getAllByRole('button', { name: /LMS 열기/ })[0])
    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://learn.hansung.ac.kr/mod/assign/view.php?id=1')

    const unsafeButton = screen.getAllByRole('button', { name: /LMS 열기/ }).at(-1)
    expect(unsafeButton).toBeDisabled()
  })

  it('shows Korean login form without owning periodic polling', async () => {
    const login = vi.fn(async () => undefined)
    mockUseLmsDashboard.mockReturnValue(readyState({
      credentialState: 'missing',
      status: {
        credential_state: 'missing',
        credential_message: '한성 e-class 로그인이 필요합니다.',
        read_only: true,
        session_clear_available: true,
      },
      overview: null,
      login,
    }))

    render(<LmsDashboardPage locale="ko-KR" />)
    fireEvent.change(screen.getByPlaceholderText('한성대 학번'), { target: { value: '2212345' } })
    fireEvent.change(screen.getByPlaceholderText('한성대 비밀번호'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: '보안 로그인' }))

    await waitFor(() => expect(login).toHaveBeenCalledWith({ student_id: '2212345', password: 'secret' }))
  })
})
