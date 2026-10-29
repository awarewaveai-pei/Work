import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { completeTranscriptionJob } from "@/lib/content/video/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function sameHash(a: string, b: string): boolean { return /^[0-9a-f]{64}$/.test(a) && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex")); }

/** Callback trust comes from a one-job secret; it never trusts a caller-supplied asset id. */
export async function POST(req: NextRequest): Promise<Response> {
  let body: Record<string, unknown>; try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const jobId = typeof body.jobId === "string" ? body.jobId : ""; const secret = typeof body.callbackSecret === "string" ? body.callbackSecret : "";
  if (!UUID_RE.test(jobId) || secret.length < 32) return NextResponse.json({ ok: false, error: "invalid_callback" }, { status: 400 });
  const { getSupabaseWriteClient } = await import("@/lib/supabase-server"); const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "media_database_unavailable" }, { status: 503 });
  const query = await db.from("media_transcription_jobs").select("id, organization_id, source_asset_id, source_checksum_sha256, callback_secret_sha256, status, result_json").eq("id", jobId).maybeSingle(); const job = query.data;
  if (query.error) return NextResponse.json({ ok: false, error: "job_lookup_failed" }, { status: 502 });
  if (!job || !sameHash(String(job.callback_secret_sha256), hash(secret))) return NextResponse.json({ ok: false, error: "invalid_callback" }, { status: 401 });
  if (job.status === "completed") return NextResponse.json({ ok: true, jobId, status: "completed" });
  if (job.status !== "dispatched") return NextResponse.json({ ok: false, error: "job_not_dispatchable" }, { status: 409 });
  if (body.ok !== true || !body.transcript || typeof body.transcript !== "object") {
    const prior = job.result_json && typeof job.result_json === "object" ? job.result_json as Record<string, unknown> : {};
    await db.from("media_transcription_jobs").update({ status: "failed", error_code: "worker_failed", result_json: { ...prior, workerError: typeof body.error === "string" ? body.error.slice(0, 512) : "unknown" }, completed_at: new Date().toISOString() }).eq("id", jobId).eq("status", "dispatched");
    return NextResponse.json({ ok: true, jobId, status: "failed" });
  }
  const done = await completeTranscriptionJob(db, job, body.transcript, req.url);
  if (!done.ok) return NextResponse.json({ ok: false, error: "transcript_import_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, jobId, status: "completed", artifacts: done.artifacts });
}
