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

const sangsangRoom = {
  id: 'sangsang_park_plus_critical_thinking',
  area: 'sangsang_park_plus',
  name: '소모임실 Critical Thinking',
  location: '상상파크 플러스',
  min_capacity: 1,
  max_capacity: 6,
  operating_hours: '09:00-21:00',
  supported: true,
}

const sangsangBaseRoom = {
  id: 'sangsang_base_seminar',
  area: 'sangsang_base',
  name: '상상베이스 세미나실',
  location: '상상베이스',
  min_capacity: 1,
  max_capacity: 10,
  operating_hours: '09:00-21:00',
  supported: true,
}

const libraryGroupRoom = {
  id: 'library_group_study_6f',
  area: 'library_group_study',
  name: '그룹스터디실(6F)',
  location: '학술정보관',
  min_capacity: 1,
  max_capacity: 8,
  operating_hours: '09:00-21:00',
  supported: true,
}

const libraryCoworkingRoom = {
  id: 'library_coworking_3f_creative_reading',
  area: 'library_group_study',
  name: '코워킹룸(3F창의열람실)',
  location: '학술정보관',
  min_capacity: 1,
  max_capacity: 12,
  operating_hours: '09:00-21:00',
  supported: true,
}

async function completeSuccessfulReservation() {
  mockAvailability.mockResolvedValueOnce({
    area: 'coding_lounge',
    date: '2026-05-27',
    start_time: '13:00',
    end_time: '15:00',
    results: [{
      room: room103,
      available: true,
      slots: [
        { start_time: '13:00', end_time: '14:00', available: true },
        { start_time: '14:00', end_time: '15:00', available: true },
      ],
    }],
  })
  fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))
  await screen.findByText('코딩라운지 103호')
  expect(await screen.findByText('예약 가능')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '예약' }))
  fireEvent.click(screen.getByRole('button', { name: '예약 확정' }))
  expect(await screen.findByText('예약이 완료되었습니다. 예약 번호: R-103')).toBeInTheDocument()
}


beforeEach(() => {
  vi.resetAllMocks()
  mockStatus.mockResolvedValue({
    credential_state: 'missing',
    credential_message: '보안 저장소에 저장된 한성대 학습공간 예약 자격증명이 없습니다.',
    supported_areas: [
      { key: 'coding_lounge', label: '코딩라운지 세미나실', supported: true },
      { key: 'sangsang_park_plus', label: '상상파크 플러스 소모임실', supported: true },
      { key: 'sangsang_base', label: '상상베이스', supported: true },
      { key: 'library_group_study', label: '학술정보관 그룹스터디실', supported: true },
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
    results: [{
      room: room103,
      available: false,
      reason: '일부 시간대가 이미 예약되어 있습니다.',
      slots: [
        { start_time: '13:00', end_time: '14:00', available: true },
        { start_time: '14:00', end_time: '15:00', available: false, reason: '예약됨' },
      ],
    }],
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
  it('does not schedule polling or load rooms/availability without an explicit user check', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    try {
      render(<StudySpaceReservationPage locale="ko-KR" />)

      await waitFor(() => expect(mockStatus).toHaveBeenCalledOnce())
      expect(setIntervalSpy.mock.calls.filter(([, delay]) => delay !== 50)).toHaveLength(0)
      expect(mockRooms).not.toHaveBeenCalled()
      expect(mockAvailability).not.toHaveBeenCalled()
    } finally {
      setIntervalSpy.mockRestore()
    }
  })

  it('shows dashboard loading, empty, unavailable, and success states from explicit actions', async () => {
    let resolvePendingAvailability: ((value: Awaited<ReturnType<typeof checkStudySpaceAvailability>>) => void) | null = null
    const pendingAvailability = new Promise<Awaited<ReturnType<typeof checkStudySpaceAvailability>>>((resolve) => {
      resolvePendingAvailability = resolve
    })
    mockAvailability.mockReturnValueOnce(pendingAvailability)
    mockAvailability.mockResolvedValueOnce({
      area: 'coding_lounge',
      date: '2026-05-27',
      start_time: '13:00',
      end_time: '15:00',
      results: [{ room: room103, available: false, reason: '이미 예약됨', slots: [] }],
    })
    mockAvailability.mockResolvedValueOnce({
      area: 'coding_lounge',
      date: '2026-05-27',
      start_time: '13:00',
      end_time: '15:00',
      results: [{ room: room103, available: true, slots: [] }],
    })
    render(<StudySpaceReservationPage locale="ko-KR" />)

    expect(screen.getByText('예약 가능 여부를 확인하면 공간별 시간대 현황이 표시됩니다.')).toBeInTheDocument()

    await waitFor(() => expect(mockStatus).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))
    await waitFor(() => expect(mockAvailability).toHaveBeenCalledTimes(1))
    expect(screen.getByText('공간 목록을 불러오는 중…')).toBeInTheDocument()
    resolvePendingAvailability?.({
      area: 'coding_lounge',
      date: '2026-05-27',
      start_time: '13:00',
      end_time: '15:00',
      results: [],
    })
    expect(await screen.findByText('조건에 맞는 학습공간이 없습니다.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))
    expect(await screen.findByText('이미 예약됨')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('예약 가능한 공간이 없습니다. 시간 또는 인원을 조정해 주세요.')
    expect(screen.getByRole('button', { name: '예약' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))
    expect(await screen.findByText('예약 가능')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '예약' }))
    fireEvent.click(screen.getByRole('button', { name: '예약 확정' }))

    expect(await screen.findByRole('status')).toHaveTextContent('예약이 완료되었습니다. 예약 번호: R-103')
  })

  it('renders Korean reservation controls without loading rooms before the user checks availability', async () => {
    render(<StudySpaceReservationPage locale="ko-KR" />)

    expect(screen.getByRole('heading', { name: '학습공간 예약' })).toBeInTheDocument()
    expect(screen.getByText('검색 조건')).toBeInTheDocument()
    expect(screen.queryByText('팀원 정보')).not.toBeInTheDocument()
    expect(screen.getByText('이용 가능한 공간')).toBeInTheDocument()

    await waitFor(() => expect(mockStatus).toHaveBeenCalledOnce())
    expect(mockRooms).not.toHaveBeenCalled()
    expect(screen.queryByText('코딩라운지 103호')).not.toBeInTheDocument()
    expect(screen.getByText('예약 가능 여부를 확인하면 공간별 시간대 현황이 표시됩니다.')).toBeInTheDocument()
  })

  it('shows room-specific time slot history after checking availability', async () => {
    render(<StudySpaceReservationPage locale="ko-KR" />)

    fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))

    expect(await screen.findByText('일부 시간대가 이미 예약되어 있습니다.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '시간대 보기' }))

    expect(screen.getByText(/13:00–14:00/)).toBeInTheDocument()
    expect(screen.getByText(/14:00–15:00/)).toBeInTheDocument()
    expect(screen.getByText(/예약됨/)).toBeInTheDocument()
  })

  it('checks availability and opens a confirmation dialog for available rooms', async () => {
    mockAvailability.mockResolvedValueOnce({
      area: 'coding_lounge',
      date: '2026-05-27',
      start_time: '13:00',
      end_time: '15:00',
      results: [{ room: room103, available: true, slots: [{ start_time: '13:00', end_time: '14:00', available: true }] }],
    })
    render(<StudySpaceReservationPage locale="ko-KR" />)

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

  it('requires Sangsang Park Plus usage details instead of team members before confirming', async () => {
    mockStatus.mockResolvedValueOnce({
      credential_state: 'missing',
      credential_message: '보안 저장소에 저장된 한성대 학습공간 예약 자격증명이 없습니다.',
      supported_areas: [
        { key: 'sangsang_park_plus', label: '상상파크 플러스 소모임실', supported: true },
      ],
      session_clear_available: true,
    })
    mockAvailability.mockResolvedValueOnce({
      area: 'sangsang_park_plus',
      date: '2026-05-27',
      start_time: '13:00',
      end_time: '15:00',
      results: [{ room: sangsangRoom, available: true, slots: [{ start_time: '13:00', end_time: '14:00', available: true }] }],
    })
    render(<StudySpaceReservationPage locale="ko-KR" />)

    expect(await screen.findByText('상상파크 플러스 추가 정보')).toBeInTheDocument()
    expect(screen.queryByText('팀원 정보')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))
    expect(await screen.findByText('예약 가능')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '예약' }))
    fireEvent.click(screen.getByRole('button', { name: '예약 확정' }))

    expect(await screen.findByText('소속, 사용인원, 사용목적을 모두 입력하세요.')).toBeInTheDocument()
    expect(mockReservation).not.toHaveBeenCalled()
  })

  it('submits Sangsang Park Plus usage fields without member rows', async () => {
    mockStatus.mockResolvedValueOnce({
      credential_state: 'missing',
      credential_message: '보안 저장소에 저장된 한성대 학습공간 예약 자격증명이 없습니다.',
      supported_areas: [
        { key: 'sangsang_park_plus', label: '상상파크 플러스 소모임실', supported: true },
      ],
      session_clear_available: true,
    })
    mockAvailability.mockResolvedValueOnce({
      area: 'sangsang_park_plus',
      date: '2026-05-27',
      start_time: '13:00',
      end_time: '15:00',
      results: [{ room: sangsangRoom, available: true, slots: [{ start_time: '13:00', end_time: '14:00', available: true }] }],
    })
    render(<StudySpaceReservationPage locale="ko-KR" />)

    fireEvent.change(await screen.findByPlaceholderText('예: 컴퓨터공학부'), { target: { value: '컴퓨터공학부' } })
    fireEvent.change(screen.getByPlaceholderText('예: 팀 프로젝트 회의'), { target: { value: '팀 프로젝트 회의' } })
    fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))
    expect(await screen.findByText('예약 가능')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '예약' }))
    fireEvent.click(screen.getByRole('button', { name: '예약 확정' }))

    await waitFor(() => expect(mockReservation).toHaveBeenCalledWith(expect.objectContaining({
      area: 'sangsang_park_plus',
      room_id: 'sangsang_park_plus_critical_thinking',
      headcount: 2,
      members: [],
      usage_info: {
        affiliation: '컴퓨터공학부',
        attendee_count: 2,
        purpose: '팀 프로젝트 회의',
      },
    })))
  })

  it('submits Sangsang Base aggregate user fields without member rows', async () => {
    mockStatus.mockResolvedValueOnce({
      credential_state: 'missing',
      credential_message: '보안 저장소에 저장된 한성대 학습공간 예약 자격증명이 없습니다.',
      supported_areas: [
        { key: 'sangsang_base', label: '상상베이스', supported: true },
      ],
      session_clear_available: true,
    })
    mockAvailability.mockResolvedValueOnce({
      area: 'sangsang_base',
      date: '2026-05-27',
      start_time: '13:00',
      end_time: '15:00',
      results: [{ room: sangsangBaseRoom, available: true, slots: [{ start_time: '13:00', end_time: '14:00', available: true }] }],
    })
    render(<StudySpaceReservationPage locale="ko-KR" />)

    expect(await screen.findByText('상상베이스 이용자 정보')).toBeInTheDocument()
    expect(screen.queryByText('팀원 정보')).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('예: 김한성 2170001, 이상상 2170002'), { target: { value: '김한성 2170001, 이상상 2170002' } })
    fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))
    expect(await screen.findByText('예약 가능')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '예약' }))
    fireEvent.click(screen.getByRole('button', { name: '예약 확정' }))

    await waitFor(() => expect(mockReservation).toHaveBeenCalledWith(expect.objectContaining({
      area: 'sangsang_base',
      room_id: 'sangsang_base_seminar',
      headcount: 2,
      members: [],
      usage_info: {
        all_users: '김한성 2170001, 이상상 2170002',
        attendee_count: 2,
      },
    })))
  })

  it('requires Sangsang Base aggregate user names and total count before confirming', async () => {
    mockStatus.mockResolvedValueOnce({
      credential_state: 'missing',
      credential_message: '보안 저장소에 저장된 한성대 학습공간 예약 자격증명이 없습니다.',
      supported_areas: [
        { key: 'sangsang_base', label: '상상베이스', supported: true },
      ],
      session_clear_available: true,
    })
    mockAvailability.mockResolvedValueOnce({
      area: 'sangsang_base',
      date: '2026-05-27',
      start_time: '13:00',
      end_time: '15:00',
      results: [{ room: sangsangBaseRoom, available: true, slots: [{ start_time: '13:00', end_time: '14:00', available: true }] }],
    })
    render(<StudySpaceReservationPage locale="ko-KR" />)

    await screen.findByText('상상베이스 이용자 정보')
    fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))
    expect(await screen.findByText('예약 가능')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '예약' }))
    fireEvent.click(screen.getByRole('button', { name: '예약 확정' }))

    expect(await screen.findByText('전체이용자 성명/학번과 총 인원수를 입력하세요.')).toBeInTheDocument()
    expect(mockReservation).not.toHaveBeenCalled()
  })

  it('submits library group study companion users without member rows', async () => {
    mockStatus.mockResolvedValueOnce({
      credential_state: 'missing',
      credential_message: '보안 저장소에 저장된 한성대 학습공간 예약 자격증명이 없습니다.',
      supported_areas: [
        { key: 'library_group_study', label: '학술정보관 그룹스터디실', supported: true },
      ],
      session_clear_available: true,
    })
    mockAvailability.mockResolvedValueOnce({
      area: 'library_group_study',
      date: '2026-05-27',
      start_time: '13:00',
      end_time: '15:00',
      results: [{ room: libraryGroupRoom, available: true, slots: [{ start_time: '13:00', end_time: '14:00', available: true }] }],
    })
    render(<StudySpaceReservationPage locale="ko-KR" />)

    expect(await screen.findByText('학술정보관 이용자 정보')).toBeInTheDocument()
    expect(screen.queryByText('팀원 정보')).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('예: 23홍길동, 24김한성'), { target: { value: '23홍길동, 24김한성' } })
    fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))
    expect(await screen.findByText('예약 가능')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '예약' }))
    fireEvent.click(screen.getByRole('button', { name: '예약 확정' }))

    await waitFor(() => expect(mockReservation).toHaveBeenCalledWith(expect.objectContaining({
      area: 'library_group_study',
      room_id: 'library_group_study_6f',
      members: [],
      usage_info: {
        companion_users: '23홍길동, 24김한성',
        attendee_count: 2,
      },
    })))
  })

  it('submits library coworking reservation reason without member rows', async () => {
    mockStatus.mockResolvedValueOnce({
      credential_state: 'missing',
      credential_message: '보안 저장소에 저장된 한성대 학습공간 예약 자격증명이 없습니다.',
      supported_areas: [
        { key: 'library_group_study', label: '학술정보관 그룹스터디실', supported: true },
      ],
      session_clear_available: true,
    })
    mockAvailability.mockResolvedValueOnce({
      area: 'library_group_study',
      date: '2026-05-27',
      start_time: '13:00',
      end_time: '15:00',
      results: [{ room: libraryCoworkingRoom, available: true, slots: [{ start_time: '13:00', end_time: '14:00', available: true }] }],
    })
    render(<StudySpaceReservationPage locale="ko-KR" />)

    expect(await screen.findByText('학술정보관 이용자 정보')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('예: 팀 프로젝트 회의'), { target: { value: '팀 프로젝트 회의' } })
    fireEvent.click(screen.getByRole('button', { name: '예약 가능 여부 확인' }))
    expect(await screen.findByText('예약 가능')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '예약' }))
    fireEvent.click(screen.getByRole('button', { name: '예약 확정' }))

    await waitFor(() => expect(mockReservation).toHaveBeenCalledWith(expect.objectContaining({
      area: 'library_group_study',
      room_id: 'library_coworking_3f_creative_reading',
      members: [],
      usage_info: {
        reservation_reason: '팀 프로젝트 회의',
        attendee_count: 2,
      },
    })))
  })

  it('submits selected room, time, and headcount without member rows for coding lounge', async () => {
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
      members: [],
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
    expect(markdown).toContain('팀원 정보 없음')
    expect(markdown).not.toMatch(/password|token|cookie/i)
  })
})
