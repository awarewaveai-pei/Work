// GET/PUT /api/ops/clients/[slug]/cs-eval-cases — a client's customer-service golden set (plan §5.2),
// the exam an intent must pass before it may be set to L2. Gated by canWriteTenantConfig (owner/admin).
// GET → every case of the client, plus each intent's latest per-case exam results.
// PUT { intentKey, cases[] } → replaces that intent's whole set (lib/cs/db.ts replaceEvalCases) and
// removes its graduation: a pass earned on the old set says nothing about the new one, and an L2
// intent then drafts until it passes again (decideAnswerAction).

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { recordOpsAudit } from "@/lib/ops-audit";
import { listEvalCases, loadGraduations, loadIntentMetadata, parseEvalCases, replaceEvalCases } from "@/lib/cs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function orgIdOf(slug: string): Promise<string | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const { data, error } = await sb.from("organizations").select("id").eq("slug", slug).single();
  return error || !data ? null : (data.id as string);
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  const [cases, graduations] = await Promise.all([listEvalCases(orgId), loadGraduations(orgId)]);
  const results = Object.fromEntries([...graduations].map(([key, g]) => [key, g.results ?? []]));
  return NextResponse.json({ ok: true, cases, results });
}

export async function PUT(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const intentKey = typeof body.intentKey === "string" ? body.intentKey.trim() : "";
  if (!intentKey) return NextResponse.json({ ok: false, error: "intentKey_required" }, { status: 400 });
  const parsed = parseEvalCases(body.cases);
  if ("error" in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  if (!(await loadIntentMetadata(orgId, intentKey))) return NextResponse.json({ ok: false, error: "intent_not_found" }, { status: 404 });

  if (!(await replaceEvalCases(orgId, intentKey, parsed.cases))) {
    return NextResponse.json({ ok: false, error: "replace_failed" }, { status: 500 });
  }
  await recordOpsAudit(orgId, resolved.role, resolved.source, "cs_eval_cases_replaced", { intentKey, n: parsed.cases.length });
  return NextResponse.json({ ok: true, intentKey, n: parsed.cases.length });
}
