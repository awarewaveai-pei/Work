// Brand-level authorization for /api/social (ADR 016 §3, ADR 018 §3; SOCIAL_MANAGER_PLAN.md C4, C12 step 6).
// A per-brand member row (social_brand_members, keyed by the auth user id middleware injects as x-ops-user-id) is an
// explicit grant and wins; staff owner/admin are owner everywhere. Without a row: staff map from ops_role
// (operator -> editor, viewer -> client), a client account is read-only on its own organization only.

import { resolveOpsRole } from "@/lib/ops-role";
import type { OpsRole } from "@/lib/ops-contracts";
import { resolveTenant } from "@/lib/tenant-guard";
import { AuthorizedOrg, requestActor } from "@/lib/entitlements/subject";
import type { BrandRole } from "./state";
import { memberRoles } from "./store";

export class BrandAccessError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "BrandAccessError";
  }
}

export interface Caller {
  kind: "staff" | "client";
  orgId: string | null;
  opsRole: OpsRole;
  userId: string | null;
  members: ReadonlyMap<string, BrandRole>;
}

/** The role a caller holds on a brand; null = may not see it. */
export function roleOn(caller: Caller, brandId: string): BrandRole | null {
  if (caller.kind === "client") return caller.members.get(brandId) ?? (caller.orgId === brandId ? "client" : null);
  if (caller.opsRole === "owner" || caller.opsRole === "admin") return "owner";
  return caller.members.get(brandId) ?? (caller.opsRole === "operator" ? "editor" : "client");
}

/** null = no session identity (the sync-key passthrough, or a path outside the middleware matcher): resolveTenant
 *  would read that as staff with access to every brand. */
export async function callerOf(req: Request): Promise<Caller | null> {
  if (!req.headers.get("x-ops-user-kind")) return null;
  const tenant = resolveTenant(req);
  const userId = req.headers.get("x-ops-user-id")?.trim() || null;
  return {
    kind: tenant.userKind,
    orgId: tenant.orgId,
    opsRole: resolveOpsRole(req).role,
    userId,
    members: userId ? await memberRoles(userId) : new Map(),
  };
}

export async function requireBrandRole(req: Request, brandId: string, allowed: readonly BrandRole[]): Promise<BrandRole> {
  const caller = await callerOf(req);
  const role = caller ? roleOn(caller, brandId) : null;
  if (!role) throw new BrandAccessError("forbidden: not your brand");
  if (!allowed.includes(role)) throw new BrandAccessError(`forbidden: ${role} may not do this`);
  return role;
}

/** A new channel is matched to the brand that asked only by timing (store.ts startConnect / resolveConnectAttempt): one
 *  open attempt blocks every brand, and an unowned channel goes to whoever's attempt is open. Safe only while the
 *  people who can open one are AwareWave staff, so a customer may reconnect its own channels but not add new ones. */
export function requireStaffForNewChannel(req: Request): void {
  if (resolveTenant(req).userKind !== "staff") throw new BrandAccessError("forbidden: new channels are connected by AwareWave staff");
}

/** What the audit log shows a viewer: customers never see staff roles or auth user ids there. (A brand's owners do get
 *  their members' user ids from /api/social/members: the handle for changing or removing one.) */
export function actorForViewer(actor: string, viewer: "staff" | "client"): string {
  if (viewer === "staff") return actor;
  if (actor.startsWith("ops:")) return "ops";
  return actor.startsWith("client:") ? actor.split(":").slice(0, 2).join(":") : actor;
}

export const ANY_ROLE: readonly BrandRole[] = ["owner", "editor", "reviewer", "client"];
export const WRITE_ROLES: readonly BrandRole[] = ["owner", "editor"];

/** Who did it, for created_by and the audit log: `ops:<role>` or `client:<org>`, then `:<user id>`. Only headers
 *  middleware sets (a caller-supplied header such as an email would let anyone write someone else's name into the log).
 *  One definition, shared with the entitlement gate. */
export function actorOf(req: Request): string {
  return requestActor(req);
}

export class NotAuthorizedForOrgError extends BrandAccessError {
  readonly code = "not_authorized_for_org";
  constructor(orgId: string) {
    super(`not_authorized_for_org: ${orgId}`);
    this.name = "NotAuthorizedForOrgError";
  }
}

/** on_behalf_of = orgId, only for a caller with a role there: staff owner/admin, a member row (keyed by org/brand id),
 *  or the client's own org. `actor` stays the real person. actorOf is sync and used everywhere, so the async check lives here. */
export async function actorFor(req: Request, orgId: string): Promise<AuthorizedOrg> {
  const tenant = resolveTenant(req);
  const actor = requestActor(req);
  if (tenant.userKind === "client" ? tenant.orgId === orgId : ["owner", "admin"].includes(resolveOpsRole(req).role)) return new AuthorizedOrg(orgId, actor);
  const userId = req.headers.get("x-ops-user-id")?.trim();
  if (!userId || !(await memberRoles(userId)).has(orgId)) throw new NotAuthorizedForOrgError(orgId);
  return new AuthorizedOrg(orgId, actor);
}
