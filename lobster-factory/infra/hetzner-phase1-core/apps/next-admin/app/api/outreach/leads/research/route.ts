import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { outreachDb } from "@/lib/outreach/db-client";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { grantFor } from "@/lib/entitlements/grant";
import { EntitlementRequired } from "@/lib/entitlements/can";
import { billedTo } from "@/lib/outreach/billing";
import { researchLead, type ResearchLead, type ResearchOutcome } from "@/lib/outreach/research";
import { getRunJob, startRunJob } from "@/lib/collect/run-jobs";
import { isWarm } from "@/lib/outreach/cold-gate";
import { canAccessOrg } from "@/lib/tenant-guard";

// Cold Outreach -- research leads (SPEC §5.1, card C3). POST starts the run in the background and answers its runKey at
// once (a crawl outlives Cloudflare's ~100 s edge timeout, lib/collect/run-jobs.ts); GET ?runKey= is polled for the
// outcome. Every lead is authorized and its outreach.research grant obtained before anything starts: a refusal is an
// answer now, not a failed background job. Batch (leadIds, ≤ 20) is for the pipeline tick (card C15).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND = "outreach-research";
const MAX_BATCH = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }
  const supabase = await outreachDb(req, str(body.orgSlug));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const ids = Array.isArray(body.leadIds) ? body.leadIds : str(body.leadId) ? [body.leadId] : [];
  const leadIds = Array.from(new Set(ids.filter((v): v is string => typeof v === "string" && UUID_RE.test(v))));
  if (leadIds.length === 0 || leadIds.length !== ids.length) return NextResponse.json({ ok: false, error: "leadId or leadIds (uuid) required" }, { status: 400 });
  if (leadIds.length > MAX_BATCH) return NextResponse.json({ ok: false, error: `at most ${MAX_BATCH} leads per run` }, { status: 400 });

  const { data, error } = await supabase.from("co_leads").select("id, organization_id, name, website, social_url, email, consent_source, do_not_contact, status").in("id", leadIds);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const leads = (data ?? []) as Array<ResearchLead & { do_not_contact: boolean; status: string | null }>;
  if (leads.length !== leadIds.length) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });

  const jobs: Array<{ lead: ResearchLead; grant: Awaited<ReturnType<typeof grantFor>>; ctx: Awaited<ReturnType<typeof billedTo>> }> = [];
  for (const lead of leads) {
    try { assertOrgAccess(req, lead.organization_id); }
    catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
    // A lead nobody may cold-email (do_not_contact, in conversation, opted out, warm) is not researched: research only
    // exists to write a cold email to them.
    if (lead.do_not_contact || isWarm(lead)) return NextResponse.json({ ok: false, error: "not_cold_contactable", leadId: lead.id }, { status: 409 });
    const ctx = await billedTo(req, lead.organization_id);
    try {
      jobs.push({ lead, grant: await grantFor("outreach.research", ctx), ctx });
    } catch (e) {
      if (e instanceof EntitlementRequired) return NextResponse.json({ ok: false, error: e.code, leadId: lead.id }, { status: e.status });
      throw e;
    }
  }

  const runKey = `research-${crypto.randomUUID()}`;
  // One lead after another: the per-host rate limiter is per run, and a batch is one tick's worth (≤ 20). A lead that
  // throws is that lead's failed outcome; the others still run and their results are kept.
  const work = (async (): Promise<ResearchOutcome[]> => {
    const out: ResearchOutcome[] = [];
    for (const j of jobs) {
      try {
        out.push(await researchLead(supabase, j.lead, { grant: j.grant, grantContext: j.ctx, runKey: `${runKey}:${j.lead.id}` }));
      } catch (e) {
        out.push({ leadId: j.lead.id, organizationId: j.lead.organization_id, status: "failed", written: 0, approved: 0, evidence: 0, pending: 0,
          emailFound: null, error: e instanceof Error ? e.message : String(e), errors: [] });
      }
    }
    return out;
  })();
  startRunJob<ResearchOutcome[]>(KIND, runKey, work);
  return NextResponse.json({ ok: true, runKey }, { status: 202 });
}

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });
  const runKey = new URL(req.url).searchParams.get("runKey") ?? "";
  if (!/^research-[0-9a-f-]{36}$/.test(runKey)) return NextResponse.json({ ok: false, error: "runKey required" }, { status: 400 });
  const job = getRunJob<ResearchOutcome[]>(KIND, runKey);
  if (!job) return NextResponse.json({ ok: false, error: "not found (finished long ago, or the server restarted)" }, { status: 404 });
  // The key is not the authorization: each outcome is shown only to a caller who may act on its lead's organization.
  const outcomes = job.result ? job.result.filter((o) => canAccessOrg(req, o.organizationId)) : null;
  return NextResponse.json({ ok: true, status: job.status, outcomes, error: job.error ?? null });
}
