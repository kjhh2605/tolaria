import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarSchoolAuthPanel } from './SidebarSchoolAuthPanel'
import { clearLmsSession, loginLms } from '../../lib/lmsDashboard'
import { clearStudySpaceSession, getStudySpaceStatus, saveStudySpaceCredentials } from '../../lib/studySpaceReservation'

vi.mock('../../lib/lmsDashboard', () => ({
  clearLmsSession: vi.fn(),
  loginLms: vi.fn(),
}))

vi.mock('../../lib/studySpaceReservation', () => ({
  getStudySpaceStatus: vi.fn(),
  saveStudySpaceCredentials: vi.fn(),
  clearStudySpaceSession: vi.fn(),
}))

const mockLmsClear = vi.mocked(clearLmsSession)
const mockLmsLogin = vi.mocked(loginLms)
const mockStudyStatus = vi.mocked(getStudySpaceStatus)
const mockStudyLogin = vi.mocked(saveStudySpaceCredentials)
const mockStudyClear = vi.mocked(clearStudySpaceSession)

beforeEach(() => {
  vi.clearAllMocks()
  mockStudyStatus.mockResolvedValue({
    credential_state: 'missing',
    credential_message: '보안 저장소에 저장된 한성대 학습공간 예약 자격증명이 없습니다.',
    supported_areas: [],
    session_clear_available: true,
  })
  mockStudyLogin.mockResolvedValue({ credential_state: 'ready', message: '시설예약 로그인 성공' })
  mockLmsLogin.mockResolvedValue({ credential_state: 'ready', message: 'LMS 로그인 성공' })
  mockStudyClear.mockResolvedValue({ cleared: true, message: '시설예약 세션 삭제' })
  mockLmsClear.mockResolvedValue({ cleared: true, message: 'LMS 세션 삭제' })
})

describe('SidebarSchoolAuthPanel', () => {
  it('stores the shared school account session for study space and LMS from the sidebar', async () => {
    render(<SidebarSchoolAuthPanel locale="ko-KR" />)

    expect(screen.getByText('학교 로그인')).toBeInTheDocument()
    await screen.findByText('키체인 미저장')

    expect(screen.queryByTestId('sidebar-auth-study-space')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sidebar-auth-lms')).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('한성대 학번'), { target: { value: '2170001' } })
    fireEvent.change(screen.getByPlaceholderText('한성대 비밀번호'), { target: { value: 'school-secret' } })
    fireEvent.click(screen.getByRole('button', { name: '학교 계정 로그인' }))

    await waitFor(() => expect(mockStudyLogin).toHaveBeenCalledWith({ student_id: '2170001', password: 'school-secret' }))
    expect(mockLmsLogin).toHaveBeenCalledWith({ student_id: '2170001', password: 'school-secret' })
  })

  it('clears the shared school account session from both integrations', async () => {
    mockStudyStatus.mockResolvedValue({
      credential_state: 'ready',
      credential_message: '시설예약 저장됨',
      supported_areas: [],
      session_clear_available: true,
    })

    render(<SidebarSchoolAuthPanel locale="ko-KR" />)

    await screen.findByText('키체인 저장됨')
    fireEvent.click(screen.getByRole('button', { name: '학교 로그인 삭제' }))

    await waitFor(() => expect(mockStudyClear).toHaveBeenCalledTimes(1))
    expect(mockLmsClear).toHaveBeenCalledTimes(1)
  })
})
