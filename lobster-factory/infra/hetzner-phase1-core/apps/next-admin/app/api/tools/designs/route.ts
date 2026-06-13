import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../lib/ops-role";
import { getSupabaseReadClient, getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { buildDesignKey, deleteDesignObject, isR2Configured, parseImageDataUrl, putDesignObject } from "../../../../lib/storage/r2";

export const runtime = "nodejs";
export const maxDuration = 60;

// Same ceiling as the tarot reference-image path (~9 MB of base64).
const MAX_IMAGE_CHARS = 12_000_000;
const LIST_LIMIT = 60;

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
  image?: string;
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
  if (body.actorUserId && !isUuid(body.actorUserId)) {
    return NextResponse.json({ ok: false, error: "actorUserId must be a UUID when provided" }, { status: 400 });
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

  const objectKey = buildDesignKey(parsed.mime);
  if (!objectKey) {
    return NextResponse.json({ ok: false, error: "unsupported_mime" }, { status: 400 });
  }

  const uploaded = await putDesignObject(objectKey, parsed.buffer, parsed.mime);
  if (!uploaded.ok) {
    // Same cast convention as tarot/generate route — tsconfig here does not narrow `!x.ok`.
    const code = (uploaded as { ok: false; error: string }).error;
    return NextResponse.json({ ok: false, error: code }, { status: 502 });
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
      mime_type: parsed.mime,
      byte_size: uploaded.byteSize,
      checksum_sha256: uploaded.checksumSha256,
      // Advisory only — caller-supplied, validated as UUID shape but not authenticated.
      created_by: body.actorUserId ?? null,
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
        actor_role: resolved.role,
        role_source: resolved.source,
        trace_id: traceId,
      },
    })
    .select("id,object_key,object_url,mime_type,byte_size,created_at")
    .single();

  if (error) {
    console.error("[designs] media_assets insert failed:", error.message);
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });
  }

  const { error: auditError } = await supabase.from("ops_audit_events").insert({
    organization_id: organizationId,
    actor_user_id: body.actorUserId ?? null,
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

  // Fetch the asset to get object_key before deleting.
  const { data: asset, error: fetchErr } = await supabase
    .from("media_assets")
    .select("id,object_key,organization_id,metadata")
    .eq("id", assetId)
    .eq("storage_backend", "r2")
    .eq("asset_domain", "ai_generated")
    .single();

  if (fetchErr || !asset) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // Delete from R2 first (idempotent — 404 treated as success).
  const r2Result = await deleteDesignObject(asset.object_key);
  if (!r2Result.ok) {
    console.error("[designs] R2 delete failed:", (r2Result as { ok: false; error: string }).error);
    return NextResponse.json({ ok: false, error: (r2Result as { ok: false; error: string }).error }, { status: 502 });
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
    payload: { object_key: asset.object_key, role_source: resolved.source },
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
  const organizationId = url.searchParams.get("organizationId") ?? defaultOrganizationId();
  if (!organizationId || !isUuid(organizationId)) {
    return NextResponse.json(
      { ok: false, error: "organizationId is required (or set POD_DESIGNS_DEFAULT_ORG_ID)" },
      { status: 400 },
    );
  }

  // Prefer the service-role client: media_assets has RLS keyed to Clerk JWTs, and this
  // server route carries no user JWT — the anon client would silently return 0 rows.
  const supabase = getSupabaseWriteClient() ?? getSupabaseReadClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("media_assets")
    .select("id,object_key,object_url,mime_type,byte_size,created_at,metadata")
    .eq("organization_id", organizationId)
    .eq("storage_backend", "r2")
    .eq("asset_domain", "ai_generated")
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    console.error("[designs] list failed:", error.message);
    return NextResponse.json({ ok: false, error: "list_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, assets: data ?? [] });
}
