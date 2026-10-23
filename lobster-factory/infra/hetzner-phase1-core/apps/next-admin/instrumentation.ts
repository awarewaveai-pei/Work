import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Without this hook Next 15 never hands server-render errors to Sentry: /ops/repairs 500'd for
// weeks with zero events (2026-10-23).
export const onRequestError = Sentry.captureRequestError;
