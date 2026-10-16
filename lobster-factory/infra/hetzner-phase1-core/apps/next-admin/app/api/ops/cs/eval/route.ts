// POST /api/ops/cs/eval — the offline golden-set eval (plan §5.2). Gated by canCreateAiImageJob
// (owner/admin/operator) because it spends LLM. Body: { slug: string, intentKey?: string }.
// With intentKey: an exam. It answers 202 at once and runs after the response (30 cases outlast a
// request); the verdict lands in cs_intents.metadata.graduation, which the 客服 tab polls through
// cs-config. A passed exam is what lets the intent be set to L2 (cs-intents route).
// Without intentKey: a whole-tenant run, answered inline, never a graduation verdict.

import { after, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { recordOpsAudit } from "@/lib/ops-audit";
import { examInFlight, examIntent, graduationOf, loadEvalCases, loadIntentMetadata, runEval, setIntentGraduation } from "@/lib/cs";

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

  const orgId = org.id as string;

  if (intentKey) {
    const metadata = await loadIntentMetadata(orgId, intentKey);
    if (!metadata) return NextResponse.json({ ok: false, error: "intent_not_found" }, { status: 404 });
    if (examInFlight(graduationOf(metadata))) return NextResponse.json({ ok: false, error: "exam_running" }, { status: 409 });
    const cases = await loadEvalCases(orgId, intentKey);
    if (cases.length === 0) return NextResponse.json({ ok: false, error: "no_eval_cases" }, { status: 400 });

    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    if ((await setIntentGraduation(orgId, intentKey, { status: "running", runId, startedAt, heartbeatAt: startedAt })) !== "ok") {
      return NextResponse.json({ ok: false, error: "graduation_write_failed" }, { status: 500 });
    }
    after(async () => {
      try {
        const g = await examIntent(orgId, intentKey, { runId, startedAt });
        if (g) {
          await recordOpsAudit(orgId, resolved.role, resolved.source, "cs_intent_exam_finished", {
            intentKey, runId, status: g.status, n: g.n, passRate: g.passRate, dangerousErrorRate: g.dangerousErrorRate, handoffRecall: g.handoffRecall,
          });
        }
      } catch (err) {
        Sentry.captureException(err, { extra: { orgId, intentKey, runId, step: "cs_exam" } });
        await setIntentGraduation(orgId, intentKey, {
          status: "failed", runId, startedAt, finishedAt: new Date().toISOString(), reasons: [`考試中斷：${String(err).slice(0, 200)}`],
        }, { ifRunId: runId }).catch(() => undefined);
      }
    });
    await recordOpsAudit(orgId, resolved.role, resolved.source, "cs_intent_exam_started", { intentKey, runId, n: cases.length });
    return NextResponse.json({ ok: true, started: true, intentKey, n: cases.length }, { status: 202 });
  }

  const summary = await runEval(orgId);

  // Don't echo full answers/questions (may contain PII) — return metrics only.
  return NextResponse.json({
    ok: true,
    slug,
    intentKey: null,
    n: summary.n,
    passRate: Number(summary.passRate.toFixed(4)),
    dangerousErrorRate: Number(summary.dangerousErrorRate.toFixed(4)),
    handoffRecall: Number(summary.handoffRecall.toFixed(4)),
    grade: null,
    note: "whole-tenant run — pass intentKey to sit one intent's exam",
  });
}
