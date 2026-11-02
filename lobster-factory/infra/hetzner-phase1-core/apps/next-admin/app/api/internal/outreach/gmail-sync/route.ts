// POST /api/internal/outreach/gmail-sync
//
// Rung every 10 minutes by the host cron (scripts/poke.sh outreach_gmail_sync, cron.d/awarewave-schedules). Logic in
// lib/outreach/gmail-sync.ts; this file wires the main database, each connector's vault token, the outreach.classify
// grant (billed to the lead's organization, else the internal account) and the operator Telegram into it.
// Answers 502 ok:false when a mailbox could not be read (an expired grant, Gmail down): /ops/schedules turns red.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { buildOperatorTelegramNotifier } from "@/lib/ops-inbox/notify/telegram";
import { getSecret, connectorSecretRef } from "@/lib/secret-vault";
import { grantFor, runForOrg } from "@/lib/entitlements/grant";
import { refreshAccessToken } from "@/lib/outreach/google-oauth";
import { gmailApi } from "@/lib/outreach/gmail-api";
import { classifyReply, runGmailSync, supabaseSyncStore } from "@/lib/outreach/gmail-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// poke.sh waits 300 s; stop starting new work well before, so the answer (and the cursor decision) arrives.
const BUDGET_MS = 240_000;
const ACTOR = "schedule:outreach_gmail_sync";

function verifyToken(request: Request): boolean {
  const expected = process.env.OUTREACH_SYNC_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

// One round at a time in this process (next-admin is one container): poke.sh gives up at 300 s while the server goes
// on, so a slow round must not overlap the next tick (double classification, two attempts counted per tick).
let running = false;

export async function POST(request: Request) {
  if (!verifyToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (running) return NextResponse.json({ ok: true, skipped: "previous round still running" });
  running = true;
  try { return await syncOnce(); } finally { running = false; }
}

async function syncOnce(): Promise<Response> {
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "no_supabase_client" }, { status: 503 });
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.json({ ok: false, error: "oauth client not configured" }, { status: 503 });
  const telegram = buildOperatorTelegramNotifier();
  const result = await runGmailSync({
    store: supabaseSyncStore(sb),
    async gmailFor(connector) {
      const refreshToken = await getSecret(connectorSecretRef(connector.id));
      if (!refreshToken) throw new Error("no stored refresh token -- reconnect this Gmail on the Connectors page");
      return gmailApi((await refreshAccessToken({ refreshToken, clientId, clientSecret })).access_token);
    },
    classify: (reply) => reply.organization_id
      ? runForOrg(reply.organization_id, ACTOR, async () => classifyReply(reply, await grantFor("outreach.classify")))
      : grantFor("outreach.classify").then((grant) => classifyReply(reply, grant)),
    notify: async (text) => { if (telegram) await telegram.sendText(text); },
    deadline: Date.now() + BUDGET_MS,
  });
  return NextResponse.json({ ok: result.errors.length === 0, ...result }, { status: result.errors.length ? 502 : 200 });
}
