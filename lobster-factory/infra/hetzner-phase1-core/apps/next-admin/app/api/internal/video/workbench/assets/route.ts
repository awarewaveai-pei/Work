import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/internal/video/workbench/assets -- video-workbench registers one generated/imported/rendered file (P6 D3:
 * VW holds no Supabase or R2 key). Bearer = VW_INTERNAL_TOKEN; unset = every call 401.
 * Body = the raw file bytes. Headers: Content-Type (mime), X-VW-Org-Id (uuid), X-VW-Origin (ai_generated |
 * real_footage | workbench_render), X-VW-Meta (base64url JSON: rightsSources, parentAssetIds, costUsd, vwJobId,
 * render {outputs, outputMeta} = the render worker's QA evidence for a video).
 * Idempotent by the caller's key: same org + origin + vwJobId (or, without a job, origin + checksum) -> that row, nothing
 * uploaded. The same bytes under another origin or job get their own row (own origin/rights/cost) over the shared
 * content-addressed object, as the next `version` of its key (unique org+backend+key+version, migration 0038).
 * workbench_render needs migration 0159 (P6 D1); before it the insert fails its CHECK and the request fails.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGINS = new Set(["ai_generated", "real_footage", "workbench_render"]);
const MIME_EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4",
  "video/quicktime": "mov", "video/webm": "webm", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/mp4": "m4a",
  "model/gltf-binary": "glb",
};
const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;
const MAX_META_CHARS = 64 * 1024;

/** Declared mime vs the file's first bytes (VW forwards what providers and users gave it). */
function magicMatches(mime: string, b: Buffer): boolean {
  if (b.length < 12) return false;
  const ascii = (s: number, e: number) => b.toString("ascii", s, e);
  switch (mime) {
    case "image/png": return b[0] === 0x89 && ascii(1, 4) === "PNG";
    case "image/jpeg": return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/webp": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "image/gif": return ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
    case "video/mp4": case "audio/mp4": return ascii(4, 8) === "ftyp";
    // Compositor/Blender MOV (alpha): ffmpeg writes ftyp "qt  "; older QuickTime files open with a bare atom.
    case "video/quicktime": return ["ftyp", "moov", "mdat", "wide", "free"].includes(ascii(4, 8));
    case "video/webm": return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    case "audio/mpeg": return ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    case "audio/wav": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
    case "model/gltf-binary": return ascii(0, 4) === "glTF";
    default: return false;
  }
}

function maxBytes(): number {
  const n = Number(process.env.VW_INGEST_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_BYTES;
}

type Meta = { rightsSources?: unknown[]; parentAssetIds?: string[]; costUsd?: number; vwJobId?: string; render?: { outputs: Record<string, string>; outputMeta?: Record<string, unknown> } };

function parseMeta(raw: string | null): Meta | null {
  if (!raw) return {};
  if (raw.length > MAX_META_CHARS) return null;
  let v: unknown;
  try { v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")); } catch { return null; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  const out: Meta = {};
  if (m.rightsSources !== undefined) {
    if (!Array.isArray(m.rightsSources) || m.rightsSources.length > 200) return null;
    out.rightsSources = m.rightsSources;
  }
  if (m.parentAssetIds !== undefined) {
    if (!Array.isArray(m.parentAssetIds) || m.parentAssetIds.length > 100 || !m.parentAssetIds.every((x) => typeof x === "string" && UUID.test(x))) return null;
    out.parentAssetIds = m.parentAssetIds as string[];
  }
  if (m.costUsd !== undefined) {
    if (typeof m.costUsd !== "number" || !Number.isFinite(m.costUsd) || m.costUsd < 0 || m.costUsd > 10_000) return null;
    out.costUsd = m.costUsd;
  }
  if (m.vwJobId !== undefined) {
    if (typeof m.vwJobId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(m.vwJobId)) return null;
    out.vwJobId = m.vwJobId;
  }
  if (m.render !== undefined) {
    const r = m.render as Record<string, unknown> | null;
    if (!r || typeof r !== "object" || !r.outputs || typeof r.outputs !== "object" || Array.isArray(r.outputs)) return null;
    out.render = { outputs: r.outputs as Record<string, string>, outputMeta: (r.outputMeta ?? undefined) as Record<string, unknown> | undefined };
  }
  return out;
}

/** Reads the body chunk by chunk, hashing as it goes, and stops at the cap (Content-Length can be absent or wrong). */
async function readCapped(req: Request, cap: number): Promise<{ ok: true; buf: Buffer; sha: string } | { ok: false }> {
  if (!req.body) return { ok: true, buf: Buffer.alloc(0), sha: createHash("sha256").digest("hex") };
  const reader = req.body.getReader();
  const hash = createHash("sha256");
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) { await reader.cancel().catch(() => {}); return { ok: false }; }
    hash.update(value);
    chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  return { ok: true, buf: Buffer.concat(chunks, total), sha: hash.digest("hex") };
}

export async function POST(req: Request): Promise<Response> {
  const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });
  const expected = process.env.VW_INTERNAL_TOKEN;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !bearer || !timingSafeEqual(bearer, expected)) return fail(401, "unauthorized");

  const organizationId = req.headers.get("x-vw-org-id")?.trim() ?? "";
  if (!UUID.test(organizationId)) return fail(400, "invalid_org");
  const origin = req.headers.get("x-vw-origin")?.trim() ?? "";
  if (!ORIGINS.has(origin)) return fail(400, "invalid_origin");
  const mime = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = Object.hasOwn(MIME_EXT, mime) ? MIME_EXT[mime] : undefined;
  if (!ext) return fail(415, "unsupported_type");
  const meta = parseMeta(req.headers.get("x-vw-meta"));
  if (!meta) return fail(400, "invalid_meta");
  const cap = maxBytes();
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > cap) return fail(413, "too_large");

  const body = await readCapped(req, cap);
  if (!body.ok) return fail(413, "too_large");
  if (!magicMatches(mime, body.buf)) return fail(422, "content_type_mismatch");

  const db = getSupabaseWriteClient();
  if (!db) return fail(503, "db_unavailable");
  // Invariant: idempotency is by the caller's key, never by bytes alone (a row found by checksum may carry another origin).
  const findMine = () => {
    const q = db.from("media_assets").select("id, object_url")
      .eq("organization_id", organizationId).eq("checksum_sha256", body.sha).eq("asset_domain", origin);
    return (meta.vwJobId ? q.eq("metadata->>vwJobId", meta.vwJobId) : q.is("metadata->>vwJobId", null))
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
  };
  const existing = await findMine();
  if (existing.error) return fail(502, "asset_lookup_failed");
  if (existing.data) return NextResponse.json({ ok: true, existing: true, assetId: existing.data.id, checksumSha256: body.sha, objectUrl: existing.data.object_url });

  const { isR2Configured, r2PutObject } = await import("@/lib/storage/r2");
  const publicBase = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  if (!isR2Configured() || !publicBase) return fail(503, "storage_unconfigured");
  const bucket = process.env.R2_VIDEO_BUCKET ?? "lobster-videos";
  const key = `video/workbench/${organizationId.toLowerCase()}/${body.sha}.${ext}`;
  // Re-putting the same bytes under a content-addressed key is a no-op for any row already pointing at it.
  const put = await r2PutObject(bucket, key, body.buf, mime, { timeoutMs: 240_000 });
  if (!put.ok) return fail(502, "storage_put_failed");
  const objectUrl = `${publicBase}/${key}`;

  // Invariant (2nd report): this request never deletes an object under a content-addressed key -- another request may be
  // about to commit a row for it. A failed registration leaves the object; nothing sweeps workbench orphans yet.
  let inserted: { data: { id: unknown } | null; error: { code?: string; message: string } | null } = { data: null, error: null };
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await db.from("media_assets").select("version")
      .eq("organization_id", organizationId).eq("storage_backend", "r2").eq("object_key", key)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) return fail(502, "asset_lookup_failed");
    inserted = await db.from("media_assets").insert({
      organization_id: organizationId,
      storage_backend: "r2",
      asset_domain: origin,
      object_key: key,
      version: (Number(latest.data?.version) || 0) + 1,
      object_url: objectUrl,
      mime_type: mime,
      byte_size: body.buf.byteLength,
      checksum_sha256: body.sha,
      metadata: {
        source: "video_workbench",
        ...(meta.rightsSources ? { rightsSources: meta.rightsSources } : {}),
        ...(meta.parentAssetIds ? { parentAssetIds: meta.parentAssetIds } : {}),
        ...(meta.costUsd !== undefined ? { costUsd: meta.costUsd } : {}),
        ...(meta.vwJobId ? { vwJobId: meta.vwJobId } : {}),
      },
    }).select("id").single();
    if (!inserted.error && inserted.data) break;
    // A concurrent retry of this same request committed first: answer with its row.
    const mine = await findMine();
    if (mine.data) return NextResponse.json({ ok: true, existing: true, assetId: mine.data.id, checksumSha256: body.sha, objectUrl: mine.data.object_url });
    if (inserted.error?.code !== "23505") break;   // a version taken by another origin's row: take the next one
  }
  if (inserted.error || !inserted.data) return fail(502, "asset_registration_failed");
  const assetId = String(inserted.data.id);

  // QA evidence for a video: the render worker's technical reports (none supplied = none recorded, never a pass) and
  // the rights check over the metadata stored above. A QA failure leaves the asset registered; release reads the QA.
  const qa: Record<string, unknown> = {};
  if (mime.startsWith("video/") && process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED === "true") {
    const { persistAutomaticTechnicalQa } = await import("@/lib/content/video/qa-persistence");
    const { persistEditorialRightsQa } = await import("@/lib/content/video/editorial-rights-persist");
    type QaParams = Parameters<typeof persistAutomaticTechnicalQa>[0];
    qa.technical = meta.render
      ? await persistAutomaticTechnicalQa({ organizationId, candidateAssetId: assetId, candidateChecksum: body.sha, outputs: meta.render.outputs, outputMeta: meta.render.outputMeta as QaParams["outputMeta"] })
      : null;
    const rights = await persistEditorialRightsQa(db, { organizationId, candidateAssetId: assetId, candidateChecksum: body.sha });
    qa.editorialRights = rights.ok === false ? { error: rights.error } : rights.persisted;
  }
  return NextResponse.json({ ok: true, existing: false, assetId, checksumSha256: body.sha, objectUrl, qa }, { status: 201 });
}
