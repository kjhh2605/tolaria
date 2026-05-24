import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'

export type StudySpaceErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'KEYCHAIN_UNAVAILABLE'
  | 'UNSUPPORTED_AREA'
  | 'INVALID_DATE'
  | 'INVALID_TIME_RANGE'
  | 'CAPACITY_TOO_LOW'
  | 'CAPACITY_TOO_HIGH'
  | 'MEMBER_INFO_REQUIRED'
  | 'UNAVAILABLE'
  | 'DUPLICATE_RESERVATION'
  | 'CONFIRM_REQUIRED'
  | 'RESERVATION_NOT_VERIFIED'
  | 'NETWORK_ERROR'
  | 'SCHOOL_SYSTEM_ERROR'
  | 'UNKNOWN_ERROR'

export type StudySpaceCredentialState = 'missing' | 'ready' | 'auth_failed' | 'keychain_unavailable'

export interface StudySpaceCommandError {
  code: StudySpaceErrorCode
  message: string
  safe_details?: string
}

export interface StudySpaceCommandResult<T> {
  ok: boolean
  data?: T
  error?: StudySpaceCommandError
}

export interface StudySpaceArea {
  key: string
  label: string
  supported: boolean
  note?: string
}

export interface StudySpaceStatus {
  credential_state: StudySpaceCredentialState
  credential_message: string
  supported_areas: StudySpaceArea[]
  session_clear_available: boolean
}

export interface StudySpaceRoom {
  id: string
  area: string
  name: string
  location: string
  min_capacity: number
  max_capacity: number
  operating_hours: string
  supported: boolean
}

export interface StudySpaceAvailabilityRequest {
  area: string
  date: string
  start_time: string
  end_time: string
  headcount: number
  min_capacity?: number | null
  max_capacity?: number | null
  room_id?: string | null
}

export interface StudySpaceAvailability {
  room: StudySpaceRoom
  available: boolean
  reason_code?: StudySpaceErrorCode
  reason?: string
}

export interface StudySpaceAvailabilityResponse {
  area: string
  date: string
  start_time: string
  end_time: string
  results: StudySpaceAvailability[]
}

export interface StudySpaceReservationMember {
  name: string
  student_number: string
}

export interface StudySpaceCreateReservationRequest extends StudySpaceAvailabilityRequest {
  room_id: string
  members: StudySpaceReservationMember[]
  dry_run?: boolean | null
  confirm?: boolean | null
}

export interface StudySpaceReservationResult {
  reservation_id?: string | null
  verified: boolean
  dry_run: boolean
  room_id: string
  area: string
  date: string
  start_time: string
  end_time: string
}

export interface StudySpaceReservationSummary {
  reservation_id?: string | null
  area: string
  room_name: string
  date: string
  start_time: string
  end_time: string
}

export interface StudySpaceClearSessionResult {
  cleared: boolean
  message: string
}

const STUDY_SPACE_ERROR_MESSAGES: Record<StudySpaceErrorCode, string> = {
  AUTH_REQUIRED: '한성대 학습공간 예약 로그인이 필요합니다.',
  AUTH_FAILED: '한성대 계정 인증에 실패했습니다.',
  KEYCHAIN_UNAVAILABLE: '보안 저장소를 사용할 수 없습니다.',
  UNSUPPORTED_AREA: '현재 자동 예약 연동이 지원되지 않는 공간입니다.',
  INVALID_DATE: '예약 날짜 형식이 올바르지 않습니다.',
  INVALID_TIME_RANGE: '예약 시작/종료 시간이 올바르지 않습니다.',
  CAPACITY_TOO_LOW: '요청 인원이 공간 최소 인원보다 적습니다.',
  CAPACITY_TOO_HIGH: '요청 인원이 공간 정원을 초과합니다.',
  MEMBER_INFO_REQUIRED: '예약에 필요한 팀원 정보가 부족합니다.',
  UNAVAILABLE: '선택한 시간에 예약 가능한 공간이 없습니다.',
  DUPLICATE_RESERVATION: '이미 겹치는 예약이 있습니다.',
  CONFIRM_REQUIRED: '실제 예약 전 확인이 필요합니다.',
  RESERVATION_NOT_VERIFIED: '예약 내역에서 예약을 확인하지 못했습니다.',
  NETWORK_ERROR: '학교 예약 시스템에 연결할 수 없습니다.',
  SCHOOL_SYSTEM_ERROR: '학교 예약 시스템 응답을 처리할 수 없습니다.',
  UNKNOWN_ERROR: '알 수 없는 예약 오류가 발생했습니다.',
}

export function studySpaceErrorMessage(code: StudySpaceErrorCode): string {
  return STUDY_SPACE_ERROR_MESSAGES[code] ?? STUDY_SPACE_ERROR_MESSAGES.UNKNOWN_ERROR
}

export class StudySpaceReservationError extends Error {
  readonly code: StudySpaceErrorCode
  readonly safeDetails?: string

  constructor(error: StudySpaceCommandError) {
    super(error.message || studySpaceErrorMessage(error.code))
    this.name = 'StudySpaceReservationError'
    this.code = error.code
    this.safeDetails = error.safe_details
  }
}

type StudySpaceCommand =
  | 'study_space_status'
  | 'study_space_list_spaces'
  | 'study_space_check_availability'
  | 'study_space_create_reservation'
  | 'study_space_list_my_reservations'
  | 'study_space_clear_session'

async function callStudySpaceCommand<T>(command: StudySpaceCommand, args?: Record<string, unknown>): Promise<T> {
  const target = isTauri() ? invoke : mockInvoke
  const result = await target<StudySpaceCommandResult<T>>(command, args)
  if (result.ok && result.data !== undefined) return result.data
  throw new StudySpaceReservationError(result.error ?? {
    code: 'UNKNOWN_ERROR',
    message: STUDY_SPACE_ERROR_MESSAGES.UNKNOWN_ERROR,
  })
}

export function getStudySpaceStatus(): Promise<StudySpaceStatus> {
  return callStudySpaceCommand('study_space_status')
}

export function listStudySpaceRooms(area: string): Promise<StudySpaceRoom[]> {
  return callStudySpaceCommand('study_space_list_spaces', { area })
}

export function checkStudySpaceAvailability(
  request: StudySpaceAvailabilityRequest,
): Promise<StudySpaceAvailabilityResponse> {
  return callStudySpaceCommand('study_space_check_availability', { request })
}

export function createStudySpaceReservation(
  request: StudySpaceCreateReservationRequest,
): Promise<StudySpaceReservationResult> {
  return callStudySpaceCommand('study_space_create_reservation', { request })
}

export function listMyStudySpaceReservations(area: string): Promise<StudySpaceReservationSummary[]> {
  return callStudySpaceCommand('study_space_list_my_reservations', { area })
}

export function clearStudySpaceSession(): Promise<StudySpaceClearSessionResult> {
  return callStudySpaceCommand('study_space_clear_session')
}
