import { useCallback, useEffect, useMemo, useState } from 'react'
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
  listStudySpaceRooms,
  type StudySpaceArea,
  type StudySpaceAvailability,
  type StudySpaceAvailabilityRequest,
  type StudySpaceCredentialState,
  type StudySpaceReservationMember,
  type StudySpaceReservationResult,
  type StudySpaceRoom,
} from '../lib/studySpaceReservation'
import { translate, type AppLocale } from '../lib/i18n'

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
}

export function StudySpaceReservationPage({ locale = 'ko-KR', onToast }: StudySpaceReservationPageProps) {
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
  const [members, setMembers] = useState<StudySpaceReservationMember[]>(() => ensureMemberCount([], DEFAULT_HEADCOUNT))
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [checking, setChecking] = useState(false)
  const [reservingRoom, setReservingRoom] = useState<StudySpaceRoom | null>(null)
  const [reservationBusy, setReservationBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [success, setSuccess] = useState<StudySpaceReservationResult | null>(null)

  const selectedArea = areas.find((candidate) => candidate.key === area)
  const selectedDate = parseIsoDate(date)

  const filteredRooms = useMemo(() => (
    rooms.filter((room) => roomMatchesCapacity(room, minCapacity, maxCapacity))
  ), [maxCapacity, minCapacity, rooms])

  const completeMembers = useMemo(() => (
    members.filter((member) => member.name.trim() && member.student_number.trim())
  ), [members])

  useEffect(() => {
    let cancelled = false
    setLoadingStatus(true)
    getStudySpaceStatus()
      .then((status) => {
        if (cancelled) return
        setAreas(status.supported_areas)
        setCredentialState(status.credential_state)
        setCredentialMessage(status.credential_message)
        if (!status.supported_areas.some((candidate) => candidate.key === area)) {
          setArea(status.supported_areas.find((candidate) => candidate.supported)?.key ?? DEFAULT_AREA)
        }
      })
      .catch((error) => {
        if (cancelled) return
        setErrorMessage(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setLoadingStatus(false)
      })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- initial adapter status only

  useEffect(() => {
    let cancelled = false
    setLoadingRooms(true)
    setErrorMessage(null)
    listStudySpaceRooms(area)
      .then((nextRooms) => {
        if (cancelled) return
        setRooms(nextRooms)
        setAvailability(new Map())
      })
      .catch((error) => {
        if (cancelled) return
        setRooms([])
        setAvailability(new Map())
        setErrorMessage(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setLoadingRooms(false)
      })
    return () => { cancelled = true }
  }, [area])

  useEffect(() => {
    setMembers((current) => ensureMemberCount(current, headcount))
  }, [headcount])

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

  const handleCheckAvailability = useCallback(async () => {
    setChecking(true)
    setErrorMessage(null)
    setSuccess(null)
    try {
      const response = await checkStudySpaceAvailability(buildRequest())
      setAvailability(new Map(response.results.map((result) => [roomAvailabilityKey(result.room), result])))
      if (response.results.every((result) => !result.available)) {
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
    if (completeMembers.length < headcount) {
      setErrorMessage(translate(locale, 'studySpace.error.membersIncomplete'))
      setReservingRoom(null)
      return
    }

    setReservationBusy(true)
    setErrorMessage(null)
    try {
      const result = await createStudySpaceReservation({
        ...buildRequest(reservingRoom.id),
        room_id: reservingRoom.id,
        members: completeMembers,
        dry_run: false,
        confirm: true,
      })
      setSuccess(result)
      onToast?.(translate(locale, 'studySpace.success.toast'))
      setReservingRoom(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setReservingRoom(null)
    } finally {
      setReservationBusy(false)
    }
  }, [buildRequest, completeMembers, headcount, locale, onToast, reservingRoom])

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

              <Button type="button" className="w-full" onClick={handleCheckAvailability} disabled={checking || loadingRooms}>
                <Clock size={16} />
                {checking ? translate(locale, 'studySpace.action.checking') : translate(locale, 'studySpace.action.check')}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-4">
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
                  <div className="mb-4 flex gap-2 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700" role="status">
                    <CheckCircle size={18} className="mt-0.5 shrink-0" />
                    <span>{translate(locale, 'studySpace.success.message', { id: success.reservation_id ?? '-' })}</span>
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
                      {loadingRooms ? (
                        <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>{translate(locale, 'studySpace.results.loading')}</td></tr>
                      ) : filteredRooms.length === 0 ? (
                        <tr><td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>{translate(locale, 'studySpace.results.empty')}</td></tr>
                      ) : filteredRooms.map((room) => {
                        const state = availability.get(roomAvailabilityKey(room))
                        const unavailable = state?.available === false || !room.supported
                        return (
                          <tr key={room.id} className="border-t">
                            <td className="px-3 py-3">
                              <div className="font-medium text-foreground">{room.name}</div>
                              <div className="text-xs text-muted-foreground">{room.location}</div>
                            </td>
                            <td className="px-3 py-3">{room.min_capacity}–{room.max_capacity}{translate(locale, 'studySpace.unit.people')}</td>
                            <td className="px-3 py-3">{room.operating_hours}</td>
                            <td className="px-3 py-3">
                              <Badge variant={state?.available ? 'default' : 'secondary'}>
                                {state ? (state.available ? translate(locale, 'studySpace.results.available') : state.reason ?? translate(locale, 'studySpace.results.unavailable')) : translate(locale, 'studySpace.results.notChecked')}
                              </Badge>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <Button type="button" size="sm" onClick={() => setReservingRoom(room)} disabled={unavailable}>
                                {translate(locale, 'studySpace.action.reserve')}
                              </Button>
                            </td>
                          </tr>
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
