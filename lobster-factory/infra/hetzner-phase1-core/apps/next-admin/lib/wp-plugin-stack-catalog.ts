/**
 * Machine-readable WordPress plugin stack catalog.
 * Source of truth: agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md
 *
 * ★ = primary slug (this file's `slug` field)
 * ↩ = alternative slug (`alternativeSlug`) — used by resolveInstallableSlugs when primary is free: false
 * †  = optional (`required: false`) — Complianz, TranslatePress
 *
 * SYNC RULE: Any change here must be reflected in WP_CLIENT_PLUGIN_STACK.md, and vice versa.
 */

export type WpSiteType = "tourism" | "brand" | "ecommerce";
export type WpPluginModule = "base" | "ecommerce" | "tourism" | "brand";

export interface WpPlugin {
  /** WP.org slug for wp plugin install, or descriptive key for PAID/DIRECT plugins */
  slug: string;
  /** Display label */
  label: string;
  /** false = paid / non-WP.org; WP-CLI cannot install directly */
  free: boolean;
  /** false = optional (†) — e.g. Complianz, TranslatePress */
  required: boolean;
  /** Which module this entry belongs to */
  module: WpPluginModule;
  /**
   * Free alternative slug (↩). Used by resolveInstallableSlugs when free: false.
   * Omit if there is no free substitute and the plugin must be installed manually.
   */
  alternativeSlug?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog — 16 base + 12 ecommerce + 5 tourism + 3 brand = 36 total entries
// ─────────────────────────────────────────────────────────────────────────────

export const WP_PLUGIN_CATALOG: WpPlugin[] = [

  // ── BASE MODULE (16 functional slots) ────────────────────────────────────

  { slug: "kadence",                          label: "Kadence Theme",                              free: true,  required: true,  module: "base" },
  { slug: "kadence-blocks",                   label: "Kadence Blocks",                             free: true,  required: true,  module: "base" },
  { slug: "wordfence",                        label: "Wordfence Security",                         free: true,  required: true,  module: "base" },
  { slug: "wpvivid-backups-and-migration",    label: "WPvivid Backup",                             free: true,  required: true,  module: "base" },
  { slug: "seo-by-rank-math",                 label: "Rank Math SEO",                              free: true,  required: true,  module: "base" },
  { slug: "redirection",                      label: "Redirection",                                free: true,  required: true,  module: "base" },
  { slug: "litespeed-cache",                  label: "LiteSpeed Cache ★",                          free: true,  required: true,  module: "base" },
  { slug: "shortpixel-image-optimiser",       label: "ShortPixel Image Optimiser ★",               free: true,  required: true,  module: "base" },
  { slug: "really-simple-ssl",               label: "Really Simple SSL",                          free: true,  required: true,  module: "base" },
  { slug: "fluentform",                       label: "Fluent Forms",                               free: true,  required: true,  module: "base" },
  { slug: "fluent-smtp",                      label: "FluentSMTP",                                 free: true,  required: true,  module: "base" },
  { slug: "fluent-crm",                       label: "FluentCRM",                                  free: true,  required: true,  module: "base" },
  {
    slug: "cleantalk-spam-protect",
    label: "CleanTalk ★ (→ Akismet ↩)",
    free: false,
    required: true,
    module: "base",
    alternativeSlug: "akismet",
  },
  { slug: "duracelltomi-google-tag-manager",  label: "GTM4WP",                                     free: true,  required: true,  module: "base" },
  { slug: "advanced-custom-fields",           label: "Advanced Custom Fields (ACF)",               free: true,  required: true,  module: "base" },
  {
    slug: "complianz-gdpr",
    label: "Complianz †",
    free: true,
    required: false,
    module: "base",
  },

  // ── ECOMMERCE MODULE (12 functional slots) ────────────────────────────────

  { slug: "woocommerce",                                label: "WooCommerce",                                   free: true,  required: true,  module: "ecommerce" },
  {
    slug: "kadence-shop-kit",
    label: "Kadence Shop Kit",
    free: false,
    required: true,
    module: "ecommerce",
  },
  { slug: "kadence-woocommerce-email-designer",         label: "Kadence WooCommerce Email Designer",            free: true,  required: true,  module: "ecommerce" },
  {
    slug: "ecpay-payment-gateway",
    label: "ECPay（綠界）",
    free: false,
    required: true,
    module: "ecommerce",
  },
  { slug: "woocommerce-gateway-stripe",                 label: "WooCommerce Stripe Gateway",                    free: true,  required: true,  module: "ecommerce" },
  { slug: "woocommerce-pdf-invoices-packing-slips",     label: "WooCommerce PDF Invoices & Packing Slips",      free: true,  required: true,  module: "ecommerce" },
  { slug: "yith-woocommerce-wishlist",                  label: "YITH WooCommerce Wishlist",                     free: true,  required: true,  module: "ecommerce" },
  {
    slug: "yith-woocommerce-points-and-rewards",
    label: "YITH WooCommerce Points and Rewards",
    free: false,
    required: true,
    module: "ecommerce",
  },
  { slug: "fluent-reviews",                             label: "Fluent Reviews for WooCommerce",                free: true,  required: true,  module: "ecommerce" },
  { slug: "variation-swatches-for-woocommerce",         label: "Variation Swatches for WooCommerce",            free: true,  required: true,  module: "ecommerce" },
  { slug: "cartflows",                                  label: "CartFlows ★",                                   free: true,  required: true,  module: "ecommerce" },
  { slug: "woo-cart-abandonment-recovery",              label: "WooCommerce Cart Abandonment Recovery",         free: true,  required: true,  module: "ecommerce" },

  // ── TOURISM MODULE (5 functional slots) ──────────────────────────────────

  { slug: "wp-travel-engine",                label: "WP Travel Engine ★",                          free: true,  required: true,  module: "tourism" },
  { slug: "custom-post-type-ui",             label: "Custom Post Type UI (CPT UI)",                free: true,  required: true,  module: "tourism" },
  { slug: "modula-best-grid-gallery",        label: "Modula Gallery",                              free: true,  required: true,  module: "tourism" },
  {
    slug: "wp-maps-pro",
    label: "WP Maps Pro ★ (→ Leaflet ↩)",
    free: false,
    required: true,
    module: "tourism",
    alternativeSlug: "leaflet-map",
  },
  {
    slug: "translatepress-multilingual",
    label: "TranslatePress †",
    free: true,
    required: false,
    module: "tourism",
  },

  // ── BRAND MODULE (3 functional slots) ────────────────────────────────────

  { slug: "custom-post-type-ui",      label: "Custom Post Type UI (CPT UI)",   free: true,  required: true,  module: "brand" },
  { slug: "modula-best-grid-gallery", label: "Modula Gallery ★",               free: true,  required: true,  module: "brand" },
  { slug: "popup-maker",              label: "Popup Maker",                    free: true,  required: true,  module: "brand" },

];

// ─────────────────────────────────────────────────────────────────────────────
// Resolve functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all WpPlugin entries for the given site type and ecommerce flag.
 * siteType === "ecommerce" forces hasEcommerce = true regardless of the argument.
 * Result includes paid plugins — use resolveInstallableSlugs for WP-CLI use.
 */
export function resolvePluginStack(
  siteType: WpSiteType,
  hasEcommerce: boolean
): WpPlugin[] {
  const effectiveHasEcommerce = siteType === "ecommerce" ? true : hasEcommerce;
  return WP_PLUGIN_CATALOG.filter((plugin) => {
    if (plugin.module === "base") return true;
    if (plugin.module === "ecommerce") return effectiveHasEcommerce;
    if (plugin.module === "tourism") return siteType === "tourism";
    if (plugin.module === "brand") return siteType === "brand";
    return false;
  });
}

/**
 * Returns slugs that can be directly passed to `wp plugin install <slug> --activate`.
 *
 * Logic per entry in resolvePluginStack:
 *   free: true                         → use plugin.slug
 *   free: false + alternativeSlug      → use alternativeSlug (free fallback ↩)
 *   free: false + no alternativeSlug   → skip (operator must install manually)
 */
export function resolveInstallableSlugs(
  siteType: WpSiteType,
  hasEcommerce: boolean
): string[] {
  const slugs: string[] = [];
  for (const plugin of resolvePluginStack(siteType, hasEcommerce)) {
    if (plugin.free) {
      slugs.push(plugin.slug);
    } else if (plugin.alternativeSlug) {
      slugs.push(plugin.alternativeSlug);
    }
  }
  return slugs;
}

/**
 * Returns paid plugins that have no free alternative — these must be installed manually.
 * Plugins with alternativeSlug are NOT returned here (their free fallback is auto-installed).
 */
export function resolvePaidPlugins(
  siteType: WpSiteType,
  hasEcommerce: boolean
): WpPlugin[] {
  return resolvePluginStack(siteType, hasEcommerce).filter(
    (plugin) => !plugin.free && !plugin.alternativeSlug
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pack-based API (additive model: base always-on + optional ecommerce/tourism/brand)
// Replaces the wpSiteType + hasEcommerce combo in OnboardWizard v2.
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all WpPlugin entries for the given packs. Base is always included. */
export function resolvePluginsForPacks(packs: WpPluginModule[]): WpPlugin[] {
  const packSet = new Set<WpPluginModule>([...packs, "base"]);
  return WP_PLUGIN_CATALOG.filter((p) => packSet.has(p.module));
}

/** Returns slugs for `wp plugin install --activate`. Same logic as resolveInstallableSlugs. */
export function resolveInstallableSlugsForPacks(packs: WpPluginModule[]): string[] {
  const slugs: string[] = [];
  for (const plugin of resolvePluginsForPacks(packs)) {
    if (plugin.free) slugs.push(plugin.slug);
    else if (plugin.alternativeSlug) slugs.push(plugin.alternativeSlug);
  }
  return slugs;
}

/** Returns paid plugins with no free alternative — must be installed manually. */
export function resolvePaidPluginsForPacks(packs: WpPluginModule[]): WpPlugin[] {
  return resolvePluginsForPacks(packs).filter((p) => !p.free && !p.alternativeSlug);
}

/** Auto-derives container manifest slug from selected packs. */
export function derivePackageSlugFromPacks(packs: WpPluginModule[]): "wp-basic" | "wp-business" | "wc-core" {
  if (packs.includes("ecommerce")) return "wc-core";
  if (packs.includes("brand")) return "wp-business";
  return "wp-basic";
}

/** Auto-derives smoke profile from selected packs. */
export function deriveSmokeProfileFromPacks(packs: WpPluginModule[]): "woocommerce" | "business" | "basic" {
  if (packs.includes("ecommerce")) return "woocommerce";
  if (packs.includes("brand")) return "business";
  return "basic";
}
