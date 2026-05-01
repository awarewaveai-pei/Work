import posthog from "posthog-js";

// Typed event registry — add new events here before using in components
export const Events = {
  PAGE_VIEWED: "page_viewed",
  // Ops surfaces
  OPS_CONSOLE_VIEWED: "ops_console_viewed",
  OPS_INBOX_VIEWED: "ops_inbox_viewed",
  // API health
  API_CHECK_TRIGGERED: "api_check_triggered",
  API_CHECK_SUCCEEDED: "api_check_succeeded",
  API_CHECK_FAILED: "api_check_failed",
  // Auth (reserved for future SSO)
  ADMIN_LOGIN: "admin_login",
  ADMIN_LOGOUT: "admin_logout",
} as const;

type EventName = (typeof Events)[keyof typeof Events];

function posthogEnabled(): boolean {
  return Boolean(
    typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim(),
  );
}

export function track(event: EventName, props?: Record<string, unknown>) {
  if (!posthogEnabled()) return;
  posthog.capture(event, props);
}

/** Attach to every subsequent capture (session-scoped); never put secrets here. */
export function registerOpsSuperProperties(role: string, source: string) {
  if (!posthogEnabled()) return;
  posthog.register({
    ops_role: role,
    ops_role_source: source,
    app: "next-admin",
  });
}

/** Group analytics for org/project dashboards in PostHog (no PII). */
export function groupProject() {
  if (!posthogEnabled()) return;
  posthog.group("project", "lobster-next-admin", {
    name: "Lobster Factory Admin",
    surface: "next-admin",
  });
}

/**
 * Optional: stable operator id from env for single-tenant internal consoles only.
 * Do not set in multi-user prod unless ids are real account identifiers.
 */
export function identifyFromEnvBootstrap() {
  if (!posthogEnabled()) return;
  const raw = process.env.NEXT_PUBLIC_POSTHOG_DISTINCT_ID?.trim();
  if (!raw) return;
  posthog.identify(raw, { source: "bootstrap_env" });
}
