// POST /api/internal/outreach/gmail-sync
//
// Rung every 10 minutes by the host cron (scripts/poke.sh outreach_gmail_sync, cron.d/awarewave-schedules). Logic in
// lib/outreach/gmail-sync.ts; this file wires the main database, each connector's vault token, the outreach.classify
// grant (billed to the lead's organization, else the internal account) and the operator Telegram into it. After the
// sync (reconciliation first), the pipeline tick (lib/outreach/pipeline.ts, card C15: research, write, review policy,
// Gmail drafts, follow-up drafts -- never sends), then the automatic send of the sender pool (lib/outreach/send-adapter.ts, card C8.4) with
// the paid verifier under the outreach.verify grant (lib/outreach/mailbox-verify.ts).
// Answers 502 ok:false when a mailbox could not be read (an expired grant, Gmail down): /ops/schedules turns red.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { buildOperatorTelegramNotifier } from "@/lib/ops-inbox/notify/telegram";
import { getSecret, connectorSecretRef } from "@/lib/secret-vault";
import { grantFor, runForOrg } from "@/lib/entitlements/grant";
import { EntitlementRequired } from "@/lib/entitlements/can";
import { refreshAccessToken } from "@/lib/outreach/google-oauth";
import { gmailApi } from "@/lib/outreach/gmail-api";
import { classifyReply, runGmailSync, supabaseSyncStore } from "@/lib/outreach/gmail-sync";
import { pipelineDeps } from "@/lib/outreach/pipeline-store";
import { runPipelineTick } from "@/lib/outreach/pipeline";
import { runAutoSend, supabaseSendStore, type SendLead } from "@/lib/outreach/send-adapter";
import { verifierKey, verifyMailbox, VerifyPending, type VerifierKey } from "@/lib/outreach/mailbox-verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// poke.sh waits 300 s; stop starting new work well before, so the answer (and the cursor decision) arrives. The sync
// gets the first part; the automatic send (up to 120 s of jitter per mailbox, mailboxes in parallel) the rest.
const SYNC_BUDGET_MS = 150_000;
const BUDGET_MS = 270_000;
// The pipeline tick may start new leads until here; the automatic send keeps the rest of the round.
const PIPELINE_BUDGET_MS = 200_000;
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
  const started = Date.now();
  const refresh = async (connectorId: string): Promise<string> => {
    const refreshToken = await getSecret(connectorSecretRef(connectorId));
    if (!refreshToken) throw new Error("no stored refresh token -- reconnect this Gmail on the Connectors page");
    return (await refreshAccessToken({ refreshToken, clientId, clientSecret })).access_token;
  };
  const result = await runGmailSync({
    store: supabaseSyncStore(sb),
    gmailFor: async (connector) => gmailApi(await refresh(connector.id)),
    classify: (reply) => reply.organization_id
      ? runForOrg(reply.organization_id, ACTOR, async () => classifyReply(reply, await grantFor("outreach.classify")))
      : grantFor("outreach.classify").then((grant) => classifyReply(reply, grant)),
    notify: async (text) => { if (telegram) await telegram.sendText(text); },
    deadline: started + SYNC_BUDGET_MS,
  });

  const pipeline = await runPipelineTick(pipelineDeps(sb, started + PIPELINE_BUDGET_MS));

  // One verifier key lookup per organization per tick; a verification still running (Hunter 202) is asked next tick.
  const keys = new Map<string, Promise<VerifierKey | null>>();
  const keyFor = (org: string | null) => { const k = org ?? ""; if (!keys.has(k)) keys.set(k, verifierKey(sb, org)); return keys.get(k)!; };
  const verifyOnce = async (lead: SendLead) => {
    const key = await keyFor(lead.organization_id);
    if (!key || !lead.email) return null;
    try {
      const grant = await grantFor("outreach.verify");
      const status = await verifyMailbox(lead.email.trim().toLowerCase(), key);
      await grant.recordUse({ provider: key.provider, lead_id: lead.id });  // metered once there is an answer (critic m1)
      return { status, provider: key.provider };
    } catch (e) {
      if (e instanceof VerifyPending || e instanceof EntitlementRequired) return null;  // not now / not allowed: no send
      throw e;
    }
  };
  const sending = await runAutoSend({
    store: supabaseSendStore(sb),
    tokenFor: (account) => refresh(account.connector_id!),
    verify: (lead) => lead.organization_id ? runForOrg(lead.organization_id, ACTOR, () => verifyOnce(lead)) : verifyOnce(lead),
    notify: async (text) => { if (telegram) await telegram.sendText(text); },
    deadline: started + BUDGET_MS,
  });
  const errors = [...result.errors, ...pipeline.errors, ...sending.errors];
  return NextResponse.json({ ok: errors.length === 0, ...result, errors, pipeline: { ...pipeline, errors: undefined }, send: { ...sending, errors: undefined } }, { status: errors.length ? 502 : 200 });
}
