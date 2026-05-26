import { fireEvent, render, screen } from '@testing-library/react'
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

  it('does not render a separate LMS login form on the detail page', () => {
    const login = vi.fn(async () => undefined)
    mockUseLmsDashboard.mockReturnValue(readyState({
      credentialState: 'missing',
      status: {
        credential_state: 'missing',
        credential_message: '사이드바에서 학교 계정을 먼저 저장해 주세요.',
        read_only: true,
        session_clear_available: true,
      },
      overview: null,
      login,
    }))

    render(<LmsDashboardPage locale="ko-KR" />)

    expect(screen.getByText('사이드바에서 학교 계정을 먼저 저장해 주세요.')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('한성대 학번')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('한성대 비밀번호')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '보안 로그인' })).not.toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })
})
