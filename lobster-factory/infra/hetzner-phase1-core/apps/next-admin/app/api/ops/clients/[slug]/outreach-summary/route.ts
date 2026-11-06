// GET /api/ops/clients/[slug]/outreach-summary -- read-only state of this client's cold outreach (client hub → 冷開發).
// Every block is { ok:true, ... } or { ok:false, error }: a failed read is never turned into a 0. Staff only (viewer+),
// like the other hub reads; a client identity never reaches /api/ops (middleware) and is refused again here.
// Blocks: senders (co_sender_accounts), counts (co_lead_inbox / co_leads / co_messages / co_replies), spend (ai_call_logs,
// route outreach/*, Asia/Taipei month), features (verdictOf per outreach.* feature: plan/grant check, no audit row, no debit).

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { resolveOpsRole } from "@/lib/ops-role";
import { resolveTenant } from "@/lib/tenant-guard";
import { taipeiMonthStartIso } from "@/lib/ai/spend-report";
import { TWD_RATE } from "@/lib/ai/cost-model";
import { stageCap } from "@/lib/outreach/sender";
import { todayClaims } from "@/lib/outreach/sender-pool";
import { PRODUCTS } from "@/lib/portal/products";
import { verdictOf } from "@/lib/entitlements/can";
import { requestActor, resolveSubject } from "@/lib/entitlements/subject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };
type Block<T> = ({ ok: true } & T) | { ok: false; error: string };

// Inbox rows still waiting for a person (classify() in app/api/outreach/inbox/route.ts); approved / rejected and the
// blocked kinds (suspected_dup, no_contact, risky, not_recommended) are not waiting.
const AWAITING_REVIEW = ["pending", "high_quality", "needs_data"];
const PAGE = 1000;
const MAX_PAGES = 50;

const failed = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function count(sb: SupabaseClient, table: string, orgId: string, narrow?: (q: any) => any): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let q = sb.from(table).select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  if (narrow) q = narrow(q);
  const { count: n, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  if (typeof n !== "number") throw new Error(`${table}: no count`);
  return n;
}

async function sendersBlock(sb: SupabaseClient, orgId: string) {
  const { data, error } = await sb.from("co_sender_accounts")
    .select("id, email, send_mode, daily_limit, warmup_stage, health_status, auto_draft, is_active")
    .eq("organization_id", orgId).order("created_at", { ascending: true });
  if (error) throw new Error(`co_sender_accounts: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; send_mode: string; daily_limit: number; warmup_stage: string } & Record<string, unknown>>;
  // Same source and cap as the Connectors page (SendersCard): an auto mailbox shows today's live claims over its stage cap;
  // a draft-mode mailbox has no send cap, so no number.
  const claims = await todayClaims(sb, rows.filter((r) => r.send_mode === "auto").map((r) => r.id));
  const senders = rows.map(({ warmup_stage, ...r }) => r.send_mode === "auto"
    ? { ...r, today_claims: claims.get(r.id) ?? 0, cap: stageCap(warmup_stage, r.daily_limit) }
    : { ...r, today_claims: null, cap: null });
  return { senders };
}

async function countsBlock(sb: SupabaseClient, orgId: string, monthStart: string) {
  const [inboxAwaiting, leads, messagesMonth, draftsMonth, sentMonth, repliesMonth, bouncesMonth] = await Promise.all([
    count(sb, "co_lead_inbox", orgId, (q) => q.in("inbox_status", AWAITING_REVIEW)),
    count(sb, "co_leads", orgId),
    count(sb, "co_messages", orgId, (q) => q.gte("created_at", monthStart)),
    count(sb, "co_messages", orgId, (q) => q.gte("created_at", monthStart).eq("status", "drafted")),
    count(sb, "co_messages", orgId, (q) => q.gte("created_at", monthStart).eq("status", "sent")),
    count(sb, "co_replies", orgId, (q) => q.gte("received_at", monthStart).eq("kind", "reply")),
    count(sb, "co_replies", orgId, (q) => q.gte("received_at", monthStart).eq("kind", "bounce")),
  ]);
  return { inboxAwaiting, leads, messagesMonth, draftsMonth, sentMonth, repliesMonth, bouncesMonth };
}

async function spendBlock(sb: SupabaseClient, orgId: string, monthStart: string) {
  let usd = 0;
  let calls = 0;
  let free = 0;
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) throw new Error("ai_call_logs: too many rows to total");
    const { data, error } = await sb.from("ai_call_logs").select("cost_usd, metadata")
      .eq("organization_id", orgId).like("route", "outreach/%").gte("created_at", monthStart)
      .order("created_at", { ascending: true }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`ai_call_logs: ${error.message}`);
    const rows = (data ?? []) as Array<{ cost_usd: number | string | null; metadata: { free?: unknown } | null }>;
    for (const r of rows) {
      usd += Number(r.cost_usd) || 0;
      calls += 1;
      if (r.metadata?.free === true || r.metadata?.free === "true") free += 1;
    }
    if (rows.length < PAGE) break;
  }
  return { usd, twd: usd * TWD_RATE, calls, free };
}

async function featuresBlock(request: Request, orgId: string) {
  const { runtimeGateDependencies } = await import("@/lib/entitlements/runtime");
  const subject = await resolveSubject({ orgId });
  const deps = runtimeGateDependencies();
  const actor = requestActor(request);
  const product = PRODUCTS.find((p) => p.key === "outreach");
  const features = [];
  for (const f of product?.features ?? []) {
    const v = await verdictOf(subject, f.feature_key, actor, deps);
    // verdictOf folds a failed check into a refusal; a check that could not run is not "未開通".
    if (v.reason === "infrastructure_error") throw new Error(`entitlement check failed: ${f.feature_key}`);
    features.push({ key: f.feature_key, name: f.name, allowed: v.allowed, reason: v.reason });
  }
  return { features };
}

async function block<T extends object>(run: () => Promise<T>): Promise<Block<T>> {
  try { return { ok: true, ...(await run()) }; } catch (e) { return failed(e); }
}

export async function GET(request: Request, context: Ctx) {
  resolveOpsRole(request);
  if (resolveTenant(request).userKind !== "staff") return NextResponse.json({ ok: false, error: "forbidden_role" }, { status: 403 });
  const { slug } = await context.params;
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  const { data, error } = await sb.from("organizations").select("id").eq("slug", slug).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "org_lookup_failed" }, { status: 503 });
  const org = data as { id: string } | null;
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const monthStart = taipeiMonthStartIso(new Date(), 0);
  const [senders, counts, spend, features] = await Promise.all([
    block(() => sendersBlock(sb, org.id)),
    block(() => countsBlock(sb, org.id, monthStart)),
    block(() => spendBlock(sb, org.id, monthStart)),
    block(() => featuresBlock(request, org.id)),
  ]);
  return NextResponse.json({ ok: true, organizationId: org.id, monthStart, senders, counts, spend, features }, { headers: { "cache-control": "no-store" } });
}
