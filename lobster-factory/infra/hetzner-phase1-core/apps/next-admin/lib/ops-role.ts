import type { OpsRole } from "./ops-contracts";

const SIMULATED_ROLE_HEADER = "x-ops-simulated-role";
const CLAIMS_ROLE_HEADERS = ["x-ops-claims-role", "x-user-role", "x-clerk-role"] as const;
type RoleSource = "claims" | "simulated" | "default_viewer";

function toRole(value: string | null | undefined): OpsRole | null {
  const raw = value?.trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "operator" || raw === "viewer") {
    return raw;
  }
  return null;
}

function shouldAllowSimulatedFallback(): boolean {
  return process.env.OPS_ALLOW_SIMULATED_ROLE_FALLBACK === "true";
}

function isProductionLike(): boolean {
  return process.env.NODE_ENV === "production";
}

function roleResolutionMode(): "claims_only" | "claims_with_simulated_fallback" {
  const explicit = process.env.OPS_ROLE_RESOLUTION_MODE?.trim().toLowerCase();
  if (explicit === "claims_only") return "claims_only";
  if (explicit === "claims_with_simulated_fallback") return "claims_with_simulated_fallback";
  return isProductionLike() ? "claims_only" : "claims_with_simulated_fallback";
}

export function readSimulatedRole(request: Request): OpsRole {
  return toRole(request.headers.get(SIMULATED_ROLE_HEADER)) ?? toRole(process.env.OPS_SIMULATED_FALLBACK_ROLE) ?? "operator";
}

export function readClaimsRole(request: Request): OpsRole | null {
  for (const header of CLAIMS_ROLE_HEADERS) {
    const role = toRole(request.headers.get(header));
    if (role) return role;
  }
  return null;
}

export function resolveOpsRole(request: Request): { role: OpsRole; source: RoleSource } {
  const claimsRole = readClaimsRole(request);
  if (claimsRole) return { role: claimsRole, source: "claims" };

  const allowSimulated = roleResolutionMode() === "claims_with_simulated_fallback" && shouldAllowSimulatedFallback();
  if (allowSimulated) return { role: readSimulatedRole(request), source: "simulated" };

  return { role: "viewer", source: "default_viewer" };
}

/**
 * Production path: read role claims headers.
 * Dev/staging fallback: simulated role header when explicitly allowed.
 */
export function readOpsRole(request: Request): OpsRole {
  return resolveOpsRole(request).role;
}

export function roleHeader(role: OpsRole): Record<string, string> {
  return { [SIMULATED_ROLE_HEADER]: role };
}

export function canWriteTenantConfig(role: OpsRole): boolean {
  return role === "owner" || role === "admin";
}

export function canCreateAiImageJob(role: OpsRole): boolean {
  return role === "owner" || role === "admin" || role === "operator";
}

/** A Release is an approval to make a tenant artifact externally deliverable. */
export function canApproveMediaRelease(role: OpsRole): boolean {
  return role === "owner" || role === "admin";
}

// === 路線 B Ops Inbox 新增（docs/Ops_Observability_PathB_Plan.md §5.4） ===
export function canTriggerAiDiagnose(role: OpsRole): boolean {
  return role === "owner" || role === "admin" || role === "operator";
}

/** Anyone who reaches Ops Inbox (logged-in) may resolve/ignore/reopen incidents — includes viewer. */
export function canModifyIncidentStatus(role: OpsRole): boolean {
  return role === "owner" || role === "admin" || role === "operator" || role === "viewer";
}

// === Phase 2c: Command Plane approval + system_modes (governance red line) ===
// These guard high-risk command approvals and global mode changes (incl. unlocking
// the kill switch via /normal_mode). Per CLAUDE.md High-STOP risk tier and the
// systems-thinker red-lines matrix, these are auth/identity boundary decisions —
// owner + admin only. operator / viewer cannot approve or change global modes.
export function canApproveCommand(role: OpsRole): boolean {
  return role === "owner" || role === "admin";
}

export function canChangeSystemMode(role: OpsRole): boolean {
  return role === "owner" || role === "admin";
}

// === Phase 2c: WP plugin report sync (from update-client-wp-plugins.ps1) ===
// operator can sync WP plugin update reports; viewer is read-only.
export function canSyncWpReport(role: OpsRole): boolean {
  return role === "owner" || role === "admin" || role === "operator";
}

// === Cold Outreach Workbench (agency-os/docs/cold_email §B0.1) ===
// owner/admin/operator may manage outreach (import leads, generate/approve copy, sync warm);
// viewer is read-only. This is the agency-internal ops-console access model — NOT per-tenant
// login isolation (which is deferred to Phase 5). organization_id stays a client-scoping filter.
export function canManageOutreach(role: OpsRole): boolean {
  return role === "owner" || role === "admin" || role === "operator";
}
