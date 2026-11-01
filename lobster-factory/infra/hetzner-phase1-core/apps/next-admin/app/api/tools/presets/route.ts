import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../lib/ops-role";
import { withFeature } from "../../../../lib/entitlements/grant";
import { getSupabaseReadClient, getSupabaseWriteClient } from "../../../../lib/supabase-server";
import {
  buildDesignKey,
  deleteDesignObject,
  isR2Configured,
  parseImageDataUrl,
  putDesignObject,
} from "../../../../lib/storage/r2";
import { deleteUnreferencedAsset } from "../../../../lib/content/r2-delete-guard";
import { isPrintBox } from "../../../../lib/studio/fabric-print";
import { effectiveOrgId, OrgAccessError, resolveTenant, toOrgAccessResponse } from "../../../../lib/tenant-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_CHARS = 12_000_000;
// A model is several rows (4 identity angles + its pose photos): 50 hid models from the 6th on.
const LIST_LIMIT = 500;

const PRESET_DOMAINS = ["mockup_model_preset", "mockup_product_preset"] as const;
type PresetDomain = (typeof PRESET_DOMAINS)[number];

function featureEnabled(): boolean {
  return process.env.POD_DESIGNS_ENABLED === "true";
}

function defaultOrganizationId(): string | null {
  return process.env.POD_DESIGNS_DEFAULT_ORG_ID ?? null;
}

/** The organization a request acts for: a customer's own, whatever the request names; staff name one or get the
 *  default. A Response = refuse with it. */
function presetOrg(request: Request, requested: string | null | undefined): string | Response {
  let organizationId: string | null;
  try { organizationId = effectiveOrgId(request, requested ?? defaultOrganizationId()); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  if (!organizationId || !isUuid(organizationId)) {
    return NextResponse.json(
      { ok: false, error: "organizationId is required (or set POD_DESIGNS_DEFAULT_ORG_ID)" },
      { status: 400 },
    );
  }
  return organizationId;
}

/** A customer's own user (middleware's x-ops-user-id), recorded on what it saves so it deletes only that. */
function clientUserId(request: Request): string | null {
  return resolveTenant(request).userKind === "client" ? request.headers.get("x-ops-user-id")?.trim() || null : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

interface SavePresetBody {
  image?: string;
  presetType: "model" | "product";
  presetName: string;
  presetSettings?: Record<string, unknown>;
  organizationId?: string;
  /** Model photos only: the photos of one model share a modelKey (uuid). Absent = a one-photo model (older rows). */
  modelKey?: string;
  photoRole?: string;
  garmentColor?: string;
  /** Where code-printing puts a design on this photo (lib/studio/fabric-print.ts PrintBox). */
  printBox?: unknown;
}

const PHOTO_ROLES = new Set(["face-front", "face-left", "face-right", "face-profile", "pose", "upload"]);
const GARMENT_COLORS = new Set(["white", "grey", "black"]);

/** The model-photo fields a request may set, validated; anything else is dropped. */
function modelPhotoMeta(body: Pick<SavePresetBody, "modelKey" | "photoRole" | "garmentColor" | "printBox">):
  Record<string, unknown> | { error: string } {
  const meta: Record<string, unknown> = {};
  if (body.modelKey !== undefined) {
    if (typeof body.modelKey !== "string" || !isUuid(body.modelKey)) return { error: "modelKey must be a uuid" };
    meta.model_key = body.modelKey;
  }
  if (body.photoRole !== undefined) {
    if (typeof body.photoRole !== "string" || !PHOTO_ROLES.has(body.photoRole)) return { error: "unknown photoRole" };
    meta.photo_role = body.photoRole;
  }
  if (body.garmentColor !== undefined) {
    if (typeof body.garmentColor !== "string" || !GARMENT_COLORS.has(body.garmentColor)) return { error: "unknown garmentColor" };
    meta.garment_color = body.garmentColor;
  }
  if (body.printBox !== undefined && body.printBox !== null) {
    if (!isPrintBox(body.printBox)) return { error: "printBox must be {x,y,w,h} inside the photo (0..1)" };
    const { x, y, w, h } = body.printBox;
    meta.print_box = { x, y, w, h };
  }
  return meta;
}

/** GET — list presets for an org (both model + product). */
export async function GET(request: Request) {
  if (!featureEnabled()) {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  resolveOpsRole(request);

  const organizationId = presetOrg(request, new URL(request.url).searchParams.get("organizationId"));
  if (organizationId instanceof Response) return organizationId;

  const supabase = getSupabaseWriteClient() ?? getSupabaseReadClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("media_assets")
    .select("id,object_url,asset_domain,metadata,created_at")
    .eq("organization_id", organizationId)
    .eq("storage_backend", "r2")
    .in("asset_domain", PRESET_DOMAINS)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    console.error("[presets] list failed:", error.message);
    return NextResponse.json({ ok: false, error: "list_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, presets: data ?? [] });
}

/** POST — save a new preset (model or product). */
// Saving and deleting mockup presets is design's own paid edit (contract); listing is free. The shared asset gallery
// (/api/tools/designs) is used by tarot, studio and content too, so it stays ungated.
export const POST = withFeature("design.edit", handlePost);
async function handlePost(request: Request): Promise<Response> {
  if (!featureEnabled()) {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: SavePresetBody;
  try {
    body = (await request.json()) as SavePresetBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Validate presetName
  const presetName = typeof body.presetName === "string" ? body.presetName.trim() : "";
  if (!presetName) {
    return NextResponse.json({ ok: false, error: "presetName is required" }, { status: 400 });
  }
  if (presetName.length > 100) {
    return NextResponse.json({ ok: false, error: "presetName max 100 chars" }, { status: 400 });
  }

  if (body.presetType !== "model" && body.presetType !== "product") {
    return NextResponse.json(
      { ok: false, error: "presetType must be 'model' or 'product'" },
      { status: 400 },
    );
  }

  const assetDomain: PresetDomain =
    body.presetType === "model" ? "mockup_model_preset" : "mockup_product_preset";

  const photoMeta = body.presetType === "model" ? modelPhotoMeta(body) : {};
  if ("error" in photoMeta) return NextResponse.json({ ok: false, error: photoMeta.error }, { status: 400 });

  if (!body.image || typeof body.image !== "string") {
    return NextResponse.json({ ok: false, error: "image (base64 data URL) is required" }, { status: 400 });
  }
  if (body.image.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ ok: false, error: "image too large (~9MB limit)" }, { status: 413 });
  }

  const parsed = parseImageDataUrl(body.image);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: "image must be a png/jpeg/webp base64 data URL" },
      { status: 400 },
    );
  }

  const organizationId = presetOrg(request, body.organizationId);
  if (organizationId instanceof Response) return organizationId;

  if (!isR2Configured()) {
    return NextResponse.json(
      { ok: false, error: "r2_not_configured", hint: "Set R2_API_TOKEN and R2_ACCOUNT_ID." },
      { status: 503 },
    );
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });
  }

  const objectKey = buildDesignKey(parsed.mime);
  if (!objectKey) {
    return NextResponse.json({ ok: false, error: "unsupported_mime" }, { status: 400 });
  }

  const uploaded = await putDesignObject(objectKey, parsed.buffer, parsed.mime);
  if (!uploaded.ok) {
    const code = (uploaded as { ok: false; error: string }).error;
    return NextResponse.json({ ok: false, error: code }, { status: 502 });
  }

  const traceId = randomUUID();
  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      organization_id: organizationId,
      storage_backend: "r2",
      asset_domain: assetDomain,
      object_key: uploaded.objectKey,
      object_url: uploaded.publicUrl,
      mime_type: parsed.mime,
      byte_size: uploaded.byteSize,
      checksum_sha256: uploaded.checksumSha256,
      created_by: clientUserId(request),
      metadata: {
        source: "mockup-studio",
        preset_name: presetName,
        // Cap preset_settings to prevent JSONB row bloat (only UI-controlled keys expected).
        preset_settings: (() => {
          if (!body.presetSettings) return null;
          const s = JSON.stringify(body.presetSettings);
          if (s.length > 4096) return null; // silently drop oversized blobs
          return body.presetSettings;
        })(),
        ...photoMeta,
        actor_role: resolved.role,
        role_source: resolved.source,
        trace_id: traceId,
      },
    })
    .select("id,object_url,asset_domain,metadata,created_at")
    .single();

  if (error) {
    console.error("[presets] media_assets insert failed:", error.message);
    // The object was uploaded first: without its row nothing lists or deletes it (0067 left one per failed save).
    const cleanup = await deleteDesignObject(uploaded.objectKey);
    if ("error" in cleanup) console.error("[presets] orphan object left:", uploaded.objectKey, cleanup.error);
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  }

  // Audit trail for preset creation (symmetry with preset_deleted).
  await supabase.from("ops_audit_events").insert({
    organization_id: organizationId,
    actor_role: resolved.role,
    event_type: "preset_saved",
    target_type: "media_assets",
    target_id: data.id,
    trace_id: traceId,
    payload: { object_key: uploaded.objectKey, preset_type: body.presetType, role_source: resolved.source },
  });

  return NextResponse.json({ ok: true, preset: data });
}

/** PATCH ?id= — change a model photo's print box / garment colour (the image itself never changes). */
export const PATCH = withFeature("design.edit", handlePatch);
async function handlePatch(request: Request): Promise<Response> {
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
  let body: Pick<SavePresetBody, "printBox" | "garmentColor">;
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const patch = modelPhotoMeta({ printBox: body.printBox, garmentColor: body.garmentColor });
  if ("error" in patch) return NextResponse.json({ ok: false, error: patch.error }, { status: 400 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });
  }
  const orgId = presetOrg(request, url.searchParams.get("organizationId"));
  if (orgId instanceof Response) return orgId;

  const { data: asset, error: fetchErr } = await supabase
    .from("media_assets")
    .select("id,metadata,created_by")
    .eq("id", assetId)
    .eq("organization_id", orgId)
    .eq("asset_domain", "mockup_model_preset")
    .single();
  if (fetchErr || !asset) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (resolveTenant(request).userKind === "client") {
    const own = clientUserId(request);
    if (!own || asset.created_by !== own) return NextResponse.json({ ok: false, error: "not_your_asset" }, { status: 403 });
  }

  const metadata = { ...((asset.metadata as Record<string, unknown> | null) ?? {}), ...patch };
  const { data, error } = await supabase
    .from("media_assets")
    .update({ metadata })
    .eq("id", assetId)
    .eq("organization_id", orgId)
    .select("id,object_url,asset_domain,metadata,created_at")
    .single();
  if (error || !data) {
    console.error("[presets] patch failed:", error?.message);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, preset: data });
}

/** DELETE — remove a preset. Requires canCreateAiImageJob. */
export const DELETE = withFeature("design.edit", handleDelete);
async function handleDelete(request: Request): Promise<Response> {
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

  // DELETE is scoped to the caller's org (a customer's own, whatever the query names).
  const deleteOrgId = presetOrg(request, url.searchParams.get("organizationId"));
  if (deleteOrgId instanceof Response) return deleteOrgId;

  const { data: asset, error: fetchErr } = await supabase
    .from("media_assets")
    .select("id,object_key,organization_id,created_by")
    .eq("id", assetId)
    .eq("organization_id", deleteOrgId)
    .eq("storage_backend", "r2")
    .in("asset_domain", PRESET_DOMAINS)
    .single();

  if (fetchErr || !asset) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  // A customer deletes only what it saved itself; staff-made presets of its organization stay (as /api/tools/designs).
  if (resolveTenant(request).userKind === "client") {
    const own = clientUserId(request);
    if (!own || asset.created_by !== own) return NextResponse.json({ ok: false, error: "not_your_asset" }, { status: 403 });
  }

  // Same rule as every saved asset: refused while a WordPress post/page still shows it (r2-delete-guard.ts).
  const r2Result = await deleteUnreferencedAsset(asset.object_key);
  if ("error" in r2Result) {
    console.error("[presets] delete refused:", r2Result.error);
    return NextResponse.json({ ok: false, error: r2Result.message, code: r2Result.error },
      { status: r2Result.error === "asset_in_use" ? 409 : 502 });
  }

  const { error: deleteErr } = await supabase
    .from("media_assets")
    .delete()
    .eq("id", assetId);

  if (deleteErr) {
    console.error("[presets] media_assets delete failed:", deleteErr.message);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }

  const traceId = randomUUID();
  await supabase.from("ops_audit_events").insert({
    organization_id: asset.organization_id,
    actor_role: resolved.role,
    event_type: "preset_deleted",
    target_type: "media_assets",
    target_id: assetId,
    trace_id: traceId,
    payload: { object_key: asset.object_key, role_source: resolved.source },
  });

  return NextResponse.json({ ok: true });
}
