import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarSchoolAuthPanel } from './SidebarSchoolAuthPanel'
import { clearLmsSession, getLmsStatus, loginLms } from '../../lib/lmsDashboard'
import { clearStudySpaceSession, getStudySpaceStatus, saveStudySpaceCredentials } from '../../lib/studySpaceReservation'

vi.mock('../../lib/lmsDashboard', () => ({
  getLmsStatus: vi.fn(),
  loginLms: vi.fn(),
  clearLmsSession: vi.fn(),
}))

vi.mock('../../lib/studySpaceReservation', () => ({
  getStudySpaceStatus: vi.fn(),
  saveStudySpaceCredentials: vi.fn(),
  clearStudySpaceSession: vi.fn(),
}))

const mockLmsStatus = vi.mocked(getLmsStatus)
const mockLmsLogin = vi.mocked(loginLms)
const mockLmsClear = vi.mocked(clearLmsSession)
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
  mockLmsStatus.mockResolvedValue({
    credential_state: 'missing',
    credential_message: '저장된 한성 e-class 세션이 없습니다.',
    read_only: true,
    session_clear_available: true,
  })
  mockStudyLogin.mockResolvedValue({ credential_state: 'ready', message: '시설예약 로그인 성공' })
  mockLmsLogin.mockResolvedValue({ credential_state: 'ready', message: 'LMS 로그인 성공' })
  mockStudyClear.mockResolvedValue({ cleared: true, message: '시설예약 세션 삭제' })
  mockLmsClear.mockResolvedValue({ cleared: true, message: 'LMS 세션 삭제' })
})

describe('SidebarSchoolAuthPanel', () => {
  it('centralizes study-space and LMS sign-in at the bottom of the sidebar', async () => {
    render(<SidebarSchoolAuthPanel locale="ko-KR" />)

    expect(screen.getByText('학교 로그인')).toBeInTheDocument()
    await screen.findByText('시설예약')
    expect(screen.getByText('LMS')).toBeInTheDocument()

    const studentIdFields = screen.getAllByPlaceholderText('한성대 학번')
    const passwordFields = screen.getAllByPlaceholderText('한성대 비밀번호')
    fireEvent.change(studentIdFields[0], { target: { value: '2170001' } })
    fireEvent.change(passwordFields[0], { target: { value: 'study-secret' } })
    fireEvent.click(screen.getByRole('button', { name: '보안 저장소에 로그인' }))

    await waitFor(() => expect(mockStudyLogin).toHaveBeenCalledWith({ student_id: '2170001', password: 'study-secret' }))

    fireEvent.change(studentIdFields[1], { target: { value: '2170001' } })
    fireEvent.change(passwordFields[1], { target: { value: 'lms-secret' } })
    fireEvent.click(screen.getByRole('button', { name: '보안 로그인' }))

    await waitFor(() => expect(mockLmsLogin).toHaveBeenCalledWith({ student_id: '2170001', password: 'lms-secret' }))
  })
})
