import { useCallback, useEffect, useState } from 'react'
import { CalendarCheck, GraduationCap, ShieldCheck } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { translate, type AppLocale } from '../../lib/i18n'
import {
  clearStudySpaceSession,
  getStudySpaceStatus,
  saveStudySpaceCredentials,
  type StudySpaceCredentialState,
} from '../../lib/studySpaceReservation'
import {
  clearLmsSession,
  getLmsStatus,
  loginLms,
  type LmsCredentialState,
} from '../../lib/lmsDashboard'
import { notifySchoolIntegrationAuthChanged } from '../../lib/schoolIntegrationEvents'

type AuthState = StudySpaceCredentialState | LmsCredentialState

type AuthService = 'study-space' | 'lms'

interface ServiceAuthState {
  credentialState: AuthState
  message: string
  busy: boolean
  studentId: string
  password: string
  error: string | null
}

const initialState: ServiceAuthState = {
  credentialState: 'missing',
  message: '',
  busy: false,
  studentId: '',
  password: '',
  error: null,
}

function statusVariant(state: AuthState): 'default' | 'secondary' | 'destructive' {
  if (state === 'ready') return 'default'
  if (state === 'auth_failed' || state === 'keychain_unavailable') return 'destructive'
  return 'secondary'
}

function serviceTitle(service: AuthService, locale: AppLocale): string {
  return service === 'lms' ? translate(locale, 'sidebar.auth.lms') : translate(locale, 'sidebar.auth.studySpace')
}

function serviceStatusLabel(service: AuthService, state: AuthState, locale: AppLocale): string {
  if (service === 'lms') {
    if (state === 'ready') return translate(locale, 'lmsDashboard.status.ready')
    if (state === 'auth_failed') return translate(locale, 'lmsDashboard.status.authFailed')
    if (state === 'keychain_unavailable') return translate(locale, 'lmsDashboard.status.keychainUnavailable')
    return translate(locale, 'lmsDashboard.status.missing')
  }
  if (state === 'ready') return translate(locale, 'studySpace.status.ready')
  if (state === 'auth_failed') return translate(locale, 'studySpace.status.authFailed')
  if (state === 'keychain_unavailable') return translate(locale, 'studySpace.status.keychainUnavailable')
  return translate(locale, 'studySpace.status.missing')
}

function SidebarAuthService({
  service,
  state,
  locale,
  onStudentIdChange,
  onPasswordChange,
  onLogin,
  onClear,
}: {
  service: AuthService
  state: ServiceAuthState
  locale: AppLocale
  onStudentIdChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onLogin: () => void
  onClear: () => void
}) {
  const Icon = service === 'lms' ? GraduationCap : CalendarCheck
  const loginLabel = service === 'lms' ? translate(locale, 'lmsDashboard.login.submit') : translate(locale, 'studySpace.credential.save')
  const busyLoginLabel = service === 'lms' ? translate(locale, 'sidebar.auth.signingIn') : translate(locale, 'studySpace.credential.saving')
  const clearLabel = service === 'lms' ? translate(locale, 'lmsDashboard.action.clearSession') : translate(locale, 'studySpace.credential.clear')
  const clearingLabel = service === 'lms' ? translate(locale, 'sidebar.auth.clearing') : translate(locale, 'studySpace.credential.clearing')

  return (
    <div className="rounded-lg border border-border bg-background/70 p-2" data-testid={`sidebar-auth-${service}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
          <Icon size={14} />
          <span className="truncate">{serviceTitle(service, locale)}</span>
        </div>
        <Badge variant={statusVariant(state.credentialState)} className="shrink-0 px-1.5 py-0 text-[10px]">
          {serviceStatusLabel(service, state.credentialState, locale)}
        </Badge>
      </div>
      {state.message ? <p className="mb-2 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{state.message}</p> : null}
      {state.error ? <p className="mb-2 line-clamp-2 text-[11px] leading-4 text-destructive">{state.error}</p> : null}
      {state.credentialState === 'ready' ? (
        <Button type="button" size="sm" variant="outline" className="h-7 w-full text-xs" onClick={onClear} disabled={state.busy}>
          {state.busy ? clearingLabel : clearLabel}
        </Button>
      ) : (
        <div className="grid gap-1.5">
          <Input
            value={state.studentId}
            onChange={(event) => onStudentIdChange(event.target.value)}
            placeholder={translate(locale, 'studySpace.credential.studentId')}
            autoComplete="username"
            className="h-7 text-xs"
          />
          <Input
            value={state.password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder={translate(locale, 'studySpace.credential.password')}
            type="password"
            autoComplete="current-password"
            className="h-7 text-xs"
          />
          <Button type="button" size="sm" className="h-7 text-xs" onClick={onLogin} disabled={state.busy || !state.studentId.trim() || !state.password}>
            {state.busy ? busyLoginLabel : loginLabel}
          </Button>
        </div>
      )}
    </div>
  )
}

export function SidebarSchoolAuthPanel({ locale = 'en' }: { locale?: AppLocale }) {
  const [studySpace, setStudySpace] = useState<ServiceAuthState>(initialState)
  const [lms, setLms] = useState<ServiceAuthState>(initialState)

  const refreshStatuses = useCallback(() => {
    setStudySpace((current) => ({ ...current, busy: true, error: null }))
    setLms((current) => ({ ...current, busy: true, error: null }))
    void getStudySpaceStatus()
      .then((status) => setStudySpace((current) => ({ ...current, credentialState: status.credential_state, message: status.credential_message, error: null })))
      .catch((error) => setStudySpace((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) })))
      .finally(() => setStudySpace((current) => ({ ...current, busy: false })))
    void getLmsStatus()
      .then((status) => setLms((current) => ({ ...current, credentialState: status.credential_state, message: status.credential_message, error: null })))
      .catch((error) => setLms((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) })))
      .finally(() => setLms((current) => ({ ...current, busy: false })))
  }, [])

  useEffect(() => {
    queueMicrotask(refreshStatuses)
  }, [refreshStatuses])

  const loginStudySpace = useCallback(() => {
    setStudySpace((current) => ({ ...current, busy: true, error: null }))
    void saveStudySpaceCredentials({ student_id: studySpace.studentId, password: studySpace.password })
      .then((result) => {
        setStudySpace((current) => ({ ...current, credentialState: result.credential_state, message: result.message, password: '', error: null }))
        notifySchoolIntegrationAuthChanged('study-space')
      })
      .catch((error) => setStudySpace((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) })))
      .finally(() => setStudySpace((current) => ({ ...current, busy: false })))
  }, [studySpace.password, studySpace.studentId])

  const loginLmsDashboard = useCallback(() => {
    setLms((current) => ({ ...current, busy: true, error: null }))
    void loginLms({ student_id: lms.studentId, password: lms.password })
      .then((result) => {
        setLms((current) => ({ ...current, credentialState: result.credential_state, message: result.message, password: '', error: null }))
        notifySchoolIntegrationAuthChanged('lms')
      })
      .catch((error) => setLms((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) })))
      .finally(() => setLms((current) => ({ ...current, busy: false })))
  }, [lms.password, lms.studentId])

  const clearStudySpace = useCallback(() => {
    setStudySpace((current) => ({ ...current, busy: true, error: null }))
    void clearStudySpaceSession()
      .then((result) => {
        setStudySpace((current) => ({ ...current, credentialState: 'missing', message: result.message, password: '', error: null }))
        notifySchoolIntegrationAuthChanged('study-space')
      })
      .catch((error) => setStudySpace((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) })))
      .finally(() => setStudySpace((current) => ({ ...current, busy: false })))
  }, [])

  const clearLms = useCallback(() => {
    setLms((current) => ({ ...current, busy: true, error: null }))
    void clearLmsSession()
      .then((result) => {
        setLms((current) => ({ ...current, credentialState: 'missing', message: result.message, password: '', error: null }))
        notifySchoolIntegrationAuthChanged('lms')
      })
      .catch((error) => setLms((current) => ({ ...current, error: error instanceof Error ? error.message : String(error) })))
      .finally(() => setLms((current) => ({ ...current, busy: false })))
  }, [])

  return (
    <div className="border-t border-border bg-sidebar p-2" data-testid="sidebar-school-auth-panel">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ShieldCheck size={13} />
        {translate(locale, 'sidebar.auth.title')}
      </div>
      <div className="grid gap-2">
        <SidebarAuthService
          service="study-space"
          state={studySpace}
          locale={locale}
          onStudentIdChange={(studentId) => setStudySpace((current) => ({ ...current, studentId }))}
          onPasswordChange={(password) => setStudySpace((current) => ({ ...current, password }))}
          onLogin={loginStudySpace}
          onClear={clearStudySpace}
        />
        <SidebarAuthService
          service="lms"
          state={lms}
          locale={locale}
          onStudentIdChange={(studentId) => setLms((current) => ({ ...current, studentId }))}
          onPasswordChange={(password) => setLms((current) => ({ ...current, password }))}
          onLogin={loginLmsDashboard}
          onClear={clearLms}
        />
      </div>
    </div>
  )
}
