import * as Sentry from "@sentry/nextjs";
import { scrubDataOf, scrubEvent } from "./lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV || "production",
  tracesSampleRate: 0.1,
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
  beforeSendSpan: scrubDataOf,
  beforeBreadcrumb: scrubDataOf,
});
