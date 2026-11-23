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
  // Platform (blueprint §13): the three that measure "pick a client", "blocked", "login to first use"
  CLIENT_PICKED: "client_picked",
  BLOCKED_SHOWN: "blocked_shown",
  LOGIN_SUCCEEDED: "login_succeeded",
} as const;

export type EventName = (typeof Events)[keyof typeof Events];

type Surface = "workspace" | "door" | "public";

/** Properties of the platform events. Closed on purpose: only short enums and counters; never an email, a name, a URL,
 *  a query string or a token (analytics-no-pii.test.ts scans these keys). A client is identified only by its group id. */
export interface PlatformEventProps {
  client_picked: { method: "search" | "category" | "row" | "other"; ms_since_load: number; surface: Surface; product_key?: string };
  /** state = right-label code (S1, S7 ...) or "not_held"/"unavailable" for a door's not-enabled page */
  blocked_shown: { state: string; surface: Surface; product_key?: string; feature_key?: string };
  login_succeeded: { door: "staff" | "portal" | "product"; product_key?: string };
}

/** The only property names a platform event may carry; track() drops anything else. */
export const EVENT_PROPS: { [E in keyof PlatformEventProps]: readonly string[] } = {
  client_picked: ["method", "ms_since_load", "surface", "product_key"],
  blocked_shown: ["state", "surface", "product_key", "feature_key"],
  login_succeeded: ["door", "product_key"],
};

type PropsArg<E extends EventName> = E extends keyof PlatformEventProps
  ? [props: PlatformEventProps[E]]
  : [props?: Record<string, unknown>];

function posthogEnabled(): boolean {
  return Boolean(
    typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim(),
  );
}

export function track<E extends EventName>(event: E, ...args: PropsArg<E>) {
  if (!posthogEnabled()) return;
  const props = args[0] as Record<string, unknown> | undefined;
  const allowed = (EVENT_PROPS as Record<string, readonly string[]>)[event];
  const out = allowed && props ? Object.fromEntries(Object.entries(props).filter(([k]) => allowed.includes(k))) : props;
  posthog.capture(event, out);
}

/** The customer (organization) as a PostHog group: its id only, never its name. Silent without a PostHog key. */
export function groupOrganization(orgId: string) {
  if (!posthogEnabled() || !orgId) return;
  posthog.group("organization", orgId);
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
