import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
type SourceAsset = { id: string; organization_id: string; object_url: string | null; checksum_sha256: string | null; mime_type: string | null };

function controlledHttpsUrl(value: string | null): string | null {
  const base = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  if (!value || !base) return null;
  try { const url = new URL(value); const allowed = new URL(base); return url.protocol === "https:" && url.host === allowed.host ? url.toString() : null; } catch { return null; }
}

/** Submit a tenant-owned, checksummed R2 asset to the independent GPU worker. */
export async function POST(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const workerUrl = (process.env.MEDIA_TRANSCRIBE_WORKER_URL ?? "").replace(/\/+$/, "");
  const workerToken = (process.env.MEDIA_TRANSCRIBE_WORKER_TOKEN ?? "").trim();
  const callbackBase = (process.env.MEDIA_TRANSCRIBE_CALLBACK_BASE_URL ?? "").replace(/\/+$/, "");
  if (!workerUrl || !workerToken || !callbackBase || !/^https:\/\//i.test(workerUrl) || !/^https:\/\//i.test(callbackBase)) return NextResponse.json({ ok: false, error: "transcription_worker_not_configured" }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const sourceAssetId = typeof body.sourceAssetId === "string" ? body.sourceAssetId.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : "large-v3";
  if (!UUID_RE.test(sourceAssetId) || !/^[A-Za-z0-9._-]{1,64}$/.test(model)) return NextResponse.json({ ok: false, error: "invalid_source_asset_or_model" }, { status: 400 });
  const { getSupabaseWriteClient } = await import("@/lib/supabase-server"); const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "media_database_unavailable" }, { status: 503 });
  const asset = await db.from("media_assets").select("id, organization_id, object_url, checksum_sha256, mime_type").eq("id", sourceAssetId).maybeSingle();
  if (asset.error) return NextResponse.json({ ok: false, error: "source_asset_lookup_failed" }, { status: 502 });
  if (!asset.data) return NextResponse.json({ ok: false, error: "source_asset_not_found" }, { status: 404 });
  const source = asset.data as SourceAsset;
  try { assertOrgAccess(req, source.organization_id); } catch (error) { if (error instanceof OrgAccessError) return toOrgAccessResponse(error); throw error; }
  if (!source.mime_type?.startsWith("video/") && !source.mime_type?.startsWith("audio/")) return NextResponse.json({ ok: false, error: "source_asset_not_media" }, { status: 422 });
  const sourceUrl = controlledHttpsUrl(source.object_url);
  if (!sourceUrl || !source.checksum_sha256 || !SHA256_RE.test(source.checksum_sha256)) return NextResponse.json({ ok: false, error: "source_asset_requires_controlled_url_and_sha256" }, { status: 422 });
  const jobId = randomUUID(); const callbackSecret = randomBytes(32).toString("base64url"); const callbackSecretHash = createHash("sha256").update(callbackSecret).digest("hex");
  const inserted = await db.from("media_transcription_jobs").insert({ id: jobId, organization_id: source.organization_id, source_asset_id: source.id, source_checksum_sha256: source.checksum_sha256, callback_secret_sha256: callbackSecretHash, status: "dispatched", model }).select("id").single();
  if (inserted.error) return NextResponse.json({ ok: false, error: "transcription_job_create_failed" }, { status: 502 });
  try {
    const response = await fetch(`${workerUrl}/v1/jobs`, { method: "POST", headers: { Authorization: `Bearer ${workerToken}`, "content-type": "application/json" }, body: JSON.stringify({ job_id: jobId, source_url: sourceUrl, source_checksum_sha256: source.checksum_sha256, callback_url: `${callbackBase}/api/internal/video/transcription-complete`, callback_secret: callbackSecret, model }), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error("worker_rejected");
  } catch {
    await db.from("media_transcription_jobs").update({ status: "failed", error_code: "worker_dispatch_failed", completed_at: new Date().toISOString() }).eq("id", jobId).eq("status", "dispatched");
    return NextResponse.json({ ok: false, error: "transcription_worker_unreachable" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, jobId, status: "dispatched" }, { status: 202 });
}
