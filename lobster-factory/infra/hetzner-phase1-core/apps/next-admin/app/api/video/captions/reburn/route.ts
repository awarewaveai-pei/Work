import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { pollRenderJob, submitCaptionReburn } from "@/lib/content/video/render-client";
import { videoObjectKey } from "@/lib/content/blocks/video-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.8: edit the captions of a finished script-caption video and burn them again.
 * POST {assetId, cues} -> one video-service job per ratio (the primary row plus its variant rows, each with its caption-less video);
 * POST {assetId, jobId} -> polls that job; when it is done, the row takes the new bytes (checksum, size, captions) and QA runs again on
 * them. Both are POST: finishing writes (a GET must not, lib/security get-no-side-effects).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMAT_RE = /\/(16x9|9x16|4x5)\.mp4$/;
type Row = { id: string; organization_id: string; object_key: string | null; object_url: string | null; metadata: Record<string, unknown> | null };
type Cue = { startMs: number; endMs: number; text: string };

const deny = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

async function loadRow(req: NextRequest, id: string): Promise<{ row: Row } | { res: Response }> {
  const db = getSupabaseWriteClient();
  if (!db) return { res: deny("db unavailable", 503) };
  const { data } = await db.from("media_assets").select("id, organization_id, object_key, object_url, metadata").eq("id", id).eq("mime_type", "video/mp4").maybeSingle();
  if (!data) return { res: deny("not found", 404) };
  const row = data as Row;
  try { assertOrgAccess(req, row.organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return { res: toOrgAccessResponse(e) }; throw e; }
  return { row };
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!canCreateAiImageJob(resolveOpsRole(req).role)) return deny("forbidden", 403);
  const body = await req.json().catch(() => null) as { assetId?: unknown; cues?: unknown; jobId?: unknown } | null;
  const assetId = typeof body?.assetId === "string" ? body.assetId : "";
  if (typeof body?.jobId === "string" && body.jobId) return finish(req, assetId, body.jobId);
  const cues = Array.isArray(body?.cues) ? body.cues as Cue[] : [];
  if (!UUID_RE.test(assetId) || cues.length === 0 || cues.some((c) => typeof c?.text !== "string" || !c.text.trim())) return deny("assetId and non-empty cues required", 400);
  const loaded = await loadRow(req, assetId);
  if ("res" in loaded) return loaded.res;
  const primary = loaded.row;
  if (primary.metadata?.variantOf) return deny("pass the primary video, not a ratio row", 400);

  const db = getSupabaseWriteClient()!;
  const { data: variants } = await db.from("media_assets").select("id, organization_id, object_key, object_url, metadata")
    .eq("organization_id", primary.organization_id).eq("metadata->>variantOf", primary.id);
  const rows = [primary, ...((variants ?? []) as Row[])];

  // A Release pins the exact bytes it approved; burning again would change them under it.
  const { data: releases } = await db.from("media_releases").select("id")
    .eq("organization_id", primary.organization_id).in("candidate_asset_id", rows.map((r) => r.id))
    .in("status", ["candidate_created", "release_approved"]).limit(1);
  if (releases && releases.length > 0) return deny("這支影片已建 Release，不能再改字幕", 409);

  const jobs: { assetId: string; jobId: string }[] = [];
  for (const row of rows) {
    const cleanUrl = typeof row.metadata?.cleanUrl === "string" ? row.metadata.cleanUrl : "";
    const format = FORMAT_RE.exec(row.object_key ?? "")?.[1];
    if (!cleanUrl || !format || !row.object_key) continue;
    const sub = await submitCaptionReburn({ cleanUrl, format, objectKey: row.object_key, cues });
    if (sub.ok === false) return deny(sub.error, sub.status);
    jobs.push({ assetId: row.id, jobId: sub.jobId });
  }
  if (jobs.length === 0) return deny("這支影片沒有保留無字幕底片（較早做的影片），無法重燒", 422);
  return NextResponse.json({ ok: true, jobs }, { status: 202 });
}

async function finish(req: NextRequest, assetId: string, jobId: string): Promise<Response> {
  if (!UUID_RE.test(assetId)) return deny("assetId and jobId required", 400);
  const loaded = await loadRow(req, assetId);
  if ("res" in loaded) return loaded.res;
  const row = loaded.row;
  const format = FORMAT_RE.exec(row.object_key ?? "")?.[1];

  const poll = await pollRenderJob(jobId);
  if (poll.status === "running") return NextResponse.json({ ok: true, status: "running" });
  if (poll.status === "error") return NextResponse.json({ ok: true, status: "error", error: poll.error });
  const meta = format ? poll.outputMeta?.[format] : undefined;
  // The job must have written a version of this row's own file (videoObjectKey maps videorev/… back to the row's key); a jobId from some other video is refused.
  const newUrl = format ? poll.outputs[format] : undefined;
  if (!format || !newUrl || !meta?.checksumSha256 || videoObjectKey(newUrl) !== row.object_key || !poll.captions) return deny("job result does not match this video", 409);

  const db = getSupabaseWriteClient()!;
  const old = row.metadata ?? {};
  // New bytes = new URL: the old URL (maybe already embedded in a post) keeps its old bytes, and no CDN/browser cache can serve stale captions.
  const { error } = await db.from("media_assets").update({
    object_url: newUrl,
    checksum_sha256: meta.checksumSha256,
    byte_size: meta.byteSize ?? 0,
    metadata: {
      ...old,
      captionSource: "script_tts",
      captionCues: poll.captions.cues,
      captionSrt: poll.captions.srt,
      captionVtt: poll.captions.vtt,
      outputMeta: { ...((old.outputMeta as Record<string, unknown> | undefined) ?? {}), [format]: meta },
      captionsReburnedAt: new Date().toISOString(),
      // The primary row also lists every ratio's URL (project page, history, gallery read it); a stale entry would show the old captions.
      ...(old.variantOf ? {} : { formats: { ...((old.formats as Record<string, string> | undefined) ?? {}), [format]: newUrl } }),
    },
  }).eq("id", row.id).eq("organization_id", row.organization_id);
  if (error) return deny(`row update failed: ${error.message}`, 502);
  if (typeof old.variantOf === "string") {
    const { data: main } = await db.from("media_assets").select("metadata").eq("id", old.variantOf).eq("organization_id", row.organization_id).maybeSingle();
    const mm = (main?.metadata ?? null) as Record<string, unknown> | null;
    if (mm) {
      const { error: fe } = await db.from("media_assets").update({ metadata: { ...mm, formats: { ...((mm.formats as Record<string, string> | undefined) ?? {}), [format]: newUrl } } })
        .eq("id", old.variantOf).eq("organization_id", row.organization_id);
      if (fe) return deny(`formats update failed: ${fe.message}`, 502);
    }
  }

  // QA reports are pinned to the checksum, so the new bytes get their own reports.
  const { persistAutomaticTechnicalQa } = await import("@/lib/content/video/qa-persistence");
  const { persistAutomaticCaptionQa } = await import("@/lib/content/video/caption-qa-persistence");
  await persistAutomaticTechnicalQa({ organizationId: row.organization_id, candidateAssetId: row.id, candidateChecksum: meta.checksumSha256, outputs: { [format]: poll.outputs[format] }, outputMeta: { [format]: meta } });
  await persistAutomaticCaptionQa({ organizationId: row.organization_id, candidateAssetId: row.id, candidateChecksum: meta.checksumSha256, captions: poll.captions.cues });
  return NextResponse.json({ ok: true, status: "done", checksum: meta.checksumSha256 });
}
