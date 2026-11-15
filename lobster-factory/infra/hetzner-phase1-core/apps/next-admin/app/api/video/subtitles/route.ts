import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { isPublicBucketAsset } from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/video/subtitles?organizationId&assetId&format=srt|vtt -- card VD.10: a video's subtitle file as a one-click
 * download from our own origin (<a download> is ignored on the cross-origin bucket; the designs download proxy is behind
 * the POD flag, Codex 6ae3db97). The file url comes only from that video row's metadata.captionFiles (written by the
 * release-text route), never from the request, and must be one of our bucket objects.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = { srt: "application/x-subrip; charset=utf-8", vtt: "text/vtt; charset=utf-8" } as const;
const MAX_BYTES = 2 * 1024 * 1024;

export async function GET(req: Request): Promise<Response> {
  const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });
  if (!canCreateAiImageJob(resolveOpsRole(req).role)) return fail(403, "forbidden");
  const q = new URL(req.url).searchParams;
  const organizationId = q.get("organizationId") ?? "", assetId = q.get("assetId") ?? "", format = q.get("format") ?? "";
  if (!UUID.test(organizationId) || !UUID.test(assetId) || !(format in TYPES)) return fail(400, "organizationId, assetId and format (srt|vtt) required");
  try { assertOrgAccess(req, organizationId); } catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const db = getSupabaseWriteClient(); if (!db) return fail(503, "db_unavailable");
  const { data, error } = await db.from("media_assets").select("metadata").eq("id", assetId).eq("organization_id", organizationId).maybeSingle();
  if (error) return fail(502, "asset_lookup_failed");
  const meta = (data?.metadata ?? {}) as { captionFiles?: Record<string, unknown>; title?: unknown };
  const url = meta.captionFiles?.[format];
  if (typeof url !== "string" || !isPublicBucketAsset(url)) return fail(404, "no_subtitles");
  let res: Response;
  try { res = await fetch(url, { signal: AbortSignal.timeout(20_000) }); } catch { return fail(502, "subtitle_fetch_failed"); }
  if (!res.ok) return fail(502, "subtitle_fetch_failed");
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX_BYTES) return fail(502, "subtitle_too_large");
  // ASCII-only name in the header (no injection); the title's own name travels as RFC 5987 filename*.
  const title = typeof meta.title === "string" && meta.title.trim() ? meta.title.trim().slice(0, 80) : "video";
  return new NextResponse(body, { status: 200, headers: {
    "Content-Type": TYPES[format as keyof typeof TYPES],
    "Content-Disposition": `attachment; filename="subtitles.${format}"; filename*=UTF-8''${encodeURIComponent(`${title}.${format}`)}`,
    "Cache-Control": "private, no-store",
  } });
}
