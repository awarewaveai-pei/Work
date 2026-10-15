import { NextResponse } from "next/server";
import { resolveOpsRole, canWriteTenantConfig } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { listAllIntegrations, getPostizConfig } from "@/lib/content/postiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A channel belongs to one brand: social_accounts (0096; the old social_postiz_connections table is no longer
// written). The platform is Postiz's providerIdentifier, taken from Postiz, never from the caller.
const PLATFORM_RE = /^[a-z][a-z0-9-]{0,30}$/;

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const { clientId, postizIntegrationId, label } = body as Record<string, unknown>;

  if (!clientId || typeof clientId !== "string") {
    return new NextResponse("clientId required", { status: 400 });
  }
  try { assertOrgAccess(req, clientId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  if (!postizIntegrationId || typeof postizIntegrationId !== "string") {
    return new NextResponse("postizIntegrationId required", { status: 400 });
  }

  const db = getSupabaseWriteClient();
  if (!db) return new NextResponse("database not configured", { status: 503 });

  // Validate org exists (prevents cross-tenant writes)
  const { data: orgRow, error: orgErr } = await db
    .from("organizations")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (orgErr || !orgRow) {
    return new NextResponse("client not found", { status: 404 });
  }

  // Validate Postiz is configured
  try {
    getPostizConfig();
  } catch (err) {
    return new NextResponse(
      err instanceof Error ? err.message : "Postiz not configured",
      { status: 503 }
    );
  }

  // Validate integrationId + derive platform server-side (never trust client-supplied platform)
  let allIntegrations: Awaited<ReturnType<typeof listAllIntegrations>>;
  try {
    allIntegrations = await listAllIntegrations();
  } catch {
    console.error("[social-admin/connections POST] failed to fetch Postiz integrations");
    return new NextResponse("failed to validate integration", { status: 502 });
  }

  const integration = allIntegrations.find((i) => i.id === postizIntegrationId);
  if (!integration) {
    return new NextResponse("postizIntegrationId not found in Postiz", { status: 404 });
  }
  if (!PLATFORM_RE.test(integration.identifier)) {
    return new NextResponse(
      `platform '${integration.identifier}' is not supported`,
      { status: 400 }
    );
  }

  const derivedPlatform = integration.identifier;
  const derivedLabel =
    typeof label === "string" && label ? label.slice(0, 200) : integration.name.slice(0, 200);

  const { error } = await db.from("social_accounts").insert({
    organization_id: clientId,
    postiz_integration_id: postizIntegrationId,
    platform: derivedPlatform,
    label: derivedLabel,
    status: integration.disabled ? "expired" : "connected",
  });

  if (error) {
    if (error.code === "23505") {
      return new NextResponse("this channel already belongs to a brand", { status: 409 });
    }
    console.error("[social-admin/connections POST] db insert failed:", error.code);
    return NextResponse.json({ ok: false, error: "failed to create connection" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const integrationId = url.searchParams.get("integrationId");

  if (!clientId) return new NextResponse("clientId required", { status: 400 });
  if (!integrationId) return new NextResponse("integrationId required", { status: 400 });

  try { assertOrgAccess(req, clientId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const db = getSupabaseWriteClient();
  if (!db) return new NextResponse("database not configured", { status: 503 });

  const { error } = await db
    .from("social_accounts")
    .delete()
    .eq("organization_id", clientId)
    .eq("postiz_integration_id", integrationId);

  if (error) {
    if (error.code === "23503") {
      return new NextResponse("posts still target this channel", { status: 409 });
    }
    console.error("[social-admin/connections DELETE] db delete failed:", error.code);
    return NextResponse.json({ ok: false, error: "failed to remove connection" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
