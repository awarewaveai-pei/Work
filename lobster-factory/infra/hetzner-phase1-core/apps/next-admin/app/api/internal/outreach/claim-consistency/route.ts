// POST /api/internal/outreach/claim-consistency  { organizationId, limit?, offset?, until? }
//
// offset pages the same ordered set (newest first, id as tie-break): a deploy restarts the container (two 2026-11-05 runs
// were cut), and the free Gemini key allows 500 calls a day shared with the pipeline (~5 per email here), so a caller
// measures in batches of ~20 over several days and sums them. until (ISO time) pins the set: an email written meanwhile
// would otherwise shift every later offset.
//
// Card C16.2: the latest first emails (both variants) of one organization, each fact-checked twice; answers the
// consistency report (lib/outreach/claim-consistency.ts) of the check approvals rest on: checkClaimsVoted, a majority
// vote (R0-PLAN C16 「一致率實測與投票」). A single run against a single run measured 0.87-0.93 (reports of 2026-11-04); a
// majority is symmetric, so unlike an AND of two runs it does not hide a flip as a stable "unsupported". Paid: four to
// six outreach.qa calls per email, billed to that organization like the pipeline tick. Run by hand on the host
// (127.0.0.1:3002, OUTREACH_SYNC_TOKEN): 200 emails take minutes, longer than the proxy's 300 s read timeout.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { grantFor, runForOrg } from "@/lib/entitlements/grant";
import type { EvidenceItem } from "@/lib/outreach/brand-context";
import { checkClaimsVoted, type Recipient } from "@/lib/outreach/claim-check";
import { measureConsistency, type ConsistencySample } from "@/lib/outreach/claim-consistency";
import { approvedEvidence, type LeadRow } from "@/lib/outreach/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 200;
const ACTOR = "internal:claim_consistency";

function verifyToken(request: Request): boolean {
  const expected = process.env.OUTREACH_SYNC_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

export async function POST(request: Request) {
  if (!verifyToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { organizationId?: unknown; limit?: unknown; offset?: unknown; until?: unknown };
  const org = typeof body.organizationId === "string" && UUID_RE.test(body.organizationId) ? body.organizationId : null;
  if (!org) return NextResponse.json({ ok: false, error: "organizationId (uuid) required" }, { status: 400 });
  const limit = Math.min(MAX, Math.max(1, Number.isInteger(body.limit) ? (body.limit as number) : MAX));
  const offset = Number.isInteger(body.offset) && (body.offset as number) > 0 ? (body.offset as number) : 0;
  const until = typeof body.until === "string" && !Number.isNaN(Date.parse(body.until)) ? new Date(body.until).toISOString() : null;
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "no_supabase_client" }, { status: 503 });

  let q = sb.from("co_messages").select("id, lead_id, body").eq("organization_id", org).not("variant_label", "is", null);
  if (until) q = q.lte("created_at", until);
  const { data: msgs, error } = await q.order("created_at", { ascending: false }).order("id").range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const rows = (msgs ?? []) as Array<{ id: string; lead_id: string; body: string }>;
  const { data: leadRows, error: leadErr } = await sb.from("co_leads").select("*").in("id", [...new Set(rows.map((m) => m.lead_id))]);
  if (leadErr) return NextResponse.json({ ok: false, error: leadErr.message }, { status: 500 });
  const leads = new Map(((leadRows ?? []) as LeadRow[]).map((l) => [l.id, l]));

  const inputs: Array<{ messageId: string; body: string; evidence: EvidenceItem[]; recipient: Recipient; leadId: string }> = [];
  for (const m of rows) {
    const lead = leads.get(m.lead_id);
    if (!lead) continue;
    const evidence = await approvedEvidence(sb, lead);
    if (!evidence.length) continue;
    inputs.push({ messageId: m.id, body: m.body, evidence, recipient: { name: lead.name, website: lead.website ?? null }, leadId: lead.id });
  }
  // One billing scope and one grant for the whole run, like the pipeline tick: a grant per check was a database request
  // per check, and the gateway answered 429.
  const report = await runForOrg(org, ACTOR, async () => {
    const grant = await grantFor("outreach.qa");
    return measureConsistency(inputs.map((i): ConsistencySample => ({ messageId: i.messageId,
      run: () => checkClaimsVoted({ body: i.body, evidence: i.evidence, recipient: i.recipient, grant, ai: { db: sb, organizationId: org }, metadata: { lead_id: i.leadId, purpose: "claim_consistency" } }) })));
  });
  return NextResponse.json({ ok: true, ...report });
}
