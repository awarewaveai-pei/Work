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
  return process.env.OPS_ALLOW_SIMULATED_ROLE_FALLBACK !== "false";
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
  return toRole(request.headers.get(SIMULATED_ROLE_HEADER)) ?? "operator";
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
