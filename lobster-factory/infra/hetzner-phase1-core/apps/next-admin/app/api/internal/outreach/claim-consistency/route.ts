// POST /api/internal/outreach/claim-consistency  { organizationId, limit? }
//
// Card C16.2: the latest first emails (both variants) of one organization, each fact-checked twice; answers the
// consistency report (lib/outreach/claim-consistency.ts). Paid: two outreach.qa calls per email, billed to that
// organization like the pipeline tick. Run by hand (OUTREACH_SYNC_TOKEN), not on a schedule.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { grantFor, runForOrg } from "@/lib/entitlements/grant";
import { checkClaims } from "@/lib/outreach/claim-check";
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
  const body = (await request.json().catch(() => ({}))) as { organizationId?: unknown; limit?: unknown };
  const org = typeof body.organizationId === "string" && UUID_RE.test(body.organizationId) ? body.organizationId : null;
  if (!org) return NextResponse.json({ ok: false, error: "organizationId (uuid) required" }, { status: 400 });
  const limit = Math.min(MAX, Math.max(1, Number.isInteger(body.limit) ? (body.limit as number) : MAX));
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "no_supabase_client" }, { status: 503 });

  const { data: msgs, error } = await sb.from("co_messages").select("id, lead_id, body")
    .eq("organization_id", org).not("variant_label", "is", null).order("created_at", { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const rows = (msgs ?? []) as Array<{ id: string; lead_id: string; body: string }>;
  const { data: leadRows, error: leadErr } = await sb.from("co_leads").select("*").in("id", [...new Set(rows.map((m) => m.lead_id))]);
  if (leadErr) return NextResponse.json({ ok: false, error: leadErr.message }, { status: 500 });
  const leads = new Map(((leadRows ?? []) as LeadRow[]).map((l) => [l.id, l]));

  const samples: ConsistencySample[] = [];
  for (const m of rows) {
    const lead = leads.get(m.lead_id);
    if (!lead) continue;
    const evidence = await approvedEvidence(sb, lead);
    if (!evidence.length) continue;
    samples.push({ messageId: m.id, organizationId: org,
      run: async () => checkClaims({ body: m.body, evidence, recipient: { name: lead.name, website: lead.website ?? null },
        grant: await grantFor("outreach.qa"), metadata: { lead_id: lead.id, purpose: "claim_consistency" } }) });
  }
  const report = await measureConsistency(samples, (o, fn) => runForOrg(o, ACTOR, fn));
  return NextResponse.json({ ok: true, ...report });
}
