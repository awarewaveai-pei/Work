import type { Event } from "@sentry/nextjs";

// One scrubber for every Sentry runtime (sentry.server/edge/client.config.ts).
// Invariant: event.request carries only an allowlist. The SDK attaches headers, parsed cookies, the
// request body and the query string by default (@sentry/core requestdata.js DEFAULT_INCLUDE; body via
// @sentry/node-core SentryHttpInstrumentation maxIncomingRequestBodySize 'medium'); a denylist missed
// a field twice (2026-10-23). A header is allowlisted only if its value cannot carry a URL (no referer).
// Query and #fragment (/login/set-password gets a one-time `#token_hash=`, lib/accounts/client-invite.ts) also
// ride in span and breadcrumb data (url, from/to, http.query…; SDK http/fetch/navigation instrumentation).
// Breadcrumbs added via scope.addBreadcrumb skip beforeBreadcrumb, so scrubEvent cleans event.breadcrumbs too.
const SAFE_HEADERS = new Set(["host", "user-agent", "accept", "content-type", "content-length"]);
const URL_KEYS = ["url", "from", "to", "http.url", "http.target", "url.full"] as const;
const QUERY_KEYS = ["url.query", "http.query", "http.fragment"] as const;

function stripQuery(url: string): string {
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

function scrubData(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  for (const key of QUERY_KEYS) delete data[key];
  for (const key of URL_KEYS) {
    const v = data[key];
    if (typeof v === "string") data[key] = stripQuery(v);
  }
}

export function scrubEvent<E extends Event>(event: E): E {
  const req = event.request;
  if (req) {
    event.request = {
      url: req.url && stripQuery(req.url),
      method: req.method,
      headers: req.headers && Object.fromEntries(Object.entries(req.headers).filter(([name]) => SAFE_HEADERS.has(name.toLowerCase()))),
    };
  }
  scrubData(event.contexts?.trace?.data);
  for (const span of event.spans ?? []) scrubData(span.data);
  for (const crumb of event.breadcrumbs ?? []) scrubData(crumb.data);
  return event;
}

/** For beforeSendSpan and beforeBreadcrumb: both carry URLs in `data`. */
export function scrubDataOf<T extends { data?: Record<string, unknown> }>(item: T): T {
  scrubData(item.data);
  return item;
}
