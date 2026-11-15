import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/video/workbench/assets/release-text -- video-workbench sends the words its own render shows (title,
 * script, on-screen caption timeline) for a video it already registered; they are what editorial QA and caption QA read.
 * Bearer = VW_INTERNAL_TOKEN (same as the assets route). A render with no words never calls this: nothing is invented.
 * Idempotent: same content = same metadata and the same QA report hashes.
 */
// 4000 = the most intervals the workbench can cut: <= 2000 text pieces (editor-export.cjs validateProject, subtitle-burn.cjs)
// -> <= 4000 boundaries -> <= 3999 intervals (backend/release-text.cjs timeline()).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE = 200, MAX_SCRIPT = 100_000, MAX_CAPTIONS = 4000, MAX_CAPTION_TEXT = 4000, MAX_BODY_CHARS = 16 * 1024 * 1024;

type Cue = { startMs: number; endMs: number; text: string };

function parseCues(raw: unknown): Cue[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_CAPTIONS) return null;
  const out: Cue[] = [];
  for (const c of raw) {
    const cue = c as Record<string, unknown> | null;
    if (!cue || typeof cue !== "object" || typeof cue.startMs !== "number" || !Number.isFinite(cue.startMs) || typeof cue.endMs !== "number" || !Number.isFinite(cue.endMs)
      || typeof cue.text !== "string" || cue.text.length > MAX_CAPTION_TEXT) return null;
    out.push({ startMs: cue.startMs, endMs: cue.endMs, text: cue.text });
  }
  return out;
}

function parseBody(raw: string): { organizationId: string; assetId: string; checksumSha256: string; title: string; script: string; captions: Cue[]; subtitles: Cue[] } | null {
  if (raw.length > MAX_BODY_CHARS) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const b = v as Record<string, unknown>;
  if (typeof b.organizationId !== "string" || !UUID.test(b.organizationId) || typeof b.assetId !== "string" || !UUID.test(b.assetId)) return null;
  if (typeof b.checksumSha256 !== "string" || !/^[0-9a-f]{64}$/i.test(b.checksumSha256)) return null;
  if (typeof b.title !== "string" || b.title.length > MAX_TITLE || typeof b.script !== "string" || b.script.length > MAX_SCRIPT) return null;
  const captions = parseCues(b.captions);
  // subtitles (card VD.10, optional: workbenches before it send none) = the spoken lines only, the SRT/VTT source
  const subtitles = b.subtitles === undefined ? [] : parseCues(b.subtitles);
  if (!captions || !subtitles) return null;
  return { organizationId: b.organizationId, assetId: b.assetId, checksumSha256: b.checksumSha256.toLowerCase(), title: b.title, script: b.script, captions, subtitles };
}

export async function POST(req: Request): Promise<Response> {
  const fail = (status: number, error: string, cause?: { code?: string; message?: string } | null) => {
    if (cause) console.error(`[vw-internal] ${error}: ${cause.code ?? ""} ${String(cause.message ?? "").slice(0, 300)}`);
    return NextResponse.json({ ok: false, error }, { status });
  };
  const expected = process.env.VW_INTERNAL_TOKEN;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !bearer || !timingSafeEqual(bearer, expected)) return fail(401, "unauthorized");

  const body = parseBody(await req.text());
  if (!body) return fail(400, "invalid_body");

  const db = getSupabaseWriteClient();
  if (!db) return fail(503, "db_unavailable");
  const found = await db.from("media_assets").select("id, organization_id, mime_type, checksum_sha256, object_key, metadata").eq("id", body.assetId).maybeSingle();
  if (found.error) return fail(502, "asset_lookup_failed", found.error);
  const row = found.data;
  if (!row || row.organization_id !== body.organizationId) return fail(404, "asset_not_found");
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
  if (metadata.source !== "video_workbench") return fail(403, "not_workbench_asset");
  if (!String(row.mime_type ?? "").startsWith("video/")) return fail(422, "not_video");
  if (String(row.checksum_sha256 ?? "").toLowerCase() !== body.checksumSha256) return fail(409, "checksum_mismatch");

  if (process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED !== "true") return fail(503, "qa_persistence_disabled");
  // Card VD.10: the spoken lines as the video's own SRT + VTT files beside it in R2 (same content-addressed name, so the
  // same words are the same files), for the release page to offer (YouTube Studio / Facebook take them by hand: the
  // Postiz providers upload none). No subtitles = no files, and none recorded.
  let captionFiles: { srt: string; vtt: string; cues: number } | null = null;
  if (body.subtitles.length) {
    const { isR2Configured, r2PutObject } = await import("@/lib/storage/r2");
    const { toSrt, toVtt } = await import("@/lib/content/video/caption-formats");
    const publicBase = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/+$/, "");
    // Own prefix, outside video/workbench/: the orphan sweep deletes every object there that no media_assets row names
    // (lib/content/video/workbench-sweep.ts), and these files have no row of their own (Codex 122e58d8 F1).
    // Named by the video's own content key, so the same video and words are the same files.
    const key = typeof row.object_key === "string" ? row.object_key.replace(/^video\/workbench\//, "video/subtitles/").replace(/\.[a-z0-9]+$/i, "") : "";
    if (!isR2Configured() || !publicBase || !key) return fail(503, "storage_unconfigured");
    if (!key.startsWith("video/subtitles/")) return fail(422, "not_workbench_object");   // never into the sweep's prefix
    let srt: string, vtt: string;
    try {
      const segments = body.subtitles.map((c, i) => ({ id: `c${i + 1}`, startMs: Math.round(c.startMs), endMs: Math.round(c.endMs), text: c.text }));
      srt = toSrt(segments); vtt = toVtt(segments);
    } catch (e) { return fail(400, "invalid_subtitles", { message: e instanceof Error ? e.message : String(e) }); }
    const bucket = process.env.R2_VIDEO_BUCKET ?? "lobster-videos";
    // Both at once, 20 s each: the workbench gives this whole request 60 s (main-system.cjs releaseText; Codex 122e58d8 F2).
    const puts = await Promise.all(([["srt", srt, "application/x-subrip"], ["vtt", vtt, "text/vtt"]] as const).map(([ext, text, type]) =>
      r2PutObject(bucket, `${key}.${ext}`, Buffer.from(text, "utf8"), `${type}; charset=utf-8`, { timeoutMs: 20_000 })));
    const failed = puts.find((p) => "error" in p);
    if (failed && "error" in failed) return fail(502, "subtitle_put_failed", { message: failed.error });
    captionFiles = { srt: `${publicBase}/${key}.srt`, vtt: `${publicBase}/${key}.vtt`, cues: body.subtitles.length };
  }
  const sameFiles = JSON.stringify(metadata.captionFiles ?? null) === JSON.stringify(captionFiles);
  if (metadata.title !== body.title || metadata.script !== body.script || !sameFiles) {
    const { captionFiles: _old, ...rest } = metadata;
    const up = await db.from("media_assets").update({ metadata: { ...rest, title: body.title, script: body.script, ...(captionFiles ? { captionFiles } : {}) } }).eq("id", body.assetId).eq("organization_id", body.organizationId);
    if (up.error) return fail(502, "release_text_update_failed", up.error);
  }

  // Invariant: ok = both reports are stored. VW marks the words sent only on ok, so a refusal here (persistence off, a
  // failed write) is retried by VW later instead of leaving the video without the reports release needs.
  const { persistEditorialRightsQa } = await import("@/lib/content/video/editorial-rights-persist");
  const { persistAutomaticCaptionQa } = await import("@/lib/content/video/caption-qa-persistence");
  const rights = await persistEditorialRightsQa(db, { organizationId: body.organizationId, candidateAssetId: body.assetId, candidateChecksum: body.checksumSha256 });
  if (rights.ok === false) return fail(502, "editorial_rights_qa_failed", { message: rights.error });
  const caption = await persistAutomaticCaptionQa({ organizationId: body.organizationId, candidateAssetId: body.assetId, candidateChecksum: body.checksumSha256, captions: body.captions });
  if (!caption) return fail(502, "caption_qa_failed", { message: "caption report not stored" });
  const qa = { editorialRights: rights.persisted, caption };
  return NextResponse.json({ ok: true, assetId: body.assetId, qa });
}
