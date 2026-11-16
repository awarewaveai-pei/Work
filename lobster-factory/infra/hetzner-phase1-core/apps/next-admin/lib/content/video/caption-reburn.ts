import { pollRenderJob, submitCaptionReburn } from "@/lib/content/video/render-client";
import { videoObjectKey } from "@/lib/content/blocks/video-pipeline";
import { decodeVideoObjectKey } from "@/lib/storage/r2";
import type { getSupabaseWriteClient } from "@/lib/supabase-server";

/**
 * V4.8 caption reburn, shared by the staff route (app/api/video/captions/reburn, session + org access) and the workbench's
 * internal route (app/api/internal/video/workbench/caption-reburn, Bearer; plan U7). Callers authorize the row's
 * organization first; everything here is scoped to that row's organization.
 * start: one video-service job per ratio (the primary row plus its variant rows, each with its caption-less video).
 * finish: when the job is done, the row takes the new bytes (checksum, size, captions) and QA runs again on them.
 */
type Db = NonNullable<ReturnType<typeof getSupabaseWriteClient>>;
export type ReburnRow = { id: string; organization_id: string; object_key: string | null; object_url: string | null; metadata: Record<string, unknown> | null };
export type ReburnCue = { startMs: number; endMs: number; text: string };
export type ReburnAnswer = { status: number; body: Record<string, unknown> };

const FORMAT_RE = /\/(16x9|9x16|4x5)\.mp4$/;
const COLUMNS = "id, organization_id, object_key, object_url, metadata";
const deny = (error: string, status: number): ReburnAnswer => ({ status, body: { ok: false, error } });

export async function loadReburnRow(db: Db, assetId: string): Promise<ReburnRow | null> {
  const { data } = await db.from("media_assets").select(COLUMNS).eq("id", assetId).eq("mime_type", "video/mp4").maybeSingle();
  return (data as ReburnRow | null) ?? null;
}

export async function startReburn(db: Db, primary: ReburnRow, cues: ReburnCue[]): Promise<ReburnAnswer> {
  if (primary.metadata?.variantOf) return deny("pass the primary video, not a ratio row", 400);
  const { data: variants } = await db.from("media_assets").select(COLUMNS)
    .eq("organization_id", primary.organization_id).eq("metadata->>variantOf", primary.id);
  const rows = [primary, ...((variants ?? []) as ReburnRow[])];

  // A Release pins the exact bytes it approved; burning again would change them under it.
  const { data: releases } = await db.from("media_releases").select("id")
    .eq("organization_id", primary.organization_id).in("candidate_asset_id", rows.map((r) => r.id))
    .in("status", ["candidate_created", "release_approved"]).limit(1);
  if (releases && releases.length > 0) return deny("這支影片已建 Release，不能再改字幕", 409);

  const jobs: { assetId: string; jobId: string }[] = [];
  for (const row of rows) {
    const cleanUrl = typeof row.metadata?.cleanUrl === "string" ? row.metadata.cleanUrl : "";
    const format = FORMAT_RE.exec(row.object_key ?? "")?.[1];
    const objectKey = row.object_key ? decodeVideoObjectKey(row.object_key) : null;
    if (!cleanUrl || !format || !objectKey) continue;
    const sub = await submitCaptionReburn({ cleanUrl, format, objectKey, cues });
    if (sub.ok === false) return deny(sub.error, sub.status);
    jobs.push({ assetId: row.id, jobId: sub.jobId });
  }
  if (jobs.length === 0) return deny("這支影片沒有保留無字幕底片（較早做的影片），無法重燒", 422);
  return { status: 202, body: { ok: true, jobs } };
}

export async function finishReburn(db: Db, row: ReburnRow, jobId: string): Promise<ReburnAnswer> {
  const format = FORMAT_RE.exec(row.object_key ?? "")?.[1];
  const poll = await pollRenderJob(jobId);
  if (poll.status === "running") return { status: 200, body: { ok: true, status: "running" } };
  if (poll.status === "error") return { status: 200, body: { ok: true, status: "error", error: poll.error } };
  const meta = format ? poll.outputMeta?.[format] : undefined;
  // The job must have written a version of this row's own file (videoObjectKey maps videorev/… back to the row's key); a jobId from some other video is refused.
  const newUrl = format ? poll.outputs[format] : undefined;
  if (!format || !newUrl || !meta?.checksumSha256 || videoObjectKey(newUrl) !== row.object_key || !poll.captions) return deny("job result does not match this video", 409);

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
  return { status: 200, body: { ok: true, status: "done", checksum: meta.checksumSha256 } };
}
