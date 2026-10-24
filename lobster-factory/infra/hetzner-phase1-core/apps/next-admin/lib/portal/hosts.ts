// Product and portal host names from config (ADR 018 §1): PUBLIC_BASE_DOMAIN (default aware-wave.com), PORTAL_HOST,
// PRODUCT_HOST_<KEY>. Kept apart from doors.ts (request routing) so a page can name a host without importing the router.
import type { PortalProduct } from "./products";

type Env = Record<string, string | undefined>;

export const cleanHost = (v: string | undefined) => (v ?? "").trim().toLowerCase();
export function baseDomain(env: Env = process.env): string {
  return cleanHost(env.PUBLIC_BASE_DOMAIN) || "aware-wave.com";
}

export function portalHost(env: Env = process.env): string {
  return cleanHost(env.PORTAL_HOST) || `portal.${baseDomain(env)}`;
}

export function productHost(p: PortalProduct, env: Env = process.env): string {
  return cleanHost(env[`PRODUCT_HOST_${p.key.toUpperCase()}`]) || `${p.subdomain}.${baseDomain(env)}`;
}

