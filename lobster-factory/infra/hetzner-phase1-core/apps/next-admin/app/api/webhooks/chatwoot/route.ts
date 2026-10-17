import { after, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { handleInbound } from "@/lib/cs/orchestrator";
import { loadCis } from "@/lib/cs/cis";
import { claimMessage, completeClaim, findOrganizationIdByChatwootAccountId, recordReply } from "@/lib/cs/db";
import { getContactName, handoffToHuman, listMessages, sendPrivateDraft, sendReply, updateContactName, verifyWebhookToken, loadWebhookSecret } from "@/lib/cs/chatwoot-client";
import { handoffAckText, isCrisisAck, isNameQuestionAck, isPlaceholderContactName, parseNameReply } from "@/lib/cs/handoff-ack";
import { hitsCrisis } from "@/lib/cs/autonomy";
import { alertOperatorOfCrisis } from "@/lib/cs/crisis-alert";
import { buildOperatorTelegramNotifier } from "@/lib/ops-inbox/notify/telegram";
import { tenantFaqAnswer } from "@/lib/cs/faq";
import { reserveCsCredit } from "@/lib/cs/billing";
import { readWebhookBody } from "@/lib/ops-inbox/readRequestBody";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { ChatwootConfig, CisProfile, InboundMessage } from "@/lib/cs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Chatwoot AgentBot webhook (Pattern A, plan §3/§16). Verifies a shared `?token=` query-string secret
// (see chatwoot-client.ts's verifyWebhookToken doc comment for why it's a query token and not a
// signature header — Chatwoot's inbox-webhook/AgentBot delivery path sends no signature, confirmed
// against its actual source), claims the message, ANSWERS, and only then runs the engine and turns its
// decision into the matching Chatwoot API call (after()). Chatwoot v4.18 gives an AgentBot 5 s
// (WEBHOOK_TIMEOUT, lib/webhooks/trigger.rb) and on timeout opens the conversation itself; the
// pipeline takes far longer (CS_TIMEOUTS). completed_at is set only once the outcome reached Chatwoot;
// a claim whose after() work is cut off (container restart) or whose delivery failed stays NULL and
// lib/cs/sweep.ts hands it to a human — the claim row, not after(), guarantees no message is lost.
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
  // For an incoming message the sender is the contact (Contact#webhook_data).
  sender?: { type?: string; id?: number; name?: string };
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
    // The one exception: a nameless contact may be answering the handoff acknowledgement's name question.
    const contactId = payload.sender?.id;
    if (!isFromAgent && typeof contactId === "number" && isPlaceholderContactName(payload.sender?.name)) {
      const reply = { organizationId, conversationId, messageId: Number(messageId), contactId, text: payload.content ?? "" };
      after(() => captureName(reply).catch((err) => Sentry.captureException(err, { extra: { organizationId, conversationId, messageId } })));
    }
    // A crisis message still pages the operator: whoever owns the thread may not be looking at it.
    if (!isFromAgent && hitsCrisis(payload.content ?? "")) {
      after(async () => pageCrisis(organizationId, conversationId, await chatwootConfigOrNone(organizationId)));
    }
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
  // A throw (failed delivery included) leaves the claim unfinished (completed_at NULL) for the sweep.
  const contact: ContactRef = { id: payload.sender?.id, name: payload.sender?.name };
  after(() => runPipeline(inbound, contact, Number(messageId)).catch((err) => Sentry.captureException(err, { extra: { organizationId, conversationId, messageId } })));
  return NextResponse.json({ ok: true, accepted: true });
}

interface ContactRef {
  id?: number;
  name?: string;
}

async function runPipeline(inbound: InboundMessage, contact: ContactRef, customerMessageId: number): Promise<void> {
  const { organizationId, conversationId, messageId } = inbound;
  const claim = { organizationId, conversationId, messageId };
  // A crisis pages the operator before anything that can fail or be switched off (tenant config read,
  // system mode, missing Chatwoot config, a failed handoff or acknowledgement): the config only adds the
  // conversation link, so a failed read still pages, without it.
  if (hitsCrisis(inbound.text)) await pageCrisis(organizationId, conversationId, await chatwootConfigOrNone(organizationId));
  const cis = await loadCis(organizationId);

  // T27 (agency-os/reports/decisions/2026-09-26-system-mode-inbound-events.md): a blocking system
  // mode pauses the AI and hands the conversation to a human -- no AI call, no credit reserved while
  // paused. Runs after claimMessage, so a Chatwoot retry of the SAME message hits "duplicate" and never
  // posts the pause note twice. A purpose-written note: blockedChangeMessage is an operator-facing 423
  // body, not something for an agent taking over a conversation. The note is best-effort; the handoff
  // is what completes the claim.
  const modeGate = await checkProductionChangeAllowed(getSupabaseWriteClient(), organizationId);
  if (!modeGate.allowed) {
    await recordReply({ ...claim, action: "handoff", retrievedChunkIds: [] });
    if (cis.chatwoot) {
      await sendPrivateDraft(organizationId, cis.chatwoot, conversationId, `AI 暫停：系統處於 ${modeGate.mode} 模式，已轉真人`).catch(() => undefined);
      await handoffToHuman(organizationId, cis.chatwoot, conversationId);
    }
    await completeClaim(claim);
    return;
  }

  // Operator-written answers: plain keyword matching, no model call, so no credit either (lib/cs/faq.ts).
  // A failed send throws and leaves the claim to the sweep, like every other delivery here.
  const faq = tenantFaqAnswer(cis, inbound.text);
  if (faq && cis.chatwoot) {
    await sendReply(organizationId, cis.chatwoot, conversationId, faq.answer);
    if (faq.handoff) await handoffToHuman(organizationId, cis.chatwoot, conversationId);
    await recordReply({ ...claim, action: faq.handoff ? "handoff" : "auto_sent", intentKey: `faq:${faq.id}`, retrievedChunkIds: [] });
    await completeClaim(claim);
    return;
  }

  // Opt-in metering (lib/cs/billing.ts) — unmetered orgs (no billing account row) always proceed.
  const credit = await reserveCsCredit(organizationId, messageId);
  if (credit.metered && !credit.allowed) {
    await recordReply({ ...claim, action: "handoff", retrievedChunkIds: [] });
    if (cis.chatwoot) {
      await handoffToHuman(organizationId, cis.chatwoot, conversationId);
      await acknowledgeHandoff(cis, cis.chatwoot, conversationId, contact, customerMessageId, inbound.text, hitsCrisis(inbound.text));
    }
    await completeClaim(claim);
    return;
  }

  // handleInbound records its decision (recordReply) on every path, failures included.
  const decision = await handleInbound(inbound);
  // The classifier's crisis intent (CS_CRISIS_INTENT_KEY) catches what the keywords cannot; it is known
  // only now, so its page goes out here, still before any Chatwoot call. A keyword hit was paged above.
  const crisis = hitsCrisis(inbound.text) || decision.handoffReason === "crisis";
  if (crisis && !hitsCrisis(inbound.text)) await pageCrisis(organizationId, conversationId, cis.chatwoot);

  // No Account API config yet (Chatwoot bring-up before client_config.chatwoot is set): the decision
  // is recorded, nothing can be sent.
  if (cis.chatwoot) {
    if (decision.action === "auto_sent" && decision.replyText) {
      await sendReply(organizationId, cis.chatwoot, conversationId, decision.replyText);
    } else if (decision.action === "draft" && decision.replyText) {
      await sendPrivateDraft(organizationId, cis.chatwoot, conversationId, decision.replyText);
      await handoffToHuman(organizationId, cis.chatwoot, conversationId);
      await acknowledgeHandoff(cis, cis.chatwoot, conversationId, contact, customerMessageId, inbound.text, crisis, decision.handoffReply);
    } else if (decision.action === "handoff") {
      await handoffToHuman(organizationId, cis.chatwoot, conversationId);
      await acknowledgeHandoff(cis, cis.chatwoot, conversationId, contact, customerMessageId, inbound.text, crisis, decision.handoffReply);
    } else if (decision.action !== "suppressed") {
      // "suppressed" = the engine intentionally stayed silent (agent owns the thread). Anything else
      // is an upstream invariant break, e.g. auto_sent with an empty replyText: leave it to the sweep.
      throw new Error(`cs webhook: no delivery branch matched for action=${decision.action}`);
    }
  }
  await completeClaim(claim);
}

/**
 * Tells the customer a human will answer, asking their name when Chatwoot only has a placeholder.
 * Not on the system-mode-blocked path (T27: no automatic reply while blocked). Skipped when a public
 * reply already followed the customer's message (several messages sent before the handoff each run
 * a pipeline; the first to get here answers). Best-effort: the handoff already reached Chatwoot, and
 * failing the claim would only make the sweep add a misleading "AI 處理中斷" note without sending
 * this either (the sweep never re-sends it).
 */
async function acknowledgeHandoff(
  cis: CisProfile,
  chatwoot: ChatwootConfig,
  conversationId: string,
  contact: ContactRef,
  customerMessageId: number,
  customerText: string,
  crisis: boolean,
  intentReply?: string,
): Promise<void> {
  const { organizationId } = cis;
  // A crisis acknowledgement is skipped only when the help lines themselves already followed: any other
  // public message (an agent's line, a template) does not carry them (Codex 58beec4d F4).
  // The dedupe read is best-effort on its own: an AgentBot token may send messages yet be refused
  // on GET (2026-10-15, Soulful: 401 on messages?after= skipped the whole acknowledgement). A read
  // that fails must never cost the customer the reply; the worst case is one duplicate sentence.
  let alreadyAnswered = false;
  try {
    const later = await listMessages(organizationId, chatwoot, conversationId, { after: customerMessageId });
    alreadyAnswered = later.some((m) => !m.private && (m.messageType === 1 || m.messageType === 3) && (!crisis || isCrisisAck(cis, m.content)));
  } catch (err) {
    Sentry.captureException(err, { extra: { organizationId, conversationId, step: "handoff_ack_dedupe" } });
  }
  if (alreadyAnswered) return;
  try {
    const askName = typeof contact.id === "number" && isPlaceholderContactName(contact.name);
    await sendReply(organizationId, chatwoot, conversationId, handoffAckText(cis, askName, customerText, crisis, intentReply));
  } catch (err) {
    Sentry.captureException(err, { extra: { organizationId, conversationId, step: "handoff_ack" } });
  }
}

async function chatwootConfigOrNone(organizationId: string): Promise<ChatwootConfig | undefined> {
  return loadCis(organizationId).then((c) => c.chatwoot, () => undefined);
}

/** Operator page for a crisis message (lib/cs/crisis-alert.ts). Best-effort: never fails the pipeline. */
async function pageCrisis(organizationId: string, conversationId: string, chatwoot?: ChatwootConfig): Promise<void> {
  try {
    const notifier = buildOperatorTelegramNotifier();
    const r = await alertOperatorOfCrisis(notifier ? (text) => notifier.sendText(text) : null, organizationId, conversationId, chatwoot);
    if (r.kind !== "sent") Sentry.captureMessage(`cs crisis page not delivered: ${r.code}`, { extra: { organizationId, conversationId } });
  } catch (err) {
    Sentry.captureException(err, { extra: { organizationId, conversationId, step: "crisis_page" } });
  }
}

/**
 * The reply counts only when the public message right before it is an acknowledgement that asks the
 * name (same text; lib/cs/handoff-ack.ts isNameQuestionAck: the ordinary one or the crisis one), so an
 * agent or template speaking in between, or a second customer message, never
 * counts. Only a placeholder name is overwritten, read fresh because an agent may have renamed the
 * contact after this webhook was sent. Residual: a rename landing between that read and the write
 * (Chatwoot has no conditional update) is overwritten.
 */
async function captureName(reply: { organizationId: string; conversationId: string; messageId: number; contactId: number; text: string }): Promise<void> {
  const { organizationId, conversationId } = reply;
  const name = parseNameReply(reply.text);
  if (!name) return;
  const cis = await loadCis(organizationId);
  if (!cis.chatwoot) return;
  // T27: a blocking mode makes no automated writes.
  const gate = await checkProductionChangeAllowed(getSupabaseWriteClient(), organizationId);
  if (!gate.allowed) return;
  let previous;
  try {
    previous = (await listMessages(organizationId, cis.chatwoot, conversationId, { before: reply.messageId }))
      .filter((m) => !m.private && m.messageType !== 2)
      .at(-1);
  } catch (err) {
    // An AgentBot access token may only create messages and toggle status (Chatwoot
    // access_token_auth_helper.rb BOT_ACCESSIBLE_ENDPOINTS); reading messages or renaming a contact
    // needs a User token in the vault (cs:chatwoot:<org>:api_token). Not an incident per reply.
    if (String(err).includes("chatwoot_api_401")) {
      console.warn(`[cs] ${organizationId}: name capture needs a User access token (bot token refused on GET)`);
      return;
    }
    throw err;
  }
  if (previous?.messageType !== 1 || !isNameQuestionAck(cis, previous.content)) return;
  if (!isPlaceholderContactName(await getContactName(organizationId, cis.chatwoot, reply.contactId))) return;
  await updateContactName(organizationId, cis.chatwoot, reply.contactId, name);
}
