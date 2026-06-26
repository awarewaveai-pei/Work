// POST /api/ops/cs/eval — run the offline golden-set eval for one tenant (optionally one intent)
// and return the summary + graduation verdict. Gated by canCreateAiImageJob (owner/admin/operator)
// because it spends LLM. Body: { slug: string, intentKey?: string }.
// NOTE: runs cases sequentially; large golden sets may take a while — keep sets modest or move to a
// background job (Trigger.dev) later. cs_* reads use the service-role client.

import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { runEval, gradeIntent } from "@/lib/cs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const intentKey = typeof body.intentKey === "string" && body.intentKey.trim() ? body.intentKey.trim() : undefined;
  if (!slug) return NextResponse.json({ ok: false, error: "slug_required" }, { status: 400 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const { data: org, error } = await supabase.from("organizations").select("id").eq("slug", slug).single();
  if (error || !org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const summary = await runEval(org.id as string, intentKey);
  const grade = gradeIntent(summary);

  // Don't echo full answers/questions (may contain PII) — return metrics + verdict only.
  return NextResponse.json({
    ok: true,
    slug,
    intentKey: intentKey ?? null,
    n: summary.n,
    passRate: Number(summary.passRate.toFixed(4)),
    dangerousErrorRate: Number(summary.dangerousErrorRate.toFixed(4)),
    handoffRecall: Number(summary.handoffRecall.toFixed(4)),
    grade,
  });
}
