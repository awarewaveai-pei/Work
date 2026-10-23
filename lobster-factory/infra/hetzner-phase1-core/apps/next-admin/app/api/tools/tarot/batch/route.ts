import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import {
  BatchStoreUnavailableError, createJob, deleteJob, listRecentJobs, setRunId, toPublicJob,
} from "../../../../../lib/tarot/batch-store";
import { fetchTriggerRunStatus } from "../../../../../lib/tarot/batch-run-status";
import { isTarotModel, isAspectRatio } from "../../../../../lib/tarot/image-gen";
import { isR2Configured } from "../../../../../lib/storage/r2";
import { effectiveOrgId, OrgAccessError, resolveTenant, toOrgAccessResponse } from "../../../../../lib/tenant-guard";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface BatchCard { index: number; name: string; prompt: string }

function storeUnavailable(e: unknown): Response | null {
  if (!(e instanceof BatchStoreUnavailableError)) return null;
  console.error("[tarot-batch]", e.message);
  return NextResponse.json({ ok: false, error: "batch_store_unavailable" }, { status: 503 });
}

// The buyer is checked here, before any card starts; each card is then billed to the job's organization
// (app/api/internal/tarot/batch/[jobId]/card/route.ts).
export const POST = withFeature("tarot.image", handlePost);

async function handlePost(req: Request, grant: Grant): Promise<Response> {
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

  // Results live only in R2 (a data URL is too large for a row): without R2 every card would be paid for and lost.
  if (!isR2Configured()) {
    return NextResponse.json({ ok: false, error: "R2 not configured — background batch unavailable" }, { status: 503 });
  }

  // Owner written once at creation (same seam as designs POST): client -> own org, staff -> default org.
  let organizationId: string | null;
  try { organizationId = effectiveOrgId(req, process.env.POD_DESIGNS_DEFAULT_ORG_ID ?? null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const createdBy = req.headers.get("x-ops-user-id")?.trim() || null;

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
  if (cards.some((c, i) => !c || c.index !== i || typeof c.name !== "string" || !c.name || typeof c.prompt !== "string" || !c.prompt)) {
    return NextResponse.json({ ok: false, error: "cards must be [{index: 0..n-1 in order, name, prompt}]" }, { status: 400 });
  }

  const arRaw = typeof body.aspectRatio === "string" ? body.aspectRatio : "2:3";
  const aspectRatio = isAspectRatio(arRaw) ? arRaw : "2:3";
  const seed        = typeof body.seed === "number" ? body.seed : null;

  const jobId = randomUUID();

  // Trigger Trigger.dev task. No secret or callback URL in the payload (it is stored and shown in the Trigger
  // dashboard): the worker reads BATCH_INTERNAL_SECRET and AWAREWAVE_WEBHOOK_BASE_URL from its own env.
  // The job exists before the run does: the task's first callback must find it (no create-after-trigger race).
  try {
    await createJob({ jobId, organizationId, createdBy, actor: grant.actor, model, aspectRatio, totalCards: cards.length });
  } catch (e) {
    const res = storeUnavailable(e);
    if (res) return res;
    throw e;
  }
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
      await deleteJob(jobId).catch(() => undefined);
      return NextResponse.json(
        { ok: false, error: `Trigger.dev HTTP ${trigRes.status} — check TRIGGER_ACCESS_TOKEN and task deployment` },
        { status: 502 },
      );
    }
  } catch (e) {
    await deleteJob(jobId).catch(() => undefined);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `Trigger.dev unreachable: ${msg}` }, { status: 502 });
  }

  // The run id lets a status read end the job when the run itself failed (lib/tarot/batch-run-status.ts).
  if (triggerRunId) await setRunId(jobId, triggerRunId).catch(() => undefined);

  return NextResponse.json({ ok: true, jobId, runId: triggerRunId, totalCards: cards.length });
}

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role" }, { status: 403 });
  }
  // Visibility: a client sees only its own organization's jobs; staff (full access, lib/tenant-guard.ts:6)
  // see the jobs they created.
  let organizationId: string | null;
  try { organizationId = effectiveOrgId(req, null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const createdBy = resolveTenant(req).userKind === "staff" ? req.headers.get("x-ops-user-id")?.trim() || null : null;
  try {
    const jobs = await listRecentJobs({ organizationId, createdBy }, 10, { runStatus: fetchTriggerRunStatus });
    return NextResponse.json({ ok: true, jobs: jobs.map(toPublicJob) });
  } catch (e) {
    const res = storeUnavailable(e);
    if (res) return res;
    throw e;
  }
}
