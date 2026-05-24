import type { StudySpaceReservationMember, StudySpaceReservationResult, StudySpaceRoom } from './studySpaceReservation'

export interface StudySpaceReservationArtifactInput {
  result: StudySpaceReservationResult
  room: Pick<StudySpaceRoom, 'name' | 'location'>
  members: StudySpaceReservationMember[]
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ').trim()
}

function compactStudentNumber(value: string): string {
  return value.replace(/[^0-9A-Za-z-]/g, '')
}

function formatMemberRows(members: StudySpaceReservationMember[]): string {
  if (members.length === 0) return '| 팀원 정보 없음 | - |\n'
  return members
    .map((member) => `| ${escapeMarkdownCell(compactStudentNumber(member.student_number)) || '-'} | ${escapeMarkdownCell(member.name) || '-'} |`)
    .join('\n')
}

function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r?\n/g, '\\n')
}

function yyyymmddhhmm(date: string, time: string): string {
  return `${date.replaceAll('-', '')}T${time.replace(':', '').padEnd(4, '0')}00`
}

export function buildStudySpaceReservationNote(input: StudySpaceReservationArtifactInput): string {
  const { result, room, members } = input
  const title = `${result.date} ${room.name} 예약`
  return `---\ntype: Reservation\ntitle: ${JSON.stringify(title)}\nreservation_id: ${JSON.stringify(result.reservation_id ?? '')}\nspace: ${JSON.stringify(room.name)}\ndate: ${JSON.stringify(result.date)}\nstart_time: ${JSON.stringify(result.start_time)}\nend_time: ${JSON.stringify(result.end_time)}\nverified: ${result.verified ? 'true' : 'false'}\n---\n\n# ${title}\n\n- 공간: ${room.name}\n- 위치: ${room.location}\n- 날짜: ${result.date}\n- 시간: ${result.start_time}–${result.end_time}\n- 예약 번호: ${result.reservation_id ?? '-'}\n- 예약 확인: ${result.verified ? '확인됨' : '미확인'}\n\n## 팀원\n\n| 학번 | 이름 |\n| --- | --- |\n${formatMemberRows(members)}\n\n> 이 노트에는 한성대 계정 비밀번호, 인증 토큰, 쿠키, 원본 MCP 요청/응답을 저장하지 않습니다.\n`
}

export function buildStudySpaceReservationIcs(input: StudySpaceReservationArtifactInput): string {
  const { result, room, members } = input
  const uid = `hs-study-space-${result.reservation_id ?? `${result.date}-${result.room_id}`}@hs-hub.local`
  const summary = `학습공간 예약: ${room.name}`
  const description = [
    `예약 번호: ${result.reservation_id ?? '-'}`,
    `공간: ${room.name}`,
    `위치: ${room.location}`,
    `팀원: ${members.map((member) => `${member.name}(${compactStudentNumber(member.student_number)})`).join(', ') || '-'}`,
    '민감 정보는 포함하지 않았습니다.',
  ].join('\n')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HS-Hub//Study Space Reservation//KO',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${yyyymmddhhmm(result.date, result.start_time)}`,
    `DTSTART:${yyyymmddhhmm(result.date, result.start_time)}`,
    `DTEND:${yyyymmddhhmm(result.date, result.end_time)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(room.location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function studySpaceReservationNoteFilename(input: StudySpaceReservationArtifactInput): string {
  const roomSlug = input.room.name
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'study-space'
  return `study-space-${input.result.date}-${roomSlug}.md`
}
