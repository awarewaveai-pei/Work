import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { dispatchToHost, externalAudioAllowed, hostWorkerConfig, OPENAI_TRANSCRIBE_MAX_BYTES, OPENAI_TRANSCRIBE_MODEL, runOpenAiJob } from "@/lib/content/video/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
type SourceAsset = { id: string; organization_id: string; object_url: string | null; checksum_sha256: string | null; mime_type: string | null; byte_size: number | null };

function controlledHttpsUrl(value: string | null): string | null {
  const base = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  if (!value || !base) return null;
  try { const url = new URL(value); const allowed = new URL(base); return url.protocol === "https:" && url.host === allowed.host ? url.toString() : null; } catch { return null; }
}

/** Submit a tenant-owned, checksummed R2 asset for transcription. engine "host" = our Whisper worker (free);
 *  "openai" = whisper-1 (paid, refused when the client keeps audio in-house), falling back to host on failure. */
export async function POST(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const sourceAssetId = typeof body.sourceAssetId === "string" ? body.sourceAssetId.trim() : "";
  const engine = body.engine === "openai" ? "openai" : "host";
  if (!UUID_RE.test(sourceAssetId)) return NextResponse.json({ ok: false, error: "invalid_source_asset" }, { status: 400 });
  const host = hostWorkerConfig();
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (engine === "host" && !host) return NextResponse.json({ ok: false, error: "transcription_worker_not_configured" }, { status: 503 });
  if (engine === "openai" && !apiKey) return NextResponse.json({ ok: false, error: "openai_not_configured" }, { status: 503 });
  const { getSupabaseWriteClient } = await import("@/lib/supabase-server"); const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "media_database_unavailable" }, { status: 503 });
  const asset = await db.from("media_assets").select("id, organization_id, object_url, checksum_sha256, mime_type, byte_size").eq("id", sourceAssetId).maybeSingle();
  if (asset.error) return NextResponse.json({ ok: false, error: "source_asset_lookup_failed" }, { status: 502 });
  if (!asset.data) return NextResponse.json({ ok: false, error: "source_asset_not_found" }, { status: 404 });
  const source = asset.data as SourceAsset;
  try { assertOrgAccess(req, source.organization_id); } catch (error) { if (error instanceof OrgAccessError) return toOrgAccessResponse(error); throw error; }
  if (!source.mime_type?.startsWith("video/") && !source.mime_type?.startsWith("audio/")) return NextResponse.json({ ok: false, error: "source_asset_not_media" }, { status: 422 });
  const sourceUrl = controlledHttpsUrl(source.object_url);
  if (!sourceUrl || !source.checksum_sha256 || !SHA256_RE.test(source.checksum_sha256)) return NextResponse.json({ ok: false, error: "source_asset_requires_controlled_url_and_sha256" }, { status: 422 });
  if (engine === "openai") {
    // Enforced here, not only by hiding the button: the client's setting is what keeps its audio in-house.
    const org = await db.from("organizations").select("metadata").eq("id", source.organization_id).maybeSingle();
    if (org.error || !org.data) return NextResponse.json({ ok: false, error: "organization_lookup_failed" }, { status: 502 });
    if (!externalAudioAllowed(org.data.metadata)) return NextResponse.json({ ok: false, error: "client_keeps_audio_in_house" }, { status: 403 });
    if ((source.byte_size ?? 0) > OPENAI_TRANSCRIBE_MAX_BYTES) return NextResponse.json({ ok: false, error: "source_over_25mb" }, { status: 422 });
  }
  const jobId = randomUUID(); const callbackSecret = randomBytes(32).toString("base64url"); const callbackSecretHash = createHash("sha256").update(callbackSecret).digest("hex");
  const model = engine === "openai" ? OPENAI_TRANSCRIBE_MODEL : host!.model;
  const resultJson = { engine };
  const inserted = await db.from("media_transcription_jobs").insert({ id: jobId, organization_id: source.organization_id, source_asset_id: source.id, source_checksum_sha256: source.checksum_sha256, callback_secret_sha256: callbackSecretHash, status: "dispatched", model, result_json: resultJson }).select("id").single();
  if (inserted.error) return NextResponse.json({ ok: false, error: "transcription_job_create_failed" }, { status: 502 });
  if (engine === "openai") {
    // Not awaited: the browser polls /status, and a closed page does not stop the job.
    void runOpenAiJob(db, { id: jobId, organization_id: source.organization_id, source_asset_id: source.id, source_checksum_sha256: source.checksum_sha256, result_json: resultJson, sourceUrl, callbackSecret }, apiKey, req.url);
    return NextResponse.json({ ok: true, jobId, status: "dispatched", engine }, { status: 202 });
  }
  if (!await dispatchToHost({ jobId, sourceUrl, checksum: source.checksum_sha256, callbackSecret })) {
    await db.from("media_transcription_jobs").update({ status: "failed", error_code: "worker_dispatch_failed", completed_at: new Date().toISOString() }).eq("id", jobId).eq("status", "dispatched");
    return NextResponse.json({ ok: false, error: "transcription_worker_unreachable" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, jobId, status: "dispatched", engine }, { status: 202 });
}
