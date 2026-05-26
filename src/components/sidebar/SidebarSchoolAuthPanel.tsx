import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck } from '@phosphor-icons/react'
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
import { clearLmsSession, loginLms } from '../../lib/lmsDashboard'
import { notifySchoolIntegrationAuthChanged } from '../../lib/schoolIntegrationEvents'

type AuthState = StudySpaceCredentialState

interface SchoolAuthState {
  credentialState: AuthState
  message: string
  busy: boolean
  studentId: string
  password: string
  error: string | null
}

const initialState: SchoolAuthState = {
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

function combinedStatusLabel(state: AuthState, locale: AppLocale): string {
  if (state === 'ready') return translate(locale, 'sidebar.auth.ready')
  if (state === 'auth_failed') return translate(locale, 'sidebar.auth.authFailed')
  if (state === 'keychain_unavailable') return translate(locale, 'sidebar.auth.keychainUnavailable')
  return translate(locale, 'sidebar.auth.missing')
}

function defaultMessage(state: AuthState, locale: AppLocale): string {
  if (state === 'ready') return translate(locale, 'sidebar.auth.readyMessage')
  if (state === 'auth_failed') return translate(locale, 'sidebar.auth.authFailedMessage')
  if (state === 'keychain_unavailable') return translate(locale, 'sidebar.auth.keychainUnavailableMessage')
  return translate(locale, 'sidebar.auth.missingMessage')
}

function notifyAllSchoolIntegrationsChanged(): void {
  notifySchoolIntegrationAuthChanged('study-space')
  notifySchoolIntegrationAuthChanged('lms')
}

function settleSilently<T>(promise: Promise<T>): void {
  void promise.catch(() => undefined)
}

function SidebarSharedAuthCard({
  state,
  locale,
  onStudentIdChange,
  onPasswordChange,
  onLogin,
  onClear,
}: {
  state: SchoolAuthState
  locale: AppLocale
  onStudentIdChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onLogin: () => void
  onClear: () => void
}) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-2" data-testid="sidebar-auth-school">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
          <ShieldCheck size={14} />
          <span className="truncate">{translate(locale, 'sidebar.auth.account')}</span>
        </div>
        <Badge variant={statusVariant(state.credentialState)} className="shrink-0 px-1.5 py-0 text-[10px]">
          {combinedStatusLabel(state.credentialState, locale)}
        </Badge>
      </div>
      {state.message ? <p className="mb-2 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{state.message}</p> : null}
      {state.error ? <p className="mb-2 line-clamp-2 text-[11px] leading-4 text-destructive">{state.error}</p> : null}
      {state.credentialState === 'ready' ? (
        <Button type="button" size="sm" variant="outline" className="h-7 w-full text-xs" onClick={onClear} disabled={state.busy}>
          {state.busy ? translate(locale, 'sidebar.auth.clearing') : translate(locale, 'sidebar.auth.clear')}
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
            {state.busy ? translate(locale, 'sidebar.auth.signingIn') : translate(locale, 'sidebar.auth.submit')}
          </Button>
        </div>
      )}
    </div>
  )
}

export function SidebarSchoolAuthPanel({ locale = 'en' }: { locale?: AppLocale }) {
  const [schoolAuth, setSchoolAuth] = useState<SchoolAuthState>(initialState)

  const refreshStatuses = useCallback(() => {
    setSchoolAuth((current) => ({ ...current, busy: true, error: null }))
    void getStudySpaceStatus()
      .then((studySpaceStatus) => {
        const credentialState = studySpaceStatus.credential_state
        setSchoolAuth((current) => ({
          ...current,
          credentialState,
          message: defaultMessage(credentialState, locale),
          error: null,
        }))
      })
      .catch((error) =>
        setSchoolAuth((current) => ({
          ...current,
          credentialState: 'auth_failed',
          message: defaultMessage('auth_failed', locale),
          error: error instanceof Error ? error.message : String(error),
        })),
      )
      .finally(() => setSchoolAuth((current) => ({ ...current, busy: false })))
  }, [locale])

  useEffect(() => {
    queueMicrotask(refreshStatuses)
  }, [refreshStatuses])

  const loginSchoolAccount = useCallback(() => {
    const credentials = { student_id: schoolAuth.studentId.trim(), password: schoolAuth.password }
    setSchoolAuth((current) => ({ ...current, busy: true, error: null }))
    void Promise.all([saveStudySpaceCredentials(credentials), loginLms(credentials)])
      .then(([studySpaceResult]) => {
        const credentialState = studySpaceResult.credential_state
        setSchoolAuth((current) => ({
          ...current,
          credentialState,
          message: defaultMessage(credentialState, locale),
          password: '',
          error: null,
        }))
        notifyAllSchoolIntegrationsChanged()
      })
      .catch((error) =>
        setSchoolAuth((current) => ({
          ...current,
          credentialState: 'auth_failed',
          message: defaultMessage('auth_failed', locale),
          error: error instanceof Error ? error.message : String(error),
        })),
      )
      .finally(() => setSchoolAuth((current) => ({ ...current, busy: false })))
  }, [locale, schoolAuth.password, schoolAuth.studentId])

  const clearSchoolAccount = useCallback(() => {
    setSchoolAuth((current) => ({
      ...current,
      busy: false,
      credentialState: 'missing',
      message: defaultMessage('missing', locale),
      password: '',
      error: null,
    }))
    notifyAllSchoolIntegrationsChanged()
    settleSilently(clearStudySpaceSession().finally(notifyAllSchoolIntegrationsChanged))
    settleSilently(clearLmsSession().finally(notifyAllSchoolIntegrationsChanged))
  }, [locale])

  return (
    <div className="border-t border-border bg-sidebar p-2" data-testid="sidebar-school-auth-panel">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ShieldCheck size={13} />
        {translate(locale, 'sidebar.auth.title')}
      </div>
      <div className="grid gap-2">
        <SidebarSharedAuthCard
          state={schoolAuth}
          locale={locale}
          onStudentIdChange={(studentId) => setSchoolAuth((current) => ({ ...current, studentId }))}
          onPasswordChange={(password) => setSchoolAuth((current) => ({ ...current, password }))}
          onLogin={loginSchoolAccount}
          onClear={clearSchoolAccount}
        />
      </div>
    </div>
  )
}
