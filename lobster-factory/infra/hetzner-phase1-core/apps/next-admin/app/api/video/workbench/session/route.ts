import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, resolveTenant } from "@/lib/tenant-guard";
import { resolveSubject } from "@/lib/entitlements/subject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** nginx auth_request target for video-workbench (P6 D2): 204 + the X-VW-* identity headers nginx forwards, or a deny.
 *  nginx must call it with `proxy_method GET` and treats anything but 2xx/401/403 as 500, so every failure denies.
 *  `X-VW-Org` picks the organization: staff may name any (none = the internal account), a customer only its own. */
export async function GET(req: Request): Promise<Response> {
  const deny = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
  // Middleware strips client copies of these and sets them only from a validated session; resolveTenant would read
  // their absence as staff, so a request that did not pass the session gate stops here.
  const userId = req.headers.get("x-ops-user-id")?.trim();
  const kind = req.headers.get("x-ops-user-kind");
  if (!userId || (kind !== "staff" && kind !== "client")) return deny(401, "unauthenticated");
  const resolved = resolveOpsRole(req);
  if (!canCreateAiImageJob(resolved.role)) return deny(403, "forbidden");
  const tenant = resolveTenant(req);
  const asked = req.headers.get("x-vw-org")?.trim() ?? "";
  if (asked && !UUID.test(asked)) return deny(403, "invalid_org");
  const orgHint = asked || (tenant.userKind === "client" ? tenant.orgId : null);
  if (tenant.userKind === "client" && !orgHint) return deny(403, "client_without_org");
  if (orgHint) {
    try { assertOrgAccess(req, orgHint); } catch (e) { if (e instanceof OrgAccessError) return deny(403, "org_forbidden"); throw e; }
  }
  let orgId: string;
  let billingOrgId: string;
  try {
    if (orgHint) {
      orgId = orgHint;
      billingOrgId = (await resolveSubject({ orgId: orgHint })).orgId;
    } else {
      const internal = await resolveSubject({});   // staff, no org named: the internal account (its own root)
      orgId = billingOrgId = internal.orgId;
    }
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (msg === "subject_not_found" || msg === "subject_root_not_found") return deny(403, "org_not_found");
    console.warn(`[vw-session] subject lookup failed: ${msg.slice(0, 200)}`);
    return deny(503, "unavailable");
  }
  return new Response(null, { status: 204, headers: {
    "Cache-Control": "no-store",
    "X-VW-User-Id": userId,
    "X-VW-Org-Id": orgId,
    "X-VW-Billing-Org-Id": billingOrgId,
    "X-VW-User-Kind": tenant.userKind,
    "X-VW-Role": resolved.role,
  } });
}
