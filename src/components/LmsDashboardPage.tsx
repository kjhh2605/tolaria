import { useEffect, useMemo } from 'react'
import { ArrowSquareOut, BookOpen, Clock, GraduationCap, ShieldCheck, WarningCircle } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { translate, type AppLocale } from '../lib/i18n'
import { isSafeLmsUrl, type LmsAssignment } from '../lib/lmsDashboard'
import { trackLmsDashboardOpened, trackLmsOriginalOpened } from '../lib/productAnalytics'
import { openExternalUrl } from '../utils/url'
import { useLmsDashboard } from '../hooks/useLmsDashboard'

interface LmsDashboardPageProps {
  locale?: AppLocale
  onToast?: (message: string) => void
}

function statusLabel(state: string, locale: AppLocale): string {
  if (state === 'ready') return translate(locale, 'lmsDashboard.status.ready')
  if (state === 'auth_failed') return translate(locale, 'lmsDashboard.status.authFailed')
  if (state === 'keychain_unavailable') return translate(locale, 'lmsDashboard.status.keychainUnavailable')
  return translate(locale, 'lmsDashboard.status.missing')
}

function todayDate(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function dateFromParts(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function looksLikeDateRange(raw: string): boolean {
  return /(?:~|～|부터|까지)/.test(raw)
}

function parseDateText(raw: string): Date | null {
  if (!raw.trim() || looksLikeDateRange(raw)) return null

  const koreanWithYear = /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(raw)
  if (koreanWithYear) {
    return dateFromParts(Number(koreanWithYear[1]), Number(koreanWithYear[2]), Number(koreanWithYear[3]))
  }

  const numeric = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(raw)
  if (numeric) return dateFromParts(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]))

  const koreanWithoutYear = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(raw)
  if (!koreanWithoutYear) return null
  return dateFromParts(new Date().getFullYear(), Number(koreanWithoutYear[1]), Number(koreanWithoutYear[2]))
}

function parseDueDate(assignment: LmsAssignment): Date | null {
  const dueDate = assignment.due_date ? parseDateText(assignment.due_date) : null
  if (dueDate) return dueDate
  return assignment.due_text ? parseDateText(assignment.due_text) : null
}

function daysFromToday(date: Date): number {
  const today = todayDate().getTime()
  const due = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return Math.round((due - today) / 86_400_000)
}

function isTodayUrgent(assignment: LmsAssignment): boolean {
  const due = parseDueDate(assignment)
  if (!due) return false
  return daysFromToday(due) <= 0
}

function isThisWeek(assignment: LmsAssignment): boolean {
  const due = parseDueDate(assignment)
  if (!due) return false
  const delta = daysFromToday(due)
  return delta >= 0 && delta <= 7
}

function sortByDueDate(assignments: LmsAssignment[]): LmsAssignment[] {
  return [...assignments].sort((a, b) => {
    const aTime = parseDueDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const bTime = parseDueDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER
    return aTime - bTime
  })
}

function AssignmentList({
  assignments,
  emptyLabel,
  locale,
  onOpen,
}: {
  assignments: LmsAssignment[]
  emptyLabel: string
  locale: AppLocale
  onOpen: (assignment: LmsAssignment) => void
}) {
  if (assignments.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  }
  return (
    <div className="space-y-2">
      {assignments.map((assignment, index) => (
        <div key={`${assignment.assignment_id ?? assignment.url}-${index}`} className="rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{assignment.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{assignment.course_name ?? translate(locale, 'lmsDashboard.assignment.unknownCourse')}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {assignment.due_text ? <span>{assignment.due_text}</span> : <span>{translate(locale, 'lmsDashboard.assignment.noDue')}</span>}
                {assignment.status_text ? <span>· {assignment.status_text}</span> : null}
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpen(assignment)} disabled={!isSafeLmsUrl(assignment.url)}>
              <ArrowSquareOut className="mr-1 h-4 w-4" />
              {translate(locale, 'lmsDashboard.action.openOriginal')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function LmsDashboardPage({ locale = 'ko-KR' }: LmsDashboardPageProps) {
  const { loading, refreshing, status, overview, credentialState, error, lastRefreshedAt, refresh, clearSession } = useLmsDashboard()

  useEffect(() => {
    trackLmsDashboardOpened()
  }, [])

  const assignments = useMemo(() => overview?.assignments ?? [], [overview?.assignments])
  const todayUrgent = useMemo(() => sortByDueDate(assignments.filter(isTodayUrgent)), [assignments])
  const thisWeek = useMemo(() => sortByDueDate(assignments.filter((assignment) => isThisWeek(assignment) && !isTodayUrgent(assignment))), [assignments])
  const needsDateReview = useMemo(() => assignments.filter((assignment) => !parseDueDate(assignment)), [assignments])
  const handleOpenAssignment = (assignment: LmsAssignment) => {
    if (!isSafeLmsUrl(assignment.url)) return
    trackLmsOriginalOpened('assignment')
    void openExternalUrl(assignment.url)
  }
  return (
    <div className="h-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary"><ShieldCheck className="mr-1 h-3.5 w-3.5" />{translate(locale, 'lmsDashboard.hero.badge')}</Badge>
              <Badge variant="outline">{translate(locale, 'lmsDashboard.hero.readOnly')}</Badge>
            </div>
            <CardTitle className="flex items-center gap-2 text-2xl"><GraduationCap className="h-6 w-6" />{translate(locale, 'lmsDashboard.title')}</CardTitle>
            <CardDescription>{translate(locale, 'lmsDashboard.description')}</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" />{translate(locale, 'lmsDashboard.connection.title')}</CardTitle>
            <CardDescription>{status?.credential_message ?? translate(locale, 'lmsDashboard.status.loading')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={credentialState === 'ready' ? 'default' : 'secondary'}>{statusLabel(credentialState, locale)}</Badge>
              {lastRefreshedAt ? <span className="text-sm text-muted-foreground"><Clock className="mr-1 inline h-4 w-4" />{translate(locale, 'lmsDashboard.lastRefreshed')}: {lastRefreshedAt.toLocaleTimeString()}</span> : null}
              <Button type="button" variant="outline" size="sm" onClick={() => void refresh('manual')} disabled={loading || refreshing}>{refreshing ? translate(locale, 'lmsDashboard.action.refreshing') : translate(locale, 'lmsDashboard.action.refresh')}</Button>
              {credentialState === 'ready' ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void clearSession()} disabled={loading || refreshing}>
                  {translate(locale, 'lmsDashboard.action.clearSession')}
                </Button>
              ) : null}
            </div>
            {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><WarningCircle className="mr-1 inline h-4 w-4" />{error.message}</div> : null}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{translate(locale, 'lmsDashboard.today.title')}</CardTitle>
              <CardDescription>{translate(locale, 'lmsDashboard.today.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <AssignmentList assignments={todayUrgent} emptyLabel={translate(locale, 'lmsDashboard.today.empty')} locale={locale} onOpen={handleOpenAssignment} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{translate(locale, 'lmsDashboard.week.title')}</CardTitle>
              <CardDescription>{translate(locale, 'lmsDashboard.week.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <AssignmentList assignments={thisWeek} emptyLabel={translate(locale, 'lmsDashboard.week.empty')} locale={locale} onOpen={handleOpenAssignment} />
            </CardContent>
          </Card>
        </div>

        {needsDateReview.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{translate(locale, 'lmsDashboard.dateReview.title')}</CardTitle>
              <CardDescription>{translate(locale, 'lmsDashboard.dateReview.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <AssignmentList assignments={needsDateReview} emptyLabel={translate(locale, 'lmsDashboard.dateReview.empty')} locale={locale} onOpen={handleOpenAssignment} />
            </CardContent>
          </Card>
        ) : null}

        <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          {translate(locale, 'lmsDashboard.safetyNote')}
        </p>
      </div>
    </div>
  )
}
