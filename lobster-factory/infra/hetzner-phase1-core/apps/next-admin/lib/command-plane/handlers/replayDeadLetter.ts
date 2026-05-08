// /replay_dead_letter <error_event_id> — Phase 2b diagnostic mode.
//
// Looks up the error_event row and returns its details so the operator can
// decide if a manual replay is needed (and via what path: smoke test, fresh
// Telegram command, or ops console UI). Full automatic re-execution is
// Phase 3 — that requires careful idempotency rewriting + side-effect rollback
// hooks, out of scope for 2b.

import type { CommandHandler } from "../commandRouter";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const replayDeadLetterHandler: CommandHandler = async (request, { supabase }) => {
  const raw = (request.args as { raw?: string }).raw?.trim() ?? "";
  const id = raw.split(/\s+/)[0] ?? "";

  if (!id) {
    return {
      text: [
        "⚠️ *Usage*: `/replay_dead_letter <error_event_id>`",
        "",
        "Find ids via `/list_failed_runs` or Supabase `error_events` table.",
      ].join("\n"),
      error: "missing_id",
    };
  }

  if (!UUID_RE.test(id)) {
    return {
      text: `⚠️ Invalid uuid: \`${id}\``,
      error: "invalid_uuid",
    };
  }

  const { data: ev, error } = await supabase
    .from("error_events")
    .select("id, source_type, source_ref, error_code, error_message, occurred_at, trace_ref, event_payload")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`error_events lookup failed: ${error.message}`);
  }
  if (!ev) {
    return {
      text: `⚠️ error_event not found: \`${id}\``,
      error: "not_found",
    };
  }

  const payloadPreview = JSON.stringify(ev.event_payload ?? {}).slice(0, 300);

  return {
    text: [
      `📋 *error_event ${id}*`,
      "",
      `source_type: \`${ev.source_type}\``,
      `source_ref: \`${ev.source_ref ?? "_none_"}\``,
      `error_code: \`${ev.error_code ?? "_none_"}\``,
      `error_message: ${truncate(ev.error_message ?? "", 200)}`,
      `occurred_at: ${ev.occurred_at}`,
      `trace_ref: \`${ev.trace_ref ?? "_none_"}\``,
      "",
      `_payload_: \`${payloadPreview}\``,
      "",
      "_Phase 2b diagnostic only — full automatic replay lands in Phase 3._",
    ].join("\n"),
    error_event: {
      id: ev.id,
      source_type: ev.source_type,
      occurred_at: ev.occurred_at,
    },
  };
};

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
