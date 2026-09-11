import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { getOrgSupabaseWriteClient } from "@/lib/org-client";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSecret, connectorSecretRef } from "@/lib/secret-vault";
import { buildRfc2822Message, createGmailDraft, refreshAccessToken, toBase64Url } from "@/lib/outreach/google-oauth";

// Cold Outreach — Gmail draft creation (task T10, acceptance: real draft via REALTEST, daily
// limit enforced, draft-only — never sends). A dedicated route rather than messages/route.ts's
// PATCH: the generic PATCH lets a human flip status among draft/approved/needs_edit/skipped, but
// 'drafted' must only ever be a side effect of an actual successful Gmail API call — never a
// value a client can set directly, or the status would lie about whether a draft exists.

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

interface LeadRow { id: string; organization_id: string | null; email: string | null; }
interface MessageRow { id: string; organization_id: string | null; lead_id: string; subject: string | null; body: string; status: string; }
interface ConnectorRow { id: string; organization_id: string | null; credentials_ref: string | null; is_enabled: boolean; }
interface SenderRow { id: string; email: string; daily_limit: number; is_active: boolean; }

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

  const supabase = await getOrgSupabaseWriteClient(str(body.orgSlug));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const { data: msgData, error: msgErr } = await supabase
    .from("co_messages")
    .select("id, organization_id, lead_id, subject, body, status")
    .eq("id", messageId)
    .maybeSingle();
  if (msgErr) return NextResponse.json({ ok: false, error: msgErr.message }, { status: 500 });
  if (!msgData) return NextResponse.json({ ok: false, error: "message not found" }, { status: 404 });
  const message = msgData as MessageRow;

  try { assertOrgAccess(req, message.organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  if (message.status !== "approved") {
    return NextResponse.json({ ok: false, error: `message must be approved first (status=${message.status})` }, { status: 400 });
  }

  const { data: leadData, error: leadErr } = await supabase
    .from("co_leads")
    .select("id, organization_id, email")
    .eq("id", message.lead_id)
    .maybeSingle();
  if (leadErr) return NextResponse.json({ ok: false, error: leadErr.message }, { status: 500 });
  if (!leadData) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });
  const lead = leadData as LeadRow;
  if (!lead.email) return NextResponse.json({ ok: false, error: "lead has no email address" }, { status: 400 });

  // Connector lookup mirrors the AI-provider ladder in messages/route.ts POST: org-scoped row
  // first (client's own connected Gmail), else the agency's own (organization_id IS NULL) — the
  // self-use / "先用測試帳號" path before any client has connected theirs.
  const pickConnector = async (): Promise<ConnectorRow | null> => {
    if (message.organization_id) {
      const { data } = await supabase
        .from("co_connector_accounts")
        .select("id, organization_id, credentials_ref, is_enabled")
        .eq("connector_name", "gmail")
        .eq("is_enabled", true)
        .eq("organization_id", message.organization_id)
        .not("credentials_ref", "is", null)
        .limit(1)
        .maybeSingle();
      if (data) return data as ConnectorRow;
    }
    const { data } = await supabase
      .from("co_connector_accounts")
      .select("id, organization_id, credentials_ref, is_enabled")
      .eq("connector_name", "gmail")
      .eq("is_enabled", true)
      .is("organization_id", null)
      .not("credentials_ref", "is", null)
      .limit(1)
      .maybeSingle();
    return (data as ConnectorRow | null) ?? null;
  };
  const connector = await pickConnector();
  if (!connector || !connector.credentials_ref) {
    return NextResponse.json({ ok: false, error: "no connected Gmail connector for this org — connect one in Connectors first" }, { status: 400 });
  }

  // .eq("organization_id", null) does NOT mean IS NULL on a typed uuid column — PostgREST raises
  // 22P02 (critic Major, 2026-09-11). The agency-default connector path (organization_id === null,
  // the "先用測試帳號" fallback used before any client connects their own Gmail) needs .is() instead.
  let senderQuery = supabase
    .from("co_sender_accounts")
    .select("id, email, daily_limit, is_active")
    .eq("provider", "gmail")
    .eq("is_active", true);
  senderQuery = connector.organization_id
    ? senderQuery.eq("organization_id", connector.organization_id)
    : senderQuery.is("organization_id", null);
  const { data: senderData, error: senderErr } = await senderQuery.limit(1).maybeSingle();
  if (senderErr) return NextResponse.json({ ok: false, error: senderErr.message }, { status: 500 });
  if (!senderData) return NextResponse.json({ ok: false, error: "no active Gmail sender account — reconnect Gmail" }, { status: 400 });
  const sender = senderData as SenderRow;

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
  if ((todayCount ?? 0) >= sender.daily_limit) {
    return NextResponse.json(
      { ok: false, error: `daily Gmail draft limit reached (${todayCount}/${sender.daily_limit})`, dailyLimitReached: true },
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

  const raw = toBase64Url(buildRfc2822Message({
    from: sender.email,
    to: lead.email,
    subject: message.subject,
    bodyText: message.body,
  }));

  let draft: { id: string };
  try {
    draft = await createGmailDraft(accessToken, raw);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "gmail draft creation failed" }, { status: 502 });
  }

  const nowIso = new Date().toISOString();
  const { error: eventErr } = await supabase.from("co_sending_events").insert({
    organization_id: connector.organization_id,
    lead_id: lead.id,
    message_id: message.id,
    stream_type: "cold",
    provider: "gmail",
    sender_account_id: sender.id,
    event_type: "draft_created",
    provider_event_id: draft.id,
  });
  if (eventErr) return NextResponse.json({ ok: false, error: eventErr.message }, { status: 500 });

  // The Gmail draft already exists at this point — a failure below must not be reported as a
  // hard error (the caller would retry and create a duplicate draft). Surface it as a warning
  // instead so the UI can flag "check for duplicates" (critic minor, 2026-09-11: this error was
  // previously discarded silently, which would have left co_messages.status stuck on 'approved'
  // with a real draft already sitting in Gmail and no visible sign anything succeeded).
  const { error: statusErr } = await supabase.from("co_messages").update({ status: "drafted", drafted_at: nowIso }).eq("id", message.id);
  const warning = statusErr ? `draft created (${draft.id}) but status update failed: ${statusErr.message} — check for a duplicate before retrying` : null;

  return NextResponse.json({ ok: true, draftId: draft.id, senderEmail: sender.email, warning });
}
