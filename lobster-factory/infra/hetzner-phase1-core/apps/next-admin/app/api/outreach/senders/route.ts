import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { outreachDb } from "@/lib/outreach/db-client";
import { effectiveOrgId, assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { defaultSignature } from "@/lib/outreach/sender";
import dns from "node:dns/promises";
import { recheckSender, supabaseHealthStore } from "@/lib/outreach/sender-health";

// Cold Outreach — sender mailboxes and their signature (SPEC D12). Rows are created by the Gmail OAuth callback; this
// route only reads them and sets signature_block, which every generated email ends with (brand-context.ts composeBody).
// GET carries the default signature for a mailbox that has none yet, so the page can show it filled in.
// POST { action: "recheck", id } is the pool mailbox "重新檢查並恢復" button (lib/outreach/sender-health.ts recheckSender).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_sender_accounts";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNATURE_MAX = 500;
const COLS = "id, organization_id, email, display_name, provider, stream_type, signature_block, is_active, send_mode, daily_limit, warmup_stage, warmup_started_at, health_status, dns_status, dns_checked_at";

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
  const rows = (data ?? []) as Array<{ organization_id: string | null; email: string; display_name: string | null; signature_block: string | null }>;
  const orgIds = Array.from(new Set(rows.map((r) => r.organization_id).filter((v): v is string => !!v)));
  const names = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs } = await supabase.from("organizations").select("id, name").in("id", orgIds);
    for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) names.set(o.id, o.name);
  }
  const senders = rows.map((r) => ({ ...r,
    default_signature: defaultSignature(r, r.organization_id ? names.get(r.organization_id) ?? null : null) }));
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

// POST { action: "recheck", id, orgSlug? } -- rerun DNS and the 7-day bounce rate now; healthy only when both pass.
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }
  if (body.action !== "recheck") return NextResponse.json({ ok: false, error: "action must be recheck" }, { status: 400 });
  const supabase = await outreachDb(req, typeof body.orgSlug === "string" ? body.orgSlug : null);
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });

  const { data: cur, error: readErr } = await supabase.from(TABLE).select("organization_id, send_mode").eq("id", id).maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try { assertOrgAccess(req, (cur as { organization_id: string | null }).organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if ((cur as { send_mode: string }).send_mode !== "auto") {
    return NextResponse.json({ ok: false, error: "只有寄件池信箱需要檢查" }, { status: 400 });
  }
  const r = await recheckSender({ store: supabaseHealthStore(supabase), resolver: dns, notify: async () => {} }, id);
  return NextResponse.json({ ok: true, healthy: r.healthy, reasons: r.reasons });
}
