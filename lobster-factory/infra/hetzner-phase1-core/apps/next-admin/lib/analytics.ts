import posthog from 'posthog-js'

// Typed event registry — add new events here before using in components
export const Events = {
  // Navigation
  PAGE_VIEWED: 'page_viewed',
  // API health
  API_CHECK_TRIGGERED: 'api_check_triggered',
  API_CHECK_SUCCEEDED: 'api_check_succeeded',
  API_CHECK_FAILED: 'api_check_failed',
  // Auth (future)
  ADMIN_LOGIN: 'admin_login',
  ADMIN_LOGOUT: 'admin_logout',
} as const

type EventName = (typeof Events)[keyof typeof Events]

export function track(event: EventName, props?: Record<string, unknown>) {
  posthog.capture(event, props)
}
