import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { staffOnly } from "@/lib/tenant-guard";
import { requestActor } from "@/lib/entitlements/subject";
import { codexAllowed } from "@/lib/tarot/codex-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/content/sites/owner-subscription { organizationId, allowed } -- K7, operator 2026-11-22 (「Soulful 也是我的，
// 只是我把它設為代操對象」): the owner marks a client organization as hers, so its sites may use her subscriptions
// (organizations.metadata.client_config.ownerSubscription, read by lib/content/text-road-guard.ts). The owner alone
// (codexAllowed): the subscriptions are hers (PLAN I1). Written and audited like client_config.audioExternalAiAllowed
// (app/api/video/transcription/options). Turning it off does not touch the sites' stored roads: their subscription
// segments are simply skipped from then on (make.ts checks at run time).
export async function PATCH(req: Request): Promise<Response> {
  const resolved = resolveOpsRole(req);
  if (!canCreateAiImageJob(resolved.role)) return new NextResponse("forbidden", { status: 403 });
  const notStaff = staffOnly(req);
  if (notStaff) return notStaff;
  if (!codexAllowed(requestActor(req))) return NextResponse.json({ ok: false, error: "sub_operator_only" }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  if (!UUID_RE.test(organizationId) || typeof body.allowed !== "boolean") return NextResponse.json({ ok: false, error: "organizationId_and_allowed_required" }, { status: 400 });
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const org = await db.from("organizations").select("metadata").eq("id", organizationId).maybeSingle();
  if (org.error) return NextResponse.json({ ok: false, error: "organization_lookup_failed" }, { status: 502 });
  if (!org.data) return NextResponse.json({ ok: false, error: "organization_not_found" }, { status: 404 });
  const metadata = ((org.data as { metadata?: unknown }).metadata && typeof (org.data as { metadata?: unknown }).metadata === "object"
    ? (org.data as { metadata: Record<string, unknown> }).metadata : {}) as Record<string, unknown>;
  const clientConfig = { ...(metadata.client_config && typeof metadata.client_config === "object" ? metadata.client_config as Record<string, unknown> : {}), ownerSubscription: body.allowed };
  const write = await db.from("organizations").update({ metadata: { ...metadata, client_config: clientConfig } }).eq("id", organizationId);
  if (write.error) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 409 });
  await db.from("ops_audit_events").insert({ organization_id: organizationId, actor_role: resolved.role, event_type: "owner_subscription_changed", target_type: "organizations", target_id: organizationId, trace_id: crypto.randomUUID(), payload: { ownerSubscription: body.allowed, role_source: resolved.source } });
  return NextResponse.json({ ok: true, allowed: body.allowed });
}
