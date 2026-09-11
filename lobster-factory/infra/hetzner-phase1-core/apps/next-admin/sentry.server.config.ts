import * as Sentry from "@sentry/nextjs";

// Strips query strings from captured request/span data — added 2026-09-11 after
// app/api/webhooks/chatwoot/route.ts started carrying an auth token in ?token=... (Chatwoot's
// inbox-webhook/AgentBot delivery sends no signature header to sign against, confirmed from its own
// source, so a URL-embedded shared token is the real auth mechanism there).
//
// CORRECTED same day after critic review of the first version (which only touched
// event.request.url): the @sentry/node-core SDK populates the query string in THREE independent
// places, verified by reading the installed package source, not assumed —
//   1. event.request.url (what v1 of this file scrubbed)
//   2. event.request.query_string — set separately by requestDataIntegration
//      (node_modules/@sentry/core/build/cjs/integrations/requestdata.js, DEFAULT_INCLUDE.query_string)
//   3. OpenTelemetry HTTP span attributes http.url / http.target
//      (node_modules/@opentelemetry/instrumentation-http/build/src/utils.js) — these ride on
//      event.contexts.trace.data (error/message events) and per-span data (transaction events);
//      no beforeSend*/beforeSendTransaction hook sees them, only a dedicated span hook does.
// Scrubbing only #1 is worse than not scrubbing at all — it looks fixed but isn't. This still isn't
// a substitute for the primary fix (the token no longer reaches nginx/Loki logs at all, and the
// pre-2026-09-11 exposed value has been rotated) — this is defense-in-depth on top of that, for the
// separate, lower-probability path where this specific route actually throws/traces into Sentry.
// Sentry's project-level "Data Scrubber" dashboard setting is an untested, unversioned toggle this
// repo doesn't control — recorded as a follow-up in TASKS.md rather than relied on silently.
const SENSITIVE_KEYS = ["http.url", "http.target", "url.full", "url.query"] as const;

function stripQuery(url: string | undefined): string | undefined {
  if (!url) return url;
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

function scrubRequest(request: { url?: string; query_string?: unknown } | undefined): void {
  if (!request) return;
  if (request.url) request.url = stripQuery(request.url);
  if (request.query_string) request.query_string = undefined;
}

function scrubSpanLikeData(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  for (const key of SENSITIVE_KEYS) {
    const v = data[key];
    if (typeof v === "string") data[key] = stripQuery(v);
  }
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV || "production",
  tracesSampleRate: 0.1,
  beforeSend(event) {
    scrubRequest(event.request);
    scrubSpanLikeData(event.contexts?.trace?.data as Record<string, unknown> | undefined);
    return event;
  },
  beforeSendTransaction(event) {
    scrubRequest(event.request);
    scrubSpanLikeData(event.contexts?.trace?.data as Record<string, unknown> | undefined);
    for (const span of event.spans ?? []) {
      scrubSpanLikeData(span.data as Record<string, unknown> | undefined);
    }
    return event;
  },
  beforeSendSpan(span) {
    scrubSpanLikeData(span.data as Record<string, unknown> | undefined);
    return span;
  },
});
