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

function parseBody(raw: string): { organizationId: string; assetId: string; checksumSha256: string; title: string; script: string; captions: Cue[] } | null {
  if (raw.length > MAX_BODY_CHARS) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const b = v as Record<string, unknown>;
  if (typeof b.organizationId !== "string" || !UUID.test(b.organizationId) || typeof b.assetId !== "string" || !UUID.test(b.assetId)) return null;
  if (typeof b.checksumSha256 !== "string" || !/^[0-9a-f]{64}$/i.test(b.checksumSha256)) return null;
  if (typeof b.title !== "string" || b.title.length > MAX_TITLE || typeof b.script !== "string" || b.script.length > MAX_SCRIPT) return null;
  if (!Array.isArray(b.captions) || b.captions.length > MAX_CAPTIONS) return null;
  const captions: Cue[] = [];
  for (const c of b.captions) {
    const cue = c as Record<string, unknown> | null;
    if (!cue || typeof cue !== "object" || typeof cue.startMs !== "number" || !Number.isFinite(cue.startMs) || typeof cue.endMs !== "number" || !Number.isFinite(cue.endMs)
      || typeof cue.text !== "string" || cue.text.length > MAX_CAPTION_TEXT) return null;
    captions.push({ startMs: cue.startMs, endMs: cue.endMs, text: cue.text });
  }
  return { organizationId: b.organizationId, assetId: b.assetId, checksumSha256: b.checksumSha256.toLowerCase(), title: b.title, script: b.script, captions };
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
  const found = await db.from("media_assets").select("id, organization_id, mime_type, checksum_sha256, metadata").eq("id", body.assetId).maybeSingle();
  if (found.error) return fail(502, "asset_lookup_failed", found.error);
  const row = found.data;
  if (!row || row.organization_id !== body.organizationId) return fail(404, "asset_not_found");
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
  if (metadata.source !== "video_workbench") return fail(403, "not_workbench_asset");
  if (!String(row.mime_type ?? "").startsWith("video/")) return fail(422, "not_video");
  if (String(row.checksum_sha256 ?? "").toLowerCase() !== body.checksumSha256) return fail(409, "checksum_mismatch");

  if (process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED !== "true") return fail(503, "qa_persistence_disabled");
  if (metadata.title !== body.title || metadata.script !== body.script) {
    const up = await db.from("media_assets").update({ metadata: { ...metadata, title: body.title, script: body.script } }).eq("id", body.assetId).eq("organization_id", body.organizationId);
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
