// GET /api/ops/site-flow/[siteId]?environment=production -- every site-flow step's state for one environment
// (SITE-FLOW-COMPLETION-PLAN.md §2, card SF-G). Staff only. States come from each step's observation plus its last
// run (I1); this route stores nothing except closing runs left running past their step's timeout.

import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { staffOnly } from "@/lib/tenant-guard";
import { environmentTypeParam, getSiteFlowStatus, loadSiteEnvironment, SITE_STEP_DEFINITIONS } from "@/lib/site-flow/engine";
import { createSiteGateClient, gateTargetOf, sshGateTransport, unconfiguredTransport } from "@/lib/site-flow/gate-client";

export async function GET(request: Request, context: { params: Promise<{ siteId: string }> }) {
  const denied = staffOnly(request);
  if (denied) return denied;
  const environmentType = environmentTypeParam(new URL(request.url).searchParams.get("environment"));
  if (!environmentType) return NextResponse.json({ ok: false, error: "invalid_environment" }, { status: 400 });
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });
  const { siteId } = await context.params;
  const loaded = await loadSiteEnvironment(db, siteId, environmentType);
  if ("outcome" in loaded) return NextResponse.json(loaded.outcome.body, { status: loaded.outcome.status });
  const transport = sshGateTransport() ?? unconfiguredTransport;
  const r = await getSiteFlowStatus(
    { db, steps: SITE_STEP_DEFINITIONS, gateFor: (env) => createSiteGateClient(gateTargetOf(env), transport) },
    { site: loaded.site, environment: loaded.environment },
  );
  return NextResponse.json(r.body, { status: r.status });
}
