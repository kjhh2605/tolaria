export const SCHOOL_INTEGRATION_AUTH_CHANGED = 'hs-hub:school-integration-auth-changed'

export type SchoolIntegrationService = 'study-space' | 'lms'

export function notifySchoolIntegrationAuthChanged(service: SchoolIntegrationService): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SCHOOL_INTEGRATION_AUTH_CHANGED, { detail: { service } }))
}

export function isSchoolIntegrationAuthEventFor(event: Event, service: SchoolIntegrationService): boolean {
  const detail = event instanceof CustomEvent ? event.detail as { service?: unknown } | undefined : undefined
  return detail?.service === service
}
