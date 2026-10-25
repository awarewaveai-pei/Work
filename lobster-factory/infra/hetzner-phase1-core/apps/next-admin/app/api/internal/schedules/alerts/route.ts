// POST /api/internal/schedules/alerts[?digest=1]
//
// Rung by the host cron (scripts/poke.sh, cron.d/awarewave-schedules): every 10 min the change alerts, daily 01:00 UTC
// (09:00 Taipei) the digest line. Logic in lib/schedules/alerts.ts; this file only wires the database and the
// ops-inbox channels (Telegram = OPS_INBOX_TELEGRAM_*, Slack = OPS_INBOX_SLACK_INCIDENTS_WEBHOOK) into it.
// Answers 502 ok:false when nothing was delivered or recorded (alerts), or when any channel missed the digest.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { upsertIncidentAtomic } from "@/lib/ops-inbox/upsertIncidentAtomic";
import { buildOperatorTelegramNotifier } from "@/lib/ops-inbox/notify/telegram";
import { SlackNotifier } from "@/lib/ops-inbox/notify/slack";
import { hostStatusRows } from "@/lib/schedules/adapters/host-status";
import { FINGERPRINT_PREFIX, runScheduleAlerts, runScheduleDigest, type Delivery, type OpenEpisode } from "@/lib/schedules/alerts";
import type { SystemRow } from "@/lib/schedules/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyToken(request: Request): boolean {
  const expected = process.env.SCHEDULE_INGEST_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

async function send(text: string): Promise<Delivery> {
  const channels: Record<string, string> = {};
  const telegram = buildOperatorTelegramNotifier();
  if (telegram) {
    const r = await telegram.sendText(text);
    // uncertain = may have arrived (timeout after the request left): counted as delivered so it is not re-sent
    // every run, but not as complete (notify/telegram.ts:16-21, same rule site-watch follows).
    channels.telegram = r.kind === "sent" ? "sent" : `${r.kind}:${r.code}`;
  }
  const webhook = process.env.OPS_INBOX_SLACK_INCIDENTS_WEBHOOK?.trim();
  if (webhook) {
    const r = await new SlackNotifier("slack:ops-incidents", webhook).sendText(text);
    channels.slack = r.status === "sent" ? "sent" : `failed:${"error" in r ? r.error : r.status}`;
  }
  const states = Object.values(channels);
  return {
    delivered: states.some((s) => s === "sent" || s.startsWith("uncertain:")),
    complete: states.length > 0 && states.every((s) => s === "sent"),
    channels,
  };
}

export async function POST(request: Request) {
  if (!verifyToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "no_supabase_client" }, { status: 503 });

  const environment = process.env.NODE_ENV === "production" ? "production" : "development";
  const pageUrl = `${(process.env.OPS_INBOX_PUBLIC_URL ?? "https://app.aware-wave.com").replace(/\/$/, "")}/ops/schedules`;
  const rows = () => hostStatusRows();

  const episodes = () =>
    sb.from("ops_incidents").select("id, fingerprint, title, status")
      .eq("source", "schedule").eq("environment", environment).like("fingerprint", `${FINGERPRINT_PREFIX}%`);

  const result = new URL(request.url).searchParams.get("digest")
    ? await runScheduleDigest({ rows, send, pageUrl })
    : await runScheduleAlerts({
        rows,
        pageUrl,
        send,
        openEpisodes: async () => {
          // ignored counts as alerted: an operator's ignore must not be undone by the next run.
          const { data, error } = await episodes().in("status", ["open", "investigating", "ignored"]);
          if (error) throw new Error(`episodes:${error.message}`);
          return (data ?? []).map((r): OpenEpisode => ({ id: r.id, key: String(r.fingerprint).slice(FINGERPRINT_PREFIX.length), title: r.title }));
        },
        knownKeys: async () => {
          const { data, error } = await episodes();
          if (error) throw new Error(`episodes:${error.message}`);
          return new Set((data ?? []).map((r) => String(r.fingerprint).slice(FINGERPRINT_PREFIX.length)));
        },
        openEpisode: async (row: SystemRow, reopen: boolean) => {
          const fingerprint = `${FINGERPRINT_PREFIX}${row.key}`;
          const { error } = await upsertIncidentAtomic(sb, {
            source: "schedule",
            external_id: fingerprint,
            fingerprint,
            signal_type: "error",
            severity: "high",
            service: "host-schedules",
            environment,
            title: row.label,
            message: `${row.state}${row.detail ? `: ${row.detail}` : ""}`,
            raw: { key: row.key, state: row.state, last_at: row.lastAt, cadence: row.cadence },
            tags: { schedule_key: row.key },
            client_slug: null,
          }, reopen);
          return error;
        },
        resolveEpisode: async (id: string) => {
          const { error } = await sb.from("ops_incidents")
            .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "schedule-alerts-auto-resolve" })
            .eq("id", id).in("status", ["open", "investigating", "ignored"]);
          return error?.message ?? null;
        },
      });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
