import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarBlank,
  CheckCircle,
  Clock,
  Plus,
  ShieldCheck,
  Trash,
  Users,
  WarningCircle,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  checkStudySpaceAvailability,
  createStudySpaceReservation,
  getStudySpaceStatus,
  type StudySpaceArea,
  type StudySpaceAvailability,
  type StudySpaceAvailabilityRequest,
  type StudySpaceCredentialState,
  type StudySpaceReservationMember,
  type StudySpaceReservationUsageInfo,
  type StudySpaceReservationResult,
  type StudySpaceRoom,
} from '../lib/studySpaceReservation'
import {
  buildStudySpaceReservationIcs,
  buildStudySpaceReservationNote,
  studySpaceReservationNoteFilename,
  type StudySpaceReservationArtifactInput,
} from '../lib/studySpaceReservationArtifacts'
import { translate, type AppLocale } from '../lib/i18n'
import { isSchoolIntegrationAuthEventFor, SCHOOL_INTEGRATION_AUTH_CHANGED } from '../lib/schoolIntegrationEvents'

const DEFAULT_AREA = 'coding_lounge'
const DEFAULT_START_TIME = '13:00'
const DEFAULT_END_TIME = '15:00'
const DEFAULT_HEADCOUNT = 2

const TIME_OPTIONS = [
  '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00',
]

function todayIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseIsoDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function statusLabel(state: StudySpaceCredentialState, locale: AppLocale): string {
  if (state === 'ready') return translate(locale, 'studySpace.status.ready')
  if (state === 'auth_failed') return translate(locale, 'studySpace.status.authFailed')
  if (state === 'keychain_unavailable') return translate(locale, 'studySpace.status.keychainUnavailable')
  return translate(locale, 'studySpace.status.missing')
}

function requiresMemberDetails(area: string): boolean {
  return area !== 'coding_lounge' && area !== 'sangsang_park_plus' && area !== 'sangsang_base' && area !== 'library_group_study'
}

function requiresUsageDetails(area: string): boolean {
  return area === 'sangsang_park_plus'
}

function requiresBaseUsageDetails(area: string): boolean {
  return area === 'sangsang_base'
}

function requiresLibraryUsageDetails(area: string): boolean {
  return area === 'library_group_study'
}

function libraryRoomRequiresReason(room: StudySpaceRoom): boolean {
  return room.id === 'library_meeting_5f_sangsang_commons' || room.id === 'library_coworking_3f_creative_reading'
}

function ensureMemberCount(members: StudySpaceReservationMember[], count: number): StudySpaceReservationMember[] {
  const target = Math.max(1, Math.min(12, count))
  const next = members.slice(0, target)
  while (next.length < target) next.push({ name: '', student_number: '' })
  return next
}

function roomMatchesCapacity(room: StudySpaceRoom, minCapacity: number | null, maxCapacity: number | null): boolean {
  if (minCapacity !== null && room.max_capacity < minCapacity) return false
  if (maxCapacity !== null && room.min_capacity > maxCapacity) return false
  return true
}

function roomAvailabilityKey(room: StudySpaceRoom): string {
  return `${room.area}:${room.id}`
}

function slotLabel(startTime: string, endTime: string): string {
  return `${startTime}–${endTime}`
}

function availabilityStatusText(state: StudySpaceAvailability | undefined, locale: AppLocale): string {
  if (!state) return translate(locale, 'studySpace.results.notChecked')
  return state.available
    ? translate(locale, 'studySpace.results.available')
    : state.reason ?? translate(locale, 'studySpace.results.unavailable')
}

function requestFromState({
  area,
  date,
  startTime,
  endTime,
  headcount,
  minCapacity,
  maxCapacity,
  roomId,
}: {
  area: string
  date: string
  startTime: string
  endTime: string
  headcount: number
  minCapacity: number | null
  maxCapacity: number | null
  roomId?: string | null
}): StudySpaceAvailabilityRequest {
  return {
    area,
    date,
    start_time: startTime,
    end_time: endTime,
    headcount,
    min_capacity: minCapacity,
    max_capacity: maxCapacity,
    room_id: roomId ?? null,
  }
}

interface StudySpaceReservationPageProps {
  locale?: AppLocale
  onToast?: (message: string) => void
  onCreateReservationNote?: (filename: string, markdown: string) => Promise<void>
}

function downloadTextFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function StudySpaceReservationPage({ locale = 'ko-KR', onToast, onCreateReservationNote }: StudySpaceReservationPageProps) {
  const [areas, setAreas] = useState<StudySpaceArea[]>([])
  const [credentialState, setCredentialState] = useState<StudySpaceCredentialState>('missing')
  const [credentialMessage, setCredentialMessage] = useState('')
  const [area, setArea] = useState(DEFAULT_AREA)
  const [date, setDate] = useState(todayIsoDate)
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME)
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME)
  const [headcount, setHeadcount] = useState(DEFAULT_HEADCOUNT)
  const [minCapacity, setMinCapacity] = useState<number | null>(null)
  const [maxCapacity, setMaxCapacity] = useState<number | null>(null)
  const [rooms, setRooms] = useState<StudySpaceRoom[]>([])
  const [availability, setAvailability] = useState<Map<string, StudySpaceAvailability>>(new Map())
  const [hasCheckedAvailability, setHasCheckedAvailability] = useState(false)
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<string>>(new Set())
  const [members, setMembers] = useState<StudySpaceReservationMember[]>(() => ensureMemberCount([], DEFAULT_HEADCOUNT))
  const [usageAffiliation, setUsageAffiliation] = useState('')
  const [usagePurpose, setUsagePurpose] = useState('')
  const [baseAllUsers, setBaseAllUsers] = useState('')
  const [libraryCompanionUsers, setLibraryCompanionUsers] = useState('')
  const [libraryReservationReason, setLibraryReservationReason] = useState('')
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [checking, setChecking] = useState(false)
  const [reservingRoom, setReservingRoom] = useState<StudySpaceRoom | null>(null)
  const [reservationBusy, setReservationBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [success, setSuccess] = useState<StudySpaceReservationResult | null>(null)
  const [successArtifact, setSuccessArtifact] = useState<StudySpaceReservationArtifactInput | null>(null)
  const [noteBusy, setNoteBusy] = useState(false)

  const selectedArea = areas.find((candidate) => candidate.key === area)
  const selectedDate = parseIsoDate(date)
  const memberDetailsRequired = requiresMemberDetails(area)
  const usageDetailsRequired = requiresUsageDetails(area)
  const baseUsageDetailsRequired = requiresBaseUsageDetails(area)
  const libraryUsageDetailsRequired = requiresLibraryUsageDetails(area)

  const filteredRooms = useMemo(() => (
    rooms.filter((room) => roomMatchesCapacity(room, minCapacity, maxCapacity))
  ), [maxCapacity, minCapacity, rooms])

  const completeMembers = useMemo(() => (
    members.filter((member) => member.name.trim() && member.student_number.trim())
  ), [members])

  const refreshCredentialStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const status = await getStudySpaceStatus()
      setAreas(status.supported_areas)
      setCredentialState(status.credential_state)
      setCredentialMessage(status.credential_message)
      setArea((currentArea) => (
        status.supported_areas.some((candidate) => candidate.key === currentArea)
          ? currentArea
          : status.supported_areas.find((candidate) => candidate.supported)?.key ?? DEFAULT_AREA
      ))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  useEffect(() => {
    void refreshCredentialStatus()
  }, [refreshCredentialStatus])

  useEffect(() => {
    const onAuthChanged = (event: Event) => {
      if (isSchoolIntegrationAuthEventFor(event, 'study-space')) void refreshCredentialStatus()
    }
    window.addEventListener(SCHOOL_INTEGRATION_AUTH_CHANGED, onAuthChanged)
    return () => window.removeEventListener(SCHOOL_INTEGRATION_AUTH_CHANGED, onAuthChanged)
  }, [refreshCredentialStatus])

  useEffect(() => {
    setMembers((current) => ensureMemberCount(current, headcount))
  }, [headcount])

  useEffect(() => {
    setRooms([])
    setAvailability(new Map())
    setHasCheckedAvailability(false)
    setExpandedRoomIds(new Set())
  }, [area, date, endTime, headcount, maxCapacity, minCapacity, startTime])

  const handleHeadcountChange = useCallback((value: string) => {
    const parsed = Number.parseInt(value, 10)
    setHeadcount(Number.isFinite(parsed) ? Math.max(1, Math.min(12, parsed)) : 1)
  }, [])

  const handleMemberChange = useCallback((index: number, field: keyof StudySpaceReservationMember, value: string) => {
    setMembers((current) => current.map((member, memberIndex) => (
      memberIndex === index ? { ...member, [field]: value } : member
    )))
  }, [])

  const handleAddMember = useCallback(() => {
    setHeadcount((current) => Math.min(12, current + 1))
  }, [])

  const handleRemoveMember = useCallback((index: number) => {
    setMembers((current) => ensureMemberCount(current.filter((_, memberIndex) => memberIndex !== index), Math.max(1, headcount - 1)))
    setHeadcount((current) => Math.max(1, current - 1))
  }, [headcount])

  const buildRequest = useCallback((roomId?: string | null) => requestFromState({
    area,
    date,
    startTime,
    endTime,
    headcount,
    minCapacity,
    maxCapacity,
    roomId,
  }), [area, date, endTime, headcount, maxCapacity, minCapacity, startTime])

  const toggleRoomSlots = useCallback((roomId: string) => {
    setExpandedRoomIds((current) => {
      const next = new Set(current)
      if (next.has(roomId)) {
        next.delete(roomId)
      } else {
        next.add(roomId)
      }
      return next
    })
  }, [])

  const handleCheckAvailability = useCallback(async () => {
    setChecking(true)
    setErrorMessage(null)
    setSuccess(null)
    setSuccessArtifact(null)
    try {
      const response = await checkStudySpaceAvailability(buildRequest())
      setRooms(response.results.map((result) => result.room))
      setAvailability(new Map(response.results.map((result) => [roomAvailabilityKey(result.room), result])))
      setExpandedRoomIds(new Set())
      setHasCheckedAvailability(true)
      if (response.results.length > 0 && response.results.every((result) => !result.available)) {
        setErrorMessage(translate(locale, 'studySpace.availability.none'))
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setChecking(false)
    }
  }, [buildRequest, locale])

  const handleReserve = useCallback(async () => {
    if (!reservingRoom) return
    if (memberDetailsRequired && completeMembers.length < headcount) {
      setErrorMessage(translate(locale, 'studySpace.error.membersIncomplete'))
      setReservingRoom(null)
      return
    }
    if (usageDetailsRequired && (!usageAffiliation.trim() || !usagePurpose.trim() || headcount < 1)) {
      setErrorMessage(translate(locale, 'studySpace.error.usageDetailsIncomplete'))
      setReservingRoom(null)
      return
    }
    if (baseUsageDetailsRequired && (!baseAllUsers.trim() || headcount < 1)) {
      setErrorMessage(translate(locale, 'studySpace.error.baseUsageDetailsIncomplete'))
      setReservingRoom(null)
      return
    }
    const libraryReasonRequired = libraryUsageDetailsRequired && libraryRoomRequiresReason(reservingRoom)
    if (libraryReasonRequired && (!libraryReservationReason.trim() || headcount < 1)) {
      setErrorMessage(translate(locale, 'studySpace.error.libraryReasonDetailsIncomplete'))
      setReservingRoom(null)
      return
    }
    if (libraryUsageDetailsRequired && !libraryReasonRequired && (!libraryCompanionUsers.trim() || headcount < 1)) {
      setErrorMessage(translate(locale, 'studySpace.error.libraryCompanionDetailsIncomplete'))
      setReservingRoom(null)
      return
    }

    const requestMembers = memberDetailsRequired ? completeMembers : []
    const usageInfo: StudySpaceReservationUsageInfo | null = usageDetailsRequired
      ? { affiliation: usageAffiliation.trim(), attendee_count: headcount, purpose: usagePurpose.trim() }
      : baseUsageDetailsRequired
        ? { all_users: baseAllUsers.trim(), attendee_count: headcount }
        : libraryUsageDetailsRequired
          ? libraryReasonRequired
            ? { reservation_reason: libraryReservationReason.trim(), attendee_count: headcount }
            : { companion_users: libraryCompanionUsers.trim(), attendee_count: headcount }
          : null

    setReservationBusy(true)
    setErrorMessage(null)
    try {
      const selectedRoom = reservingRoom
      const result = await createStudySpaceReservation({
        ...buildRequest(selectedRoom.id),
        room_id: selectedRoom.id,
        members: requestMembers,
        usage_info: usageInfo,
        dry_run: false,
        confirm: true,
      })
      setSuccess(result)
      setSuccessArtifact({ result, room: selectedRoom, members: requestMembers })
      onToast?.(translate(locale, 'studySpace.success.toast'))
      setReservingRoom(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setReservingRoom(null)
    } finally {
      setReservationBusy(false)
    }
  }, [baseAllUsers, baseUsageDetailsRequired, buildRequest, completeMembers, headcount, libraryCompanionUsers, libraryReservationReason, libraryUsageDetailsRequired, locale, memberDetailsRequired, onToast, reservingRoom, usageAffiliation, usageDetailsRequired, usagePurpose])

  const handleCreateReservationNote = useCallback(async () => {
    if (!successArtifact || !onCreateReservationNote) return
    setNoteBusy(true)
    try {
      await onCreateReservationNote(
        studySpaceReservationNoteFilename(successArtifact),
        buildStudySpaceReservationNote(successArtifact),
      )
      onToast?.(translate(locale, 'studySpace.success.noteSaved'))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setNoteBusy(false)
    }
  }, [locale, onCreateReservationNote, onToast, successArtifact])

  const handleDownloadIcs = useCallback(() => {
    if (!successArtifact) return
    const filename = studySpaceReservationNoteFilename(successArtifact).replace(/\.md$/, '.ics')
    downloadTextFile(filename, buildStudySpaceReservationIcs(successArtifact), 'text/calendar;charset=utf-8')
  }, [successArtifact])

  return (
    <div className="h-full overflow-auto bg-background" data-testid="study-space-page">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <ShieldCheck size={14} />
              {translate(locale, 'studySpace.hero.badge')}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{translate(locale, 'studySpace.title')}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{translate(locale, 'studySpace.description')}</p>
          </div>
          <div className="rounded-xl border bg-background px-4 py-3 text-sm">
            <div className="font-medium text-foreground">{statusLabel(credentialState, locale)}</div>
            <div className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
              {loadingStatus ? translate(locale, 'studySpace.status.loading') : credentialMessage}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{translate(locale, 'studySpace.credential.sidebarHint')}</div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{translate(locale, 'studySpace.search.title')}</CardTitle>
              <CardDescription>{translate(locale, 'studySpace.search.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="grid gap-2 text-sm font-medium">
                {translate(locale, 'studySpace.field.area')}
                <Select value={area} onValueChange={setArea}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(areas.length > 0 ? areas : [{ key: DEFAULT_AREA, label: '코딩라운지', supported: true }]).map((candidate) => (
                      <SelectItem key={candidate.key} value={candidate.key} disabled={!candidate.supported}>
                        {candidate.label}{candidate.supported ? '' : ` · ${translate(locale, 'studySpace.area.unsupported')}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedArea?.note && <span className="text-xs text-muted-foreground">{selectedArea.note}</span>}
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2 text-sm font-medium">
                  {translate(locale, 'studySpace.field.date')}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className="justify-start">
                        <CalendarBlank size={16} />
                        {date}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(day) => { if (day) setDate(formatIsoDate(day)) }}
                        defaultMonth={selectedDate}
                        captionLayout="dropdown"
                        navLayout="after"
                      />
                    </PopoverContent>
                  </Popover>
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  {translate(locale, 'studySpace.field.headcount')}
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={String(headcount)}
                    onChange={(event) => handleHeadcountChange(event.target.value)}
                    aria-label={translate(locale, 'studySpace.field.headcount')}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2 text-sm font-medium">
                  {translate(locale, 'studySpace.field.startTime')}
                  <Select value={startTime} onValueChange={setStartTime}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{TIME_OPTIONS.map((time) => <SelectItem key={time} value={time}>{time}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  {translate(locale, 'studySpace.field.endTime')}
                  <Select value={endTime} onValueChange={setEndTime}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{TIME_OPTIONS.map((time) => <SelectItem key={time} value={time}>{time}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2 text-sm font-medium">
                  {translate(locale, 'studySpace.field.minCapacity')}
                  <Input type="text" inputMode="numeric" value={minCapacity ?? ''} onChange={(event) => setMinCapacity(event.target.value ? Number.parseInt(event.target.value, 10) : null)} placeholder="1" />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  {translate(locale, 'studySpace.field.maxCapacity')}
                  <Input type="text" inputMode="numeric" value={maxCapacity ?? ''} onChange={(event) => setMaxCapacity(event.target.value ? Number.parseInt(event.target.value, 10) : null)} placeholder="12" />
                </label>
              </div>

              <Button type="button" className="w-full" onClick={handleCheckAvailability} disabled={checking}>
                <Clock size={16} />
                {checking ? translate(locale, 'studySpace.action.checking') : translate(locale, 'studySpace.action.check')}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {memberDetailsRequired && (
              <Card>
                <CardHeader>
                  <CardTitle>{translate(locale, 'studySpace.members.title')}</CardTitle>
                  <CardDescription>{translate(locale, 'studySpace.members.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {members.map((member, index) => (
                    <div key={index} className="grid gap-2 rounded-xl border bg-background p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                      <label className="grid gap-1 text-sm font-medium">
                        {translate(locale, 'studySpace.field.studentNumber')}
                        <Input value={member.student_number} onChange={(event) => handleMemberChange(index, 'student_number', event.target.value)} placeholder="2170000" />
                      </label>
                      <label className="grid gap-1 text-sm font-medium">
                        {translate(locale, 'studySpace.field.memberName')}
                        <Input value={member.name} onChange={(event) => handleMemberChange(index, 'name', event.target.value)} placeholder={translate(locale, 'studySpace.placeholder.memberName')} />
                      </label>
                      <Button type="button" variant="ghost" size="icon" aria-label={translate(locale, 'studySpace.action.removeMember')} onClick={() => handleRemoveMember(index)} disabled={members.length <= 1}>
                        <Trash size={16} />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" onClick={handleAddMember} disabled={members.length >= 12}>
                    <Plus size={16} />
                    {translate(locale, 'studySpace.action.addMember')}
                  </Button>
                </CardContent>
              </Card>
            )}

            {usageDetailsRequired && (
              <Card>
                <CardHeader>
                  <CardTitle>{translate(locale, 'studySpace.usage.title')}</CardTitle>
                  <CardDescription>{translate(locale, 'studySpace.usage.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="grid gap-2 text-sm font-medium">
                    {translate(locale, 'studySpace.field.affiliation')}
                    <Input
                      value={usageAffiliation}
                      onChange={(event) => setUsageAffiliation(event.target.value)}
                      placeholder={translate(locale, 'studySpace.placeholder.affiliation')}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    {translate(locale, 'studySpace.field.attendeeCount')}
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(headcount)}
                      onChange={(event) => handleHeadcountChange(event.target.value)}
                      aria-label={translate(locale, 'studySpace.field.attendeeCount')}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    {translate(locale, 'studySpace.field.purpose')}
                    <Input
                      value={usagePurpose}
                      onChange={(event) => setUsagePurpose(event.target.value)}
                      placeholder={translate(locale, 'studySpace.placeholder.purpose')}
                    />
                  </label>
                </CardContent>
              </Card>
            )}

            {baseUsageDetailsRequired && (
              <Card>
                <CardHeader>
                  <CardTitle>{translate(locale, 'studySpace.baseUsage.title')}</CardTitle>
                  <CardDescription>{translate(locale, 'studySpace.baseUsage.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="grid gap-2 text-sm font-medium">
                    {translate(locale, 'studySpace.field.allUsers')}
                    <Input
                      value={baseAllUsers}
                      onChange={(event) => setBaseAllUsers(event.target.value)}
                      placeholder={translate(locale, 'studySpace.placeholder.allUsers')}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    {translate(locale, 'studySpace.field.totalAttendeeCount')}
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(headcount)}
                      onChange={(event) => handleHeadcountChange(event.target.value)}
                      aria-label={translate(locale, 'studySpace.field.totalAttendeeCount')}
                    />
                  </label>
                </CardContent>
              </Card>
            )}

            {libraryUsageDetailsRequired && (
              <Card>
                <CardHeader>
                  <CardTitle>{translate(locale, 'studySpace.libraryUsage.title')}</CardTitle>
                  <CardDescription>{translate(locale, 'studySpace.libraryUsage.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="grid gap-2 text-sm font-medium">
                    {translate(locale, 'studySpace.field.companionUsers')}
                    <Input
                      value={libraryCompanionUsers}
                      onChange={(event) => setLibraryCompanionUsers(event.target.value)}
                      placeholder={translate(locale, 'studySpace.placeholder.companionUsers')}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    {translate(locale, 'studySpace.field.reservationReason')}
                    <Input
                      value={libraryReservationReason}
                      onChange={(event) => setLibraryReservationReason(event.target.value)}
                      placeholder={translate(locale, 'studySpace.placeholder.reservationReason')}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    {translate(locale, 'studySpace.field.totalAttendeeCount')}
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(headcount)}
                      onChange={(event) => handleHeadcountChange(event.target.value)}
                      aria-label={translate(locale, 'studySpace.field.totalAttendeeCount')}
                    />
                  </label>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>{translate(locale, 'studySpace.results.title')}</CardTitle>
                    <CardDescription>{translate(locale, 'studySpace.results.description')}</CardDescription>
                  </div>
                  <Badge variant="secondary" className="w-fit">{filteredRooms.length}{translate(locale, 'studySpace.results.countSuffix')}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {errorMessage && (
                  <div className="mb-4 flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                    <WarningCircle size={18} className="mt-0.5 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
                {success && (
                  <div className="mb-4 space-y-3 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700" role="status">
                    <div className="flex gap-2">
                      <CheckCircle size={18} className="mt-0.5 shrink-0" />
                      <span>{translate(locale, 'studySpace.success.message', { id: success.reservation_id ?? '-' })}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pl-7">
                      {onCreateReservationNote && (
                        <Button type="button" variant="outline" size="sm" onClick={handleCreateReservationNote} disabled={noteBusy}>
                          {noteBusy ? translate(locale, 'studySpace.action.savingNote') : translate(locale, 'studySpace.action.saveNote')}
                        </Button>
                      )}
                      <Button type="button" variant="outline" size="sm" onClick={handleDownloadIcs}>
                        {translate(locale, 'studySpace.action.downloadIcs')}
                      </Button>
                    </div>
                  </div>
                )}
                <div className="overflow-hidden rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">{translate(locale, 'studySpace.results.room')}</th>
                        <th className="px-3 py-2 font-medium">{translate(locale, 'studySpace.results.capacity')}</th>
                        <th className="px-3 py-2 font-medium">{translate(locale, 'studySpace.results.hours')}</th>
                        <th className="px-3 py-2 font-medium">{translate(locale, 'studySpace.results.status')}</th>
                        <th className="px-3 py-2 text-right font-medium">{translate(locale, 'studySpace.results.action')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checking ? (
                        <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>{translate(locale, 'studySpace.results.loading')}</td></tr>
                      ) : !hasCheckedAvailability ? (
                        <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>{translate(locale, 'studySpace.results.notCheckedPrompt')}</td></tr>
                      ) : filteredRooms.length === 0 ? (
                        <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>{translate(locale, 'studySpace.results.empty')}</td></tr>
                      ) : filteredRooms.map((room) => {
                        const state = availability.get(roomAvailabilityKey(room))
                        const unavailable = !state?.available || !room.supported
                        const expanded = expandedRoomIds.has(room.id)
                        return (
                          <Fragment key={room.id}>
                            <tr className="border-t">
                              <td className="px-3 py-3">
                                <div className="font-medium text-foreground">{room.name}</div>
                                <div className="text-xs text-muted-foreground">{room.location}</div>
                              </td>
                              <td className="px-3 py-3">{room.min_capacity}–{room.max_capacity}{translate(locale, 'studySpace.unit.people')}</td>
                              <td className="px-3 py-3">{room.operating_hours}</td>
                              <td className="px-3 py-3">
                                <Badge variant={state?.available ? 'default' : 'secondary'}>
                                  {availabilityStatusText(state, locale)}
                                </Badge>
                              </td>
                              <td className="px-3 py-3 text-right">
                                <div className="flex justify-end gap-2">
                                  <Button type="button" size="sm" variant="outline" onClick={() => toggleRoomSlots(room.id)} disabled={!state?.slots?.length}>
                                    {expanded ? translate(locale, 'studySpace.results.hideSlots') : translate(locale, 'studySpace.results.showSlots')}
                                  </Button>
                                  <Button type="button" size="sm" onClick={() => setReservingRoom(room)} disabled={unavailable}>
                                    {translate(locale, 'studySpace.action.reserve')}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {expanded && state?.slots?.length ? (
                              <tr className="border-t bg-muted/20">
                                <td className="px-3 py-3 text-xs text-muted-foreground" colSpan={5}>
                                  <div className="mb-2 font-medium text-foreground">{translate(locale, 'studySpace.results.slotHistory')}</div>
                                  <div className="flex flex-wrap gap-2">
                                    {state.slots.map((slot) => (
                                      <Badge key={`${room.id}:${slot.start_time}`} variant={slot.available ? 'outline' : 'secondary'}>
                                        {slotLabel(slot.start_time, slot.end_time)} · {slot.available ? translate(locale, 'studySpace.results.available') : slot.reason ?? translate(locale, 'studySpace.results.reserved')}
                                      </Badge>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(reservingRoom)} onOpenChange={(open) => { if (!open && !reservationBusy) setReservingRoom(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate(locale, 'studySpace.confirm.title')}</DialogTitle>
            <DialogDescription>
              {translate(locale, 'studySpace.confirm.description', {
                room: reservingRoom?.name ?? '',
                date,
                start: startTime,
                end: endTime,
                count: headcount,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Users size={16} className="mr-1 inline" />
            {translate(locale, 'studySpace.confirm.security')}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReservingRoom(null)} disabled={reservationBusy}>{translate(locale, 'common.cancel')}</Button>
            <Button type="button" onClick={handleReserve} disabled={reservationBusy}>
              {reservationBusy ? translate(locale, 'studySpace.action.reserving') : translate(locale, 'studySpace.action.confirmReserve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
