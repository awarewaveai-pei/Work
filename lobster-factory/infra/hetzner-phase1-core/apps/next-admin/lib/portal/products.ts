// Product registry consumed by the portal.aware-wave.com launcher.
// Data-driven on purpose (PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md §6.2): adding a product here is
// how the launcher becomes aware of it. This file carries NO product-specific business logic —
// entitlement, provisioning, and per-product UI all live elsewhere, keyed by `key`.

export type ProductKey = "cognitive" | "hci" | "social";

export interface PortalProduct {
  key: ProductKey;
  name: string;
  /** Where a provisioned customer lands. Not reachable yet for either product — see status. */
  domain: string;
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
  { key: "cognitive", name: "AI LEGO Cognitive Engineering OS", domain: "cognitive.aware-wave.com", status: "coming_soon", selfSignup: true },
  { key: "hci", name: "HCI-30", domain: "hci.aware-wave.com", status: "coming_soon", selfSignup: true },
  { key: "social", name: "社群發文", domain: "social.aware-wave.com", status: "coming_soon", selfSignup: false }, // ADR 016
];

/** The products a visitor may pick at signup — the only list the signup form and /api/signup use. */
export const SELF_SIGNUP_PRODUCTS: readonly PortalProduct[] = PRODUCTS.filter((p) => p.selfSignup);

/** What signup gives a visitor who did not pick one — the form's initial value and /api/signup's fallback. */
export const DEFAULT_SIGNUP_PRODUCT: ProductKey = SELF_SIGNUP_PRODUCTS[0].key;

export function isSelfSignupProductKey(value: unknown): value is ProductKey {
  return typeof value === "string" && SELF_SIGNUP_PRODUCTS.some((p) => p.key === value);
}
