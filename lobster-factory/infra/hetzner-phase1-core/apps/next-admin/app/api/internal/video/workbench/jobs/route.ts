import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/internal/video/workbench/jobs -- video-workbench's job ledger (P6 D1 table media_workbench_jobs; until migration
 * 0159 is applied every DB call fails and answers 502). Bearer = VW_INTERNAL_TOKEN; unset = every call 401.
 * POST {action:"upsert", organizationId, idempotencyKey, kind, status, ...} | {action:"cancel", organizationId, idempotencyKey}
 * GET ?organizationId=<uuid>&limit=<1..100>
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set(["image", "video", "audio", "text", "remove-bg", "3d", "render", "transcribe"]);
const STATUSES = new Set(["queued", "running", "succeeded", "failed", "cancelled"]);
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const RANK: Record<string, number> = { queued: 0, running: 1, succeeded: 2, failed: 2, cancelled: 2 };
const KEY = /^[A-Za-z0-9._:-]{1,200}$/;
const COLUMNS = "id, organization_id, idempotency_key, kind, status, result_asset_id, cost_usd, error, attempt, cancel_requested, created_at, updated_at";

function unauthorized(req: Request): Response | null {
  const expected = process.env.VW_INTERNAL_TOKEN;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !bearer || !timingSafeEqual(bearer, expected)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return null;
}
// Invariant: a database/storage failure is logged with its own code and message; the caller gets the label only.
const fail = (status: number, error: string, cause?: { code?: string; message?: string } | null) => {
  if (cause) console.error(`[vw-internal] ${error}: ${cause.code ?? ""} ${String(cause.message ?? "").slice(0, 300)}`);
  return NextResponse.json({ ok: false, error }, { status });
};

export async function POST(req: Request): Promise<Response> {
  const denied = unauthorized(req); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "invalid_json"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "invalid_json");
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  if (!UUID.test(organizationId) || !KEY.test(idempotencyKey)) return fail(400, "organizationId/idempotencyKey required");
  const db = getSupabaseWriteClient(); if (!db) return fail(503, "db_unavailable");

  if (body.action === "cancel") {
    const { data, error } = await db.from("media_workbench_jobs").update({ cancel_requested: true, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId).eq("idempotency_key", idempotencyKey).select(COLUMNS).maybeSingle();
    if (error) return fail(502, "job_update_failed", error);
    if (!data) return fail(404, "job_not_found");
    return NextResponse.json({ ok: true, job: data });
  }
  if (body.action !== "upsert") return fail(400, "invalid_action");
  const kind = typeof body.kind === "string" ? body.kind : "";
  const status = typeof body.status === "string" ? body.status : "";
  if (!KINDS.has(kind) || !STATUSES.has(status)) return fail(400, "invalid_kind_or_status");
  const optUuid = (v: unknown) => (v === undefined || v === null ? null : typeof v === "string" && UUID.test(v) ? v : undefined);
  const createdBy = optUuid(body.createdBy);
  const resultAssetId = optUuid(body.resultAssetId);
  if (createdBy === undefined || resultAssetId === undefined) return fail(400, "invalid_uuid");
  const cost = body.costUsd === undefined || body.costUsd === null ? null : body.costUsd;
  if (cost !== null && (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0 || cost > 10_000)) return fail(400, "invalid_cost");
  const attempt = body.attempt === undefined ? 1 : body.attempt;
  if (typeof attempt !== "number" || !Number.isInteger(attempt) || attempt < 1 || attempt > 100) return fail(400, "invalid_attempt");
  const errorText = typeof body.error === "string" ? body.error.slice(0, 2000) : null;
  const input = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input : null;
  if (input && JSON.stringify(input).length > 32_000) return fail(400, "input_too_large");
  // Only what the caller supplied is written: a retry or late update never nulls cost/result/error an earlier one
  // recorded, and an absent input leaves the column default '{}' (input is NOT NULL, 0159).
  // cancel_requested is never written here: a running worker's upsert must not clear a cancel.
  const given: Record<string, unknown> = {
    ...(createdBy ? { created_by: createdBy } : {}),
    ...(input ? { input } : {}),
    ...(resultAssetId ? { result_asset_id: resultAssetId } : {}),
    ...(cost !== null ? { cost_usd: cost } : {}),
    ...(errorText !== null ? { error: errorText } : {}),
    ...(body.attempt !== undefined ? { attempt } : {}),
  };
  const jobs = () => db.from("media_workbench_jobs");
  // Status only moves forward (queued -> running -> terminal) and a terminal row is final except a missing cost. Read, then update guarded
  // on the status read, so a concurrent change makes the update match nothing and the loop re-reads.
  for (let i = 0; i < 3; i++) {
    const cur = await jobs().select(COLUMNS).eq("organization_id", organizationId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (cur.error) return fail(502, "job_lookup_failed", cur.error);
    const now = new Date().toISOString();
    if (!cur.data) {
      const ins = await jobs().insert({ organization_id: organizationId, idempotency_key: idempotencyKey, kind, status, ...given, updated_at: now })
        .select(COLUMNS).single();
      if (!ins.error && ins.data) return NextResponse.json({ ok: true, job: ins.data });
      if (ins.error?.code === "23505") continue;   // another request created it first: apply this one as an update
      return fail(502, "job_upsert_failed", ins.error);
    }
    const was = String((cur.data as { status: unknown }).status);
    if (TERMINAL.has(was) || RANK[status] < RANK[was]) {
      // A terminal row keeps its status, result and error; only a cost not yet recorded may still land, once (a job
      // cancelled mid-call may already be billed). Guarded on cost_usd null, so a concurrent fill makes this match nothing.
      if (TERMINAL.has(was) && cost !== null && (cur.data as { cost_usd: unknown }).cost_usd === null) {
        const fill = await jobs().update({ cost_usd: cost, updated_at: now })
          .eq("organization_id", organizationId).eq("idempotency_key", idempotencyKey).is("cost_usd", null).select(COLUMNS).maybeSingle();
        if (fill.error) return fail(502, "job_upsert_failed", fill.error);
        if (fill.data) return NextResponse.json({ ok: true, job: fill.data, applied: false, costRecorded: true });
        continue;
      }
      return NextResponse.json({ ok: true, job: cur.data, applied: false });
    }
    const upd = await jobs().update({ status, ...given, updated_at: now })
      .eq("organization_id", organizationId).eq("idempotency_key", idempotencyKey).eq("status", was).select(COLUMNS).maybeSingle();
    if (upd.error) return fail(502, "job_upsert_failed", upd.error);
    if (upd.data) return NextResponse.json({ ok: true, job: upd.data });
  }
  return fail(409, "job_conflict");
}

export async function GET(req: Request): Promise<Response> {
  const denied = unauthorized(req); if (denied) return denied;
  const q = new URL(req.url).searchParams;
  const organizationId = q.get("organizationId") ?? "";
  if (!UUID.test(organizationId)) return fail(400, "organizationId required");
  const limit = Math.min(100, Math.max(1, Number.parseInt(q.get("limit") ?? "50", 10) || 50));
  const db = getSupabaseWriteClient(); if (!db) return fail(503, "db_unavailable");
  const { data, error } = await db.from("media_workbench_jobs").select(COLUMNS).eq("organization_id", organizationId)
    .order("created_at", { ascending: false }).limit(limit);
  if (error) return fail(502, "job_list_failed", error);
  return NextResponse.json({ ok: true, jobs: data ?? [] });
}
