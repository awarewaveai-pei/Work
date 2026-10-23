import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../lib/ops-role";
import { withFeature } from "../../../../lib/entitlements/grant";
import { getSupabaseReadClient, getSupabaseWriteClient } from "../../../../lib/supabase-server";
import {
  buildDesignKey,
  isR2Configured,
  parseImageDataUrl,
  putDesignObject,
} from "../../../../lib/storage/r2";
import { deleteUnreferencedAsset } from "../../../../lib/content/r2-delete-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_CHARS = 12_000_000;
const LIST_LIMIT = 50;

const PRESET_DOMAINS = ["mockup_model_preset", "mockup_product_preset"] as const;
type PresetDomain = (typeof PRESET_DOMAINS)[number];

function featureEnabled(): boolean {
  return process.env.POD_DESIGNS_ENABLED === "true";
}

function defaultOrganizationId(): string | null {
  return process.env.POD_DESIGNS_DEFAULT_ORG_ID ?? null;
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
}

/** GET — list presets for an org (both model + product). */
export async function GET(request: Request) {
  if (!featureEnabled()) {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  resolveOpsRole(request);

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId") ?? defaultOrganizationId();
  if (!organizationId || !isUuid(organizationId)) {
    return NextResponse.json(
      { ok: false, error: "organizationId is required (or set POD_DESIGNS_DEFAULT_ORG_ID)" },
      { status: 400 },
    );
  }

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

  const organizationId = body.organizationId ?? defaultOrganizationId();
  if (!organizationId || !isUuid(organizationId)) {
    return NextResponse.json(
      { ok: false, error: "organizationId is required (or set POD_DESIGNS_DEFAULT_ORG_ID)" },
      { status: 400 },
    );
  }

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
        actor_role: resolved.role,
        role_source: resolved.source,
        trace_id: traceId,
      },
    })
    .select("id,object_url,asset_domain,metadata,created_at")
    .single();

  if (error) {
    console.error("[presets] media_assets insert failed:", error.message);
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

  // Resolve org boundary — DELETE must be scoped to the caller's org.
  const deleteOrgId = new URL(request.url).searchParams.get("organizationId") ?? defaultOrganizationId();
  if (!deleteOrgId || !isUuid(deleteOrgId)) {
    return NextResponse.json(
      { ok: false, error: "organizationId is required (or set POD_DESIGNS_DEFAULT_ORG_ID)" },
      { status: 400 },
    );
  }

  const { data: asset, error: fetchErr } = await supabase
    .from("media_assets")
    .select("id,object_key,organization_id")
    .eq("id", assetId)
    .eq("organization_id", deleteOrgId)
    .eq("storage_backend", "r2")
    .in("asset_domain", PRESET_DOMAINS)
    .single();

  if (fetchErr || !asset) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
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
