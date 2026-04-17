import * as Sentry from "@sentry/node";

type SentryContext = {
  workflowId: string;
  route?: string;
  payload?: unknown;
  tags?: Record<string, string>;
};

let initialized = false;
let enabled = false;

function initSentry() {
  if (initialized) {
    return;
  }

  const dsn =
    process.env.SENTRY_DSN_TRIGGER_WORKFLOWS ||
    process.env.LOBSTER_SENTRY_DSN ||
    process.env.TRIGGER_SENTRY_DSN ||
    process.env.SENTRY_DSN ||
    "";

  if (dsn) {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || process.env.APP_ENV || "staging",
    });
    enabled = true;
  }

  initialized = true;
}

export function captureWorkflowException(error: unknown, context: SentryContext) {
  initSentry();
  if (!enabled) {
    return;
  }

  const err = error instanceof Error ? error : new Error(String(error));
  Sentry.withScope((scope) => {
    scope.setTag("workflow.id", context.workflowId);
    if (context.route) {
      scope.setTag("workflow.route", context.route);
    }
    if (context.tags) {
      for (const [k, v] of Object.entries(context.tags)) {
        scope.setTag(k, v);
      }
    }
    if (context.payload !== undefined) {
      scope.setContext("workflow.payload", { payload: context.payload });
    }
    Sentry.captureException(err);
  });
}
