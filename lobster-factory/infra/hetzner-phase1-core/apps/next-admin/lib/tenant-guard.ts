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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Client or staff, as middleware set it: shared by resolveTenant and lib/ops-role.ts resolveOpsRole so a caller's
 *  role and tenant never disagree. Absent or any other value reads as staff (see resolveTenant below). */
export function userKindOf(headers: Headers): UserKind {
  return headers.get(HEADER_USER_KIND) === "client" ? "client" : "staff";
}

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
  const userKind = userKindOf(headers);
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
 * Non-throwing form of the access rule.
 * - staff: always true.
 * - client: targetOrgId must equal ctx.orgId; null targetOrgId (unscoped row) is false.
 *
 * Exists because some call sites need to FILTER rather than reject — e.g. picking the first
 * site a caller may use when no siteId was supplied (lib/content/wp-sites.ts resolveWpSite),
 * or listing only the sites they may see. Those must not be written as try/catch around
 * assertOrgAccess: a second hand-written copy of the rule is how the two drift apart.
 * assertOrgAccess below is defined in terms of this function so there is exactly one rule.
 */
export function canAccessOrg(
  req: Request | { headers: Headers },
  targetOrgId: string | null | undefined
): boolean {
  const ctx = resolveTenant(req);
  if (ctx.userKind === "staff") return true; // full access
  return Boolean(ctx.orgId) && ctx.orgId === targetOrgId;
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
  if (!canAccessOrg(req, targetOrgId)) {
    throw new OrgAccessError();
  }
}

/** Thrown when a portal.aware-wave.com route is hit by a caller that is not a bound client. */
export class PortalAccessError extends Error {
  readonly status = 403;
  constructor(message = "forbidden: portal access requires a client account bound to an org") {
    super(message);
    this.name = "PortalAccessError";
  }
}

export function toPortalAccessResponse(e: PortalAccessError): Response {
  return new Response(JSON.stringify({ ok: false, error: e.message }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Fail-CLOSED variant for portal.aware-wave.com routes ONLY. Do not use resolveTenant()
 * directly on a portal route — its fail-open default below is the deliberate historical
 * default for the ADMIN CONSOLE, whose only caller class has always been internal staff:
 * absent x-ops-user-kind → { staff, null } → FULL cross-org access. That default is safe
 * there and would be a privilege-escalation hole on portal, whose caller class is external
 * customers — a portal request that slips past the middleware matcher, or that lands on a
 * PUBLIC_API_PATHS passthrough, must never silently resolve to staff-level access.
 *
 * requireClientOrg() never falls back to staff: an absent or non-"client" x-ops-user-kind,
 * or a missing x-ops-org-id, always throws. Call this at the top of every portal
 * page/route/API handler; never call resolveTenant() there.
 */
export function requireClientOrg(req: Request | { headers: Headers }): { userKind: "client"; orgId: string } {
  const headers = req.headers;
  const rawKind = headers.get(HEADER_USER_KIND);
  const rawOrg = (headers.get(HEADER_ORG_ID) ?? "").trim();
  if (rawKind !== "client" || !rawOrg) {
    throw new PortalAccessError();
  }
  return { userKind: "client", orgId: rawOrg };
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
 *
 * A non-null, non-blank `requestedOrgId` that isn't uuid-shaped throws OrgAccessError rather
 * than being passed through. Every one of the 22 real call sites of this function across the
 * app already wraps it in `catch (e) { if (e instanceof OrgAccessError) return
 * toOrgAccessResponse(e) / <local equivalent>; throw e; }` (grepped and read individually,
 * 2026-09-11) — reusing this error class means the rejection reaches every call site with zero
 * changes there, instead of a garbage id reaching `.eq("organization_id", ...)` and Postgres
 * throwing `22P02 invalid input syntax for type uuid`, which several routes were previously
 * leaking as a raw 500 (`error.message`). The status code is 403 rather than a more
 * semantically-precise 400 — that's the one tradeoff of reusing the existing mechanism instead
 * of adding a second error type every caller would need a new catch branch for.
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
  // Trim first (mirrors resolveTenant()'s own `.trim() || null` convention two lines up) so an
  // empty/whitespace-only value returns null instead of skipping both the format check AND the
  // `?? null` coalesce (critic Major, 2026-09-11: `""` is falsy so `requestedOrgId && ...` never
  // ran, but `"" ?? null` still evaluates to `""`, not `null` — silently reopened the 22P02 leak
  // for the one input shape easiest to trigger by accident, and rejected legitimately
  // whitespace-padded valid uuids).
  const trimmed = requestedOrgId?.trim() || null;
  if (trimmed && !UUID_RE.test(trimmed)) {
    throw new OrgAccessError("organizationId must be a uuid");
  }
  return trimmed;
}
