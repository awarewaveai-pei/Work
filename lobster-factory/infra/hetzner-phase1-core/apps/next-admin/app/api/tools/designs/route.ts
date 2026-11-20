import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../lib/ops-role";
import { getSupabaseReadClient, getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { buildDesignKey, getDesignsPublicBase, isR2Configured, putDesignObject, sha256Hex } from "../../../../lib/storage/r2";
import { isR2S3Configured } from "../../../../lib/storage/r2-s3";
import { claimPendingUpload, discardPendingUpload, discardUnregisteredDesignObjects, parsePendingKey, type PendingKey } from "../../../../lib/studio/design-pending";
import { cleanSourceName, sourceBytesMatch, sourceKeyFor, sourceKeyFromMetadata } from "../../../../lib/studio/design-source";
import { deleteUnreferencedAsset } from "../../../../lib/content/r2-delete-guard";
import { decodeCursor, listDesigns, type SortOrder, type TimeRange } from "../../../../lib/studio/designs-list";
import { effectiveOrgId, assertOrgAccess, OrgAccessError, resolveTenant, toOrgAccessResponse } from "../../../../lib/tenant-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

// A Printful mockup fetched by sourceUrl (server-to-server, not a request body).
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

// `sourceUrl` lets the client persist a Printful mockup (temporary S3 URL — note the
// "/tmp/" path, it expires) into My Designs. Allowlist ONLY Printful's mockup CDN hosts
// (SSRF guard) — verified live 2026-06-15. Never fetch an arbitrary client-supplied URL.
const PRINTFUL_MOCKUP_HOSTS = new Set([
  "printful-upload.s3-accelerate.amazonaws.com",
  "files.cdn.printful.com",
]);
const SOURCE_MIME_OK: Record<string, true> = { "image/jpeg": true, "image/png": true, "image/webp": true };

/** Convert any image buffer to WebP targeting 50–100 KB (for gallery thumbnails). */
async function toWebpOptimized(buffer: Buffer): Promise<{ buffer: Buffer; mime: "image/webp" }> {
  for (const quality of [80, 65, 50, 40, 30]) {
    const out = await sharp(buffer).webp({ quality }).toBuffer();
    if (out.byteLength <= 100 * 1024) return { buffer: out, mime: "image/webp" };
  }
  // Absolute floor — quality 20 always fits in 100 KB for typical mockup photos
  const out = await sharp(buffer).webp({ quality: 20 }).toBuffer();
  return { buffer: out, mime: "image/webp" };
}

/** Fetch a Printful-CDN mockup into a buffer (SSRF-guarded, size+timeout capped). */
async function fetchPrintfulMockup(
  sourceUrl: string,
): Promise<{ ok: true; mime: string; buffer: Buffer } | { ok: false; status: number; error: string }> {
  try {
    const u = new URL(sourceUrl);
    if (u.protocol !== "https:" || !PRINTFUL_MOCKUP_HOSTS.has(u.host)) {
      return { ok: false, status: 400, error: "sourceUrl host not allowed (Printful mockup CDN only)" };
    }
  } catch {
    return { ok: false, status: 400, error: "sourceUrl is not a valid URL" };
  }
  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), 25_000);
  try {
    // redirect:"manual" fails closed — a 3xx cannot bounce off the allowlisted host.
    const res = await fetch(sourceUrl, { signal: controller.signal, redirect: "manual" });
    if (!res.ok) return { ok: false, status: 502, error: `source_fetch_failed_${res.status}` };
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!SOURCE_MIME_OK[mime]) return { ok: false, status: 415, error: `unsupported source mime: ${mime || "unknown"}` };
    if (Number(res.headers.get("content-length") ?? "0") > MAX_SOURCE_BYTES) {
      return { ok: false, status: 413, error: "source image too large" };
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_SOURCE_BYTES) return { ok: false, status: 413, error: "source image too large" };
    return { ok: true, mime, buffer: Buffer.from(ab) };
  } catch {
    return { ok: false, status: 502, error: controller.signal.aborted ? "source_fetch_timeout" : "source_fetch_network_error" };
  } finally {
    clearTimeout(killer);
  }
}

function featureEnabled(): boolean {
  return process.env.POD_DESIGNS_ENABLED === "true";
}

function defaultOrganizationId(): string | null {
  return process.env.POD_DESIGNS_DEFAULT_ORG_ID ?? null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

interface SaveDesignBody {
  /** Alternative to `upload`: a Printful mockup CDN URL to persist into My Designs. */
  sourceUrl?: string;
  prompt?: string;
  modelName?: string;
  organizationId?: string;
  actorUserId?: string;
  /** Originating tool: "pod-studio" | "tarot" | "tarot-preview". Defaults to "pod-studio". */
  source?: string;
  /** For tarot: the card name (e.g. "The Fool"). */
  cardName?: string;
  /** Studio: product type key (tshirt / hoodie / mug / poster / sticker). */
  productType?: string;
  /** Studio: theme / style tag (e.g. "spiritual healing"). */
  theme?: string;
  /** Brand / client tag (e.g. "AwareWave", "soulful"). */
  brand?: string;
  /** Style chips the user picked (zh labels — painter / medium / style). Lets the gallery
   *  show what was selected and rebuild a meaningful filename. Empty for img2img / no style. */
  styleTags?: string[];
  /** Main subject of the image (tarot subject override, or studio subject) — for filename. */
  subject?: string;
  /** Tarot background batch: the job and card this framed card came from. A second save of the same pair returns the
   *  first row instead of adding a copy (the studio saves on every 「載入批次結果」). */
  batchJobId?: string;
  cardIndex?: number;
  /** The picture (plan lobster-factory/docs/PLAN-designs-direct-upload.md): the key /api/tools/designs/upload-url handed out,
   *  after the browser PUT the original bytes there. Pictures never travel in this request's body (Next's middleware cuts
   *  bodies over 10 MiB), so there is no base64 `image` input. */
  upload?: { key?: unknown };
  /** The original file behind the picture (.vectorcraft / .svg / .psd), uploaded the same way; content-sniffed
   *  (lib/studio/design-source.ts); metadata gets source_key / source_name / source_bytes. `name` defaults to design.<ext>. */
  sourceUpload?: { key?: unknown; name?: unknown };
}

type PendingOk = Extract<PendingKey, { ok: true }>;
const SNIFFED_MIME: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

/** Who saved or deletes: a customer is the user middleware authenticated (x-ops-user-id), never a body field; staff keep
 *  the advisory body value. */
function actorUserIdOf(request: Request, claimed: string | undefined): string | null {
  return resolveTenant(request).userKind === "client" ? request.headers.get("x-ops-user-id")?.trim() || null : claimed ?? null;
}

/** Keep only clean string tags, trim, drop blanks, cap count + length (defensive against junk). */
function sanitizeStyleTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const v = t.trim();
    if (v) out.push(v.slice(0, 120));
    if (out.length >= 24) break;
  }
  return out;
}

/** POST — persist one generated design: data URL → R2 → media_assets (+ audit event). */
export async function POST(request: Request) {
  if (!featureEnabled()) {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: SaveDesignBody;
  try {
    body = (await request.json()) as SaveDesignBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "body must be a JSON object" }, { status: 400 });

  const hasUpload = body.upload !== undefined && body.upload !== null;
  const hasSourceUpload = body.sourceUpload !== undefined && body.sourceUpload !== null;
  if (hasUpload && body.sourceUrl !== undefined) {
    return NextResponse.json({ ok: false, error: "upload cannot be combined with sourceUrl" }, { status: 400 });
  }

  // Two input modes: a direct upload (`upload`, checked once the org is known) or a Printful mockup CDN URL (`sourceUrl`).
  // parsed stays null for `upload`: its bytes are read after the copy.
  let parsed: { mime: string; buffer: Buffer } | null = null;
  if (hasUpload) {
    // checked below, after the org
  } else if (typeof body.sourceUrl === "string" && body.sourceUrl.length > 0) {
    const fetched = await fetchPrintfulMockup(body.sourceUrl);
    if (!fetched.ok) {
      // tsconfig here does not narrow `!x.ok` — same cast convention as the rest of this route.
      const f = fetched as { ok: false; status: number; error: string };
      return NextResponse.json({ ok: false, error: f.error }, { status: f.status });
    }
    // Convert to WebP 50–100 KB so gallery thumbnails are small and load fast.
    const converted = await toWebpOptimized(fetched.buffer);
    parsed = { mime: converted.mime, buffer: converted.buffer };
  } else {
    return NextResponse.json(
      { ok: false, error: "upload {key} (from /api/tools/designs/upload-url) or sourceUrl is required" },
      { status: 400 },
    );
  }
  let organizationId: string | null;
  try { organizationId = effectiveOrgId(request, body.organizationId ?? defaultOrganizationId()); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (!organizationId || !isUuid(organizationId)) {
    return NextResponse.json(
      { ok: false, error: "organizationId is required (or set POD_DESIGNS_DEFAULT_ORG_ID)" },
      { status: 400 },
    );
  }
  const actorUserId = actorUserIdOf(request, body.actorUserId);
  if (actorUserId && !isUuid(actorUserId)) {
    return NextResponse.json({ ok: false, error: "actorUserId must be a UUID when provided" }, { status: 400 });
  }

  // A pending key is registered only by a requester of the org in its path (I3).
  let pendingImage: Extract<PendingOk, { kind: "image" }> | null = null;
  let pendingSource: { p: Extract<PendingOk, { kind: "source" }>; name: string } | null = null;
  if (hasUpload) {
    const pk = parsePendingKey((body.upload as { key?: unknown }).key, organizationId, "image");
    if (!pk.ok) { const f = pk as { ok: false; status: number; error: string }; return NextResponse.json({ ok: false, error: f.error }, { status: f.status }); }
    pendingImage = pk as Extract<PendingOk, { kind: "image" }>;
  }
  if (hasSourceUpload) {
    const su = body.sourceUpload as { key?: unknown; name?: unknown };
    const pk = parsePendingKey(su.key, organizationId, "source");
    if (!pk.ok) { const f = pk as { ok: false; status: number; error: string }; return NextResponse.json({ ok: false, error: f.error }, { status: f.status }); }
    const p = pk as Extract<PendingOk, { kind: "source" }>;
    const clean = cleanSourceName(su.name ?? `design${p.ext}`);
    if (!clean || clean.ext !== p.ext) return NextResponse.json({ ok: false, error: `sourceUpload.name must end in ${p.ext}` }, { status: 400 });
    pendingSource = { p, name: clean.name };
  }
  if ((pendingImage || pendingSource) && !isR2S3Configured()) {
    return NextResponse.json({ ok: false, error: "r2_s3_not_configured", hint: "Set R2_S3_ACCESS_KEY_ID and R2_S3_SECRET_ACCESS_KEY." }, { status: 503 });
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { ok: false, error: "r2_not_configured", hint: "Set R2_API_TOKEN and R2_ACCOUNT_ID." },
      { status: 503 },
    );
  }
  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: "supabase_write_not_configured",
        hint: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for mutating ops endpoints.",
      },
      { status: 503 },
    );
  }

  const batchKey = typeof body.batchJobId === "string" && isUuid(body.batchJobId)
    && Number.isInteger(body.cardIndex) && (body.cardIndex as number) >= 0
    ? { job: body.batchJobId, card: String(body.cardIndex) }
    : null;
  // Check-then-insert: two loads of the same job running at the same moment (two tabs) can both insert. The studio
  // disables 「載入批次結果」 while one runs; a unique index would close it fully but needs a migration (2026-10-23).
  if (batchKey) {
    const { data: existing, error: findErr } = await supabase
      .from("media_assets")
      .select("id,object_key,object_url,mime_type,byte_size,created_at")
      .eq("organization_id", organizationId)
      .eq("metadata->>batch_job_id", batchKey.job)
      .eq("metadata->>card_index", batchKey.card)
      .limit(1)
      .maybeSingle();
    if (findErr) {
      console.error("[designs] batch dedupe lookup failed:", findErr.message);
      return NextResponse.json({ ok: false, error: "lookup_failed" }, { status: 500 });
    }
    if (existing) return NextResponse.json({ ok: true, asset: existing, reused: true });
  }
  // Registering a key is idempotent: the row is inserted and the pending object deleted before the answer goes out, so a
  // browser that lost that answer and asks again finds the row here instead of a misleading "upload expired".
  if (pendingImage) {
    const { data: existing, error: findErr } = await supabase
      .from("media_assets")
      .select("id,object_key,object_url,mime_type,byte_size,created_at")
      .eq("organization_id", organizationId)
      .eq("metadata->>upload_key", pendingImage.key)
      .limit(1)
      .maybeSingle();
    if (findErr) {
      console.error("[designs] upload_key lookup failed:", findErr.message);
      return NextResponse.json({ ok: false, error: "lookup_failed" }, { status: 500 });
    }
    if (existing) return NextResponse.json({ ok: true, asset: existing, reused: true });
  }

  const mime = pendingImage ? pendingImage.mime : parsed!.mime;
  const objectKey = buildDesignKey(mime);
  if (!objectKey) {
    return NextResponse.json({ ok: false, error: "unsupported_mime" }, { status: 400 });
  }

  // I4: every designs/ object this request writes is listed here BEFORE it is written (a PUT whose answer is lost may still
  // have landed), and every failure below deletes them all. Not through the WordPress-reference guard: these keys were minted
  // in this request and never returned, so no post can show them, and the guard refuses to delete when a site cannot be
  // scanned (r2-delete-guard.ts) -- which would leave them without a row.
  const written: string[] = [];
  const fail = async (status: number, error: string) => {
    await discardUnregisteredDesignObjects(written);
    return NextResponse.json({ ok: false, error }, { status });
  };

  let uploaded: { objectKey: string; publicUrl: string; byteSize: number; checksumSha256: string };
  // card R3: the picture's size, kept in metadata so a picker can mark a design of another shape without loading it
  let pixelSize: { width?: number; height?: number } = {};
  if (pendingImage) {
    written.push(objectKey);
    const got = await claimPendingUpload(pendingImage, objectKey);
    if (!got.ok) { const f = got as { ok: false; status: number; error: string }; return fail(f.status, f.error); }
    // Checked on the formal copy (the bytes kept); the decoded format must be the type the key and Content-Type claim.
    let format: string | undefined;
    try { const m = await sharp(got.buffer).metadata(); format = m.format; pixelSize = { width: m.width, height: m.height }; } catch { format = undefined; }
    if (!format || SNIFFED_MIME[format] !== pendingImage.mime) return fail(400, "upload is not the png/jpeg/webp image its key names");
    uploaded = { objectKey, publicUrl: `${getDesignsPublicBase()}/${objectKey}`, byteSize: got.buffer.byteLength, checksumSha256: sha256Hex(got.buffer) };
  } else {
    written.push(objectKey);
    try { const m = await sharp(parsed!.buffer).metadata(); pixelSize = { width: m.width, height: m.height }; } catch { pixelSize = {}; }
    const put = await putDesignObject(objectKey, parsed!.buffer, parsed!.mime);
    // Same cast convention as tarot/generate route — tsconfig here does not narrow `!x.ok`.
    if (!put.ok) return fail(502, (put as { ok: false; error: string }).error);
    uploaded = put as { objectKey: string; publicUrl: string; byteSize: number; checksumSha256: string };
  }

  let sourceMeta: Record<string, unknown> = {};
  if (pendingSource) {
    const sourceKey = sourceKeyFor(objectKey, pendingSource.p.ext);
    written.push(sourceKey);
    const got = await claimPendingUpload(pendingSource.p, sourceKey);
    if (!got.ok) { const f = got as { ok: false; status: number; error: string }; return fail(f.status, f.error); }
    if (!sourceBytesMatch(pendingSource.p.ext, got.buffer)) return fail(400, `source content is not a ${pendingSource.p.ext} file`);
    sourceMeta = { source_key: sourceKey, source_name: pendingSource.name, source_bytes: got.buffer.byteLength };
  }

  const traceId = randomUUID(); // node:crypto import — Node 18 on SG has no crypto global
  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      organization_id: organizationId,
      storage_backend: "r2",
      asset_domain: "ai_generated",
      object_key: uploaded.objectKey,
      object_url: uploaded.publicUrl,
      mime_type: mime,
      byte_size: uploaded.byteSize,
      checksum_sha256: uploaded.checksumSha256,
      // Customers: the authenticated user. Staff: advisory, caller-supplied, validated as UUID shape only.
      created_by: actorUserId,
      metadata: {
        source: body.source ?? "pod-studio",
        prompt: body.prompt ?? null,
        model_name: body.modelName ?? null,
        card_name: body.cardName ?? null,
        product_type: body.productType && body.productType !== "none" ? body.productType : null,
        theme: body.theme ?? null,
        brand: body.brand ?? null,
        style_tags: sanitizeStyleTags(body.styleTags),
        subject: body.subject?.trim() || null,
        ...(pixelSize.width && pixelSize.height ? { width: pixelSize.width, height: pixelSize.height } : {}),
        ...sourceMeta,
        ...(batchKey ? { batch_job_id: batchKey.job, card_index: batchKey.card } : {}),
        ...(pendingImage ? { upload_key: pendingImage.key } : {}),
        actor_role: resolved.role,
        role_source: resolved.source,
        trace_id: traceId,
      },
    })
    .select("id,object_key,object_url,mime_type,byte_size,created_at")
    .single();

  if (error) {
    console.error("[designs] media_assets insert failed:", error.message);
    return fail(500, "insert_failed"); // preview and original: no row will ever point at them
  }
  for (const p of [pendingImage, pendingSource?.p]) if (p) await discardPendingUpload(p.key);

  const { error: auditError } = await supabase.from("ops_audit_events").insert({
    organization_id: organizationId,
    actor_user_id: actorUserId,
    actor_role: resolved.role,
    event_type: "design_asset_saved",
    target_type: "media_assets",
    target_id: data.id,
    trace_id: traceId,
    payload: {
      object_key: data.object_key,
      byte_size: data.byte_size,
      model_name: body.modelName ?? null,
      role_source: resolved.source,
    },
  });
  if (auditError) {
    // Asset is already committed — do not fail the request, but never drop the trail silently.
    console.warn("[designs] ops_audit_events insert failed:", auditError.message);
  }

  return NextResponse.json({ ok: true, asset: data });
}

/** DELETE — remove one design from R2 and media_assets. Requires canCreateAiImageJob. */
export async function DELETE(request: Request) {
  if (!featureEnabled()) {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  const url = new URL(request.url);
  const assetId = url.searchParams.get("id");
  if (!assetId || !isUuid(assetId)) {
    return NextResponse.json({ ok: false, error: "id (UUID) query param required" }, { status: 400 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });
  }

  // Fetch the asset to get object_key + mime_type before deleting.
  const { data: asset, error: fetchErr } = await supabase
    .from("media_assets")
    .select("id,object_key,mime_type,organization_id,created_by,metadata")
    .eq("id", assetId)
    .eq("storage_backend", "r2")
    .eq("asset_domain", "ai_generated")
    .single();

  if (fetchErr || !asset) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  try { assertOrgAccess(request, (asset as Record<string, unknown>).organization_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  // A customer deletes only what it saved itself; staff-made assets (managed service) stay.
  if (resolveTenant(request).userKind === "client") {
    const own = actorUserIdOf(request, undefined);
    if (!own || (asset as Record<string, unknown>).created_by !== own) return NextResponse.json({ ok: false, error: "not_your_asset" }, { status: 403 });
  }

  // A file still shown by a WordPress post/page is refused and the row stays (r2-delete-guard.ts picks the bucket
  // from the key: video/ and remotion/ -> R2_VIDEO_BUCKET, designs/ captions/ web/ -> R2_DESIGNS_BUCKET).
  // R2DEL: this row is the one going; a content-addressed object (e.g. a workbench file, ai_generated too) that another
  // row still uses stays in R2.
  const r2Result = await deleteUnreferencedAsset(asset.object_key, { exceptAssetIds: [String(asset.id)] });
  if ("error" in r2Result) {
    console.error("[designs] delete refused:", r2Result.error);
    const references = "references" in r2Result ? r2Result.references : undefined;
    return NextResponse.json({ ok: false, error: r2Result.message, code: r2Result.error, references },
      { status: r2Result.error === "asset_in_use" ? 409 : 502 });
  }

  // The original file saved with the preview (sourceUpload): same guarded delete. A failure keeps the row so a retry finishes the job
  // (the preview delete above treats an already-gone object as ok).
  const sourceKey = sourceKeyFromMetadata((asset as Record<string, unknown>).metadata);
  if (sourceKey) {
    const sr = await deleteUnreferencedAsset(sourceKey);
    if ("error" in sr) {
      console.error("[designs] source delete refused:", sr.error);
      return NextResponse.json({ ok: false, error: sr.message, code: sr.error }, { status: sr.error === "asset_in_use" ? 409 : 502 });
    }
  }

  // Remove row from media_assets.
  const { error: deleteErr } = await supabase
    .from("media_assets")
    .delete()
    .eq("id", assetId);

  if (deleteErr) {
    console.error("[designs] media_assets delete failed:", deleteErr.message);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }

  // Audit trail.
  const traceId = randomUUID();
  await supabase.from("ops_audit_events").insert({
    organization_id: asset.organization_id,
    actor_role: resolved.role,
    event_type: "design_asset_deleted",
    target_type: "media_assets",
    target_id: assetId,
    trace_id: traceId,
    payload: { object_key: asset.object_key, source_key: sourceKey, role_source: resolved.source },
  });

  return NextResponse.json({ ok: true });
}

/** GET — list saved designs (newest first). Any ops role may read. */
export async function GET(request: Request) {
  if (!featureEnabled()) {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  // Reads are open to all ops roles. The actual auth boundary for /api/* is the
  // nginx basic-auth layer in front of next-admin on SG (OPS_BASIC_USER/OPS_BASIC_PASSWORD,
  // lobster-phase1 nginx vhost) — same posture as the other /api/tools/* routes.
  resolveOpsRole(request);

  const url = new URL(request.url);
  // 讀路徑的租戶語意（2026-08-26 對齊 /api/video/history）：
  //   • client  → effectiveOrgId 強制綁回自己的 org，無綁定則拋 403
  //   • staff   → 不帶 ?organizationId 時為 null = **不過濾，看全部 org**
  //
  // 為何改：本 route 原本是 `?? defaultOrganizationId()`，等於 staff 永遠只看得到
  // POD_DESIGNS_DEFAULT_ORG_ID 那一個 org；而讀同一張 media_assets 的 /api/video/history
  // 用的是 `effectiveOrgId(req, null)`（staff 看全部）。同一批資料、兩個畫面、兩種集合。
  // 對齊方向選 history，因為 lib/tenant-guard.ts:6 對 staff 的定義就是「Full access to all orgs」
  // —— 是 designs 這一邊與文件模型衝突。操作者 2026-08-26 明示採「管理員看得到全部客戶」。
  //
  // **寫路徑（POST）不受影響**：insert 必須有明確 org，仍走 defaultOrganizationId() 後備。
  // An explicit ?organizationId (the video workbench's 作品 page sends the customer it is switched to) is checked like
  // every (wb) page's API (/api/video/schedule): a customer naming another organization gets 403 and no rows, instead of
  // effectiveOrgId quietly answering with its own.
  const requestedOrgId = url.searchParams.get("organizationId")?.trim() || null;
  let organizationId: string | null;
  try {
    if (requestedOrgId) assertOrgAccess(request, requestedOrgId);
    organizationId = effectiveOrgId(request, requestedOrgId);
  }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (organizationId && !isUuid(organizationId)) {
    return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  }

  // 影片與圖片同屬 asset_domain="ai_generated"（DB CHECK 見 0151，此路由只寫 ai_generated），
  // 用 mime_type 區分：?domain=ai_video → video/*；default → image/*。避免動 prod schema。
  const wantVideo = url.searchParams.get("domain") === "ai_video";
  const mimePrefix = wantVideo ? ("video/%" as const) : ("image/%" as const);

  // Optional source-group filter for the publish picker's split 設計圖 / 商品照 sections, the
  // mockup picker (print = 設計圖 without tarot card art) and the My Designs tabs. Applied in the DB (lib/studio/designs-list.ts applyFilters) so each group pages
  // on its own — the 洗版 bug (60-row cap × 87% tarot left mockups invisible) stays closed.
  // Unknown values are ignored (un-filtered list, backward compatible).
  const groupParam = url.searchParams.get("group");
  const group = groupParam === "mockup" || groupParam === "design" || groupParam === "print" ? groupParam : null;

  // Paging: ?cursor=<nextCursor from the previous page>; keyset on (created_at, id), no OFFSET.
  const cursorParam = url.searchParams.get("cursor");
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  if (cursorParam && !cursor) {
    return NextResponse.json({ ok: false, error: "invalid_cursor" }, { status: 400 });
  }
  const order: SortOrder = url.searchParams.get("order") === "asc" ? "asc" : "desc";
  const timeParam = url.searchParams.get("time");
  const time: TimeRange | null = timeParam === "today" || timeParam === "week" || timeParam === "month" ? timeParam : null;
  const tzRaw = Number(url.searchParams.get("tz") ?? "0");
  const tzOffsetMin = Number.isInteger(tzRaw) && Math.abs(tzRaw) <= 840 ? tzRaw : 0;
  const text = (k: string) => {
    const v = url.searchParams.get(k);
    return v && v !== "all" ? v.slice(0, 120) : null;
  };

  // Prefer the service-role client: media_assets has RLS keyed to Clerk JWTs, and this
  // server route carries no user JWT — the anon client would silently return 0 rows.
  const supabase = getSupabaseWriteClient() ?? getSupabaseReadClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  try {
    const result = await listDesigns(
      supabase,
      {
        organizationId,
        mimePrefix,
        group,
        model: text("model"),
        product: text("product"),
        theme: text("theme"),
        brand: text("brand"),
        time,
        tzOffsetMin,
      },
      // ?counts=1 (My Designs) adds total + per-chip counts on the first page; pickers skip the cost.
      { cursor, order, withCounts: url.searchParams.get("counts") === "1" },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[designs] list failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "list_failed" }, { status: 500 });
  }
}
