// The two checks every /api/ops/clients/[slug]/<people> route makes first (accounts, member-transfer): one copy, so the
// rule of who may manage a client's people and which organizations have them cannot drift between routes.
import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { resolveTenant } from "@/lib/tenant-guard";

export type ClientRouteCtx = { params: Promise<{ slug: string }> };
export type ClientOrg = { id: string; name: string };
export type StaffAdmin = { role: "owner" | "admin"; source: ReturnType<typeof resolveOpsRole>["source"]; actorUserId: string | null };

/** owner/admin staff, else the 403 response. A client identity never reaches /api/ops (middleware), checked again here. */
export function staffAdmin(request: Request): StaffAdmin | Response {
  const resolved = resolveOpsRole(request);
  if (resolveTenant(request).userKind !== "staff" || !canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  // canWriteTenantConfig admits owner and admin only; actorUserId = who pressed it, for the audit (set only by middleware)
  return { role: resolved.role as "owner" | "admin", source: resolved.source, actorUserId: request.headers.get("x-ops-user-id")?.trim() || null };
}

/** The client organization the slug names, else the error response. An internal org's people are staff, not clients. */
export async function clientOrg(context: ClientRouteCtx): Promise<ClientOrg | Response> {
  const { slug } = await context.params;
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  const { data, error } = await sb.from("organizations").select("id, name, type").eq("slug", slug).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "org_lookup_failed" }, { status: 503 });
  const org = data as { id: string; name: string; type: string } | null;
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  if (org.type !== "client") return NextResponse.json({ ok: false, error: "not_a_client_org" }, { status: 409 });
  return { id: org.id, name: org.name };
}
