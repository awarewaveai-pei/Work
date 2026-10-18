// Which door a request came through (ADR 018 §1-2). The only place a hostname is mapped to a door: middleware.ts and
// pages ask here. Hosts come from config, never literals: PUBLIC_BASE_DOMAIN (default aware-wave.com), PORTAL_HOST,
// PRODUCT_HOST_<KEY> -- a buyout install on a customer's domain sets these and changes no code.

import { PRODUCTS, type PortalProduct, type ProductDoor } from "./products";

type Env = Record<string, string | undefined>;
export type NextAdminProduct = PortalProduct & { door: Extract<ProductDoor, { app: "next-admin" }> };

/** Subdomains a product may not take: the staff and portal doors, and the public site. */
export const RESERVED_SUBDOMAINS: readonly string[] = ["app", "portal", "www"];

const clean = (v: string | undefined) => (v ?? "").trim().toLowerCase();

export function baseDomain(env: Env = process.env): string {
  return clean(env.PUBLIC_BASE_DOMAIN) || "aware-wave.com";
}

export function portalHost(env: Env = process.env): string {
  return clean(env.PORTAL_HOST) || `portal.${baseDomain(env)}`;
}

export function productHost(p: PortalProduct, env: Env = process.env): string {
  return clean(env[`PRODUCT_HOST_${p.key.toUpperCase()}`]) || `${p.subdomain}.${baseDomain(env)}`;
}

export function nextAdminProducts(): NextAdminProduct[] {
  return PRODUCTS.filter((p): p is NextAdminProduct => p.door.app === "next-admin");
}

/** Registration reserves a host before page/DNS/nginx rollout. Legacy doors predate this field. */
export function servedNextAdminProducts(): NextAdminProduct[] {
  return nextAdminProducts().filter((p) => p.door.enabled !== false);
}

export type Door = { kind: "none" } | { kind: "probe" } | { kind: "staff" } | { kind: "portal" } | { kind: "product"; product: NextAdminProduct };

/** Only configured staff hosts may reach the staff door (ADR 018 §1). */
export function doorForHost(host: string, env: Env = process.env): Door {
  const h = clean(host.split(",")[0]).replace(/:\d+$/, "");
  if (!h) return { kind: "none" };
  if (h === portalHost(env)) return { kind: "portal" };
  const product = servedNextAdminProducts().find((p) => productHost(p, env) === h);
  if (product) return { kind: "product", product };
  const staff = (env.STAFF_HOSTS ?? `app.${baseDomain(env)}`).split(",").map(clean).filter(Boolean);
  if (env.NODE_ENV === "development") staff.push("localhost");
  if (staff.includes(h)) return { kind: "staff" };
  // Existing compose and sg-deploy probes use loopback. This is never a staff door.
  return h === "127.0.0.1" ? { kind: "probe" } : { kind: "none" };
}

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** The product's own page and API paths. */
export function isProductPath(pathname: string, product: NextAdminProduct): boolean {
  return under(pathname, product.door.page) || product.door.api.some((a) => under(pathname, a));
}

/** A page path some product serves only on its own door (e.g. /social on the staff host). */
export function productPageOwner(pathname: string): NextAdminProduct | null {
  return servedNextAdminProducts().find((p) => under(pathname, p.door.page)) ?? null;
}

export type ProductRoute = { action: "pass" } | { action: "rewrite"; pathname: string } | { action: "not_found" };

/** On a product door: its own paths pass; any other API is 404; every other page path is served under the product's
 *  page prefix ("/" -> "/social"), so a staff page such as /ops becomes /social/ops and 404s on its own. */
export function routeOnProductDoor(pathname: string, product: NextAdminProduct): ProductRoute {
  if (isProductPath(pathname, product)) return { action: "pass" };
  if (pathname.startsWith("/api/") || pathname === "/api" || pathname.startsWith("/portal/api/")) return { action: "not_found" };
  return { action: "rewrite", pathname: pathname === "/" ? product.door.page : `${product.door.page}${pathname}` };
}
