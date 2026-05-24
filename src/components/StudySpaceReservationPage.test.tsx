import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudySpaceReservationPage } from './StudySpaceReservationPage'
import {
  checkStudySpaceAvailability,
  clearStudySpaceSession,
  createStudySpaceReservation,
  getStudySpaceStatus,
  listStudySpaceRooms,
  saveStudySpaceCredentials,
} from '../lib/studySpaceReservation'

vi.mock('../lib/studySpaceReservation', () => ({
  getStudySpaceStatus: vi.fn(),
  saveStudySpaceCredentials: vi.fn(),
  clearStudySpaceSession: vi.fn(),
  listStudySpaceRooms: vi.fn(),
  checkStudySpaceAvailability: vi.fn(),
  createStudySpaceReservation: vi.fn(),
}))

const mockStatus = vi.mocked(getStudySpaceStatus)
const mockSaveCredentials = vi.mocked(saveStudySpaceCredentials)
const mockClearSession = vi.mocked(clearStudySpaceSession)
const mockRooms = vi.mocked(listStudySpaceRooms)
const mockAvailability = vi.mocked(checkStudySpaceAvailability)
const mockReservation = vi.mocked(createStudySpaceReservation)

const room103 = {
  id: 'coding-lounge-103',
  area: 'coding_lounge',
  name: '코딩라운지 103호',
  location: '상상관 코딩라운지',
  min_capacity: 1,
  max_capacity: 6,
  operating_hours: '09:00-21:00',
  supported: true,
}

function fillMembers() {
  const studentInputs = screen.getAllByPlaceholderText('2170000')
  const nameInputs = screen.getAllByPlaceholderText('팀원 이름')
  fireEvent.change(studentInputs[0]!, { target: { value: '2170001' } })
  fireEvent.change(nameInputs[0]!, { target: { value: '김한성' } })
  fireEvent.change(studentInputs[1]!, { target: { value: '2170002' } })
  fireEvent.change(nameInputs[1]!, { target: { value: '이상상' } })
}

async function completeSuccessfulReservation() {
  await screen.findByText('코딩라운지 103호')
  fillMembers()
  fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))
  expect(await screen.findByText('예약 가능')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '예약' }))
  fireEvent.click(screen.getByRole('button', { name: '예약 확정' }))
  expect(await screen.findByText('예약이 완료되었습니다. 예약 번호: R-103')).toBeInTheDocument()
}

beforeEach(() => {
  vi.clearAllMocks()
  mockStatus.mockResolvedValue({
    credential_state: 'missing',
    credential_message: '보안 저장소에 저장된 한성대 학습공간 예약 자격증명이 없습니다.',
    supported_areas: [
      { key: 'coding_lounge', label: '코딩라운지', supported: true },
      { key: 'library_group_study', label: '학술정보관 그룹스터디실', supported: false, note: '연동 준비 중' },
    ],
    session_clear_available: true,
  })
  mockRooms.mockResolvedValue([room103])
  mockSaveCredentials.mockResolvedValue({
    credential_state: 'ready',
    message: '로그인 성공. 비밀번호는 저장하지 않았고 세션 쿠키만 OS 보안 저장소에 저장했습니다.',
    student_id_masked: '21***68',
    name: '김한성',
  })
  mockClearSession.mockResolvedValue({
    cleared: true,
    message: '저장된 학습공간 예약 세션을 삭제했습니다.',
  })
  mockAvailability.mockResolvedValue({
    area: 'coding_lounge',
    date: '2026-05-27',
    start_time: '13:00',
    end_time: '15:00',
    results: [{ room: room103, available: true }],
  })
  mockReservation.mockResolvedValue({
    reservation_id: 'R-103',
    verified: true,
    dry_run: false,
    room_id: room103.id,
    area: 'coding_lounge',
    date: '2026-05-27',
    start_time: '13:00',
    end_time: '15:00',
  })
})

describe('StudySpaceReservationPage', () => {
  it('renders Korean reservation controls and loads the room catalog', async () => {
    render(<StudySpaceReservationPage locale="ko-KR" />)

    expect(screen.getByRole('heading', { name: '학습공간 예약' })).toBeInTheDocument()
    expect(screen.getByText('검색 조건')).toBeInTheDocument()
    expect(screen.getByText('팀원 정보')).toBeInTheDocument()
    expect(screen.getByText('이용 가능한 공간')).toBeInTheDocument()

    expect(await screen.findByText('코딩라운지 103호')).toBeInTheDocument()
    expect(mockStatus).toHaveBeenCalledOnce()
    expect(mockRooms).toHaveBeenCalledWith('coding_lounge')
  })

  it('checks availability and opens a confirmation dialog for available rooms', async () => {
    render(<StudySpaceReservationPage locale="ko-KR" />)

    await screen.findByText('코딩라운지 103호')
    fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))

    await waitFor(() => expect(mockAvailability).toHaveBeenCalledWith(expect.objectContaining({
      area: 'coding_lounge',
      start_time: '13:00',
      end_time: '15:00',
      headcount: 2,
    })))
    expect(await screen.findByText('예약 가능')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '예약' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('실제 예약 확인')
  })

  it('logs in through the secure reservation boundary without exposing the password in UI state', async () => {
    render(<StudySpaceReservationPage locale="ko-KR" />)

    fireEvent.change(screen.getByPlaceholderText('한성대 학번'), { target: { value: '2170001' } })
    fireEvent.change(screen.getByPlaceholderText('한성대 비밀번호'), { target: { value: 'secret-pass' } })
    fireEvent.click(screen.getByRole('button', { name: '보안 저장소에 로그인' }))

    await waitFor(() => expect(mockSaveCredentials).toHaveBeenCalledWith({
      student_id: '2170001',
      password: 'secret-pass',
    }))
    expect(await screen.findByText('로그인 성공. 비밀번호는 저장하지 않았고 세션 쿠키만 OS 보안 저장소에 저장했습니다.')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('secret-pass')).not.toBeInTheDocument()
  })

  it('requires complete member information before confirming a live reservation', async () => {
    render(<StudySpaceReservationPage locale="ko-KR" />)

    await screen.findByText('코딩라운지 103호')
    fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))
    expect(await screen.findByText('예약 가능')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '예약' }))
    fireEvent.click(screen.getByRole('button', { name: '예약 확정' }))

    expect(await screen.findByText('예약 전 모든 팀원의 학번과 이름을 입력하세요.')).toBeInTheDocument()
    expect(mockReservation).not.toHaveBeenCalled()
  })

  it('submits selected room, time, headcount, and member rows only after confirmation', async () => {
    const onToast = vi.fn()
    render(<StudySpaceReservationPage locale="ko-KR" onToast={onToast} />)

    await completeSuccessfulReservation()

    await waitFor(() => expect(mockReservation).toHaveBeenCalledWith(expect.objectContaining({
      area: 'coding_lounge',
      room_id: 'coding-lounge-103',
      start_time: '13:00',
      end_time: '15:00',
      headcount: 2,
      dry_run: false,
      confirm: true,
      members: [
        { student_number: '2170001', name: '김한성' },
        { student_number: '2170002', name: '이상상' },
      ],
    })))
    expect(onToast).toHaveBeenCalledWith('학습공간 예약이 완료되었습니다.')
  })

  it('saves a sanitized reservation note after a successful booking', async () => {
    const onCreateReservationNote = vi.fn().mockResolvedValue(undefined)
    render(<StudySpaceReservationPage locale="ko-KR" onCreateReservationNote={onCreateReservationNote} />)

    await completeSuccessfulReservation()
    fireEvent.click(screen.getByRole('button', { name: '예약 노트 저장' }))

    await waitFor(() => expect(onCreateReservationNote).toHaveBeenCalledOnce())
    const [filename, markdown] = onCreateReservationNote.mock.calls[0]!
    expect(filename).toBe('study-space-2026-05-27-코딩라운지-103호.md')
    expect(markdown).toContain('| 2170001 | 김한성 |')
    expect(markdown).not.toMatch(/password|token|cookie/i)
  })
})
