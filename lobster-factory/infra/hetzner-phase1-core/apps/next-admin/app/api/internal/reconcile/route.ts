// GET /api/internal/reconcile -- cross-product id reconciliation (lib/reconcile/pointers.ts, BACKUP_COVERAGE_PLAN.md B8).
//
// Called once a day by backup-coverage-check.py on the host (127.0.0.1, token from /etc/default/awarewave-reconcile).
// Read-only. Own bearer token RECONCILE_TOKEN, never a shared one (verifyIngestToken.ts M2). A check that could
// not run comes back with its error, so the caller fails that row instead of reading silence as clean.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { runChecks } from "@/lib/reconcile/pointers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function verifyToken(request: Request): boolean {
  const expected = process.env.RECONCILE_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyToken(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ error: "no_supabase_client" }, { status: 500 });
  return NextResponse.json({ generated_at: new Date().toISOString(), checks: await runChecks(sb) });
}
