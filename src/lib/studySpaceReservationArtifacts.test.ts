import { describe, expect, it } from 'vitest'
import {
  buildStudySpaceReservationIcs,
  buildStudySpaceReservationNote,
  studySpaceReservationNoteFilename,
} from './studySpaceReservationArtifacts'

const input = {
  result: {
    reservation_id: 'R-103',
    verified: true,
    dry_run: false,
    room_id: 'coding-lounge-103',
    area: 'coding_lounge',
    date: '2026-05-27',
    start_time: '13:00',
    end_time: '15:00',
  },
  room: { name: '코딩라운지 103호', location: '상상관 코딩라운지' },
  members: [
    { student_number: '2170001', name: '김한성' },
    { student_number: '2170002', name: '이상상' },
  ],
}

describe('studySpaceReservationArtifacts', () => {
  it('builds a safe reservation note without credential fields', () => {
    const note = buildStudySpaceReservationNote(input)

    expect(note).toContain('# 2026-05-27 코딩라운지 103호 예약')
    expect(note).toContain('| 2170001 | 김한성 |')
    expect(note).not.toMatch(/password|token|cookie|payload/i)
    expect(note).toContain('원본 MCP 요청/응답을 저장하지 않습니다')
  })

  it('builds an ICS event with room and member metadata only', () => {
    const ics = buildStudySpaceReservationIcs(input)

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('DTSTART:20260527T130000')
    expect(ics).toContain('DTEND:20260527T150000')
    expect(ics).toContain('SUMMARY:학습공간 예약: 코딩라운지 103호')
    expect(ics).not.toMatch(/password|token|cookie/i)
  })

  it('creates a stable markdown filename', () => {
    expect(studySpaceReservationNoteFilename(input)).toBe('study-space-2026-05-27-코딩라운지-103호.md')
  })
})
