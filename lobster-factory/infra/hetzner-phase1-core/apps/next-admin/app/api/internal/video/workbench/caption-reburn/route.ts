import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { finishReburn, loadReburnRow, startReburn } from "@/lib/content/video/caption-reburn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/video/workbench/caption-reburn -- plan U7: the workbench's 字幕 tool burns edited captions onto a
 * main-system video that kept its caption-less copy (lib/content/video/caption-reburn.ts, same code as the staff route).
 * {organizationId, assetId, cues:[{startMs,endMs,text}]} -> 202 {jobs:[{assetId,jobId}]};
 * {organizationId, assetId, jobId} -> {status: running|error|done}. Bearer = VW_INTERNAL_TOKEN; unset = every call 401.
 * Every row (the asked one and the polled ratio rows) must belong to organizationId: another org's id answers 404.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOB = /^[A-Za-z0-9._:-]{1,200}$/;
const cueOk = (c: unknown): c is { startMs: number; endMs: number; text: string } => {
  const x = c as Record<string, unknown> | null;
  return !!x && typeof x.text === "string" && x.text.trim() !== "" && x.text.length <= 500 &&
    Number.isInteger(x.startMs) && Number.isInteger(x.endMs) && (x.startMs as number) >= 0 && (x.endMs as number) > (x.startMs as number);
};

export async function POST(req: Request): Promise<Response> {
  const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });
  const expected = process.env.VW_INTERNAL_TOKEN;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !bearer || !timingSafeEqual(bearer, expected)) return fail(401, "unauthorized");
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const organizationId = typeof body?.organizationId === "string" ? body.organizationId : "";
  const assetId = typeof body?.assetId === "string" ? body.assetId : "";
  const jobId = typeof body?.jobId === "string" ? body.jobId : "";
  if (!UUID.test(organizationId) || !UUID.test(assetId)) return fail(400, "organizationId and assetId required");
  if (jobId ? !JOB.test(jobId) : !(Array.isArray(body?.cues) && body.cues.length > 0 && body.cues.length <= 2000 && body.cues.every(cueOk)))
    return fail(400, jobId ? "invalid jobId" : "cues required: whole ms, start < end, text 1-500 characters");
  const db = getSupabaseWriteClient(); if (!db) return fail(503, "db_unavailable");
  const row = await loadReburnRow(db, assetId);
  if (!row || row.organization_id !== organizationId) return fail(404, "not found");
  const answer = jobId ? await finishReburn(db, row, jobId) : await startReburn(db, row, body!.cues as { startMs: number; endMs: number; text: string }[]);
  return NextResponse.json(answer.body, { status: answer.status });
}
