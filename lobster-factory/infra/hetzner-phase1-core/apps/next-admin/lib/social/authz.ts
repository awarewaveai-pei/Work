// Brand-level authorization for /api/social (ADR 016 §3; SOCIAL_MANAGER_PLAN.md C4). V1: staff get a brand role from
// their ops_role (owner/admin -> owner, operator -> editor, viewer -> client), a client account is read-only on its own
// brand only. Per-person brand members (social_brand_members, incl. reviewers) need a user id from middleware: C8.

import { resolveOpsRole } from "@/lib/ops-role";
import { resolveTenant } from "@/lib/tenant-guard";
import type { BrandRole } from "./state";

export class BrandAccessError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "BrandAccessError";
  }
}

/** null = this caller may not see the brand at all. */
export function brandRole(req: Request, brandId: string): BrandRole | null {
  // no session identity (the sync-key passthrough, or a path outside the middleware matcher): resolveTenant would read
  // that as staff with access to every brand
  if (!req.headers.get("x-ops-user-kind")) return null;
  const tenant = resolveTenant(req);
  if (tenant.userKind === "client") return tenant.orgId === brandId ? "client" : null;
  const { role } = resolveOpsRole(req);
  if (role === "owner" || role === "admin") return "owner";
  return role === "operator" ? "editor" : "client";
}

export function requireBrandRole(req: Request, brandId: string, allowed: readonly BrandRole[]): BrandRole {
  const role = brandRole(req, brandId);
  if (!role) throw new BrandAccessError("forbidden: not your brand");
  if (!allowed.includes(role)) throw new BrandAccessError(`forbidden: ${role} may not do this`);
  return role;
}

export const ANY_ROLE: readonly BrandRole[] = ["owner", "editor", "reviewer", "client"];
export const WRITE_ROLES: readonly BrandRole[] = ["owner", "editor"];

/** Who did it, for created_by and the audit log. Only headers middleware sets: no per-person id until C8 injects
 *  one (a caller-supplied header such as an email would let anyone write someone else's name into the log). */
export function actorOf(req: Request): string {
  const tenant = resolveTenant(req);
  return tenant.userKind === "client" ? `client:${tenant.orgId}` : `ops:${resolveOpsRole(req).role}`;
}
