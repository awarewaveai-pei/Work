import { NextResponse } from "next/server";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { resolveWpSite } from "@/lib/content/wp-sites";

const ORG_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SocialOrgScope = { ok: true; organizationId: string } | { ok: false; response: Response };

/**
 * The organization a social (Postiz) call acts for. Postiz connections, delivery receipts and the
 * production-change gate are all keyed on organizations.id (migration 0011 client_id FK), so exactly one
 * of the two inputs must be given:
 * - siteId: a WordPress site picked in ContentStudio -> that site's owning org. Env-configured sites
 *   have no org (wp-sites.ts:42) -> 422, never a guess.
 * - clientId: already an organization id (Client Hub, release delivery panel).
 */
export async function resolveSocialOrg(
  req: Request,
  input: { siteId?: unknown; clientId?: unknown },
): Promise<SocialOrgScope> {
  const siteId = typeof input.siteId === "string" ? input.siteId.trim() : "";
  const clientId = typeof input.clientId === "string" ? input.clientId.trim() : "";
  if (input.siteId !== undefined && input.clientId !== undefined) {
    return fail(400, "give siteId or clientId, not both");
  }
  try {
    if (input.siteId !== undefined) {
      if (!siteId) return fail(400, "siteId must be a non-empty string");
      const resolved = await resolveWpSite(req, siteId);
      if (!resolved) return fail(404, "site not found");
      const org = resolved.site.organizationId;
      if (!org || !ORG_ID_RE.test(org)) {
        return fail(422, "site has no owning organization; link it to an organization before social publishing");
      }
      return { ok: true, organizationId: org };
    }
    if (!clientId) return fail(400, "siteId or clientId required");
    if (!ORG_ID_RE.test(clientId)) return fail(400, "clientId must be an organization UUID");
    assertOrgAccess(req, clientId);
    return { ok: true, organizationId: clientId };
  } catch (e) {
    if (e instanceof OrgAccessError) return { ok: false, response: toOrgAccessResponse(e) };
    throw e;
  }
}

function fail(status: number, error: string): SocialOrgScope {
  return { ok: false, response: NextResponse.json({ ok: false, error }, { status }) };
}
