// POST /api/ops/repairs/remediate { incident_id } — manually run the matching
// catalog remediation for an incident (A2). Human-approved by the click, so
// the AUTO_REMEDIATE_ENABLED flag does not gate this path; the whitelist and
// precheck still do. Same RBAC as repair approval.

import { NextResponse } from "next/server";
import { canApproveCommand, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { Incident } from "@/lib/ops-inbox/types";
import { tryRemediate } from "@/lib/repair-center/remediations/engine";
import { blockedChangeResponse } from "@/lib/system-modes/blocked-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  if (!canApproveCommand(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let incidentId = "";
  try {
    const body = (await request.json()) as { incident_id?: unknown };
    incidentId = typeof body.incident_id === "string" ? body.incident_id.trim() : "";
  } catch {
    /* fall through to validation */
  }
  if (!UUID_RE.test(incidentId)) {
    return NextResponse.json({ ok: false, error: "invalid_incident_id" }, { status: 400 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });
  }

  const { data: incident, error } = await supabase
    .from("ops_incidents")
    .select("*")
    .eq("id", incidentId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!incident) return NextResponse.json({ ok: false, error: "incident_not_found" }, { status: 404 });

  const outcome = await tryRemediate(supabase, incident as Incident, {
    mode: "manual",
    actor: `ops-console:${resolved.role}`,
  });

  if (outcome.blockedMode !== undefined) return blockedChangeResponse(outcome.blockedMode);
  return NextResponse.json(
    { ok: outcome.attempted ? outcome.ok === true : false, outcome },
    { status: 200 },
  );
}
