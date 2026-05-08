// Centralised error reporting: writes to error_events (DLQ) + Sentry.
// Phase 1 design uses existing public.error_events; source_type values:
//   command_ingress_failed | command_dispatch_failed | command_handler_failed
//   telegram_auth_failed
// Replay query (manual): select * from error_events where source_type like 'command_%';

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CommandErrorSource =
  | "command_ingress_failed"
  | "command_dispatch_failed"
  | "command_handler_failed"
  | "telegram_auth_failed";

export interface CommandErrorReport {
  organizationId: string | null;
  source_type: CommandErrorSource;
  source_ref: string | null;
  error_code: string | null;
  error_message: string;
  event_payload?: Record<string, unknown>;
  trace_ref?: string | null;
  // When true, write the error_events row but do NOT raise a Sentry event.
  // Use for high-volume / low-signal classes that flood the Sentry inbox
  // without operator value (e.g. random internet scanners hitting the
  // Telegram webhook without the secret header). The error_events row is
  // still the system of record for audit / replay.
  silentSentry?: boolean;
}

export async function reportCommandError(
  client: SupabaseClient | null,
  report: CommandErrorReport,
): Promise<void> {
  if (!report.silentSentry) {
    Sentry.captureMessage(`[command-plane] ${report.source_type}: ${report.error_message}`, {
      level: "error",
      tags: { component: "command-plane", source_type: report.source_type },
      extra: { source_ref: report.source_ref, payload: report.event_payload },
    });
  }

  if (!client || !report.organizationId) return; // auth failures may have no org context

  const { error } = await client.from("error_events").insert({
    organization_id: report.organizationId,
    source_type: report.source_type,
    source_ref: report.source_ref,
    error_code: report.error_code,
    error_message: report.error_message,
    trace_ref: report.trace_ref ?? null,
    event_payload: report.event_payload ?? {},
  });
  if (error) {
    Sentry.captureException(error, {
      tags: { component: "command-plane", phase: "error_events_insert" },
    });
  }
}
