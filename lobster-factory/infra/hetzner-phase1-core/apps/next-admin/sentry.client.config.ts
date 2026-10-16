import * as Sentry from "@sentry/nextjs";

// URL fragments never leave the browser in telemetry: /login/set-password receives a one-time sign-in token in
// `#token_hash=` (lib/accounts/client-invite.ts), and the navigation breadcrumb for clearing it records the old URL.
const noHash = (u: unknown) => (typeof u === "string" ? u.replace(/#.*$/, "") : u);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV || "production",
  tracesSampleRate: 0.1,
  beforeBreadcrumb(crumb) {
    if (crumb.data) for (const k of ["from", "to", "url"]) if (k in crumb.data) crumb.data[k] = noHash(crumb.data[k]);
    return crumb;
  },
  beforeSend(event) {
    if (event.request?.url) event.request.url = noHash(event.request.url) as string;
    for (const c of event.breadcrumbs ?? []) {
      if (c.data) for (const k of ["from", "to", "url"]) if (k in c.data) c.data[k] = noHash(c.data[k]);
    }
    return event;
  },
  beforeSendTransaction(event) {
    if (event.request?.url) event.request.url = noHash(event.request.url) as string;
    return event;
  },
});
