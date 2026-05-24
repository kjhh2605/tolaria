import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudySpaceReservationPage } from './StudySpaceReservationPage'
import {
  checkStudySpaceAvailability,
  createStudySpaceReservation,
  getStudySpaceStatus,
  listStudySpaceRooms,
} from '../lib/studySpaceReservation'

vi.mock('../lib/studySpaceReservation', () => ({
  getStudySpaceStatus: vi.fn(),
  listStudySpaceRooms: vi.fn(),
  checkStudySpaceAvailability: vi.fn(),
  createStudySpaceReservation: vi.fn(),
}))

const mockStatus = vi.mocked(getStudySpaceStatus)
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

    await screen.findByText('코딩라운지 103호')
    const studentInputs = screen.getAllByPlaceholderText('2170000')
    const nameInputs = screen.getAllByPlaceholderText('팀원 이름')
    fireEvent.change(studentInputs[0]!, { target: { value: '2170001' } })
    fireEvent.change(nameInputs[0]!, { target: { value: '김한성' } })
    fireEvent.change(studentInputs[1]!, { target: { value: '2170002' } })
    fireEvent.change(nameInputs[1]!, { target: { value: '이상상' } })

    fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))
    expect(await screen.findByText('예약 가능')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '예약' }))
    fireEvent.click(screen.getByRole('button', { name: '예약 확정' }))

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
    expect(await screen.findByText('예약이 완료되었습니다. 예약 번호: R-103')).toBeInTheDocument()
    expect(onToast).toHaveBeenCalledWith('학습공간 예약이 완료되었습니다.')
  })
})
