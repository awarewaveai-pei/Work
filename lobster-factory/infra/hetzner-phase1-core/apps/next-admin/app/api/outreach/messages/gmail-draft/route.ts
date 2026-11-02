import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { outreachDb } from "@/lib/outreach/db-client";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse, userKindOf } from "@/lib/tenant-guard";
import { getSecret, connectorSecretRef } from "@/lib/secret-vault";
import { buildRfc2822Message, createGmailDraft, GmailDraftError, refreshAccessToken, replySubject, toBase64Url, type GmailDraft } from "@/lib/outreach/google-oauth";
import { gmailApi, GmailNotFound, header } from "@/lib/outreach/gmail-api";
import { contactBlock } from "@/lib/outreach/contact-guard";
import { stageCap } from "@/lib/outreach/sender";

// Cold Outreach — Gmail draft creation (task T10, acceptance: real draft via REALTEST, daily
// limit enforced, draft-only — never sends). A dedicated route rather than messages/route.ts's
// PATCH: the generic PATCH lets a human flip status among draft/approved/needs_edit/skipped, but
// 'drafted' is never a value a client sets: this route takes the row (approved → drafted) just before the Gmail call
// and gives it back if the call fails, so the status never lies about whether a draft exists and two requests cannot
// both draft it; drafted_at is written once the draft exists.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Follow-up dates use the same Asia/Taipei business-day anchor as app/api/outreach/followups —
// the daily draft limit resets on the same calendar boundary the rest of this product uses.
const BIZ_TZ = "Asia/Taipei";
function todayStartUtcIso(): string {
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: BIZ_TZ }).format(new Date());
  // en-CA gives YYYY-MM-DD for the *local* Taipei date; interpret that as a Taipei midnight, which
  // for a fixed UTC+8 zone is simply that date at 16:00 the previous UTC day. Taipei has no DST.
  return new Date(`${dateStr}T00:00:00+08:00`).toISOString();
}

interface LeadRow { id: string; organization_id: string | null; name: string | null; email: string | null; website: string | null; do_not_contact: boolean;
  status: string | null; consent_source: string | null; }
interface MessageRow { id: string; organization_id: string | null; lead_id: string; subject: string | null; body: string; status: string;
  drafted_at: string | null; prompt_snapshot: { sender_id?: string } | null; output_type: string | null; }

// A take older than this with no draft_created event is a request that died between the take and Gmail.
const STALE_TAKE_MS = 10 * 60_000;
interface ConnectorRow { id: string; organization_id: string | null; credentials_ref: string | null; is_enabled: boolean; settings: { email?: string } | null; }
interface SenderRow { id: string; organization_id: string | null; email: string; daily_limit: number; is_active: boolean; stream_type: string; provider?: string;
  send_mode?: string; warmup_stage?: string; connector_id?: string | null; }
const SENDER_COLS = "id, organization_id, email, daily_limit, is_active, stream_type, provider, send_mode, warmup_stage, connector_id";

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const messageId = str(body.messageId);
  if (!messageId) return NextResponse.json({ ok: false, error: "messageId required" }, { status: 400 });
  if (!UUID_RE.test(messageId)) return NextResponse.json({ ok: false, error: "messageId must be a uuid" }, { status: 400 });

  const supabase = await outreachDb(req, str(body.orgSlug));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const { data: msgData, error: msgErr } = await supabase
    .from("co_messages")
    .select("id, organization_id, lead_id, subject, body, status, drafted_at, prompt_snapshot, output_type")
    .eq("id", messageId)
    .maybeSingle();
  if (msgErr) return NextResponse.json({ ok: false, error: msgErr.message }, { status: 500 });
  if (!msgData) return NextResponse.json({ ok: false, error: "message not found" }, { status: 404 });
  const message = msgData as MessageRow;

  try { assertOrgAccess(req, message.organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  // drafted with no draft_created event long after its take: the request died before Gmail, or Gmail drafted and the
  // event write failed. Code cannot tell the two apart, so code never calls Gmail again by itself: a person looks in
  // Gmail first and confirms there is no draft (confirmedNoDraft) -- the only way a second call can happen.
  let staleTake = false;
  if (message.status === "drafted" && message.drafted_at && Date.now() - Date.parse(message.drafted_at) > STALE_TAKE_MS) {
    const { count, error } = await supabase.from("co_sending_events").select("id", { count: "exact", head: true })
      .eq("message_id", message.id).eq("event_type", "draft_created");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    staleTake = (count ?? 0) === 0;
    if (staleTake && body.confirmedNoDraft !== true) {
      return NextResponse.json({ ok: false, error: "drafted_unconfirmed", detail: "這封可能已經在 Gmail 裡：先去看，確定沒有再按一次" }, { status: 409 });
    }
  }
  if (message.status !== "approved" && !staleTake) {
    return NextResponse.json({ ok: false, error: `message must be approved first (status=${message.status})` }, { status: 400 });
  }

  const { data: leadData, error: leadErr } = await supabase
    .from("co_leads")
    .select("id, organization_id, name, email, website, do_not_contact, status, consent_source")
    .eq("id", message.lead_id)
    .maybeSingle();
  if (leadErr) return NextResponse.json({ ok: false, error: leadErr.message }, { status: 500 });
  if (!leadData) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });
  const lead = leadData as LeadRow;
  if (!lead.email) return NextResponse.json({ ok: false, error: "lead has no email address" }, { status: 400 });

  // SPEC I6: the lead was contactable when the message was generated; it may not be any more (opt-out, suppression,
  // MX check since). Decided here, before any token work, by the same guard the auto-send path uses.
  let blocked: Awaited<ReturnType<typeof contactBlock>>;
  try {
    blocked = await contactBlock(supabase, lead);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "contact guard failed" }, { status: 500 });
  }
  if (blocked) return NextResponse.json({ ok: false, blocked: true, reason: blocked }, { status: 409 });

  // Connector lookup mirrors the AI-provider ladder in messages/route.ts POST: org-scoped row
  // first (client's own connected Gmail), else the agency's own (organization_id IS NULL) — the
  // self-use / "先用測試帳號" path before any client has connected theirs. A customer never drafts in the agency's mailbox:
  // its own connector or nothing.
  const agencyFallback = userKindOf(req.headers) !== "client";
  const pickConnector = async (): Promise<ConnectorRow | null> => {
    if (message.organization_id) {
      const { data } = await supabase
        .from("co_connector_accounts")
        .select("id, organization_id, credentials_ref, is_enabled, settings")
        .eq("connector_name", "gmail")
        .eq("is_enabled", true)
        .eq("organization_id", message.organization_id)
        .not("credentials_ref", "is", null)
        .limit(1)
        .maybeSingle();
      if (data) return data as ConnectorRow;
    }
    if (!agencyFallback) return null;
    const { data } = await supabase
      .from("co_connector_accounts")
      .select("id, organization_id, credentials_ref, is_enabled, settings")
      .eq("connector_name", "gmail")
      .eq("is_enabled", true)
      .is("organization_id", null)
      .not("credentials_ref", "is", null)
      .limit(1)
      .maybeSingle();
    return (data as ConnectorRow | null) ?? null;
  };
  // The mailbox the email was written for (its signature is in the body, SPEC D12): drafted there or not at all. The
  // rotation over the sender pool happens when the email is written (sender.ts senderFor, C8.1). A follow-up goes out
  // from the mailbox that drafted the lead's earlier mail (one thread, SPEC §5.5, C8.2).
  let writtenFor = message.prompt_snapshot?.sender_id ?? null;
  if (message.output_type === "followup") {
    const { data: prev, error: prevErr } = await supabase.from("co_sending_events").select("sender_account_id")
      .eq("lead_id", lead.id).in("event_type", ["draft_created", "sent"]).not("sender_account_id", "is", null)
      .neq("message_id", message.id).order("created_at", { ascending: false }).limit(1);
    if (prevErr) return NextResponse.json({ ok: false, error: prevErr.message }, { status: 500 });
    const first = ((prev ?? []) as Array<{ sender_account_id: string }>)[0]?.sender_account_id ?? null;
    if (first && writtenFor && first !== writtenFor) {
      return NextResponse.json({ ok: false, error: "sender_mismatch", detail: "這封追蹤信的署名信箱和前一封不同：重新產生" }, { status: 409 });
    }
    writtenFor = first ?? writtenFor;
  }
  let named: SenderRow | null = null;
  if (writtenFor) {
    const { data, error } = await supabase.from("co_sender_accounts")
      .select(SENDER_COLS).eq("id", writtenFor).maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    named = (data as SenderRow | null) ?? null;
    const org = named?.organization_id ?? null;
    const usable = named && named.is_active && named.stream_type === "cold" && named.provider === "gmail"
      && (org === message.organization_id || (org === null && agencyFallback));
    if (!usable) return NextResponse.json({ ok: false, error: "sender_unavailable", detail: "寫信用的寄件信箱已停用或不屬於這個組織：重新產生" }, { status: 409 });
  }
  const pickNamedConnector = async (s: SenderRow): Promise<ConnectorRow | null> => {
    // 0152 links a mailbox to its connector; a mailbox from before that is matched by address.
    if (s.connector_id) {
      const { data } = await supabase.from("co_connector_accounts").select("id, organization_id, credentials_ref, is_enabled, settings")
        .eq("id", s.connector_id).eq("is_enabled", true).not("credentials_ref", "is", null).maybeSingle();
      return (data as ConnectorRow | null) ?? null;
    }
    let q = supabase.from("co_connector_accounts").select("id, organization_id, credentials_ref, is_enabled, settings")
      .eq("connector_name", "gmail").eq("is_enabled", true).not("credentials_ref", "is", null);
    q = s.organization_id ? q.eq("organization_id", s.organization_id) : q.is("organization_id", null);
    const { data } = await q.limit(50);
    return ((data ?? []) as ConnectorRow[]).find((c) => (c.settings?.email ?? "").toLowerCase() === s.email.toLowerCase()) ?? null;
  };
  const connector = named ? await pickNamedConnector(named) : await pickConnector();
  if (!connector || !connector.credentials_ref) {
    return NextResponse.json({ ok: false, error: "no connected Gmail connector for this org — connect one in Connectors first" }, { status: 400 });
  }

  // .eq("organization_id", null) does NOT mean IS NULL on a typed uuid column — PostgREST raises
  // 22P02 (critic Major, 2026-09-11). The agency-default connector path (organization_id === null,
  // the "先用測試帳號" fallback used before any client connects their own Gmail) needs .is() instead.
  let senderQuery = supabase
    .from("co_sender_accounts")
    .select("id, organization_id, email, daily_limit, is_active, stream_type")
    .eq("provider", "gmail")
    .eq("is_active", true);
  senderQuery = connector.organization_id
    ? senderQuery.eq("organization_id", connector.organization_id)
    : senderQuery.is("organization_id", null);
  // Rows from before C2 name no mailbox: the organization's active cold one, as before.
  const { data: senderData, error: senderErr } = named ? { data: named, error: null }
    : await senderQuery.eq("stream_type", "cold").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (senderErr) return NextResponse.json({ ok: false, error: senderErr.message }, { status: 500 });
  if (!senderData) return NextResponse.json({ ok: false, error: "no active Gmail sender account — reconnect Gmail" }, { status: 400 });
  const sender = senderData as SenderRow;
  // A pool mailbox drafts no more a day than it may send (its warm-up stage cap, SPEC D21).
  const dailyLimit = sender.send_mode === "auto" ? stageCap(sender.warmup_stage ?? "full", sender.daily_limit) : sender.daily_limit;

  // Gate on a live count of today's draft_created events, not a manually-reset counter column —
  // self-resetting on the Asia/Taipei day boundary with no cron dependency (critic: a stored
  // counter needs an explicit reset job; this doesn't).
  const { count: todayCount, error: countErr } = await supabase
    .from("co_sending_events")
    .select("id", { count: "exact", head: true })
    .eq("sender_account_id", sender.id)
    .eq("event_type", "draft_created")
    .gte("created_at", todayStartUtcIso());
  if (countErr) return NextResponse.json({ ok: false, error: countErr.message }, { status: 500 });
  if ((todayCount ?? 0) >= dailyLimit) {
    return NextResponse.json(
      { ok: false, error: `daily Gmail draft limit reached (${todayCount}/${dailyLimit})`, dailyLimitReached: true },
      { status: 429 },
    );
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.json({ ok: false, error: "oauth client not configured" }, { status: 503 });

  let refreshToken: string | null;
  try {
    refreshToken = await getSecret(connectorSecretRef(connector.id));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "vault read failed" }, { status: 500 });
  }
  if (!refreshToken) return NextResponse.json({ ok: false, error: "gmail connector has no stored refresh token — reconnect" }, { status: 400 });

  let accessToken: string;
  try {
    const tokens = await refreshAccessToken({ refreshToken, clientId, clientSecret });
    accessToken = tokens.access_token;
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "token refresh failed" }, { status: 502 });
  }

  // A follow-up replies in the thread of our last SENT mail to the lead (C5.2, SPEC §5.7): its RFC Message-ID becomes
  // In-Reply-To / References, its thread the draft's thread, "Re: <first email's subject>" the subject. Read-only Gmail
  // call, made before the take so a failure here leaves the row untouched.
  let reply: { inReplyTo: string; threadId: string; subject: string | null } | null = null;
  if (message.output_type === "followup") {
    const { data: sentEv, error: sentErr } = await supabase.from("co_sending_events").select("sender_account_id, metadata")
      .eq("lead_id", lead.id).eq("event_type", "sent").order("created_at", { ascending: false }).limit(1);
    if (sentErr) return NextResponse.json({ ok: false, error: sentErr.message }, { status: 500 });
    const prev = ((sentEv ?? []) as Array<{ sender_account_id: string | null; metadata: { gmailMessageId?: string; threadId?: string } | null }>)[0];
    const prevGmailId = prev?.metadata?.gmailMessageId;
    const prevThread = prev?.metadata?.threadId;
    if (!prevGmailId || !prevThread) {
      return NextResponse.json({ ok: false, error: "no_previous_mail", detail: "這筆名單還沒有寄出過的信，追蹤信沒有可回的那一串" }, { status: 409 });
    }
    if (prev?.sender_account_id && prev.sender_account_id !== sender.id) {
      return NextResponse.json({ ok: false, error: "sender_mismatch", detail: "上一封是用另一個信箱寄出的：追蹤信要回同一串，不能換信箱" }, { status: 409 });
    }
    const { data: first, error: firstErr } = await supabase.from("co_messages").select("subject")
      .eq("lead_id", lead.id).eq("output_type", "cold_email").eq("status", "sent").order("sent_at", { ascending: false }).limit(1);
    if (firstErr) return NextResponse.json({ ok: false, error: firstErr.message }, { status: 500 });
    let messageIdHeader: string | null;
    try {
      messageIdHeader = header(await gmailApi(accessToken).message(prevGmailId, "meta"), "Message-ID")?.trim() || null;
    } catch (e) {
      if (e instanceof GmailNotFound) return NextResponse.json({ ok: false, error: "no_previous_mail", detail: "Gmail 裡找不到上一封寄出的信（可能已被刪除）" }, { status: 409 });
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "gmail read failed" }, { status: 502 });
    }
    if (!messageIdHeader) return NextResponse.json({ ok: false, error: "previous mail has no Message-ID header" }, { status: 502 });
    reply = { inReplyTo: messageIdHeader, threadId: prevThread, subject: replySubject(((first ?? []) as Array<{ subject: string | null }>)[0]?.subject ?? null) };
  }

  // Take the row before Gmail is called (approved → drafted, conditional): of two concurrent requests, or a review change
  // racing this one, only the one that took it creates a draft. The draft is built from the content taken, not the
  // content read earlier (an edit in between would otherwise be stored but not drafted). A failure gives the row back.
  // drafted_at is the take time; a stale take is retaken only if nobody retook it since (same drafted_at).
  const takeIso = new Date().toISOString();
  const takeQ = supabase.from("co_messages").update({ status: "drafted", drafted_at: takeIso }).eq("id", message.id);
  const { data: taken, error: takeErr } = await (staleTake ? takeQ.eq("status", "drafted").eq("drafted_at", message.drafted_at!) : takeQ.eq("status", "approved"))
    .select("subject, body").maybeSingle();
  if (takeErr) return NextResponse.json({ ok: false, error: takeErr.message }, { status: 500 });
  if (!taken) return NextResponse.json({ ok: false, error: "status_changed" }, { status: 409 });
  const content = taken as { subject: string | null; body: string };

  let draft: GmailDraft;
  try {
    const raw = toBase64Url(buildRfc2822Message({ from: sender.email, to: lead.email.trim(), subject: reply ? reply.subject : content.subject,
      bodyText: content.body, ...(reply ? { inReplyTo: reply.inReplyTo } : {}) }));
    draft = await createGmailDraft(accessToken, raw, reply?.threadId);
  } catch (e) {
    const error = e instanceof Error ? e.message : "gmail draft creation failed";
    // Gmail refused (4xx): no draft exists, the row goes back. Anything else (network, 5xx, unreadable reply): a draft
    // may exist, so the row stays taken; the stale-take path above lets a person retry after looking in Gmail.
    if (e instanceof GmailDraftError && e.created === "no") {
      const { error: backErr } = await supabase.from("co_messages").update({ status: "approved", drafted_at: null })
        .eq("id", message.id).eq("status", "drafted").eq("drafted_at", takeIso);
      return NextResponse.json({ ok: false, error, ...(backErr ? { warning: `the message stays drafted without a Gmail draft: ${backErr.message}` } : {}) }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error, warning: "Gmail 可能已經建了草稿：先到 Gmail 看，沒有的話 10 分鐘後再按一次" }, { status: 502 });
  }

  // The draft exists and the row is drafted: from here nothing is an error (an error invites a retry and a second
  // draft). The event is what the daily limit counts and what marks the take finished; one retry, then a warning.
  const event = { organization_id: connector.organization_id, lead_id: lead.id, message_id: message.id, stream_type: "cold",
    provider: "gmail", sender_account_id: sender.id, event_type: "draft_created", provider_event_id: draft.id,
    // The reply sync reads these (lib/outreach/gmail-sync.ts): the message for "sent?", the thread for matching replies.
    metadata: { draftId: draft.id, messageId: draft.message?.id ?? null, threadId: draft.message?.threadId ?? null } };
  let { error: eventErr } = await supabase.from("co_sending_events").insert(event);
  if (eventErr) ({ error: eventErr } = await supabase.from("co_sending_events").insert(event));
  const warning = eventErr ? `draft ${draft.id} created but its event was not recorded (${eventErr.message}): it is not counted in today's limit` : null;

  return NextResponse.json({ ok: true, draftId: draft.id, senderEmail: sender.email, warning });
}
