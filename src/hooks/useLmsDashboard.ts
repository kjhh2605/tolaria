import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearLmsSession,
  getLmsOverview,
  getLmsStatus,
  loginLms,
  type LmsCredentialState,
  type LmsDashboardError,
  type LmsLoginRequest,
  type LmsOverview,
  type LmsStatus,
} from '../lib/lmsDashboard'
import {
  trackLmsDashboardRefreshCompleted,
  trackLmsDashboardRefreshFailed,
  trackLmsDashboardRefreshTriggered,
  trackLmsSessionCleared,
  type LmsDashboardRefreshSource,
} from '../lib/productAnalytics'
import { isSchoolIntegrationAuthEventFor, SCHOOL_INTEGRATION_AUTH_CHANGED } from '../lib/schoolIntegrationEvents'

interface LmsDashboardState {
  loading: boolean
  refreshing: boolean
  credentialState: LmsCredentialState
  status: LmsStatus | null
  overview: LmsOverview | null
  error: LmsDashboardError | Error | null
  lastRefreshedAt: Date | null
}

export interface UseLmsDashboardResult extends LmsDashboardState {
  refresh: (source?: LmsDashboardRefreshSource) => Promise<void>
  login: (request: LmsLoginRequest) => Promise<void>
  clearSession: () => Promise<void>
}

const RESUME_REFRESH_GUARD_MS = 60_000

function errorReason(error: unknown): Parameters<typeof trackLmsDashboardRefreshFailed>[0] {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : ''
  if (code === 'AUTH_REQUIRED') return 'auth_required'
  if (code === 'AUTH_FAILED') return 'auth_failed'
  if (code === 'NETWORK_ERROR') return 'network'
  if (code === 'BRIDGE_UNAVAILABLE' || code === 'BRIDGE_TIMEOUT') return 'bridge'
  if (code === 'PARSE_ERROR') return 'parse'
  return 'unknown'
}

export function useLmsDashboard(): UseLmsDashboardResult {
  const [state, setState] = useState<LmsDashboardState>({
    loading: true,
    refreshing: false,
    credentialState: 'missing',
    status: null,
    overview: null,
    error: null,
    lastRefreshedAt: null,
  })
  const lastFetchMsRef = useRef(0)

  const refresh = useCallback(async (source: LmsDashboardRefreshSource = 'manual') => {
    trackLmsDashboardRefreshTriggered(source)
    setState((current) => ({ ...current, loading: current.status === null, refreshing: current.status !== null, error: null }))
    try {
      const status = await getLmsStatus()
      let overview: LmsOverview | null = null
      if (status.credential_state === 'ready') {
        overview = await getLmsOverview()
        trackLmsDashboardRefreshCompleted(overview)
      }
      lastFetchMsRef.current = Date.now()
      setState({
        loading: false,
        refreshing: false,
        credentialState: status.credential_state,
        status,
        overview,
        error: null,
        lastRefreshedAt: new Date(),
      })
    } catch (error) {
      trackLmsDashboardRefreshFailed(errorReason(error))
      setState((current) => ({ ...current, loading: false, refreshing: false, error: error as Error }))
    }
  }, [])

  const login = useCallback(async (request: LmsLoginRequest) => {
    setState((current) => ({ ...current, refreshing: true, error: null }))
    try {
      await loginLms(request)
      await refresh('manual')
    } catch (error) {
      trackLmsDashboardRefreshFailed(errorReason(error))
      setState((current) => ({ ...current, refreshing: false, error: error as Error }))
    }
  }, [refresh])

  const clearSession = useCallback(async () => {
    setState((current) => ({ ...current, refreshing: true, error: null }))
    try {
      await clearLmsSession()
      trackLmsSessionCleared()
      await refresh('manual')
    } catch (error) {
      setState((current) => ({ ...current, refreshing: false, error: error as Error }))
    }
  }, [refresh])

  useEffect(() => {
    void refresh('open')
  }, [refresh])

  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastFetchMsRef.current < RESUME_REFRESH_GUARD_MS) return
      void refresh('resume')
    }
    const onAuthChanged = (event: Event) => {
      if (isSchoolIntegrationAuthEventFor(event, 'lms')) void refresh('manual')
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener(SCHOOL_INTEGRATION_AUTH_CHANGED, onAuthChanged)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(SCHOOL_INTEGRATION_AUTH_CHANGED, onAuthChanged)
    }
  }, [refresh])

  return { ...state, refresh, login, clearSession }
}
