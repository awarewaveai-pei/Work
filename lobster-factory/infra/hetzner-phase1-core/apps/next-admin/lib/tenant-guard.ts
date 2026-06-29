// Tenant identity guard — reads the headers injected by middleware.ts.
// Headers are stripped before middleware sets them so client-supplied values cannot spoof.
//
// Two user kinds:
//   staff  — agency employees (owner/admin/operator/viewer). Full access to all orgs.
//            Fallback for any account without explicit user_kind (backwards-compatible).
//   client — end-client self-service. Bound to exactly one org (x-ops-org-id).
//
// Usage pattern (S2 route migration):
//   • Writes:  organization_id: effectiveOrgId(req, body.organizationId)
//              ↳ client callers cannot inject a foreign org; staff callers keep passing theirs.
//   • Reads:   assertOrgAccess(req, row.organization_id)
//              ↳ throws 403 if a client reads a row belonging to another org.

export type UserKind = "staff" | "client";

export interface TenantContext {
  userKind: UserKind;
  /** null for staff (full global access). Always set for client. */
  orgId: string | null;
}

const HEADER_USER_KIND = "x-ops-user-kind";
const HEADER_ORG_ID = "x-ops-org-id";

/**
 * Parse the tenant context from request headers set by middleware.
 *
 * IMPORTANT — fail-open default: when x-ops-user-kind is absent (e.g. route not covered
 * by the middleware matcher, or PUBLIC_API_PATHS passthrough), this function returns
 * { staff, null } which grants full access. This is intentional for backwards compatibility
 * but means every route wired to assertOrgAccess / effectiveOrgId in S2 MUST be covered
 * by the middleware matcher. Use the dev-mode warning below to catch uncovered routes early.
 *
 * S2 gate: before wiring any route, verify it is NOT in:
 *   - PUBLIC_API_PATHS (middleware.ts)
 *   - middleware matcher exclusions (api/internal, api/webhooks, api/auth, api/internal)
 * A route excluded from the matcher will never have tenant headers injected.
 */
export function resolveTenant(req: Request | { headers: Headers }): TenantContext {
  const headers = req instanceof Request ? req.headers : req.headers;
  const rawKind = headers.get(HEADER_USER_KIND) ?? "";
  const userKind: UserKind = rawKind === "client" ? "client" : "staff";
  const rawOrg = headers.get(HEADER_ORG_ID) ?? "";
  const orgId = rawOrg.trim() || null;

  // Dev-mode guard: if this function is called but no tenant header was injected, the route
  // is likely outside the middleware matcher. Log a warning so the S2 author notices.
  if (process.env.NODE_ENV !== "production" && !rawKind) {
    console.warn(
      "[tenant-guard] resolveTenant: x-ops-user-kind header absent — " +
      "this route may not be covered by the middleware matcher. " +
      "All guarded routes MUST be within the matcher. Defaulting to staff (full access)."
    );
  }

  return { userKind, orgId };
}

/** Thrown when a client user attempts to access data belonging to a different org. */
export class OrgAccessError extends Error {
  readonly status = 403;
  constructor(message = "forbidden: org mismatch") {
    super(message);
    this.name = "OrgAccessError";
  }
}

/**
 * Convert an OrgAccessError to a 403 Response (for use in route catch blocks).
 * Usage: catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
 * Or use the assertOrgAccessOrReturn helper below for inline usage.
 */
export function toOrgAccessResponse(e: OrgAccessError): Response {
  return new Response(JSON.stringify({ ok: false, error: e.message }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Assert the caller may access data scoped to `targetOrgId`.
 * - staff: always passes.
 * - client: targetOrgId must equal ctx.orgId; null targetOrgId (unscoped row) also blocks.
 * @throws OrgAccessError (status 403) on violation.
 */
export function assertOrgAccess(
  req: Request | { headers: Headers },
  targetOrgId: string | null | undefined
): void {
  const ctx = resolveTenant(req);
  if (ctx.userKind === "staff") return; // full access
  if (!ctx.orgId || ctx.orgId !== targetOrgId) {
    throw new OrgAccessError();
  }
}

/**
 * Resolve the effective organization_id to use for a query or insert.
 *
 * - client: always returns ctx.orgId, ignoring `requestedOrgId` (prevents IDOR on writes).
 *           Throws OrgAccessError if ctx.orgId is null (misconfigured account — org_id missing
 *           from app_metadata). A client with no org must never reach a write path.
 * - staff:  returns `requestedOrgId` if provided, otherwise null (query all orgs).
 *
 * Pass the value from body/query as `requestedOrgId`.
 */
export function effectiveOrgId(
  req: Request | { headers: Headers },
  requestedOrgId: string | null | undefined
): string | null {
  const ctx = resolveTenant(req);
  if (ctx.userKind === "client") {
    if (!ctx.orgId) {
      // Misconfigured client account: app_metadata.org_id missing. Fail closed — a client
      // with no org must not write unscoped rows (null organization_id) or read all rows.
      throw new OrgAccessError("forbidden: client account has no org binding");
    }
    return ctx.orgId; // client cannot inject foreign org
  }
  return requestedOrgId ?? null;
}
