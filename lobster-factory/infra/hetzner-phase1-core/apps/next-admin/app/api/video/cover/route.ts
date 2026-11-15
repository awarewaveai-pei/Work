import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { chosenCover, coversOf, COVER_COLUMNS, type Cover, type CoverRow } from "@/lib/content/video/cover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Card VD.3: a video's covers on the release page (rule: lib/content/video/cover.ts).
 * GET  ?organizationId&assetIds=a,b         -> { covers: { [videoId]: [{ id, url, kind, chosen }] } }
 * POST { organizationId, assetId, coverAssetId } -> that cover becomes the chosen one (metadata.chosenAt on the COVER row)
 * POST multipart ?organizationId { assetId, rightsConfirmed: "true", file } -> the user's own image becomes a chosen cover
 *   (the organization is in the query and Content-Length is checked first: access and size are refused before any body
 *   is read)
 * The video row is never written. A cover must belong to the named video of the named org; a url is never taken from the client.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// YouTube's mobile thumbnail limit (support.google.com/youtube/answer/72431); the workbench's own covers keep to it too.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };
// The release page shows the newest this many per video; the chosen one is always shown (chosenCover, bounded queries).
const LIST_LIMIT = 30;

const json = (status: number, body: Record<string, unknown>) => NextResponse.json(status < 300 ? { ok: true, ...body } : { ok: false, ...body }, { status });

function guard(req: Request, organizationId: string): Response | null {
  if (!canCreateAiImageJob(resolveOpsRole(req).role)) return json(403, { error: "forbidden" });
  if (!UUID.test(organizationId)) return json(400, { error: "organizationId required" });
  try { assertOrgAccess(req, organizationId); } catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  return null;
}

async function videoOf(db: NonNullable<ReturnType<typeof getSupabaseWriteClient>>, organizationId: string, assetId: string) {
  const { data, error } = await db.from("media_assets").select("id, mime_type").eq("id", assetId).eq("organization_id", organizationId).maybeSingle();
  if (error) throw new Error(error.message);
  return data && String(data.mime_type ?? "").startsWith("video/") ? data : null;
}

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const organizationId = q.get("organizationId") ?? "";
  const denied = guard(req, organizationId); if (denied) return denied;
  const ids = (q.get("assetIds") ?? "").split(",").filter(Boolean);
  if (!ids.length || ids.length > 10 || !ids.every((i) => UUID.test(i))) return json(400, { error: "assetIds required" });
  const db = getSupabaseWriteClient(); if (!db) return json(503, { error: "db_unavailable" });
  const covers: Record<string, Cover[]> = {};
  try {
    for (const id of ids) {
      const { data, error } = await db.from("media_assets").select(COVER_COLUMNS).eq("organization_id", organizationId).eq("metadata->>coverOf", id)
        .like("mime_type", "image/%").order("created_at", { ascending: false }).limit(LIST_LIMIT);
      if (error) throw new Error(error.message);
      const chosen = await chosenCover(db, organizationId, id);
      const list = coversOf(id, (data ?? []) as CoverRow[]).map((c) => ({ ...c, chosen: c.id === chosen?.id }));
      covers[id] = chosen && !list.some((c) => c.id === chosen.id) ? [chosen, ...list] : list;
    }
  } catch { return json(502, { error: "cover_lookup_failed" }); }
  return json(200, { covers });
}

export async function POST(req: Request): Promise<Response> {
  return (req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data") ? upload(req) : choose(req);
}

async function choose(req: Request): Promise<Response> {
  let body: Record<string, unknown>; try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const denied = guard(req, organizationId); if (denied) return denied;
  const assetId = typeof body.assetId === "string" ? body.assetId : "", coverAssetId = typeof body.coverAssetId === "string" ? body.coverAssetId : "";
  if (!UUID.test(assetId) || !UUID.test(coverAssetId)) return json(400, { error: "assetId and coverAssetId required" });
  const db = getSupabaseWriteClient(); if (!db) return json(503, { error: "db_unavailable" });
  const { data: row, error } = await db.from("media_assets").select(COVER_COLUMNS).eq("id", coverAssetId).eq("organization_id", organizationId).maybeSingle();
  if (error) return json(502, { error: "cover_lookup_failed" });
  // Invariant: only a cover of THIS video in THIS org can be chosen for it.
  if (!row || !coversOf(assetId, [row as CoverRow]).length) return json(404, { error: "cover_not_found" });
  const metadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
  const up = await db.from("media_assets").update({ metadata: { ...metadata, chosenAt: new Date().toISOString() } }).eq("id", coverAssetId).eq("organization_id", organizationId);
  if (up.error) return json(502, { error: "cover_choose_failed" });
  return json(200, { coverAssetId });
}

// A whole image, decoded, not just a byte pattern (Codex 63d19a26 F4, 9bea8a27 F1): sharp decodes every pixel (stats)
// and fails on a truncated or corrupt file; the decoded format must be the one the file claims.
async function wholeImage(mime: string, b: Buffer): Promise<boolean> {
  try {
    const sharp = (await import("sharp")).default;
    const img = sharp(b, { failOn: "truncated" });
    const meta = await img.metadata();
    if (meta.format !== (mime === "image/png" ? "png" : "jpeg") || !(meta.width && meta.height)) return false;
    await img.stats();
    return true;
  } catch { return false; }
}
// multipart framing around one <= 2 MB file plus three short fields
const MAX_FORM_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

async function upload(req: Request): Promise<Response> {
  const organizationId = new URL(req.url).searchParams.get("organizationId") ?? "";
  const denied = guard(req, organizationId); if (denied) return denied;
  const length = Number(req.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(length)) return json(411, { error: "length_required" });
  if (length > MAX_FORM_BYTES) return json(413, { error: "封面圖最大 2 MB（YouTube 的上限）" });
  let form: FormData; try { form = await req.formData(); } catch { return json(400, { error: "invalid_form" }); }
  const assetId = String(form.get("assetId") ?? "");
  if (!UUID.test(assetId)) return json(400, { error: "assetId required" });
  if (form.get("rightsConfirmed") !== "true") return json(400, { error: "請先勾選「我有權使用這張圖」" });
  const file = form.get("file");
  if (!(file instanceof Blob)) return json(400, { error: "file required" });
  const mime = file.type.toLowerCase(), ext = IMAGE_EXT[mime];
  if (!ext) return json(415, { error: "封面只收 JPG 或 PNG" });
  if (file.size > MAX_UPLOAD_BYTES) return json(413, { error: "封面圖最大 2 MB（YouTube 的上限）" });
  const buf = Buffer.from(await file.arrayBuffer());
  if (!(await wholeImage(mime, buf))) return json(422, { error: "這個檔案不是完整的 JPG／PNG 圖片" });
  const db = getSupabaseWriteClient(); if (!db) return json(503, { error: "db_unavailable" });
  try { if (!(await videoOf(db, organizationId, assetId))) return json(404, { error: "video_not_found" }); } catch { return json(502, { error: "asset_lookup_failed" }); }

  const { isR2Configured, r2PutObject } = await import("@/lib/storage/r2");
  const publicBase = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  if (!isR2Configured() || !publicBase) return json(503, { error: "storage_unconfigured" });
  const sha = createHash("sha256").update(buf).digest("hex");
  // Same content-addressed key space as the workbench intake (app/api/internal/video/workbench/assets/route.ts).
  const key = `video/workbench/${organizationId.toLowerCase()}/${sha}.${ext}`;
  const put = await r2PutObject(process.env.R2_VIDEO_BUCKET ?? "lobster-videos", key, buf, mime, { timeoutMs: 60_000 });
  if ("error" in put) return json(502, { error: "storage_put_failed" });
  const objectUrl = `${publicBase}/${key}`;
  // Same bytes uploaded at once for two videos take the same next version of the shared key (unique org+backend+key+
  // version, migration 0038): the loser takes the next one, as the workbench intake does (Codex 63d19a26 F2).
  let inserted: { data: { id: unknown } | null; error: { code?: string; message: string } | null } = { data: null, error: null };
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await db.from("media_assets").select("version").eq("organization_id", organizationId).eq("storage_backend", "r2").eq("object_key", key)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) return json(502, { error: "asset_lookup_failed" });
    inserted = await db.from("media_assets").insert({
      organization_id: organizationId, storage_backend: "r2", asset_domain: "real_footage", object_key: key,
      version: (Number(latest.data?.version) || 0) + 1, object_url: objectUrl, mime_type: mime, byte_size: buf.byteLength, checksum_sha256: sha,
      metadata: { source: "cover_upload", coverOf: assetId, coverKind: "upload", chosenAt: new Date().toISOString(), rightsSources: [{ kind: "upload", url: objectUrl, rightsConfirmed: true }] },
    }).select("id").single();
    if (!inserted.error && inserted.data) break;
    if (inserted.error?.code !== "23505") break;
  }
  if (inserted.error || !inserted.data) return json(502, { error: "asset_registration_failed" });
  return json(201, { coverAssetId: String(inserted.data.id), url: objectUrl });
}
