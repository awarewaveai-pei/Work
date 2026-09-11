import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { handleInbound } from "@/lib/cs/orchestrator";
import { loadCis } from "@/lib/cs/cis";
import { claimMessage, findOrganizationIdByChatwootAccountId } from "@/lib/cs/db";
import { handoffToHuman, sendPrivateDraft, sendReply, verifyWebhookToken, loadWebhookSecret } from "@/lib/cs/chatwoot-client";
import { reserveCsCredit } from "@/lib/cs/billing";
import { readWebhookBody } from "@/lib/ops-inbox/readRequestBody";
import type { InboundMessage } from "@/lib/cs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Chatwoot AgentBot webhook (Pattern A, plan §3/§16). Verifies a shared `?token=` query-string secret
// (see chatwoot-client.ts's verifyWebhookToken doc comment for why it's a query token and not a
// signature header — Chatwoot's inbox-webhook/AgentBot delivery path sends no signature, confirmed
// against its actual source), maps the payload to InboundMessage, runs the engine, and turns its
// decision into the matching Chatwoot API call.
// NEVER surfaces a 5xx for a processing failure — handleInbound already degrades to `handoff` inside
// itself (plan §8.4: "no component failure may answer the customer with a guess"); this route's own
// job is only to not let a webhook exception cause Chatwoot to retry-storm a message that was in fact
// received and safely handed to a human.
//
// Body reading uses readWebhookBody (agency-os/reports/audit/auto-repair-2026-05-23.md §C3) — every
// webhook route in this app shares the same 256KB cap; a bespoke req.text()/req.json() here would be
// exactly the regression that audit flagged. (This route no longer needs the raw bytes specifically —
// auth moved from a body-signing HMAC to a query-string token, see verifyWebhookToken's doc comment —
// but the shared helper's size cap still applies to every webhook route regardless.)

interface ChatwootMessageCreatedPayload {
  event?: string;
  id?: number | string;
  content?: string;
  message_type?: "incoming" | "outgoing" | number;
  sender?: { type?: string };
  account?: { id?: number };
  conversation?: {
    id?: number | string;
    status?: string;
    contact_inbox?: { source_id?: string };
  };
}

function isIncoming(p: ChatwootMessageCreatedPayload): boolean {
  return p.message_type === "incoming" || p.message_type === 0;
}

export async function POST(req: Request): Promise<Response> {
  const body = await readWebhookBody(req);
  if (body.ok === false) return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  const payload = body.parsed as ChatwootMessageCreatedPayload;

  // Only "a customer said something" triggers the engine — agent replies, status/typing/other events
  // are ignored here (Chatwoot fires many event types on the same webhook URL).
  if (payload.event !== "message_created" || !isIncoming(payload)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const accountId = payload.account?.id;
  // "unauthorized" is returned identically for a missing/unknown account id AND a bad signature
  // below — an unknown-account 404 would let anyone enumerate which numeric Chatwoot account ids are
  // wired to a real tenant without ever presenting a valid secret. Same generic response either way;
  // Sentry (not the HTTP response) is where the two cases are told apart for debugging.
  if (typeof accountId !== "number") return new NextResponse("unauthorized", { status: 401 });
  const organizationId = await findOrganizationIdByChatwootAccountId(accountId);
  if (!organizationId) return new NextResponse("unauthorized", { status: 401 });

  // Token verified AFTER resolving which org's secret to check against (chicken-and-egg: the account
  // id needed to pick the secret comes from the same untrusted payload) — safe, because a forged
  // account id gains nothing without also knowing that account's own webhook_secret/token value.
  const secret = await loadWebhookSecret(organizationId);
  const providedToken = new URL(req.url).searchParams.get("token");
  const ok = verifyWebhookToken(providedToken, secret ?? undefined);
  if (!ok) return new NextResponse("unauthorized", { status: 401 });

  const messageId = String(payload.id ?? "");
  const conversationId = String(payload.conversation?.id ?? "");
  if (!messageId || !conversationId) return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });

  // Same silence rule handleInbound applies internally (orchestrator.ts) — computed here, from the
  // raw payload, and checked BEFORE claimMessage/reserveCsCredit, not after. Every conversation a
  // human has ever taken over (conversationStatus 'open') hits this on EVERY subsequent customer
  // message — that's the normal, common case after any handoff, not an edge case. Checking only
  // inside handleInbound (as this route did before) meant claimMessage still wrote a permanent fake
  // 'handoff' audit row and reserveCsCredit still debited a real credit for AI work that never ran.
  const isFromAgent = payload.sender?.type === "agent_bot" || payload.sender?.type === "user";
  const conversationStatus = payload.conversation?.status ?? "pending";
  if (isFromAgent || conversationStatus === "open") {
    return NextResponse.json({ ok: true, ignored: true, reason: "human_owns_thread" });
  }

  // Atomic claim (lib/cs/db.ts) — NOT a check-then-act read. "duplicate" (a concurrent redelivery
  // lost the race) is the only outcome safe to silently no-op; "error" is a real failure (DB down,
  // RLS misconfig) that must not be mistaken for one — see claimMessage's own doc comment.
  const claim = await claimMessage(organizationId, conversationId, messageId);
  if (claim === "duplicate") return NextResponse.json({ ok: true, deduped: true });
  if (claim === "error") {
    Sentry.captureException(new Error("cs webhook: claimMessage failed (not a duplicate)"), {
      extra: { organizationId, conversationId, messageId },
    });
    return NextResponse.json({ ok: false, error: "claim_failed" }, { status: 502 });
  }

  const cis = await loadCis(organizationId);

  // Opt-in metering (lib/cs/billing.ts) — unmetered orgs (no billing account row) always proceed.
  const credit = await reserveCsCredit(organizationId, messageId);
  if (credit.metered && !credit.allowed) {
    if (cis.chatwoot) await handoffToHuman(organizationId, cis.chatwoot, conversationId).catch(() => undefined);
    return NextResponse.json({ ok: true, action: "handoff", reason: "credit_exhausted" });
  }

  const inbound: InboundMessage = {
    organizationId,
    conversationId,
    messageId,
    channel: "website",
    contactRef: payload.conversation?.contact_inbox?.source_id ?? conversationId,
    text: payload.content ?? "",
    isFromAgent,
    conversationStatus,
    // Business-hours gating is a documented seam, not yet computed anywhere (BUILD_PLAN §5 U1 note:
    // "AI 24h 回，非決策") — always true until a per-tenant schedule exists.
    withinBusinessHours: true,
  };

  const decision = await handleInbound(inbound);

  if (!cis.chatwoot) {
    // Engine ran and was persisted (orchestrator.persist), but there's no Account API config yet to
    // act on the decision — this happens during Chatwoot bring-up before client_config.chatwoot is
    // set. Report success (the webhook itself was handled); nothing was sent to the customer.
    return NextResponse.json({ ok: true, action: decision.action, sent: false, reason: "chatwoot_config_missing" });
  }

  let sent = false;
  try {
    if (decision.action === "auto_sent" && decision.replyText) {
      await sendReply(organizationId, cis.chatwoot, conversationId, decision.replyText);
      sent = true;
    } else if (decision.action === "draft" && decision.replyText) {
      await sendPrivateDraft(organizationId, cis.chatwoot, conversationId, decision.replyText);
      await handoffToHuman(organizationId, cis.chatwoot, conversationId);
      sent = true;
    } else if (decision.action === "handoff") {
      await handoffToHuman(organizationId, cis.chatwoot, conversationId);
      sent = true;
    }
    // "suppressed" — engine intentionally stayed silent (agent already owns the thread); no API call,
    // sent stays false (correct: nothing was meant to be sent).
    if (!sent && decision.action !== "suppressed") {
      // Invariant violation, not a delivery failure — e.g. action==='auto_sent' but replyText was
      // empty (orchestrator.ts is supposed to prevent this, but this route has no fallback of its
      // own if that invariant is ever broken upstream). Visible in Sentry; response stays 200 because
      // the claim already committed this message — a 5xx here would just make Chatwoot retry into
      // the same claimed row forever.
      Sentry.captureException(new Error(`cs webhook: no delivery branch matched for action=${decision.action}`), {
        extra: { organizationId, conversationId, messageId },
      });
    }
  } catch (err) {
    // The DECISION was made and persisted (claimMessage + recordReply already committed it); only the
    // Chatwoot-side delivery failed (network/API/expired token). This is exactly the failure mode the
    // system's whole safety story ("when in doubt, hand off to a human," plan §8.4) is supposed to
    // prevent — a silently-undelivered handoff is a customer who gets nothing. Chatwoot's own webhook
    // retry will redeliver, but claimMessage above will correctly dedupe it (the row already exists),
    // so a retry can NEVER recover this — Sentry is the only signal that this happened.
    Sentry.captureException(err, { extra: { organizationId, conversationId, messageId, action: decision.action } });
    return NextResponse.json({ ok: false, action: decision.action, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  return NextResponse.json({ ok: true, action: decision.action, sent });
}
