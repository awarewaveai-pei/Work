// POST /api/internal/outreach/sender-health
//
// Rung daily by the host cron (scripts/poke.sh outreach_sender_health, cron.d/awarewave-schedules). Logic in
// lib/outreach/sender-health.ts; this file wires the main database, the system DNS resolver and the operator Telegram
// (OPS_INBOX_TELEGRAM_*) into it. Answers 502 ok:false when any mailbox could not be checked.
import { NextResponse } from "next/server";
import dns from "node:dns/promises";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { buildOperatorTelegramNotifier } from "@/lib/ops-inbox/notify/telegram";
import { runSenderHealth, supabaseHealthStore } from "@/lib/outreach/sender-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyToken(request: Request): boolean {
  const expected = process.env.OUTREACH_SYNC_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

export async function POST(request: Request) {
  if (!verifyToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "no_supabase_client" }, { status: 503 });
  const telegram = buildOperatorTelegramNotifier();
  const result = await runSenderHealth({
    store: supabaseHealthStore(sb),
    resolver: dns,
    notify: async (text) => { if (telegram) await telegram.sendText(text); },
  });
  return NextResponse.json({ ok: result.errors.length === 0, ...result }, { status: result.errors.length ? 502 : 200 });
}
