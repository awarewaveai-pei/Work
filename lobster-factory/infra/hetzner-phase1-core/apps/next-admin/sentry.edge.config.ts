import * as Sentry from "@sentry/nextjs";

// Same scrubbing as sentry.server.config.ts — see that file's comment for why this needs to touch
// three separate fields (request.url, request.query_string, span/trace http.url|http.target data),
// not just the request URL. This route currently runs on the nodejs runtime, not edge, but any edge
// route added later with a URL-embedded secret gets the same protection for free.
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
