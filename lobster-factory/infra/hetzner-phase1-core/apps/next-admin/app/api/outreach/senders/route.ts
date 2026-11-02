import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { outreachDb } from "@/lib/outreach/db-client";
import { effectiveOrgId, assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { defaultSignature, POOL_DAILY_LIMIT, taipeiDay } from "@/lib/outreach/sender";
import { todayClaims } from "@/lib/outreach/sender-pool";
import { baseDomain } from "@/lib/portal/hosts";
import dns from "node:dns/promises";
import { judgeBounce, poolEmailRefusal, recheckSender, statsFrom, supabaseHealthStore } from "@/lib/outreach/sender-health";
import { supabaseSyncStore, type GmailSyncState } from "@/lib/outreach/gmail-sync";

// Cold Outreach — sender mailboxes and their signature (SPEC D12). Rows are created by the Gmail OAuth callback; this
// route only reads them and sets signature_block, which every generated email ends with (brand-context.ts composeBody).
// GET carries the default signature for a mailbox that has none yet, so the page can show it filled in, and the
// mailbox's last good reply sync. POST { action: "recheck", id } is the pool mailbox "重新檢查並恢復" button
// (lib/outreach/sender-health.ts recheckSender); POST { action: "rescan", id, days } is "補掃 N 天": the next reply-sync
// tick scans that mailbox's inbox N days back (settings.gmail_sync.rescan_days, lib/outreach/gmail-sync.ts);
// POST { action: "send_mode", id, mode, confirmEmail } is the pool table's 自動寄出 switch (card C8.4): turning it on
// needs the mailbox's address typed back and a subdomain mailbox (poolEmailRefusal); a mailbox never in the pool starts
// warm-up at w1, 50/day (SPEC D17, D21). GET adds, for pool mailboxes, today's claims and the 7-day bounce rate.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_sender_accounts";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNATURE_MAX = 500;
const COLS = "id, organization_id, email, display_name, provider, stream_type, signature_block, is_active, send_mode, daily_limit, warmup_stage, warmup_started_at, health_status, dns_status, dns_checked_at, connector_id";
const RESCAN_DAYS = [1, 3, 7] as const;

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const supabase = await outreachDb(req, params.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const rawOrgId = params.get("organizationId");
  if (rawOrgId && !UUID_RE.test(rawOrgId)) return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, rawOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  let q = supabase.from(TABLE).select(COLS).order("created_at", { ascending: true }).limit(100);
  if (orgFilter) q = q.eq("organization_id", orgFilter);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const rows = (data ?? []) as Array<{ id: string; organization_id: string | null; email: string; display_name: string | null; signature_block: string | null;
    connector_id: string | null; send_mode: string }>;
  const orgIds = Array.from(new Set(rows.map((r) => r.organization_id).filter((v): v is string => !!v)));
  const names = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs } = await supabase.from("organizations").select("id, name").in("id", orgIds);
    for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) names.set(o.id, o.name);
  }
  const sync = new Map<string, GmailSyncState>();
  const connectorIds = rows.map((r) => r.connector_id).filter((v): v is string => !!v);
  if (connectorIds.length) {
    const { data: conns, error: cErr } = await supabase.from("co_connector_accounts").select("id, settings").in("id", connectorIds);
    if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    for (const c of (conns ?? []) as Array<{ id: string; settings: { gmail_sync?: GmailSyncState } | null }>) sync.set(c.id, c.settings?.gmail_sync ?? {});
  }
  const poolIds = rows.filter((r) => r.send_mode === "auto").map((r) => r.id);
  let claims = new Map<string, number>();
  const bounce = new Map<string, number | null>();
  try {
    claims = await todayClaims(supabase, poolIds);
    const store = supabaseHealthStore(supabase);
    const now = new Date();
    for (const id of poolIds) {
      const st = statsFrom(await store.events(id, new Date(now.getTime() - 7 * 86_400_000).toISOString()), now);
      bounce.set(id, st.sent7 ? judgeBounce(st.sent7, st.hardBounced7).rate : null);
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "pool usage read failed" }, { status: 500 });
  }
  const senders = rows.map((r) => {
    const state = r.connector_id ? sync.get(r.connector_id) : undefined;
    const id = r.id;
    return { ...r, default_signature: defaultSignature(r, r.organization_id ? names.get(r.organization_id) ?? null : null),
      last_sync_at: state?.last_ok_at ?? null, rescan_days: state?.rescan_days ?? null,
      today_claims: claims.get(id) ?? null, bounce_rate_7d: bounce.get(id) ?? null };
  });
  return NextResponse.json({ ok: true, senders });
}

// PATCH { id, signatureBlock, orgSlug? }
export async function PATCH(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }
  const supabase = await outreachDb(req, typeof body.orgSlug === "string" ? body.orgSlug : null);
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
  const signature = typeof body.signatureBlock === "string" ? body.signatureBlock.replace(/\r\n/g, "\n").trim() : "";
  if (!signature) return NextResponse.json({ ok: false, error: "署名不能空白" }, { status: 400 });
  if (signature.length > SIGNATURE_MAX) return NextResponse.json({ ok: false, error: `署名最多 ${SIGNATURE_MAX} 字` }, { status: 400 });

  const { data: cur, error: readErr } = await supabase.from(TABLE).select("organization_id").eq("id", id).maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try { assertOrgAccess(req, (cur as { organization_id: string | null }).organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const { data, error } = await supabase.from(TABLE)
    .update({ signature_block: signature, updated_at: new Date().toISOString() }).eq("id", id).select(COLS).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sender: data });
}

// POST { action: "recheck" | "rescan", id, days?, orgSlug? } -- recheck: rerun DNS and the 7-day bounce rate now,
// healthy only when both pass; rescan: the reply sync scans this mailbox's inbox `days` back on its next tick.
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }
  if (body.action !== "recheck" && body.action !== "rescan" && body.action !== "send_mode") {
    return NextResponse.json({ ok: false, error: "action must be recheck, rescan or send_mode" }, { status: 400 });
  }
  const supabase = await outreachDb(req, typeof body.orgSlug === "string" ? body.orgSlug : null);
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });

  const { data: cur, error: readErr } = await supabase.from(TABLE).select("organization_id, email, stream_type, send_mode, connector_id, warmup_started_at").eq("id", id).maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try { assertOrgAccess(req, (cur as { organization_id: string | null }).organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (body.action === "send_mode") {
    const row = cur as { email: string; stream_type: string; connector_id: string | null; warmup_started_at: string | null };
    if (body.mode === "draft") {
      const { error } = await supabase.from(TABLE).update({ send_mode: "draft", updated_at: new Date().toISOString() }).eq("id", id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, sendMode: "draft" });
    }
    if (body.mode !== "auto") return NextResponse.json({ ok: false, error: "mode must be auto or draft" }, { status: 400 });
    const typed = typeof body.confirmEmail === "string" ? body.confirmEmail.trim().toLowerCase() : "";
    if (typed !== row.email.trim().toLowerCase()) return NextResponse.json({ ok: false, error: "輸入的 email 和這個信箱不同：沒有開啟" }, { status: 400 });
    const refusal = poolEmailRefusal(row.email, baseDomain());
    if (refusal) return NextResponse.json({ ok: false, error: refusal }, { status: 400 });
    if (row.stream_type !== "cold") return NextResponse.json({ ok: false, error: "只有冷信信箱能自動寄出" }, { status: 400 });
    if (!row.connector_id) return NextResponse.json({ ok: false, error: "這個信箱沒有連上 Gmail：先重新連線" }, { status: 409 });
    // A mailbox back in the pool keeps its warm-up stage; a first time starts at w1 (sender.ts connectedSenderFields).
    const join = row.warmup_started_at ? {} : { daily_limit: POOL_DAILY_LIMIT, warmup_stage: "w1", warmup_started_at: taipeiDay() };
    const { error } = await supabase.from(TABLE).update({ send_mode: "auto", ...join, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, sendMode: "auto" });
  }
  if (body.action === "rescan") {
    const days = RESCAN_DAYS.find((d) => d === body.days);
    if (!days) return NextResponse.json({ ok: false, error: `days must be ${RESCAN_DAYS.join(" / ")}` }, { status: 400 });
    const connectorId = (cur as { connector_id: string | null }).connector_id;
    if (!connectorId) return NextResponse.json({ ok: false, error: "這個信箱沒有連上 Gmail：先重新連線" }, { status: 409 });
    try { await supabaseSyncStore(supabase).saveState(connectorId, { rescan_days: days }); }
    catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "rescan request failed" }, { status: 500 }); }
    return NextResponse.json({ ok: true, rescanDays: days });
  }
  if ((cur as { send_mode: string }).send_mode !== "auto") {
    return NextResponse.json({ ok: false, error: "只有寄件池信箱需要檢查" }, { status: 400 });
  }
  const r = await recheckSender({ store: supabaseHealthStore(supabase), resolver: dns, notify: async () => {} }, id);
  return NextResponse.json({ ok: true, healthy: r.healthy, reasons: r.reasons });
}
