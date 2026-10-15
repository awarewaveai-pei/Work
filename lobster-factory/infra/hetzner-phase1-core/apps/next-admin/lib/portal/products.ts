// Product registry: the one list of products (ADR 012 §5) and how each is delivered (ADR 018 -- its own door,
// its login sources, whether it installs alone). Data-driven on purpose (PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md §6.2):
// adding a product here is how the launcher and lib/portal/doors.ts become aware of it. No hostnames here: a host is
// subdomain + the configured base domain (doors.ts), so a buyout install on a customer's domain changes config only.
// __tests__/products.test.ts fails a product that leaves any delivery field out.

export type ProductKey = "cognitive" | "hci" | "social";

/** How a person signs in (ADR 018 §3); every source ends in this app's own session. */
export type LoginSource = "local" | "awarewave-wp" | "customer-wp";
export const LOGIN_SOURCES: readonly LoginSource[] = ["local", "awarewave-wp", "customer-wp"];

/** Where the product's own door is served. next-admin: `page` is the page prefix the door's paths are rewritten
 *  under, `api` the API prefixes the door also serves; nothing else is reachable on that host. */
export type ProductDoor =
  | { app: "next-admin"; page: string; api: readonly string[] }
  | { app: "external" };

export interface PortalProduct {
  key: ProductKey;
  name: string;
  /** Host label: the product's door is `<subdomain>.<base domain>` (doors.ts). Never app, portal or www. */
  subdomain: string;
  door: ProductDoor;
  /** Must include "local": a buyout install signs people in on its own by default (ADR 017 §6). */
  loginSources: readonly LoginSource[];
  /** A buyout customer can install this product without the others (ADR 017 §5 lists what it depends on). */
  standalone: boolean;
  /**
   * "coming_soon": no product-side Tenant-provisioning API exists yet (Cognitive OS is Phase 2
   * planning per ADR-003; HCI-30 is unstarted). The launcher must render this literally as
   * "coming soon" — never as a working link — until a product flips this via its own rollout,
   * not by editing this literal to "available".
   *
   * Critic finding (2026-08-29, suggestion): this field was typed as the single literal
   * "coming_soon", which made app/portal/launcher/page.tsx's `product.status !== "coming_soon"`
   * check statically unreachable — TypeScript narrowed it to always-false, so the "isReady"
   * branch this comment describes was dead code with no way to ever become true, contradicting
   * the very rollout mechanism this comment promises. Typed as a real union so a future product
   * launch can actually flip this value and the launcher's branch becomes reachable.
   */
  status: "coming_soon" | "available";
  /**
   * Offered on the portal signup form and accepted by /api/signup. Every self-signup key must also be
   * allowed by the organization_product_subscriptions.product_key check (0062) — the registry test
   * compares the two. Social is false until V2 opens subscriptions (ADR 016 §7).
   */
  selfSignup: boolean;
}

export const PRODUCTS: readonly PortalProduct[] = [
  { key: "cognitive", name: "AI LEGO Cognitive Engineering OS", subdomain: "cognitive", door: { app: "external" },
    loginSources: ["local", "awarewave-wp"], standalone: true, status: "coming_soon", selfSignup: true },
  { key: "hci", name: "HCI-30", subdomain: "hci", door: { app: "external" },
    loginSources: ["local", "awarewave-wp"], standalone: true, status: "coming_soon", selfSignup: true },
  { key: "social", name: "社群發文", subdomain: "social", door: { app: "next-admin", page: "/social", api: ["/api/social"] },
    loginSources: ["local", "awarewave-wp", "customer-wp"], standalone: true, status: "coming_soon", selfSignup: false }, // ADR 016
];

/** The products a visitor may pick at signup — the only list the signup form and /api/signup use. */
export const SELF_SIGNUP_PRODUCTS: readonly PortalProduct[] = PRODUCTS.filter((p) => p.selfSignup);

/** What signup gives a visitor who did not pick one — the form's initial value and /api/signup's fallback. */
export const DEFAULT_SIGNUP_PRODUCT: ProductKey = SELF_SIGNUP_PRODUCTS[0].key;

export function isSelfSignupProductKey(value: unknown): value is ProductKey {
  return typeof value === "string" && SELF_SIGNUP_PRODUCTS.some((p) => p.key === value);
}
