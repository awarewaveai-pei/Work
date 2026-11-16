import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { finishReburn, loadReburnRow, startReburn, type ReburnCue } from "@/lib/content/video/caption-reburn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.8: edit the captions of a finished script-caption video and burn them again (lib/content/video/caption-reburn.ts).
 * POST {assetId, cues} -> one video-service job per ratio; POST {assetId, jobId} -> polls that job and, when done, the row
 * takes the new bytes. Both are POST: finishing writes (a GET must not, lib/security get-no-side-effects).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const deny = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: NextRequest): Promise<Response> {
  if (!canCreateAiImageJob(resolveOpsRole(req).role)) return deny("forbidden", 403);
  const body = await req.json().catch(() => null) as { assetId?: unknown; cues?: unknown; jobId?: unknown } | null;
  const assetId = typeof body?.assetId === "string" ? body.assetId : "";
  const jobId = typeof body?.jobId === "string" ? body.jobId : "";
  const cues = Array.isArray(body?.cues) ? body.cues as ReburnCue[] : [];
  if (!UUID_RE.test(assetId)) return deny(jobId ? "assetId and jobId required" : "assetId and non-empty cues required", 400);
  if (!jobId && (cues.length === 0 || cues.some((c) => typeof c?.text !== "string" || !c.text.trim()))) return deny("assetId and non-empty cues required", 400);
  const db = getSupabaseWriteClient();
  if (!db) return deny("db unavailable", 503);
  const row = await loadReburnRow(db, assetId);
  if (!row) return deny("not found", 404);
  try { assertOrgAccess(req, row.organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const answer = jobId ? await finishReburn(db, row, jobId) : await startReburn(db, row, cues);
  return NextResponse.json(answer.body, { status: answer.status });
}
