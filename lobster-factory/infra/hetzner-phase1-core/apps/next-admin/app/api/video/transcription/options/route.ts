import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { TRANSCRIBE_RATES, TWD_RATE } from "@/lib/ai/cost-model";
import { externalAudioAllowed, HOST_REALTIME_FACTOR, hostWorkerHealthy, OPENAI_TRANSCRIBE_MAX_BYTES, OPENAI_TRANSCRIBE_MODEL } from "@/lib/content/video/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** What the captions step can offer for one client: is each engine usable now, the client's audio setting, and the
 *  numbers the page needs to show time and price before anyone clicks. PATCH flips the client's audio setting. */
export async function GET(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const organizationId = (new URL(req.url).searchParams.get("organizationId") ?? "").trim();
  if (!UUID_RE.test(organizationId)) return NextResponse.json({ ok: false, error: "invalid_organization" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); } catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const { getSupabaseWriteClient } = await import("@/lib/supabase-server"); const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "media_database_unavailable" }, { status: 503 });
  const [org, hostReady] = await Promise.all([db.from("organizations").select("metadata").eq("id", organizationId).maybeSingle(), hostWorkerHealthy()]);
  if (org.error || !org.data) return NextResponse.json({ ok: false, error: "organization_lookup_failed" }, { status: 502 });
  return NextResponse.json({
    ok: true,
    hostReady,
    openAiReady: Boolean((process.env.OPENAI_API_KEY ?? "").trim()),
    externalAllowed: externalAudioAllowed(org.data.metadata),
    canChangeSetting: canWriteTenantConfig(role),
    hostRealtimeFactor: HOST_REALTIME_FACTOR,
    openAiMaxBytes: OPENAI_TRANSCRIBE_MAX_BYTES,
    openAiUsdPerMin: TRANSCRIBE_RATES[OPENAI_TRANSCRIBE_MODEL].usdPerMin,
    twdRate: TWD_RATE,
  });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const resolved = resolveOpsRole(req);
  if (!canWriteTenantConfig(resolved.role)) return NextResponse.json({ ok: false, error: "forbidden_role" }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  if (!UUID_RE.test(organizationId) || typeof body.externalAllowed !== "boolean") return NextResponse.json({ ok: false, error: "organizationId_and_externalAllowed_required" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); } catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const { getSupabaseWriteClient } = await import("@/lib/supabase-server"); const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "media_database_unavailable" }, { status: 503 });
  const org = await db.from("organizations").select("metadata").eq("id", organizationId).maybeSingle();
  if (org.error || !org.data) return NextResponse.json({ ok: false, error: "organization_lookup_failed" }, { status: 502 });
  const metadata = (org.data.metadata && typeof org.data.metadata === "object" ? org.data.metadata : {}) as Record<string, unknown>;
  const clientConfig = { ...(metadata.client_config && typeof metadata.client_config === "object" ? metadata.client_config as Record<string, unknown> : {}), audioExternalAiAllowed: body.externalAllowed };
  const write = await db.from("organizations").update({ metadata: { ...metadata, client_config: clientConfig } }).eq("id", organizationId);
  if (write.error) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 409 });
  await db.from("ops_audit_events").insert({ organization_id: organizationId, actor_role: resolved.role, event_type: "audio_external_ai_changed", target_type: "organizations", target_id: organizationId, trace_id: crypto.randomUUID(), payload: { audioExternalAiAllowed: body.externalAllowed, role_source: resolved.source } });
  return NextResponse.json({ ok: true, externalAllowed: body.externalAllowed });
}
