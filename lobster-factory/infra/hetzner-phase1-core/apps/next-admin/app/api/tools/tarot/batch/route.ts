import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { createJob, listRecentJobs } from "../../../../../lib/tarot/batch-store";
import { isTarotModel, isAspectRatio } from "../../../../../lib/tarot/image-gen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface BatchCard { index: number; name: string; prompt: string }

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role" }, { status: 403 });
  }

  const apiUrl = process.env.TRIGGER_API_URL?.trim();
  const token  = process.env.TRIGGER_ACCESS_TOKEN?.trim() || process.env.TRIGGER_SECRET_KEY?.trim();
  if (!apiUrl || !token) {
    return NextResponse.json(
      { ok: false, error: "TRIGGER_API_URL / TRIGGER_ACCESS_TOKEN not configured — background batch unavailable" },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const model = body.model as string;
  if (!isTarotModel(model)) {
    return NextResponse.json({ ok: false, error: "invalid_model" }, { status: 400 });
  }

  const cards = body.cards as BatchCard[] | undefined;
  if (!Array.isArray(cards) || cards.length === 0) {
    return NextResponse.json({ ok: false, error: "cards array required" }, { status: 400 });
  }
  if (cards.length > 78) {
    return NextResponse.json({ ok: false, error: "cards length exceeds maximum (78)" }, { status: 400 });
  }

  const arRaw = typeof body.aspectRatio === "string" ? body.aspectRatio : "2:3";
  const aspectRatio = isAspectRatio(arRaw) ? arRaw : "2:3";
  const seed        = typeof body.seed === "number" ? body.seed : null;

  const sgBaseUrl = (
    process.env.INTERNAL_ADMIN_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "https://app.aware-wave.com"
  ).replace(/\/$/, "");

  const jobId = randomUUID();

  // Trigger Trigger.dev task
  const triggerUrl = `${apiUrl.replace(/\/$/, "")}/api/v1/tasks/tarot-batch-generate/trigger`;
  let triggerRunId: string | null = null;
  try {
    const trigRes = await fetch(triggerUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          jobId,
          cards,
          model,
          aspectRatio,
          seed,
          sgBaseUrl,
          batchSecret: process.env.BATCH_INTERNAL_SECRET?.trim() || undefined,
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (trigRes.ok) {
      const data = (await trigRes.json()) as { id?: string };
      triggerRunId = data.id ?? null;
    } else {
      const txt = await trigRes.text().catch(() => "");
      console.error("[tarot-batch] trigger failed", trigRes.status, txt.slice(0, 300));
      return NextResponse.json(
        { ok: false, error: `Trigger.dev HTTP ${trigRes.status} — check TRIGGER_ACCESS_TOKEN and task deployment` },
        { status: 502 },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `Trigger.dev unreachable: ${msg}` }, { status: 502 });
  }

  const job = createJob(jobId, model, aspectRatio, cards.length, triggerRunId);

  return NextResponse.json({ ok: true, jobId: job.jobId, runId: triggerRunId, totalCards: cards.length });
}

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, jobs: listRecentJobs(10) });
}
