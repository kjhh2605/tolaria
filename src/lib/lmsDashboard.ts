import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'

export type LmsDashboardErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'KEYCHAIN_UNAVAILABLE'
  | 'BRIDGE_UNAVAILABLE'
  | 'BRIDGE_TIMEOUT'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'UNSAFE_URL'
  | 'UNKNOWN_ERROR'

export type LmsCredentialState = 'missing' | 'ready' | 'auth_failed' | 'keychain_unavailable'

export interface LmsCommandError {
  code: LmsDashboardErrorCode
  message: string
  safe_details?: string
}

export interface LmsCommandResult<T> {
  ok: boolean
  data?: T
  error?: LmsCommandError
}

export interface LmsStatus {
  credential_state: LmsCredentialState
  credential_message: string
  read_only: boolean
  session_clear_available: boolean
  student_id_masked?: string
}

export interface LmsLoginRequest {
  student_id: string
  password: string
}

export interface LmsLoginResult {
  credential_state: LmsCredentialState
  message: string
  student_id_masked?: string
}

export interface LmsCourse {
  course_id: string
  name: string
  url: string
  progress_text?: string
}

export interface LmsAssignment {
  assignment_id?: string
  course_id: string
  course_name?: string
  name: string
  url: string
  due_text?: string
  status_text?: string
  due_date?: string
}

export interface LmsOverviewSummary {
  course_count: number
  assignment_count: number
  capped_course_count: number
  capped_assignment_count: number
}

export interface LmsOverview {
  read_only: boolean
  summary: LmsOverviewSummary
  courses: LmsCourse[]
  assignments: LmsAssignment[]
}

export interface LmsClearSessionResult {
  cleared: boolean
  message: string
}

const LMS_ERROR_MESSAGES: Record<LmsDashboardErrorCode, string> = {
  AUTH_REQUIRED: '한성 e-class 로그인이 필요합니다.',
  AUTH_FAILED: '한성 e-class 인증에 실패했습니다.',
  KEYCHAIN_UNAVAILABLE: '보안 저장소를 사용할 수 없습니다.',
  BRIDGE_UNAVAILABLE: 'LMS 실행 환경을 찾지 못했습니다.',
  BRIDGE_TIMEOUT: 'LMS 응답 시간이 초과되었습니다.',
  NETWORK_ERROR: '한성 e-class에 연결할 수 없습니다.',
  PARSE_ERROR: 'LMS 응답을 처리할 수 없습니다.',
  UNSAFE_URL: '안전하지 않은 LMS 링크가 차단되었습니다.',
  UNKNOWN_ERROR: '알 수 없는 LMS 오류가 발생했습니다.',
}

export function lmsErrorMessage(code: LmsDashboardErrorCode): string {
  return LMS_ERROR_MESSAGES[code] ?? LMS_ERROR_MESSAGES.UNKNOWN_ERROR
}

export class LmsDashboardError extends Error {
  readonly code: LmsDashboardErrorCode
  readonly safeDetails?: string

  constructor(error: LmsCommandError) {
    super(error.message || lmsErrorMessage(error.code))
    this.name = 'LmsDashboardError'
    this.code = error.code
    this.safeDetails = error.safe_details
  }
}

type LmsCommand = 'lms_status' | 'lms_login' | 'lms_overview' | 'lms_clear_session'

async function callLmsCommand<T>(command: LmsCommand, args?: Record<string, unknown>): Promise<T> {
  const target = isTauri() ? invoke : mockInvoke
  const result = await target<LmsCommandResult<T>>(command, args)
  if (result.ok && result.data !== undefined) return result.data
  throw new LmsDashboardError(result.error ?? {
    code: 'UNKNOWN_ERROR',
    message: LMS_ERROR_MESSAGES.UNKNOWN_ERROR,
  })
}

export function getLmsStatus(): Promise<LmsStatus> {
  return callLmsCommand('lms_status')
}

export function loginLms(request: LmsLoginRequest): Promise<LmsLoginResult> {
  return callLmsCommand('lms_login', { request })
}

export function getLmsOverview(): Promise<LmsOverview> {
  return callLmsCommand('lms_overview')
}

export function clearLmsSession(): Promise<LmsClearSessionResult> {
  return callLmsCommand('lms_clear_session')
}

export function isSafeLmsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'learn.hansung.ac.kr'
  } catch {
    return false
  }
}
